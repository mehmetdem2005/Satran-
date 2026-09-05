package com.satran.jobapply.data.translate

import com.satran.jobapply.core.runCatchingCancellable
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
        val device = runCatchingCancellable {
            onDevice.ensureModel(requireWifi)
            onDevice.translate(text)
        }.getOrNull()
        if (!device.isNullOrBlank()) return device
        return runCatchingCancellable { http.translate(text) }.getOrNull()?.takeIf { it.isNotBlank() } ?: text
    }

    /**
     * İlanın alanlarını çevirir ve daha önce çevrilmiş olanları **tekrar
     * çevirmez** — [existing] içindeki tamamlanmışlık işaretlerine bakar.
     *
     * İşveren adı, şehir ve eyalet çevrilmez: özel adlardır ve başvuru
     * e-postasında olduğu gibi geçmeleri gerekir.
     *
     * @param headlineOnly yalnızca başlık ve meslek adı (liste görünümü için).
     */
    suspend fun translateJob(
        job: Job,
        requireWifi: Boolean,
        headlineOnly: Boolean,
        existing: JobTranslation? = null,
    ): JobTranslation {
        var result = existing ?: JobTranslation()

        if (existing?.headlineDone != true) {
            val title = translateShort(job.title, requireWifi).takeIf { it != job.title }
            val socTitle = job.socTitle
                ?.takeIf { it != job.title }
                ?.let { original -> translateShort(original, requireWifi).takeIf { it != original } }
            result = result.mergedWith(
                JobTranslation(title = title, socTitle = socTitle, headlineDone = true),
            )
        }

        if (headlineOnly || existing?.bodyDone == true) return result

        val duties = job.duties?.let { runCatchingCancellable { translateLong(it, requireWifi) }.getOrNull() }
        val requirements = job.requirements
            ?.let { runCatchingCancellable { translateLong(it, requireWifi) }.getOrNull() }
            ?.takeIf { it != job.requirements }

        // Gövde ancak görev tanımı gerçekten geldiyse "tamamlandı" sayılır;
        // yoksa metin sonradan yüklendiğinde bir daha çevrilmezdi.
        return result.mergedWith(
            JobTranslation(
                duties = duties,
                requirements = requirements,
                bodyDone = job.duties != null,
            ),
        )
    }

    private suspend fun translateLong(text: String, requireWifi: Boolean): String {
        val device = runCatchingCancellable {
            onDevice.ensureModel(requireWifi)
            onDevice.translate(text)
        }.getOrNull()
        if (!device.isNullOrBlank()) return device
        return http.translate(text)
    }

}
