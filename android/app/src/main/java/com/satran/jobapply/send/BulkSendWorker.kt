package com.satran.jobapply.send

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.satran.jobapply.SatranApp
import com.satran.jobapply.data.mail.CvFile
import com.satran.jobapply.data.mail.CvLoader
import com.satran.jobapply.data.mail.GmailSender
import com.satran.jobapply.data.model.SendRecord
import com.satran.jobapply.data.model.SendStatus
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import java.util.Calendar
import java.util.concurrent.TimeUnit

/**
 * Kuyruğu ön plan bildirimiyle işler.
 *
 * Binlerce başvuru tek oturumda gönderilemez: Gmail ücretsiz hesapta günde
 * ~500 ileti sınırı koyar, aşılırsa hesap geçici olarak kilitlenir. Bu yüzden
 * işçi **günlük kotaya kadar** gönderir, sonra kendini ertesi güne planlar ve
 * kaldığı yerden sürer. Her ileti gönderilir gönderilmez kuyruktan düşer, o
 * yüzden süreç ortada ölse bile aynı işverene ikinci kez yazılmaz.
 */
class BulkSendWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    private val container = (context.applicationContext as SatranApp).container

    override suspend fun doWork(): Result {
        val queue = container.sendQueueStore
        var state = queue.rolloverIfNeeded()
        if (!state.isActive) return Result.success(summaryData(state))

        val settings = container.settingsStore.settings.value
        val dailyLimit = settings.dailySendLimit.coerceAtLeast(1)
        var remainingToday = dailyLimit - state.sentToday

        if (remainingToday <= 0) {
            scheduleNextDay()
            notifyPaused(state)
            return Result.success(summaryData(state))
        }

        setForeground(foregroundInfo(state, state.pending.firstOrNull()?.employer.orEmpty()))

        val cv: CvFile? = settings.cvUri.takeIf { it.isNotBlank() }?.let { uri ->
            runCatching { CvLoader.load(applicationContext, uri) }.getOrNull()
        }
        val cvMissing = settings.cvUri.isNotBlank() && cv == null

        try {
            GmailSender(settings).use { sender ->
                sender.connect()

                while (remainingToday > 0) {
                    currentCoroutineContext().ensureActive()
                    if (isStopped) break

                    val mail = queue.state.value.pending.firstOrNull() ?: break

                    setForeground(foregroundInfo(queue.state.value, mail.employer))
                    setProgress(
                        workDataOf(
                            KEY_PROGRESS to queue.state.value.doneCount,
                            KEY_TOTAL to queue.state.value.totalQueued,
                            KEY_CURRENT to mail.employer,
                            KEY_TODAY to queue.state.value.sentToday,
                            KEY_DAILY_LIMIT to dailyLimit,
                        ),
                    )

                    val outcome = runCatching {
                        // Gönderilen içerik kuyruğa yazıldığı gibidir; burada
                        // hiçbir alan yeniden türetilmez, böylece ilanların
                        // bilgileri birbirine karışamaz.
                        sender.send(
                            GmailSender.Outgoing(
                                to = mail.to,
                                subject = mail.subject,
                                body = if (cvMissing) {
                                    mail.body + "\n\n(Not: CV eki bu iletiye eklenemedi.)"
                                } else {
                                    mail.body
                                },
                                attachment = cv,
                            ),
                        )
                    }

                    container.historyStore.add(
                        SendRecord(
                            caseNumber = mail.caseNumber,
                            title = mail.title,
                            employer = mail.employer,
                            email = mail.to,
                            status = if (outcome.isSuccess) SendStatus.SENT else SendStatus.FAILED,
                            error = outcome.exceptionOrNull()?.let { it.message ?: it::class.java.simpleName },
                        ),
                    )
                    state = queue.complete(mail.caseNumber, outcome.isSuccess)
                    if (outcome.isSuccess) remainingToday--

                    if (queue.state.value.isActive && remainingToday > 0 && settings.sendDelaySeconds > 0) {
                        delay(settings.sendDelaySeconds * 1000L)
                    }
                }
            }
        } catch (e: Exception) {
            // Bağlantı kurulamadıysa kuyruk olduğu gibi kalır; birazdan yeniden denenir.
            scheduleRetry()
            notifyError(e.message ?: "Bağlantı kurulamadı")
            return Result.success(
                summaryData(state).let { workDataOf(KEY_ERROR to (e.message ?: "Bağlantı kurulamadı")) },
            )
        }

        return when {
            !queue.state.value.isActive -> {
                notifyDone(queue.state.value)
                queue.clear()
                Result.success(summaryData(state))
            }
            else -> {
                // Günlük kota doldu; yarın kaldığı yerden devam eder.
                scheduleNextDay()
                notifyPaused(queue.state.value)
                Result.success(summaryData(queue.state.value))
            }
        }
    }

    // ---------------------------------------------------------------- planlama

    private fun scheduleNextDay() {
        val now = Calendar.getInstance()
        val next = (now.clone() as Calendar).apply {
            add(Calendar.DAY_OF_YEAR, 1)
            set(Calendar.HOUR_OF_DAY, 9)
            set(Calendar.MINUTE, 5)
            set(Calendar.SECOND, 0)
        }
        val delayMs = (next.timeInMillis - now.timeInMillis).coerceAtLeast(TimeUnit.MINUTES.toMillis(30))
        enqueueSelf(delayMs)
    }

    private fun scheduleRetry() = enqueueSelf(TimeUnit.MINUTES.toMillis(15))

    private fun enqueueSelf(delayMs: Long) {
        WorkManager.getInstance(applicationContext).enqueueUniqueWork(
            WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<BulkSendWorker>()
                .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
                .build(),
        )
    }

    // ---------------------------------------------------------------- bildirim

    private fun foregroundInfo(state: SendQueueState, current: String): ForegroundInfo {
        val total = state.totalQueued.coerceAtLeast(1)
        val notification = NotificationCompat.Builder(applicationContext, SatranApp.CHANNEL_ID)
            .setContentTitle("Başvurular gönderiliyor")
            .setContentText("${state.doneCount}/$total — $current")
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setOngoing(true)
            .setProgress(total, state.doneCount, false)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(NOTIFICATION_ID, notification)
        }
    }

    private fun notify(title: String, text: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val notification = NotificationCompat.Builder(applicationContext, SatranApp.CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setSmallIcon(android.R.drawable.stat_sys_upload_done)
            .setAutoCancel(true)
            .build()
        applicationContext.getSystemService(NotificationManager::class.java)
            ?.notify(DONE_NOTIFICATION_ID, notification)
    }

    private fun notifyDone(state: SendQueueState) = notify(
        "Başvurular tamamlandı",
        "${state.sentTotal} gönderildi" + if (state.failedTotal > 0) ", ${state.failedTotal} başarısız" else "",
    )

    private fun notifyPaused(state: SendQueueState) = notify(
        "Günlük sınıra ulaşıldı",
        "${state.sentTotal} gönderildi, ${state.pending.size} bekliyor. " +
            "Gmail'in günlük sınırı yüzünden yarın kaldığı yerden devam edecek.",
    )

    private fun notifyError(message: String) = notify(
        "Gönderim duraklatıldı",
        "$message — 15 dakika sonra yeniden denenecek.",
    )

    private fun summaryData(state: SendQueueState) = workDataOf(
        KEY_SENT to state.sentTotal,
        KEY_FAILED to state.failedTotal,
        KEY_PENDING to state.pending.size,
    )

    companion object {
        const val WORK_NAME = "satran_bulk_send"
        const val KEY_PROGRESS = "progress"
        const val KEY_TOTAL = "total"
        const val KEY_CURRENT = "current"
        const val KEY_TODAY = "today"
        const val KEY_DAILY_LIMIT = "daily_limit"
        const val KEY_SENT = "sent"
        const val KEY_FAILED = "failed"
        const val KEY_PENDING = "pending"
        const val KEY_ERROR = "error"

        private const val NOTIFICATION_ID = 4201
        private const val DONE_NOTIFICATION_ID = 4202
    }
}
