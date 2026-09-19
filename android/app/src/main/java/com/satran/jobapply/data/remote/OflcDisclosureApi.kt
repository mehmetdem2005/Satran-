package com.satran.jobapply.data.remote

import com.satran.jobapply.core.Net
import com.satran.jobapply.data.model.Job
import com.satran.jobapply.data.model.JobSource
import com.satran.jobapply.data.xlsx.XlsxRows
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.util.Locale
import kotlin.coroutines.coroutineContext

/**
 * Çalışma Bakanlığı'nın üç ayda bir yayımladığı **onaylı H-2B başvuruları**
 * dosyası.
 *
 * Neden ayrı bir kaynak: seasonaljobs.dol.gov yalnızca ilan verilmiş işleri
 * gösteriyor. Bu dosyada ilan sitesinde hiç görünmeyen işverenler var —
 * ölçüldü: 6.660 işveren e-postasının 4.666'sı ilan sitesinde yok.
 *
 * **Adreslerin niteliği farklıdır.** Buradaki e-posta, şirketin DOL'a
 * bildirdiği idari irtibat kişisidir; "başvurular buraya" adresi değildir.
 * Bu yüzden kaynak ayrı kategoride durur, listesi karışmaz ve arayüzde
 * ne olduğu açıkça yazar.
 *
 * Avukat/temsilci adresleri **hiç alınmaz**: onlar işverenin değil, hukuk
 * bürosunun adresidir; başvuru göndermek yanlış olur.
 */
class OflcDisclosureApi(private val cacheDir: File) {

    data class Release(val url: String, val label: String)

    data class Progress(val downloadedBytes: Long, val totalBytes: Long, val parsedRows: Int)

    /**
     * Yayımlanan en güncel H-2B dosyasını bulur.
     *
     * Bağlantı sabit yazılmaz: dosya adı her çeyrekte değişiyor
     * (`..._FY2026_Q3.xlsx`). Sayfa okunup en yüksek yıl/çeyrek seçilir,
     * böylece uygulama güncellenmeden yeni veriye geçer.
     */
    suspend fun latestRelease(): Release = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(PERFORMANCE_PAGE)
            .addHeader("User-Agent", USER_AGENT)
            .build()

        val html = Net.client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("DOL sayfası yanıt vermedi (HTTP ${response.code}).")
            }
            response.body?.string().orEmpty()
        }

        val found = parseReleases(html).maxByOrNull { it.sortKey }
            ?: throw IOException("H-2B açıklama dosyası sayfada bulunamadı.")
        found.release
    }

    internal data class Candidate(val sortKey: Int, val release: Release)

    /**
     * Sayfadaki bağlantılardan sürümleri çıkarır.
     *
     * Yalnızca `href` içine bakılır: sayfada dosya adı bağlantı **metni**
     * olarak da geçiyor (`>H-2B_Disclosure_Data_FY2026_Q3.xlsx<`) ve onu
     * adres sanmak "https://www.dol.gov>H-2B_..." gibi bozuk bir bağlantı
     * üretiyordu.
     */
    internal fun parseReleases(html: String): List<Candidate> =
        HREF_PATTERN.findAll(html).mapNotNull { match ->
            val (raw, year, quarter) = match.destructured
            val path = raw.trim()
            if (path.isEmpty()) return@mapNotNull null
            val url = when {
                path.startsWith("http") -> path
                // Sayfada "https://www.dol.gov//media/..." gibi çift eğik
                // çizgili bağlantılar da var.
                else -> "https://www.dol.gov/" + path.trimStart('/')
            }
            Candidate(
                sortKey = year.toInt() * 10 + quarter.toInt(),
                release = Release(url = url, label = "FY$year Q$quarter"),
            )
        }.toList()

    /** Dosya bu çeyrek için zaten indirilmişse onu döndürür. */
    fun cachedFile(label: String): File? =
        File(cacheDir, fileName(label)).takeIf { it.isFile && it.length() > MIN_VALID_BYTES }

    suspend fun download(release: Release, onProgress: (Long, Long) -> Unit): File =
        withContext(Dispatchers.IO) {
            cachedFile(release.label)?.let { return@withContext it }

            val target = File(cacheDir, fileName(release.label))
            val partial = File(cacheDir, fileName(release.label) + ".part")
            partial.delete()

            val request = Request.Builder()
                .url(release.url)
                .addHeader("User-Agent", USER_AGENT)
                .build()

            Net.client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    throw IOException("Dosya indirilemedi (HTTP ${response.code}).")
                }
                val body = response.body ?: throw IOException("Dosya boş döndü.")
                val total = body.contentLength()
                var written = 0L

                body.byteStream().use { input ->
                    partial.outputStream().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            coroutineContext.ensureActive()
                            val read = input.read(buffer)
                            if (read < 0) break
                            output.write(buffer, 0, read)
                            written += read
                            onProgress(written, total)
                        }
                    }
                }

                if (written < MIN_VALID_BYTES) {
                    partial.delete()
                    throw IOException("İndirilen dosya eksik görünüyor (${written / 1024} KB).")
                }
            }

            // Yalnızca tamamlanınca asıl ada taşınır: yarıda kesilen indirme
            // bir sonraki açılışta "hazır" sanılmasın.
            if (!partial.renameTo(target)) {
                partial.delete()
                throw IOException("İndirilen dosya kaydedilemedi.")
            }
            // Eski çeyreklerin dosyaları yer kaplamasın.
            cacheDir.listFiles()
                ?.filter { it.name.startsWith(PREFIX) && it.name != target.name }
                ?.forEach { it.delete() }
            target
        }

    /**
     * Dosyayı ilanlara çevirir.
     *
     * Elenenler: onaylanmamış başvurular, işi bitmiş olanlar, e-postası
     * olmayanlar ve aynı işverenin aynı işe ait tekrar kayıtları.
     */
    suspend fun parse(file: File, todayIso: String, onProgress: (Int) -> Unit = {}): List<Job> =
        withContext(Dispatchers.IO) {
            val out = LinkedHashMap<String, Job>()
            var seen = 0

            XlsxRows.read(file) { row ->
                seen++
                if (seen % 2000 == 0) onProgress(out.size)

                val status = row["CASE_STATUS"].orEmpty()
                val email = row["EMPLOYER_POC_EMAIL"].orEmpty().trim()
                val end = row["EMPLOYMENT_END_DATE"].orEmpty().take(10)

                val certified = status.contains("Certif", ignoreCase = true) &&
                    !status.contains("Withdraw", ignoreCase = true) &&
                    !status.contains("Denied", ignoreCase = true)

                if (certified && end >= todayIso && email.contains("@")) {
                    val job = row.toJob(email)
                    if (job != null) out.putIfAbsent(job.caseNumber, job)
                }
                true
            }
            out.values.toList()
        }

    private fun Map<String, String>.toJob(email: String): Job? {
        val case = this["CASE_NUMBER"]?.trim().orEmpty().ifEmpty { return null }
        val title = this["JOB_TITLE"]?.trim().orEmpty()
            .ifEmpty { this["SOC_TITLE"]?.trim().orEmpty() }
            .ifEmpty { return null }
        val employer = (this["TRADE_NAME_DBA"]?.trim()?.takeIf { it.isNotEmpty() && it != "N/A" }
            ?: this["EMPLOYER_NAME"]?.trim())
            .orEmpty().ifEmpty { "Bilinmeyen işveren" }

        val city = this["EMPLOYER_CITY"]?.trim().orEmpty()
        val state = this["EMPLOYER_STATE"]?.trim().orEmpty()
        val begin = this["EMPLOYMENT_BEGIN_DATE"]?.take(10).orEmpty()
        val end = this["EMPLOYMENT_END_DATE"]?.take(10).orEmpty()

        return Job(
            caseNumber = case,
            title = title.titleCase(),
            employer = employer.titleCase(),
            email = email.lowercase(Locale.US),
            phone = this["EMPLOYER_PHONE"]?.trim()?.takeIf { it.isNotEmpty() },
            applyUrl = null,
            location = listOf(city.titleCase(), state.titleCase())
                .filter { it.isNotEmpty() }
                .joinToString(", ")
                .ifEmpty { "ABD" },
            socCode = this["SOC_CODE"]?.trim(),
            socTitle = this["SOC_TITLE"]?.trim()?.titleCase(),
            visaClass = "H-2B",
            positions = this["TOTAL_WORKERS_CERTIFIED"]?.trim()?.toDoubleOrNull()?.toInt(),
            wage = null,
            period = if (begin.isNotEmpty() && end.isNotEmpty()) "$begin – $end" else null,
            // Açıklama dosyasında görev tanımı yoktur; uydurulmaz, boş bırakılır.
            duties = null,
            requirements = null,
            education = null,
            experience = null,
            schedule = this["NATURE_OF_TEMPORARY_NEED"]?.trim()?.takeIf { it.isNotEmpty() },
            postedOn = this["DECISION_DATE"]?.take(10)?.takeIf { it.isNotEmpty() },
            source = JobSource.OFLC_DISCLOSURE,
        )
    }

    private fun String.titleCase(): String = split(' ')
        .joinToString(" ") { word ->
            if (word.length <= 3 && word.all { it.isUpperCase() }) word
            else word.lowercase(Locale.US).replaceFirstChar { it.uppercase() }
        }
        .trim()

    private fun fileName(label: String) = PREFIX + label.replace(' ', '_') + ".xlsx"

    private companion object {
        const val PERFORMANCE_PAGE = "https://www.dol.gov/agencies/eta/foreign-labor/performance"
        const val USER_AGENT = "SatranJobs/1.0 (Android)"
        const val PREFIX = "oflc_h2b_"

        /** Bu boyutun altı, kesilmiş ya da hata sayfası demek. */
        const val MIN_VALID_BYTES = 1_000_000L

        val HREF_PATTERN = Regex(
            """href\s*=\s*["']([^"']*H-2B_Disclosure_Data_FY(\d{4})_Q(\d)\.xlsx)["']""",
            RegexOption.IGNORE_CASE,
        )
    }
}
