package com.satran.jobapply.send

/**
 * Bir gönderimin neden başarısız olduğunu ve tekrar denenip denemeyeceğini söyler.
 *
 * Ayrım önemli: kuyruk başarısız iletiyi siliyordu, yani Gmail'in hız sınırına
 * takılan ya da internet koptuğu an denk gelen başvuru **kalıcı olarak**
 * kayboluyordu. Adresi olmayan bir işverene tekrar yazmanın anlamı yok, ama
 * "birazdan tekrar dene" diyen bir sunucuya kulak asmamak başvuru kaybettirir.
 */
enum class FailureKind {
    /** Adres yok, kutu kapalı, alan adı yanlış. Tekrar denemek anlamsız. */
    PERMANENT,

    /** Ağ hatası, sunucu meşgul. Aynı oturumda sona alınıp tekrar denenir. */
    TRANSIENT,

    /** Günlük kota ya da hız sınırı. Gönderim durdurulup sonraya bırakılır. */
    THROTTLED,
}

data class MailFailure(
    val kind: FailureKind,
    /** Kullanıcıya gösterilecek, gruplanabilir kısa sebep. */
    val reason: String,
) {
    val retryable: Boolean get() = kind != FailureKind.PERMANENT
}

object MailFailures {

    /**
     * Sunucu yanıtını sınıflandırır.
     *
     * SMTP kodları tek başına yetmiyor: Gmail günlük kotayı `550 5.4.5` ile,
     * yani kalıcı hata kodu ile bildiriyor — oysa ertesi gün geçiyor. Bu yüzden
     * metne de bakılıyor.
     */
    fun classify(error: Throwable?): MailFailure {
        val text = buildString {
            var e = error
            var depth = 0
            while (e != null && depth < 5) {
                append(e.message.orEmpty()).append(' ')
                append(e::class.java.simpleName).append(' ')
                e = e.cause
                depth++
            }
        }.lowercase()

        return when {
            text.isBlank() -> MailFailure(FailureKind.TRANSIENT, "Bilinmeyen hata")

            // Kota ve hız sınırı: kod 5xx olsa da ertesi gün geçiyor.
            text.contains("5.4.5") ||
                text.contains("daily user sending") ||
                text.contains("daily sending quota") ||
                text.contains("sending limit exceeded") ->
                MailFailure(FailureKind.THROTTLED, "Gmail günlük gönderim sınırı")

            text.contains("421") ||
                text.contains("4.7.0") ||
                text.contains("try again later") ||
                text.contains("too many") ||
                text.contains("rate limit") ->
                MailFailure(FailureKind.THROTTLED, "Gmail hız sınırı — çok hızlı gönderildi")

            // Kalıcı: adres yok ya da reddedildi.
            text.contains("5.1.1") ||
                text.contains("5.1.2") ||
                text.contains("5.1.3") ||
                text.contains("does not exist") ||
                text.contains("address not found") ||
                text.contains("user unknown") ||
                text.contains("no such user") ||
                text.contains("recipient rejected") ||
                text.contains("invalid address") ||
                text.contains("addressexception") ->
                MailFailure(FailureKind.PERMANENT, "Adres yok ya da kapanmış")

            text.contains("5.7.1") || text.contains("blocked") || text.contains("spam") ->
                MailFailure(FailureKind.PERMANENT, "Alıcı sunucu iletiyi reddetti")

            text.contains("5.2.2") || text.contains("quota exceeded") || text.contains("mailbox full") ->
                MailFailure(FailureKind.PERMANENT, "Alıcının posta kutusu dolu")

            // Ağ: her zaman geçici.
            text.contains("timeout") ||
                text.contains("timed out") ||
                text.contains("connection reset") ||
                text.contains("unable to connect") ||
                text.contains("connectexception") ||
                text.contains("unknownhostexception") ||
                text.contains("sockettimeout") ||
                text.contains("ioexception") ->
                MailFailure(FailureKind.TRANSIENT, "Bağlantı hatası")

            text.contains("authenticationfailed") || text.contains("535") ->
                MailFailure(FailureKind.THROTTLED, "Gmail girişi reddedildi")

            // Tanımadığımız 4xx geçici, 5xx kalıcı sayılır.
            Regex("\\b4\\d\\d\\b").containsMatchIn(text) ->
                MailFailure(FailureKind.TRANSIENT, "Sunucu geçici hata verdi")

            Regex("\\b5\\d\\d\\b").containsMatchIn(text) ->
                MailFailure(FailureKind.PERMANENT, "Sunucu iletiyi kabul etmedi")

            else -> MailFailure(FailureKind.TRANSIENT, "Bilinmeyen hata")
        }
    }
}
