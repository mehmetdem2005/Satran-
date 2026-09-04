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

    suspend fun isModelReady(): Boolean = onDevice.isModelReady()

    suspend fun downloadModel(requireWifi: Boolean) = onDevice.ensureModel(requireWifi)

    /**
     * Tek bir kısa metni çevirir (ilan başlığı, meslek adı gibi).
     * Liste genelinde "tümünü çevir" bunu kullanır; ucuz ve hızlıdır.
     */
    suspend fun translateShort(text: String, requireWifi: Boolean): String {
        if (text.isBlank()) return text
        val device = runCatching {
            onDevice.ensureModel(requireWifi)
            onDevice.translate(text)
        }.getOrNull()
        if (!device.isNullOrBlank()) return device
        return runCatching { http.translate(text) }.getOrNull()?.takeIf { it.isNotBlank() } ?: text
    }

    /**
     * İlanın alanlarını tek tek çevirir.
     *
     * Alanlar ayrı ayrı çevrilir ki biri başarısız olsa da diğerleri gelsin ve
     * arayüz her alanı doğru yere yerleştirebilsin. İşveren adı, şehir ve
     * eyalet **çevrilmez** — özel adlardır.
     *
     * @param headlineOnly yalnızca başlık ve meslek adı (liste görünümü için).
     */
    suspend fun translateJob(
        job: Job,
        requireWifi: Boolean,
        headlineOnly: Boolean,
    ): JobTranslation {
        val title = translateShort(job.title, requireWifi).takeIf { it != job.title }
        val socTitle = job.socTitle
            ?.takeIf { it != job.title }
            ?.let { original -> translateShort(original, requireWifi).takeIf { it != original } }

        if (headlineOnly) return JobTranslation(title = title, socTitle = socTitle)

        val duties = job.duties?.let { runCatching { translateLong(it, requireWifi) }.getOrNull() }
        val requirements = job.requirements
            ?.takeIf { it.length > 8 }
            ?.let { runCatching { translateLong(it, requireWifi) }.getOrNull() }

        return JobTranslation(
            title = title,
            socTitle = socTitle,
            duties = duties,
            requirements = requirements,
        )
    }

    private suspend fun translateLong(text: String, requireWifi: Boolean): String {
        val device = runCatching {
            onDevice.ensureModel(requireWifi)
            onDevice.translate(text)
        }.getOrNull()
        if (!device.isNullOrBlank()) return device
        return http.translate(text)
    }

}
