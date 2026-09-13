package com.satran.jobapply.watch

import android.Manifest
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import com.satran.jobapply.MainActivity
import com.satran.jobapply.SatranApp
import java.util.concurrent.TimeUnit

/**
 * Ön plan servisi öldüğünde devreye giren yedek denetim.
 *
 * Dakikalık hassasiyeti bu **veremez** — WorkManager'ın alt sınırı 15
 * dakikadır. Amacı başka: bazı markalar (Xiaomi, Huawei, Samsung) pil
 * yönetimiyle ön plan servislerini de uyutuyor, Android 15 ise süre sınırı
 * koyabiliyor. Öyle bir durumda liste saatlerce donmuş kalmasın diye 15
 * dakikada bir aynı denetim çalışır.
 */
class LiveWatchWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? SatranApp ?: return Result.success()
        val settings = app.container.settingsStore.settings.value
        if (!settings.backgroundWatch) {
            cancel(applicationContext)
            return Result.success()
        }

        // Ön plan servisi yaşıyorsa zaten dakikada bir denetliyor; yedek işin
        // aynı turu tekrarlaması boşa istek ve çift bildirim demek.
        val sinceLastCheck = System.currentTimeMillis() - app.container.liveWatch.state.value.lastCheckAt
        if (sinceLastCheck in 0 until SERVICE_ALIVE_WINDOW_MS) return Result.success()

        val result = LiveWatcher(app.container).sweep(settings)
        if (result.fresh.isNotEmpty()) notifyNewJobs(result.fresh.size, result.fresh.first().title)
        return Result.success()
    }

    private fun notifyNewJobs(count: Int, firstTitle: String) {
        if (ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val open = PendingIntent.getActivity(
            applicationContext,
            0,
            Intent(applicationContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(applicationContext, SatranApp.WATCH_CHANNEL_ID)
            .setContentTitle("$count yeni ilan")
            .setContentText(firstTitle)
            .setSmallIcon(android.R.drawable.stat_notify_more)
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        applicationContext.getSystemService(NotificationManager::class.java)
            ?.notify(NOTIFICATION_ID, notification)
    }

    companion object {
        const val WORK_NAME = "satran_live_watch_fallback"

        /** Bu süre içinde denetim olduysa servis ayaktadır, yedek çalışmaz. */
        private const val SERVICE_ALIVE_WINDOW_MS = 5 * 60 * 1000L
        private const val NOTIFICATION_ID = 4303

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<LiveWatchWorker>(15, TimeUnit.MINUTES)
                .setConstraints(
                    Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
                )
                .build()
            WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
                WORK_NAME,
                // KEEP: zaten kuruluysa sayacı sıfırlamasın, yoksa servis her
                // açılışta yedeği baştan başlatıp hiç çalıştırmazdı.
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context.applicationContext).cancelUniqueWork(WORK_NAME)
        }
    }
}
