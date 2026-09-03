plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.satran.jobapply"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.satran.jobapply"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        // x86/x86_64 yalnızca emülatörlerde kullanılır; paketlemiyoruz.
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = false
    }

    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs += listOf(
            "-opt-in=androidx.compose.foundation.layout.ExperimentalLayoutApi",
            "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api",
            "-opt-in=androidx.compose.ui.ExperimentalComposeUiApi",
        )
    }

    buildFeatures {
        compose = true
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/*.kotlin_module",
                "META-INF/DEPENDENCIES*",
                "META-INF/LICENSE*",
                "META-INF/license*",
                "META-INF/NOTICE*",
                "META-INF/notice*",
                "META-INF/*.md",
                "META-INF/INDEX.LIST",
            )
        }
    }

    /**
     * Cihaz üstü çeviri modeli (ML Kit) her işlemci mimarisi için ayrı yerel
     * kütüphane getiriyor ve tek APK'yı 84 MB'a çıkarıyordu. x86/x86_64
     * yalnızca emülatörlerde kullanılır; gerçek telefonlar ARM'dir.
     * Mimari başına ayrı APK üretiliyor, ayrıca ikisini birleştiren
     * "universal" APK da çıkıyor.
     */
    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a")
            isUniversalApk = true
        }
    }

    lint {
        abortOnError = false
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.documentfile)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.javamail.android.mail)
    implementation(libs.javamail.android.activation)
    implementation(libs.mlkit.translate)
    debugImplementation(libs.androidx.ui.tooling)
    testImplementation(libs.junit)
}
