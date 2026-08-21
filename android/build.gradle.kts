plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    // Chaquopy 17: Python'u APK'nın içine gömer. MIT lisanslı, AGP 7.3-9.2 ile uyumlu.
    id("com.chaquo.python") version "17.0.0" apply false
}
