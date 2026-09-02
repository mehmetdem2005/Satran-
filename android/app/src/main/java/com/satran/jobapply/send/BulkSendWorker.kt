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
import androidx.work.ForegroundInfo
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

/**
 * Toplu gönderimi ön plan bildirimiyle yürütür. Tek SMTP oturumu açar,
 * iletileri sırayla yollar ve her sonucu geçmişe yazar.
 */
class BulkSendWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    private val container = (context.applicationContext as SatranApp).container

    override suspend fun doWork(): Result {
        val queue = container.sendQueueStore.read()
        if (queue.isEmpty()) return Result.success(workDataOf(KEY_SENT to 0, KEY_FAILED to 0))

        val settings = container.settingsStore.settings.value
        setForeground(foregroundInfo(0, queue.size, queue.first().employer))

        val cv: CvFile? = if (settings.cvUri.isNotBlank()) {
            runCatching { CvLoader.load(applicationContext, settings.cvUri) }.getOrNull()
        } else {
            null
        }
        val cvError = settings.cvUri.isNotBlank() && cv == null

        var sent = 0
        var failed = 0
        val results = mutableListOf<SendRecord>()

        try {
            GmailSender(settings).use { sender ->
                sender.connect()

                queue.forEachIndexed { index, mail ->
                    currentCoroutineContext().ensureActive()
                    if (isStopped) return@forEachIndexed
                    setForeground(foregroundInfo(index, queue.size, mail.employer))
                    setProgress(
                        workDataOf(
                            KEY_PROGRESS to index,
                            KEY_TOTAL to queue.size,
                            KEY_CURRENT to mail.employer,
                        ),
                    )

                    val record = runCatching {
                        sender.send(
                            GmailSender.Outgoing(
                                to = mail.to,
                                subject = mail.subject,
                                body = if (cvError) {
                                    mail.body + "\n\n(Not: CV eki bu iletiye eklenemedi.)"
                                } else {
                                    mail.body
                                },
                                attachment = cv,
                            ),
                        )
                    }.fold(
                        onSuccess = {
                            sent++
                            SendRecord(mail.caseNumber, mail.title, mail.employer, mail.to, SendStatus.SENT)
                        },
                        onFailure = { error ->
                            failed++
                            SendRecord(
                                caseNumber = mail.caseNumber,
                                title = mail.title,
                                employer = mail.employer,
                                email = mail.to,
                                status = SendStatus.FAILED,
                                error = error.message ?: error::class.java.simpleName,
                            )
                        },
                    )
                    results += record

                    // Gmail dakikada çok sayıda iletiye takılabiliyor; araya nefes payı koy.
                    if (index < queue.lastIndex && settings.sendDelaySeconds > 0) {
                        delay(settings.sendDelaySeconds * 1000L)
                    }
                }
            }
        } catch (e: Exception) {
            // Bağlantı hiç kurulamadıysa kalan iletileri başarısız olarak işaretle.
            val handled = results.map { it.caseNumber }.toSet()
            queue.filterNot { it.caseNumber in handled }.forEach { mail ->
                failed++
                results += SendRecord(
                    caseNumber = mail.caseNumber,
                    title = mail.title,
                    employer = mail.employer,
                    email = mail.to,
                    status = SendStatus.FAILED,
                    error = e.message ?: "Bağlantı kurulamadı",
                )
            }
            container.historyStore.addAll(results)
            container.sendQueueStore.clear()
            notifyDone(sent, failed)
            return Result.failure(
                workDataOf(KEY_SENT to sent, KEY_FAILED to failed, KEY_ERROR to (e.message ?: "Gönderim başarısız")),
            )
        }

        container.historyStore.addAll(results)
        container.sendQueueStore.clear()
        notifyDone(sent, failed)
        return Result.success(workDataOf(KEY_SENT to sent, KEY_FAILED to failed))
    }

    private fun foregroundInfo(index: Int, total: Int, current: String): ForegroundInfo {
        val notification = NotificationCompat.Builder(applicationContext, SatranApp.CHANNEL_ID)
            .setContentTitle("Başvurular gönderiliyor")
            .setContentText("${index + 1}/$total — $current")
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setOngoing(true)
            .setProgress(total, index, false)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(NOTIFICATION_ID, notification)
        }
    }

    private fun notifyDone(sent: Int, failed: Int) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val text = buildString {
            append("$sent gönderildi")
            if (failed > 0) append(", $failed başarısız")
        }
        val notification = NotificationCompat.Builder(applicationContext, SatranApp.CHANNEL_ID)
            .setContentTitle("Başvurular tamamlandı")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_upload_done)
            .setAutoCancel(true)
            .build()
        val manager = applicationContext.getSystemService(NotificationManager::class.java)
        manager?.notify(DONE_NOTIFICATION_ID, notification)
    }

    companion object {
        const val WORK_NAME = "satran_bulk_send"
        const val KEY_PROGRESS = "progress"
        const val KEY_TOTAL = "total"
        const val KEY_CURRENT = "current"
        const val KEY_SENT = "sent"
        const val KEY_FAILED = "failed"
        const val KEY_ERROR = "error"

        private const val NOTIFICATION_ID = 4201
        private const val DONE_NOTIFICATION_ID = 4202
    }
}
