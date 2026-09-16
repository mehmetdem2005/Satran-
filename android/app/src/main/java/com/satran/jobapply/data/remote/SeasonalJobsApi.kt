package com.satran.jobapply.data.remote

import com.satran.jobapply.core.Net
import com.satran.jobapply.data.filter.JobQuery
import com.satran.jobapply.data.model.Job
import com.satran.jobapply.data.model.JobDto
import com.satran.jobapply.data.model.toJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/**
 * seasonaljobs.dol.gov'un açık arama servisi (Azure Cognitive Search).
 * Anahtar gerektirmez; site arayüzünün kullandığı uç noktanın aynısıdır.
 */
class SeasonalJobsApi(
    private val endpoint: String = DEFAULT_ENDPOINT,
) {

    companion object {
        const val DEFAULT_ENDPOINT = "https://api.seasonaljobs.dol.gov/datahub/search?api-version=2020-06-30"

        /** Azure Search tek istekte en çok 1000 kayıt döndürür; biz makul bir tavan koyuyoruz. */
        const val MAX_LIMIT = 1000
        const val DEFAULT_LIMIT = 40

        /** "Tümünü çek" turlarında istek başına kayıt sayısı. */
        const val BULK_LIMIT = 1000

        /** Kaza eseri sonsuz döngüye girmemek için üst sınır. */
        const val ALL_HARD_CAP = 20_000

        /** search.in() ile tek seferde sorgulanacak ilan numarası sayısı. */
        private const val CASE_CHUNK = 150

        /**
         * Liste için hafif alanlar: uzun metinler (job_duties, special_req) yok.
         * 200 kayıt ~126 KB; tüm dizin (~8000 ilan) ~5 MB'a sığar.
         */
        private const val SELECT_LEAN =
            "case_number,job_title,employer_business_name,employer_trade_name," +
                "employer_city,employer_state,employer_email,apply_email,apply_url,apply_phone," +
                "worksite_city,worksite_state,begin_date,end_date,accepted_date," +
                "basic_rate_from,basic_rate_to,pay_range_desc,add_wage_info,total_positions,visa_class," +
                "soc_code_id,soc_title,education_level,emp_experience_reqd,emp_exp_num_months," +
                "full_time,work_hour_num_basic"

        /** Kart açıldığında tek ilan için çekilen tam alan kümesi. */
        private const val SELECT_FULL = "$SELECT_LEAN,job_duties,special_req,worksite_address"

        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }

    data class Query(
        val input: JobQuery.Input = JobQuery.Input(),
        val sort: Sort = Sort.NEWEST,
        /** Kaçıncı kayıttan başlanacak — "sonraki sayfa" bunu büyütür. */
        val offset: Int = 0,
        /** Bu aramada kaç ilan çekilecek. */
        val limit: Int = DEFAULT_LIMIT,
        /**
         * Uzun metinler (görev tanımı, özel şartlar) de gelsin mi?
         * Normal sayfada evet — 40 kayıt ~134 KB, kart açılınca ek istek gerekmez.
         * "Tümünü çek" turlarında hayır — 8000 kayıt aksi hâlde ~27 MB olurdu.
         */
        val full: Boolean = true,
    ) {
        val safeLimit: Int get() = limit.coerceIn(1, MAX_LIMIT)
    }

    enum class Sort(val odata: String?) {
        RELEVANCE(null),
        NEWEST("accepted_date desc"),
        WAGE_HIGH("basic_rate_from desc"),
        STARTING_SOON("begin_date asc"),
    }

    data class Page(
        val jobs: List<Job>,
        val totalCount: Int,
        val stateFacets: List<Facet>,
        /** Sunucuya gönderilen gerçek ifadeler; arayüzde olduğu gibi gösterilir. */
        val sentFilter: String,
        val sentSearch: String,
    )

    data class Facet(val value: String, val count: Int)

    suspend fun search(query: Query): Page = withContext(Dispatchers.IO) {
        val body = buildRequestBody(query)
        val request = Request.Builder()
            .url(endpoint)
            .addHeader("Content-Type", "application/json")
            .addHeader("Accept", "application/json")
            .addHeader("User-Agent", "SatranJobs/1.0 (Android)")
            .post(Net.json.encodeToString(JsonObject.serializer(), body).toRequestBody(JSON_MEDIA))
            .build()

        Net.client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IOException("İlanlar alınamadı (HTTP ${response.code}). ${raw.take(200)}")
            }
            parse(raw, JobQuery.build(query.input))
        }
    }

    /** Canlı kaynak doğrulaması: ham HTTP durumu, sunucu saati ve en yeni kayıt. */
    data class SourceProof(
        val endpointHost: String,
        val httpCode: Int,
        val serverDate: String?,
        val totalActive: Int,
        val newestCaseNumber: String?,
        val newestTitle: String?,
        val newestEmployer: String?,
        val newestAcceptedDate: String?,
        val fetchedAt: Long,
        val elapsedMs: Long,
    )

    /**
     * Sitedeki sayı ile uygulamadaki sayının neden farklı olduğunu,
     * süzgeç süzgeç ölçerek gösterir.
     *
     * seasonaljobs.dol.gov ana sayfada bütün programları birden sayıyor;
     * uygulama ise tarım dışını süzüp işi başlamamış ilanları da ekliyor.
     * İkisi de doğru, ama aradaki farkı kullanıcının kendi gözüyle
     * görebilmesi gerekiyor — yoksa "uygulama tutarsız" gibi duruyor.
     */
    data class FilterFunnel(
        /** Sitenin ana sayfada saydığı: bütün programlar, yayındakiler. */
        val siteTotal: Int,
        /** Bunun kaçı tarım (H-2A) — uygulama bunları bilerek elemiyor. */
        val agricultural: Int,
        /** Tarım dışı (H-2B) yayındakiler. */
        val nonAgricultural: Int,
        /** H-2B olduğu hâlde tarım mesleği sayılanlar (SOC 45). */
        val socFarming: Int,
        /** E-posta ile başvurulamayanlar; mektup gönderilemiyor. */
        val withoutEmail: Int,
        /** Süzgeçten geçen, yayındaki ilanlar. */
        val activeMatching: Int,
        /** Uygulamanın listelediği toplam (işi başlamamışlar dahil). */
        val appTotal: Int,
    ) {
        val upcoming: Int get() = (appTotal - activeMatching).coerceAtLeast(0)
    }

    suspend fun compareWithSite(input: JobQuery.Input): FilterFunnel = withContext(Dispatchers.IO) {
        suspend fun count(filter: String): Int = countFor(filter)

        val soc = "soc_code_id ge '45-' and soc_code_id lt '46-'"
        val live = "display eq true and active eq true"
        val nonAgri = "$live and visa_class eq '${JobQuery.NON_AGRICULTURAL_VISA}'"

        FilterFunnel(
            siteTotal = count(live),
            agricultural = count("$live and visa_class eq '${JobQuery.AGRICULTURAL_VISA}'"),
            nonAgricultural = count(nonAgri),
            socFarming = count("$nonAgri and $soc"),
            withoutEmail = count("$nonAgri and (apply_email eq null or apply_email eq 'N/A')"),
            activeMatching = count(
                "$nonAgri and not ($soc) and apply_email ne null and apply_email ne 'N/A'",
            ),
            appTotal = count(JobQuery.build(input).filter),
        )
    }

    /** Yalnızca sayıyı ister; kayıt indirmez. */
    private suspend fun countFor(filter: String): Int = withContext(Dispatchers.IO) {
        val payload = buildJsonObject {
            put("search", JsonPrimitive("*"))
            put("count", JsonPrimitive(true))
            put("top", JsonPrimitive(0))
            put("filter", JsonPrimitive(filter))
        }
        val request = Request.Builder()
            .url(endpoint)
            .addHeader("Content-Type", "application/json")
            .addHeader("User-Agent", "SatranJobs/1.0 (Android)")
            .post(Net.json.encodeToString(JsonObject.serializer(), payload).toRequestBody(JSON_MEDIA))
            .build()
        Net.client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("Sayım yapılamadı (HTTP ${response.code}).")
            Net.json.parseToJsonElement(raw).jsonObject["@odata.count"]
                ?.jsonPrimitive?.content?.toIntOrNull() ?: 0
        }
    }

    /**
     * Uygulamanın gerçekten ağa çıktığını kullanıcının kendi gözüyle görmesi için.
     * Anahtar kullanmaz; ilan verisi kamuya açıktır.
     */
    suspend fun verifySource(): SourceProof = withContext(Dispatchers.IO) {
        val started = System.currentTimeMillis()
        val payload = buildJsonObject {
            put("search", JsonPrimitive("*"))
            put("count", JsonPrimitive(true))
            put("top", JsonPrimitive(1))
            put("filter", JsonPrimitive("active eq true and display eq true"))
            put("orderby", JsonPrimitive("accepted_date desc"))
            put("select", JsonPrimitive("case_number,job_title,employer_business_name,accepted_date"))
        }
        val request = Request.Builder()
            .url(endpoint)
            .addHeader("Content-Type", "application/json")
            .addHeader("User-Agent", "SatranJobs/1.0 (Android)")
            .post(Net.json.encodeToString(JsonObject.serializer(), payload).toRequestBody(JSON_MEDIA))
            .build()

        Net.client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            val elapsed = System.currentTimeMillis() - started
            if (!response.isSuccessful) {
                throw IOException("Kaynak yanıt vermedi (HTTP ${response.code}). ${raw.take(160)}")
            }
            val root = Net.json.parseToJsonElement(raw).jsonObject
            val newest = root["value"]?.jsonArray?.firstOrNull()?.jsonObject
            SourceProof(
                endpointHost = endpoint.substringAfter("://").substringBefore('/'),
                httpCode = response.code,
                // Sunucunun kendi saati: cihaz saatinden bağımsız, taze veri kanıtı.
                serverDate = response.header("Date"),
                totalActive = root["@odata.count"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0,
                newestCaseNumber = newest?.get("case_number")?.jsonPrimitive?.contentOrNull,
                newestTitle = newest?.get("job_title")?.jsonPrimitive?.contentOrNull,
                newestEmployer = newest?.get("employer_business_name")?.jsonPrimitive?.contentOrNull,
                newestAcceptedDate = newest?.get("accepted_date")?.jsonPrimitive?.contentOrNull?.substringBefore('T'),
                fetchedAt = System.currentTimeMillis(),
                elapsedMs = elapsed,
            )
        }
    }

    /**
     * Süzgeçlere uyan **bütün** ilanları sayfalayarak çeker.
     *
     * Tek istekte 1000 kayıt alınabildiği için ~8000 ilan 8 turda toplanır.
     * Uzun metinler alınmaz (bkz. [SELECT_LEAN]); açıklama kart açılınca gelir.
     *
     * @param onProgress toplanan / toplam sayısıyla her turda çağrılır.
     */
    suspend fun fetchAll(
        input: JobQuery.Input,
        sort: Sort = Sort.NEWEST,
        hardCap: Int = ALL_HARD_CAP,
        onProgress: (fetched: Int, total: Int) -> Unit = { _, _ -> },
    ): Page {
        val collected = LinkedHashMap<String, Job>()
        var offset = 0
        var total = 0
        var facets: List<Facet> = emptyList()
        var built = JobQuery.build(input)

        while (offset < hardCap) {
            val page = search(Query(input = input, sort = sort, offset = offset, limit = BULK_LIMIT, full = false))
            built = JobQuery.Built(page.sentFilter, page.sentSearch, built.searchMode)
            if (page.stateFacets.isNotEmpty()) facets = page.stateFacets
            total = page.totalCount
            page.jobs.forEach { collected[it.caseNumber] = it }

            onProgress(collected.size, minOf(total, hardCap))

            // Sunucu istenenden az döndürdüyse dizin bitti.
            if (page.jobs.size < BULK_LIMIT) break
            offset += BULK_LIMIT
            if (offset >= total) break
        }

        return Page(
            jobs = collected.values.toList(),
            totalCount = total,
            stateFacets = facets,
            sentFilter = built.filter,
            sentSearch = built.search,
        )
    }

    /**
     * Verilen ilan numaralarından hangilerinin **hâlâ listede** olduğunu söyler.
     *
     * Süzgeç listeyle birebir aynıdır ([JobQuery.freshnessFilter]); yoksa
     * listede duran ilanlar "kalkmış" sanılıp silinir.
     */
    suspend fun stillActive(caseNumbers: List<String>, input: JobQuery.Input): Set<String> {
        if (caseNumbers.isEmpty()) return emptySet()
        val alive = mutableSetOf<String>()

        caseNumbers.distinct().chunked(CASE_CHUNK).forEach { chunk ->
            val payload = buildJsonObject {
                put("search", JsonPrimitive("*"))
                put("count", JsonPrimitive(true))
                put("top", JsonPrimitive(chunk.size))
                put("select", JsonPrimitive("case_number"))
                put(
                    "filter",
                    JsonPrimitive(JobQuery.freshnessFilter(input, chunk)),
                )
            }
            val request = Request.Builder()
                .url(endpoint)
                .addHeader("Content-Type", "application/json")
                .addHeader("User-Agent", "SatranJobs/1.0 (Android)")
                .post(Net.json.encodeToString(JsonObject.serializer(), payload).toRequestBody(JSON_MEDIA))
                .build()

            withContext(Dispatchers.IO) {
                Net.client.newCall(request).execute().use { response ->
                    val raw = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        throw IOException("Arşiv tazelenemedi (HTTP ${response.code}).")
                    }
                    Net.json.parseToJsonElement(raw).jsonObject["value"]?.jsonArray.orEmpty().forEach { element ->
                        element.jsonObject["case_number"]?.jsonPrimitive?.contentOrNull?.let { alive += it }
                    }
                }
            }
        }
        return alive
    }

    /**
     * Tek ilanın görev tanımını ve özel şartlarını getirir.
     *
     * İlan numarası tam metin dizininde aranabilir bir alan **değildir**;
     * bu yüzden arama yerine doğrudan OData eşitliğiyle sorgulanır.
     * (Aramayla denenirse sonuç boş döner ve açıklama hiç gelmez.)
     */
    suspend fun detailsFor(caseNumber: String): Job? = withContext(Dispatchers.IO) {
        val payload = buildJsonObject {
            put("search", JsonPrimitive("*"))
            put("top", JsonPrimitive(1))
            put("select", JsonPrimitive(SELECT_FULL))
            put("filter", JsonPrimitive("case_number eq '${caseNumber.replace("'", "''")}'"))
        }
        val request = Request.Builder()
            .url(endpoint)
            .addHeader("Content-Type", "application/json")
            .addHeader("User-Agent", "SatranJobs/1.0 (Android)")
            .post(Net.json.encodeToString(JsonObject.serializer(), payload).toRequestBody(JSON_MEDIA))
            .build()

        Net.client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("İlan ayrıntısı alınamadı (HTTP ${response.code}).")
            val element = Net.json.parseToJsonElement(raw).jsonObject["value"]?.jsonArray?.firstOrNull()
                ?: return@use null
            runCatching { Net.json.decodeFromJsonElement(JobDto.serializer(), element) }.getOrNull()?.toJob()
        }
    }

    private fun buildRequestBody(query: Query): JsonObject {
        val built = JobQuery.build(query.input)
        return buildJsonObject {
            put("search", JsonPrimitive(built.search))
            put("searchMode", JsonPrimitive(built.searchMode))
            put("queryType", JsonPrimitive("simple"))
            put("count", JsonPrimitive(true))
            put("top", JsonPrimitive(query.safeLimit))
            put("skip", JsonPrimitive(query.offset.coerceAtLeast(0)))
            put("select", JsonPrimitive(if (query.full) SELECT_FULL else SELECT_LEAN))
            put("filter", JsonPrimitive(built.filter))
            query.sort.odata?.let { put("orderby", JsonPrimitive(it)) }
            put(
                "facets",
                buildJsonArray {
                    add(JsonPrimitive("worksite_state,count:60"))
                    add(JsonPrimitive("soc_title,count:30"))
                },
            )
            if (built.search != "*") {
                put(
                    "searchFields",
                    JsonPrimitive(
                        "case_number,job_title,soc_title,job_duties,special_req," +
                            "employer_business_name,worksite_city,worksite_state",
                    ),
                )
            }
        }
    }

    private fun parse(raw: String, built: JobQuery.Built): Page {
        val root = Net.json.parseToJsonElement(raw).jsonObject
        root["error"]?.let { error ->
            val message = error.jsonObject["message"]?.jsonPrimitive?.content ?: "Bilinmeyen servis hatası"
            throw IOException("Arama servisi hatası: $message")
        }

        val values = root["value"]?.jsonArray.orEmpty()
        val jobs = values.mapNotNull { element ->
            runCatching { Net.json.decodeFromJsonElement(JobDto.serializer(), element) }.getOrNull()?.toJob()
        }

        val total = root["@odata.count"]?.jsonPrimitive?.content?.toIntOrNull() ?: jobs.size
        val facets = root["@search.facets"]?.jsonObject
            ?.get("worksite_state")?.jsonArray.orEmpty()
            .mapNotNull { it.toFacet() }

        return Page(
            jobs = jobs,
            totalCount = total,
            stateFacets = facets,
            sentFilter = built.filter,
            sentSearch = built.search,
        )
    }

    private fun JsonElement.toFacet(): Facet? {
        val obj = this as? JsonObject ?: return null
        val value = obj["value"]?.jsonPrimitive?.content ?: return null
        val count = obj["count"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0
        return Facet(value, count)
    }
}
