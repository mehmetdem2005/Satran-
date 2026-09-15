package com.satran.jobapply.data.model

import kotlinx.serialization.Serializable

enum class SendStatus { QUEUED, SENDING, SENT, FAILED, SKIPPED }

@Serializable
data class SendRecord(
    val caseNumber: String,
    val title: String,
    val employer: String,
    val email: String,
    val status: SendStatus,
    val timestamp: Long = System.currentTimeMillis(),
    val error: String? = null,
)

/**
 * Gönderim geçmişinin dökümü.
 *
 * Geçmiş hem başarılı hem başarısız denemeleri tutuyor. Tek sayı olarak
 * "gönderim" demek yanıltıcı: Gmail'in Gönderilenler klasöründe yalnızca
 * başarılılar görünür, kullanıcı aradaki farkı hata sanıyor.
 */
data class SendSummary(
    val sent: Int,
    val failed: Int,
    val other: Int,
) {
    val total: Int get() = sent + failed + other
}

fun List<SendRecord>.summarize(): SendSummary {
    var sent = 0
    var failed = 0
    var other = 0
    forEach {
        when (it.status) {
            SendStatus.SENT -> sent++
            SendStatus.FAILED -> failed++
            else -> other++
        }
    }
    return SendSummary(sent = sent, failed = failed, other = other)
}

/**
 * Başarısız gönderimleri sebebe göre gruplar, çoktan aza sıralar.
 *
 * "Neden başarısız oluyor" sorusunun cevabı yüzlerce kaydın içinde
 * kayboluyordu; döküm tek bakışta gösteriyor.
 */
fun List<SendRecord>.failureReasons(): List<Pair<String, Int>> = this
    .filter { it.status == SendStatus.FAILED }
    .groupingBy { it.error?.takeIf { e -> e.isNotBlank() } ?: "Sebep kaydedilmemiş" }
    .eachCount()
    .toList()
    .sortedByDescending { it.second }
