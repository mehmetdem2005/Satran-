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

// Chaquopy'nin tüm ayarları kendi bloğunda; android bloğunun yapısını yansıtır.
chaquopy {
    defaultConfig {
        version = "3.11"
        pip {
            // HermesForge'un bağımlılıkları — üçü de saf Python.
            install("flask>=3.0")
            install("requests>=2.31")
            install("pypdf>=4.0")
        }
    }
    sourceSets {
        getByName("main") {
            // Backend deponun kökünde duruyor; kopyalamak yerine doğrudan
            // Python kaynak yolu olarak veriyoruz ki tek kaynak kalsın.
            srcDir("../../backend")
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
}
