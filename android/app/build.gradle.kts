plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.chaquo.python")
}

android {
    namespace = "com.hermesforge.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.hermesforge.app"
        minSdk = 24          // Android 7.0 — Chaquopy'nin tabanı ve makul bir alt sınır
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        ndk {
            // Yalnızca gerçek telefon mimarileri. x86 eklemek APK'yı iki katına
            // çıkarıp hiçbir kullanıcıya yaramaz.
            abiFilters += listOf("arm64-v8a", "armeabi-v7a")
        }
    }

    // Mimariye göre ayrı APK'lar. Tek APK 34 MB oluyor çünkü iki mimarinin
    // Python çalışma zamanını birden taşıyor; telefonun yalnızca birine
    // ihtiyacı var. Bölünce arm64 sürümü ~20 MB'a düşüyor.
    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a")
            isUniversalApk = true   // hepsini içeren sürüm de üretilsin
        }
    }

    buildTypes {
        getByName("debug") {
            isMinifyEnabled = false
        }
        getByName("release") {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

// Hermes'in kaynak ağacı 164 MB; APK'ya yalnızca çalışma zamanında gereken
// kısmı giriyor. Ölçüm: gateway'i ayağa kaldırmak için agent/, gateway/,
// hermes_cli/, cron/, tools/, plugins/, providers/ ve kök .py dosyaları
// yetiyor (import izi ölçülerek çıkarıldı). Kırpılmış ağaç ~72 MB.
val hermesSource = layout.buildDirectory.dir("hermes-python")

val syncHermesSource by tasks.registering(Sync::class) {
    from("../../vendor/hermes-agent") {
        exclude(
            "venv/**", ".venv/**", ".git/**", "node_modules/**", "tests/**",
            "apps/**", "docs/**", "evals/**", "contributors/**", "native/**",
            "nix/**", "docker/**", "optional-mcps/**", "optional-skills/**",
            "mcp-research-data/**", "datagen-config-examples/**",
            "**/__pycache__/**", "**/*.pyc", "hermes_agent.egg-info/**",
            ".github/**", ".pytest_cache/**",
            // `hermes` uzantısız bir başlatıcı betik ve bizim `hermes/`
            // paketimizle aynı ada sahip — APK'da ikisi aynı yolda duruyor.
            // Çalışma zamanında gerekmiyor (gateway'i doğrudan import ediyoruz).
            "hermes", "hermes-acp",
            // Depo süsleri: APK'yı şişirir, çalışma zamanında okunmaz.
            "*.md", "**/*.md", "LICENSE", "Dockerfile*", "docker-compose*",
            "*.tar.gz", "flake.*", "*.mjs", "*.example", "Makefile", "setup.py",
            "*.toml", "*.cfg", "*.lock", "*.txt",
            // Gateway'in hiç dokunmadığı arayüzler ve belge varlıkları.
            // Ölçüldü: bunlar çıkarılınca gateway açılıyor ve tam bir tur
            // tamamlıyor; APK 136 MB'tan 60 MB'a iniyor.
            "website/**", "ui-tui/**", "web/**", "tui_gateway/**", "scripts/**",
            "**/docs/**", "**/__tests__/**",
            "**/*.png", "**/*.jpg", "**/*.jpeg", "**/*.gif", "**/*.svg",
            "**/*.webp", "**/*.ico", "**/*.mp4", "**/*.woff*", "**/*.ttf",
            "**/*.ts", "**/*.tsx", "**/*.scss", "**/*.map"
        )
    }
    into(hermesSource)
}

// İki Python kaynak ağacı aynı yola kopyalanıyor; aynı adlı bir dosya
// diğerini sessizce ezerdi. Gradle'ın anlaşılmaz "Is a directory" hatası
// yerine burada açık bir mesajla duruyoruz.
val checkPythonCollisions by tasks.registering {
    dependsOn(syncHermesSource)
    doLast {
        val ours = file("../../backend").listFiles()?.map { it.name }?.toSet() ?: emptySet()
        val theirs = hermesSource.get().asFile.listFiles()?.map { it.name }?.toSet() ?: emptySet()
        val clash = (ours intersect theirs) - setOf("__pycache__")
        if (clash.isNotEmpty()) {
            throw GradleException(
                "Python kaynak çakışması: $clash — backend/ ile Hermes ağacında " +
                "aynı adlar var. Birini yeniden adlandır ya da sync görevinde hariç tut."
            )
        }
    }
}

// Chaquopy kaynakları toplamadan önce kırpılmış ağaç hazır olmalı.
tasks.matching { it.name.contains("PythonSources") }.configureEach {
    dependsOn(syncHermesSource, checkPythonCollisions)
}

// Chaquopy'nin tüm ayarları kendi bloğunda; android bloğunun yapısını yansıtır.
chaquopy {
    defaultConfig {
        version = "3.11"
        pip {
            // pydantic-core'un ve jiter'in Android yapıları Chaquopy deposunda
            // yok. İkisini de kendimiz ürettik (bkz. android/wheels/README.md):
            // pydantic-core NDK ile çapraz derlendi, jiter saf Python gölge
            // paketi olarak yazıldı (openai SDK'sı onu tek bir yerde kullanıyor).
            options("--find-links", "$rootDir/wheels")

            // HermesForge'un kendi bağımlılıkları — üçü de saf Python.
            install("flask>=3.0")
            install("requests>=2.31")
            install("pypdf>=4.0")

            // Hermes Agent 0.20.4'ün çalışma zamanı bağımlılıkları.
            // Sürümler, gateway'in bu kümeyle gerçekten bir tur tamamladığı
            // ölçülerek sabitlendi.
            install("pydantic==2.13.4")
            install("openai==2.24.0")
            install("jiter==0.10.0")
            install("aiohttp")
            install("cryptography")
            install("psutil")
            install("pillow")
            install("pyyaml")
            install("ruamel.yaml")
            install("websockets")
            install("fastapi")
            install("uvicorn")
            install("starlette")
            install("httpx")
            install("httpcore")
            install("h11")
            install("anyio")
            install("sniffio")
            install("distro")
            install("certifi")
            install("rich")
            install("prompt_toolkit")
            install("croniter")
            install("fire")
            install("python-dotenv")
            install("python-dateutil")
            install("pytz")
            install("markdown")
            install("markdown-it-py")
            install("jinja2")
            install("pyjwt")
            install("tenacity")
            install("tqdm")
            install("termcolor")
            install("pathspec")
            install("socksio")
            install("python-multipart")
            install("typing-inspection")
            install("annotated-types")
        }
    }
    sourceSets {
        getByName("main") {
            // Backend deponun kökünde duruyor; kopyalamak yerine doğrudan
            // Python kaynak yolu olarak veriyoruz ki tek kaynak kalsın.
            srcDir("../../backend")
            // Hermes'in kırpılmış kaynağı. Tek çakışan ad `utils` idi;
            // bizimki hf_utils olarak yeniden adlandırıldı.
            srcDir(hermesSource)
        }
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
}
