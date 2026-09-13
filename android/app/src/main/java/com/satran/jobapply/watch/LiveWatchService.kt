package com.satran.jobapply.watch

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.satran.jobapply.MainActivity
import com.satran.jobapply.SatranApp
import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.data.model.Job
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job as CoroutineJob
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Uygulama kapalıyken de listeyi dakikalık hassasiyette denetleyen servis.
 *
 * **Neden servis, neden kalıcı bildirim:** Android'de zamanlanmış işlerin
 * (WorkManager) en sık çalışma aralığı 15 dakikadır ve bu değiştirilemez.
 * Dakikada bir iş yapmanın tek meşru yolu ön plan servisidir; sistem de
 * karşılığında kalıcı bir bildirim ister. Bildirim işletim sisteminin şartı.
 *
 * **Neden `specialUse`:** Android 15'te `dataSync` türü günde 6 saatle
 * sınırlı; sınır dolunca sistem servisi durduruyor. `specialUse` bu sınıra
 * tabi değil. (Play Store'a çıkarken bu tür gerekçe ister; bu uygulama yan
 * yükleniyor.) Yine de sistem durdurursa [onTimeout] devreye girer ve
 * [LiveWatchWorker] 15 dakikalık yedek denetimi sürdürür.
 */
class LiveWatchService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var loop: CoroutineJob? = null

    private val container by lazy { (application as SatranApp).container }

    // Kap ile aynı örnek: servis uygulamayla aynı süreçte döndüğü için ayrı
    // bir örnek kurulursa ikisi aynı dosyaya yazıp birbirini ezerdi.
    private val watchStore by lazy { container.liveWatch }
    private val watcher by lazy { LiveWatcher(container) }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            container.settingsStore.update { it.copy(backgroundWatch = false) }
            LiveWatchWorker.cancel(this)
            stopEverything()
            return START_NOT_STICKY
        }

        // START_STICKY ile sistem servisi boş niyetle geri getirebilir; ayar
        // kapanmışsa bildirimi hiç göstermeden çekiliriz.
        if (!container.settingsStore.settings.value.backgroundWatch) {
            stopEverything()
            return START_NOT_STICKY
        }

        startForegroundCompat(buildNotification(container.settingsStore.settings.value))
        // Servis öldürülürse yedek 15 dakikalık denetim devralsın.
        LiveWatchWorker.schedule(this)
        if (loop?.isActive != true) loop = scope.launch { watchLoop() }
        return START_STICKY
    }

    /**
     * Android 15+ bir ön plan servisini süre sınırından durdurduğunda çağrılır.
     * Burada temiz durmazsak sistem uygulamayı ANR ile öldürüyor.
     */
    override fun onTimeout(startId: Int, fgsType: Int) {
        watchStore.update {
            it.copy(lastError = "Sistem izlemeyi durdurdu; 15 dakikalık yedek denetim sürüyor.")
        }
        LiveWatchWorker.schedule(this)
        stopEverything()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun stopEverything() {
        loop?.cancel()
        loop = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    // ------------------------------------------------------------------ döngü

    private suspend fun watchLoop() {
        while (true) {
            val settings = container.settingsStore.settings.value
            if (!settings.backgroundWatch) {
                stopEverything()
                return
            }
            delay(intervalSeconds(settings) * 1000L)
            tick(container.settingsStore.settings.value)
        }
    }

    private suspend fun tick(settings: AppSettings) {
        val result = watcher.sweep(settings)
        updateNotification(buildNotification(settings))
        if (result.fresh.isNotEmpty()) notifyNewJobs(result.fresh)
    }

    private fun intervalSeconds(settings: AppSettings): Int =
        settings.liveRefreshSeconds.coerceAtLeast(MIN_INTERVAL_SECONDS)

    // --------------------------------------------------------------- bildirim

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(WATCH_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(WATCH_NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotification(notification: Notification) {
        if (!canNotify()) return
        getSystemService(NotificationManager::class.java)?.notify(WATCH_NOTIFICATION_ID, notification)
    }

    private fun buildNotification(settings: AppSettings): Notification {
        val watch = watchStore.state.value
        val interval = intervalSeconds(settings)
        val text = buildString {
            if (watch.lastCheckAt > 0) {
                append("Son denetim ${CLOCK.format(Date(watch.lastCheckAt))}")
                append(" · ${watch.watchedCount} ilan soruldu")
            } else {
                append("İlk denetim $interval sn içinde")
            }
            if (watch.newJobs.isNotEmpty()) append(" · ${watch.newJobs.size} yeni")
            if (watch.removedTotal > 0) append(" · ${watch.removedTotal} kalktı")
            watch.lastError?.let { append("\n$it") }
        }

        return NotificationCompat.Builder(this, SatranApp.WATCH_CHANNEL_ID)
            .setContentTitle("İlanlar izleniyor ($interval sn)")
            .setContentText(text.lineSequence().first())
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .setShowWhen(false)
            .setContentIntent(openAppIntent())
            .addAction(0, "Durdur", stopIntent())
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun notifyNewJobs(fresh: List<Job>) {
        if (!canNotify()) return
        val lines = fresh.take(5).joinToString("\n") { "• ${it.title} — ${it.location}" }
        val more = if (fresh.size > 5) "\n… ve ${fresh.size - 5} ilan daha" else ""
        val notification = NotificationCompat.Builder(this, SatranApp.WATCH_CHANNEL_ID)
            .setContentTitle("${fresh.size} yeni ilan")
            .setContentText(fresh.first().title)
            .setStyle(NotificationCompat.BigTextStyle().bigText(lines + more))
            .setSmallIcon(android.R.drawable.stat_notify_more)
            .setAutoCancel(true)
            .setContentIntent(openAppIntent())
            .build()
        getSystemService(NotificationManager::class.java)?.notify(NEW_JOBS_NOTIFICATION_ID, notification)
    }

    private fun canNotify(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED

    private fun openAppIntent(): PendingIntent = PendingIntent.getActivity(
        this,
        0,
        Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE,
    )

    private fun stopIntent(): PendingIntent = PendingIntent.getService(
        this,
        1,
        Intent(this, LiveWatchService::class.java).setAction(ACTION_STOP),
        PendingIntent.FLAG_IMMUTABLE,
    )

    companion object {
        const val ACTION_STOP = "com.satran.jobapply.STOP_WATCH"

        /**
         * Arka planda pil için alt sınır. Kullanıcı 30 sn seçse de burada
         * 60 sn'nin altına inilmez: istenen dakikalık hassasiyeti zaten
         * karşılıyor, daha sıkısı pili belirgin yiyor.
         */
        const val MIN_INTERVAL_SECONDS = 60

        private const val WATCH_NOTIFICATION_ID = 4301
        private const val NEW_JOBS_NOTIFICATION_ID = 4302

        private val CLOCK = SimpleDateFormat("HH:mm", Locale("tr"))

        fun start(context: Context) {
            ContextCompat.startForegroundService(
                context.applicationContext,
                Intent(context.applicationContext, LiveWatchService::class.java),
            )
        }

        fun stop(context: Context) {
            val app = context.applicationContext
            app.stopService(Intent(app, LiveWatchService::class.java))
            LiveWatchWorker.cancel(app)
        }
    }
}
