package com.satran.jobapply.send

/** Bir gönderim denemesinden sonra kuyruğun ne yapacağı. */
sealed interface SendDecision {
    /** Gitti; kuyruktan düş, sayacı artır. */
    data object Sent : SendDecision

    /** Kalıcı hata; kuyruktan düş, başarısız yaz. Tekrar denemek anlamsız. */
    data class Drop(val reason: String) : SendDecision

    /** Geçici hata; sona al, aynı turda tekrar denenecek. */
    data class Defer(val reason: String) : SendDecision

    /** Kota / hız sınırı ya da bağlantı gitti; turu bitir, sonraya bırak. */
    data class Pause(val reason: String, val untilTomorrow: Boolean) : SendDecision
}

/**
 * Gönderim turunun karar mantığı — Android'den bağımsız, bu yüzden sınanabilir.
 *
 * Eskiden bu karar doğrudan `BulkSendWorker`'ın içindeydi ve orada "başarılı da
 * olsa başarısız da olsa kuyruktan sil" deniyordu: ağ koptuğu an denk gelen
 * başvuru kalıcı olarak kayboluyordu. Mantık buraya çıkınca hem worker hem de
 * simülasyon aynı kodu çalıştırıyor.
 */
object SendPolicy {

    /** Kaç ardışık geçici hatadan sonra "bağlantı gitmiş" sayılır. */
    const val MAX_TRANSIENT_STREAK = 5

    /**
     * Tek bir iletiye en fazla kaç kez denenir.
     *
     * Olmasaydı, hatası geçici sanılan ama aslında hep başarısız olan bir
     * ileti kuyruktan hiç çıkmaz; gönderim sonsuza kadar onun etrafında
     * döner ve arkasındaki başvurular hiç gönderilmezdi.
     */
    const val MAX_ATTEMPTS_PER_MAIL = 4

    fun decide(error: Throwable?, transientStreak: Int, attempts: Int = 0): SendDecision {
        if (error == null) return SendDecision.Sent

        val failure = MailFailures.classify(error)
        return when (failure.kind) {
            FailureKind.PERMANENT -> SendDecision.Drop(failure.reason)

            FailureKind.THROTTLED ->
                SendDecision.Pause(failure.reason, untilTomorrow = true)

            FailureKind.TRANSIENT -> when {
                // Kota/hız değil, bu iletiye özgü kalıcı bir sorun.
                attempts + 1 >= MAX_ATTEMPTS_PER_MAIL ->
                    SendDecision.Drop("${failure.reason} (${MAX_ATTEMPTS_PER_MAIL} denemede ulaşılamadı)")

                transientStreak + 1 >= MAX_TRANSIENT_STREAK ->
                    SendDecision.Pause(failure.reason, untilTomorrow = false)

                else -> SendDecision.Defer(failure.reason)
            }
        }
    }
}
