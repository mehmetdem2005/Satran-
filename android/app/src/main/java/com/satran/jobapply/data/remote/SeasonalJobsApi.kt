package com.satran.jobapply.data.remote

import com.satran.jobapply.core.Net
import com.satran.jobapply.data.model.Job
import com.satran.jobapply.data.model.JobDto
import com.satran.jobapply.data.model.toJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
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
        const val MAX_LIMIT = 200
        const val DEFAULT_LIMIT = 40

        /** Arayüzde gösterilecek alanlar; yanıtı küçük tutar. */
        private const val SELECT_FIELDS =
            "case_number,job_title,job_duties,special_req,employer_business_name,employer_trade_name," +
                "employer_city,employer_state,employer_email,apply_email,apply_url,apply_phone," +
                "worksite_address,worksite_city,worksite_state,begin_date,end_date,accepted_date," +
                "basic_rate_from,basic_rate_to,pay_range_desc,add_wage_info,total_positions,visa_class," +
                "soc_code_id,soc_title,education_level,emp_experience_reqd,emp_exp_num_months," +
                "full_time,work_hour_num_basic"

        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }

    data class Query(
        val text: String = "",
        val state: String? = null,
        val visaClass: String? = null,
        val emailOnly: Boolean = true,
        val sort: Sort = Sort.NEWEST,
        /** Kaçıncı kayıttan başlanacak — "sonraki sayfa" bunu büyütür. */
        val offset: Int = 0,
        /** Bu aramada kaç ilan çekilecek. */
        val limit: Int = DEFAULT_LIMIT,
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
            parse(raw)
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

    /** Tek bir ilanı case_number ile getirir. */
    suspend fun byCaseNumber(caseNumber: String): Job? {
        val page = search(Query(text = "\"$caseNumber\"", emailOnly = false, sort = Sort.RELEVANCE, limit = 5))
        return page.jobs.firstOrNull { it.caseNumber == caseNumber }
    }

    private fun buildRequestBody(query: Query): JsonObject = buildJsonObject {
        val text = query.text.trim()
        put("search", JsonPrimitive(if (text.isEmpty()) "*" else text))
        put("searchMode", JsonPrimitive("any"))
        put("queryType", JsonPrimitive("simple"))
        put("count", JsonPrimitive(true))
        put("top", JsonPrimitive(query.safeLimit))
        put("skip", JsonPrimitive(query.offset.coerceAtLeast(0)))
        put("select", JsonPrimitive(SELECT_FIELDS))
        put("filter", JsonPrimitive(buildFilter(query)))
        query.sort.odata?.let { put("orderby", JsonPrimitive(it)) }
        put(
            "facets",
            kotlinx.serialization.json.buildJsonArray {
                add(JsonPrimitive("worksite_state,count:60"))
                add(JsonPrimitive("visa_class"))
            },
        )
        if (text.isNotEmpty()) {
            put("searchFields", JsonPrimitive("job_title,soc_title,job_duties,employer_business_name,worksite_city,worksite_state,special_req"))
        }
    }

    private fun buildFilter(query: Query): String {
        val clauses = mutableListOf("active eq true", "display eq true")
        if (query.emailOnly) {
            clauses += "apply_email ne null"
            clauses += "apply_email ne 'N/A'"
        }
        query.state?.let { clauses += "worksite_state eq '${it.odataEscape()}'" }
        query.visaClass?.let { clauses += "visa_class eq '${it.odataEscape()}'" }
        return clauses.joinToString(" and ")
    }

    private fun String.odataEscape(): String = replace("'", "''")

    private fun parse(raw: String): Page {
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

        return Page(jobs = jobs, totalCount = total, stateFacets = facets)
    }

    private fun JsonElement.toFacet(): Facet? {
        val obj = this as? JsonObject ?: return null
        val value = obj["value"]?.jsonPrimitive?.content ?: return null
        val count = obj["count"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0
        return Facet(value, count)
    }
}
