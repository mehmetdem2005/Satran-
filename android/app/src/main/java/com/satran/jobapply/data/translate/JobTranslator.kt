package com.satran.jobapply.data.translate

import com.satran.jobapply.data.model.Job

/**
 * İlanı Türkçeye çevirir.
 *
 * Sıra: önce **cihaz üstü** motor (anahtarsız, ücretsiz, indirdikten sonra
 * çevrimdışı), o çalışmazsa **anahtarsız HTTP** yedeği. Hiçbir aşamada yapay
 * zekâ anahtarı gerekmez; yapay zekâ yalnızca "özet çıkar" seçeneği içindir.
 */
class JobTranslator(
    private val onDevice: OnDeviceTranslator = OnDeviceTranslator(),
    private val http: HttpTranslator = HttpTranslator(),
) {

    /** Çevirinin hangi yoldan geldiği — arayüzde küçük not olarak gösterilir. */
    enum class Source(val label: String) {
        ON_DEVICE("cihazda çevrildi"),
        HTTP("çevrimiçi çevrildi"),
    }

    data class Result(val text: String, val source: Source)

    suspend fun isModelReady(): Boolean = onDevice.isModelReady()

    suspend fun downloadModel(requireWifi: Boolean) = onDevice.ensureModel(requireWifi)

    suspend fun translate(job: Job, requireWifi: Boolean): Result {
        val source = buildSourceText(job)
        if (source.isBlank()) return Result("Çevrilecek metin yok.", Source.ON_DEVICE)

        val deviceAttempt = runCatching {
            onDevice.ensureModel(requireWifi)
            onDevice.translate(source)
        }
        deviceAttempt.getOrNull()?.takeIf { it.isNotBlank() }?.let {
            return Result(it, Source.ON_DEVICE)
        }

        // Play Hizmetleri yoksa ya da model inmediyse anahtarsız yedeğe düş.
        return Result(http.translate(source), Source.HTTP)
    }

    /** Çeviriye giden metin: başlık, görev tanımı ve özel şartlar. */
    private fun buildSourceText(job: Job): String = buildString {
        appendLine(job.title)
        job.socTitle?.takeIf { it != job.title }?.let { appendLine(it) }
        job.duties?.let {
            appendLine()
            appendLine("GÖREV TANIMI")
            appendLine(it)
        }
        job.requirements?.let {
            appendLine()
            appendLine("ÖZEL ŞARTLAR")
            appendLine(it)
        }
    }.trim()
}
