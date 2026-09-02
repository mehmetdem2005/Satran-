package com.satran.jobapply.data.remote

import com.satran.jobapply.core.Net
import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.data.model.SearchProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/**
 * İnternet araması. Dört sağlayıcı desteklenir; DuckDuckGo anahtar istemez,
 * diğerleri ücretsiz kotalı API anahtarıyla çalışır.
 */
class WebSearchClient(private val settings: AppSettings) {

    data class Result(val title: String, val url: String, val snippet: String)

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    suspend fun search(query: String, maxResults: Int = 6): List<Result> = withContext(Dispatchers.IO) {
        if (query.isBlank()) return@withContext emptyList()
        when (settings.searchProvider) {
            SearchProvider.TAVILY -> tavily(query, maxResults)
            SearchProvider.SERPER -> serper(query, maxResults)
            SearchProvider.BRAVE -> brave(query, maxResults)
            SearchProvider.DUCKDUCKGO -> duckDuckGo(query, maxResults)
        }
    }

    /** İşveren araştırması için hazır sorgu. */
    suspend fun researchEmployer(employer: String, location: String, maxResults: Int = 6): List<Result> =
        search("\"$employer\" $location employer reviews H-2A H-2B workers", maxResults)

    private fun tavily(query: String, maxResults: Int): List<Result> {
        requireKey()
        val payload = buildJsonObject {
            put("api_key", JsonPrimitive(settings.searchApiKey))
            put("query", JsonPrimitive(query))
            put("max_results", JsonPrimitive(maxResults))
            put("search_depth", JsonPrimitive("basic"))
        }
        val request = Request.Builder()
            .url("https://api.tavily.com/search")
            .addHeader("Content-Type", "application/json")
            .post(Net.json.encodeToString(JsonObject.serializer(), payload).toRequestBody(jsonMedia))
            .build()
        val root = execute(request)
        return root["results"]?.jsonArray.orEmpty().mapNotNull {
            val obj = it.jsonObject
            Result(
                title = obj["title"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null,
                url = obj["url"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                snippet = obj["content"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            )
        }
    }

    private fun serper(query: String, maxResults: Int): List<Result> {
        requireKey()
        val payload = buildJsonObject {
            put("q", JsonPrimitive(query))
            put("num", JsonPrimitive(maxResults))
        }
        val request = Request.Builder()
            .url("https://google.serper.dev/search")
            .addHeader("X-API-KEY", settings.searchApiKey)
            .addHeader("Content-Type", "application/json")
            .post(Net.json.encodeToString(JsonObject.serializer(), payload).toRequestBody(jsonMedia))
            .build()
        val root = execute(request)
        return root["organic"]?.jsonArray.orEmpty().take(maxResults).mapNotNull {
            val obj = it.jsonObject
            Result(
                title = obj["title"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null,
                url = obj["link"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                snippet = obj["snippet"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            )
        }
    }

    private fun brave(query: String, maxResults: Int): List<Result> {
        requireKey()
        val url = "https://api.search.brave.com/res/v1/web/search".toHttpUrl().newBuilder()
            .addQueryParameter("q", query)
            .addQueryParameter("count", maxResults.toString())
            .build()
        val request = Request.Builder()
            .url(url)
            .addHeader("X-Subscription-Token", settings.searchApiKey)
            .addHeader("Accept", "application/json")
            .get()
            .build()
        val root = execute(request)
        return root["web"]?.jsonObject?.get("results")?.jsonArray.orEmpty().mapNotNull {
            val obj = it.jsonObject
            Result(
                title = obj["title"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null,
                url = obj["url"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                snippet = obj["description"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            )
        }
    }

    /** Anahtarsız yedek. Sınırlı sonuç verir ama hiçbir kurulum gerektirmez. */
    private fun duckDuckGo(query: String, maxResults: Int): List<Result> {
        val url = "https://api.duckduckgo.com/".toHttpUrl().newBuilder()
            .addQueryParameter("q", query)
            .addQueryParameter("format", "json")
            .addQueryParameter("no_html", "1")
            .addQueryParameter("skip_disambig", "1")
            .build()
        val request = Request.Builder().url(url).addHeader("Accept", "application/json").get().build()
        val root = execute(request)

        val results = mutableListOf<Result>()
        root["AbstractText"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }?.let { abstract ->
            results += Result(
                title = root["Heading"]?.jsonPrimitive?.contentOrNull.orEmpty().ifBlank { query },
                url = root["AbstractURL"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                snippet = abstract,
            )
        }
        root["RelatedTopics"]?.jsonArray.orEmpty().forEach { element ->
            val obj = element as? JsonObject ?: return@forEach
            val text = obj["Text"]?.jsonPrimitive?.contentOrNull ?: return@forEach
            results += Result(
                title = text.substringBefore(" - ").take(90),
                url = obj["FirstURL"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                snippet = text,
            )
        }
        return results.take(maxResults)
    }

    private fun requireKey() {
        require(settings.searchApiKey.isNotBlank()) {
            "${settings.searchProvider.label} için API anahtarı gerekli. Ayarlar sekmesinden ekle."
        }
    }

    private fun execute(request: Request): JsonObject {
        Net.client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IOException("Web araması başarısız (HTTP ${response.code}). ${raw.take(200)}")
            }
            return Net.json.parseToJsonElement(raw).jsonObject
        }
    }
}
