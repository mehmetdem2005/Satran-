package com.satran.jobapply.send

import android.content.Context
import com.satran.jobapply.core.Net
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Kuyruğun kalıcı durumu.
 *
 * Binlerce başvuru Gmail'in günlük sınırı yüzünden günlere yayılır; bu yüzden
 * yalnızca bekleyen iletiler değil, **nereye kadar gelindiği** de saklanır.
 */
@Serializable
data class SendQueueState(
    val pending: List<QueuedMail> = emptyList(),
    val totalQueued: Int = 0,
    val sentTotal: Int = 0,
    val failedTotal: Int = 0,
    /** Bugün gönderilen sayısı — günlük kota için. */
    val sentToday: Int = 0,
    /** Günlük sayacın ait olduğu gün (yyyy-MM-dd). Gün değişince sıfırlanır. */
    val dayStamp: String = "",
    val startedAt: Long = 0L,
    val lastSentAt: Long = 0L,
) {
    val isActive: Boolean get() = pending.isNotEmpty()
    val doneCount: Int get() = sentTotal + failedTotal
}

/**
 * Gönderim kuyruğu diskte tutulur; uygulama kapansa, süreç ölse ya da telefon
 * yeniden başlasa da iş kaldığı yerden sürer.
 *
 * Her ileti gönderildikten **hemen sonra** kuyruktan düşülür ve dosya yazılır:
 * süreç ortada ölürse aynı işverene ikinci kez yazılmaz.
 */
class SendQueueStore(context: Context) {

    private val file = File(context.applicationContext.filesDir, "send_queue.json")

    private val _state = MutableStateFlow(load())
    val state: StateFlow<SendQueueState> = _state.asStateFlow()

    @Synchronized
    fun enqueue(mails: List<QueuedMail>) {
        val fresh = SendQueueState(
            pending = mails,
            totalQueued = mails.size,
            startedAt = System.currentTimeMillis(),
            dayStamp = today(),
        )
        write(fresh)
    }

    /** Gün değiştiyse günlük sayacı sıfırlar ve güncel durumu döndürür. */
    @Synchronized
    fun rolloverIfNeeded(): SendQueueState {
        val current = _state.value
        val today = today()
        if (current.dayStamp == today) return current
        val rolled = current.copy(sentToday = 0, dayStamp = today)
        write(rolled)
        return rolled
    }

    /** Bir iletiyi sonuçlandırır: kuyruktan düşer, sayaçlar güncellenir. */
    @Synchronized
    fun complete(caseNumber: String, succeeded: Boolean): SendQueueState {
        val current = _state.value
        val next = current.copy(
            pending = current.pending.filterNot { it.caseNumber == caseNumber },
            sentTotal = current.sentTotal + if (succeeded) 1 else 0,
            failedTotal = current.failedTotal + if (succeeded) 0 else 1,
            sentToday = current.sentToday + if (succeeded) 1 else 0,
            lastSentAt = System.currentTimeMillis(),
        )
        write(next)
        return next
    }

    @Synchronized
    fun clear() {
        _state.value = SendQueueState()
        file.delete()
    }

    private fun write(next: SendQueueState) {
        _state.value = next
        runCatching { file.writeText(Net.json.encodeToString(SendQueueState.serializer(), next)) }
    }

    private fun load(): SendQueueState {
        if (!file.exists()) return SendQueueState()
        return runCatching {
            Net.json.decodeFromString(SendQueueState.serializer(), file.readText())
        }.getOrElse { SendQueueState() }
    }

    private fun today(): String = DAY_FORMAT.format(Date())

    private companion object {
        val DAY_FORMAT = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    }
}
