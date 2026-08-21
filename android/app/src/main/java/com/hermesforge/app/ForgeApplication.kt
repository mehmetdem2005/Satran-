package com.hermesforge.app

import android.app.Application
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform

/**
 * Chaquopy'yi süreç ömrü boyunca bir kez başlatır.
 *
 * Python çalışma zamanı Activity'ye değil sürece bağlı: ekran döndüğünde ya
 * da Activity yeniden yaratıldığında sunucu ayakta kalmalı.
 */
class ForgeApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (!Python.isStarted()) {
            Python.start(AndroidPlatform(this))
        }
    }
}
