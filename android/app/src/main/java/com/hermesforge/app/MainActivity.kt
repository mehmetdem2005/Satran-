package com.hermesforge.app

import android.Manifest
import android.content.ContentValues
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import android.view.View
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var splash: View
    private lateinit var splashText: android.widget.TextView
    private lateinit var retryButton: android.widget.Button

    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    /** Ataç düğmesi: WebView dosya seçiciyi kendi başına açamaz. */
    private val fileChooser = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = filePathCallback
        filePathCallback = null
        callback?.onReceiveValue(
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        )
    }

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* reddedilse de sunucu çalışır, yalnızca bildirim görünmez */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        splash = findViewById(R.id.splash)
        splashText = findViewById(R.id.splash_text)
        retryButton = findViewById(R.id.retry_button)
        webView = findViewById(R.id.web_view)

        retryButton.setOnClickListener { bootEngine() }
        configureWebView()
        requestNotificationPermissionIfNeeded()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Geri tuşu sohbet içinde gezinsin; en başta ise uygulamadan çıksın.
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        ForgeService.start(this)
        bootEngine()
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    /** Sunucunun hazır olmasını bekler, sonra arayüzü yükler. */
    private fun bootEngine() {
        splash.visibility = View.VISIBLE
        retryButton.visibility = View.GONE
        splashText.setText(R.string.starting)

        thread(name = "forge-wait") {
            val port = PythonBridge.start(applicationContext)
            runOnUiThread {
                if (port > 0) {
                    webView.loadUrl(PythonBridge.baseUrl)
                } else {
                    splashText.text = getString(R.string.start_failed) + "\n\n" + PythonBridge.lastError
                    retryButton.visibility = View.VISIBLE
                }
            }
        }
    }

    private fun configureWebView() {
        WebView.setWebContentsDebuggingEnabled(true)
        CookieManager.getInstance().setAcceptCookie(true)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // sohbet geçmişi localStorage'da
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            useWideViewPort = true
            loadWithOverviewMode = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false           // uzaktan içerik yok; gerek de yok
            allowContentAccess = false
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url ?: return false
                // Yerel arayüz WebView'de kalsın; dış bağlantılar tarayıcıya.
                if (url.host == "127.0.0.1" || url.host == "localhost") return false
                return try {
                    startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, url))
                    true
                } catch (throwable: Throwable) {
                    false
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                splash.visibility = View.GONE
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                val intent = params?.createIntent()
                if (intent == null) {
                    // Seçici açılamıyorsa geri arama boş bırakılmamalı; yoksa
                    // WebView bir daha dosya seçici istemez ve ataç düğmesi ölür.
                    callback?.onReceiveValue(null)
                    return false
                }
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                return try {
                    fileChooser.launch(intent)
                    true
                } catch (throwable: Throwable) {
                    filePathCallback = null
                    callback?.onReceiveValue(null)
                    false
                }
            }
        }

        // "İndir" düğmesi zip/tar.gz üretiyor. WebView indirmeleri kendiliğinden
        // yutar; DownloadManager'a localhost vermek de kırılgan (ayrı süreç,
        // ayrı ağ politikası). Bu yüzden indirmeyi uygulama içinde yapıyoruz.
        webView.setDownloadListener { url, _, contentDisposition, mimeType, _ ->
            downloadInApp(url, contentDisposition, mimeType)
        }
    }

    private fun downloadInApp(url: String, contentDisposition: String?, mimeType: String?) {
        val name = fileNameFrom(url, contentDisposition)
        Toast.makeText(this, "İndiriliyor: $name", Toast.LENGTH_SHORT).show()

        thread(name = "forge-download") {
            try {
                val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 15_000
                    readTimeout = 120_000
                }
                connection.inputStream.use { input ->
                    saveToDownloads(name, mimeType ?: "application/octet-stream", input)
                }
                runOnUiThread {
                    Toast.makeText(
                        this,
                        getString(R.string.download_saved, name),
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (throwable: Throwable) {
                Log.e("HermesForge", "İndirme başarısız", throwable)
                runOnUiThread {
                    Toast.makeText(
                        this,
                        getString(R.string.download_failed, throwable.message ?: name),
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }
    }

    /** Android 10+ MediaStore'a, altında klasik İndirilenler klasörüne yazar. */
    private fun saveToDownloads(name: String, mimeType: String, input: java.io.InputStream) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mimeType)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val resolver = contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("İndirilenler klasörüne yazılamadı")
            resolver.openOutputStream(uri).use { output ->
                requireNotNull(output).let { input.copyTo(it) }
            }
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
        } else {
            @Suppress("DEPRECATION")
            val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            dir.mkdirs()
            File(dir, name).outputStream().use { output -> input.copyTo(output) }
        }
    }

    private fun fileNameFrom(url: String, contentDisposition: String?): String {
        contentDisposition
            ?.let { Regex("filename\\*?=(?:UTF-8'')?\"?([^\";]+)").find(it) }
            ?.groupValues?.getOrNull(1)
            ?.let { return URLDecoder.decode(it, "UTF-8").substringAfterLast('/') }

        return url.substringAfterLast('/').substringBefore('?').ifBlank { "hermesforge-indirme" }
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
