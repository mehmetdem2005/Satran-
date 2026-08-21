package com.hermesforge.app

import android.content.Context
import android.util.Log
import com.chaquo.python.PyObject
import com.chaquo.python.Python
import java.io.File

/**
 * Gömülü Python sunucusunu yöneten tek nokta.
 *
 * Sunucu süreç başına bir kez başlar; [start] yeniden çağrıldığında zaten
 * çalışan portu döndürür. Bu, Activity yeniden yaratıldığında ikinci bir
 * sunucu açılmasını önler.
 */
object PythonBridge {
    private const val TAG = "HermesForge"
    private const val FRONTEND_ASSET = "frontend.zip"

    @Volatile
    var port: Int = 0
        private set

    @Volatile
    var lastError: String = ""
        private set

    val isRunning: Boolean get() = port > 0

    val baseUrl: String get() = "http://127.0.0.1:$port/"

    /** Sunucuyu başlatır (idempotent). Çağıran iş parçacığını bloklar. */
    @Synchronized
    fun start(context: Context): Int {
        if (port > 0) return port

        return try {
            val module: PyObject = Python.getInstance().getModule("android_main")
            val frontendZip = extractFrontendZip(context)
            val result = module.callAttr(
                "start",
                context.filesDir.absolutePath,
                frontendZip.absolutePath
            ).toInt()

            if (result > 0) {
                port = result
                Log.i(TAG, "Python sunucusu 127.0.0.1:$result adresinde")
            } else {
                lastError = module.callAttr("last_error").toString()
                Log.e(TAG, "Python sunucusu başlamadı: $lastError")
            }
            result
        } catch (throwable: Throwable) {
            // Python tarafındaki her hata buraya düşer; kullanıcıya boş ekran
            // yerine sebebini gösterebilmek için saklıyoruz.
            lastError = throwable.message ?: throwable.toString()
            Log.e(TAG, "Python köprüsü çöktü", throwable)
            0
        }
    }

    /**
     * Arayüz arşivini asset'ten dosya sistemine kopyalar.
     *
     * Python tarafı zip'i okuyup açıyor; asset'ler doğrudan dosya yolu
     * olmadığı için önce buraya kopyalanmaları gerekiyor.
     */
    private fun extractFrontendZip(context: Context): File {
        val target = File(context.cacheDir, FRONTEND_ASSET)
        context.assets.open(FRONTEND_ASSET).use { input ->
            target.outputStream().use { output -> input.copyTo(output) }
        }
        return target
    }
}
