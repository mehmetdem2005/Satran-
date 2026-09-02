package com.satran.jobapply.send

import android.content.Context
import com.satran.jobapply.core.Net
import kotlinx.serialization.builtins.ListSerializer
import java.io.File

/**
 * Gönderim kuyruğu diskte tutulur; böylece uygulama arka plana atılsa ya da
 * süreç yeniden başlasa da WorkManager işi kaldığı yerden sürdürebilir.
 */
class SendQueueStore(context: Context) {

    private val file = File(context.applicationContext.filesDir, "send_queue.json")

    fun write(mails: List<QueuedMail>) {
        file.writeText(Net.json.encodeToString(ListSerializer(QueuedMail.serializer()), mails))
    }

    fun read(): List<QueuedMail> {
        if (!file.exists()) return emptyList()
        return runCatching {
            Net.json.decodeFromString(ListSerializer(QueuedMail.serializer()), file.readText())
        }.getOrElse { emptyList() }
    }

    fun clear() {
        file.delete()
    }
}
