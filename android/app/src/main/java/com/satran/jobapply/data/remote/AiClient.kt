package com.satran.jobapply.data.remote

import com.satran.jobapply.core.Net
import com.satran.jobapply.core.truncate
import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.data.model.Job
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
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
 * Sohbet tamamlama istemcisi.
 *
 * İki protokol desteklenir:
 *  - OpenAI uyumlu `/chat/completions` (DeepSeek, OpenAI, OpenRouter, kendi sunucun)
 *  - Anthropic `/messages` (Claude)
 *
 * Model adı ayarlardan serbest metin olarak gelir; sağlayıcı yeni bir sürüm
 * yayımladığında uygulamayı güncellemeye gerek kalmaz.
 */
class AiClient(private val settings: AppSettings) {

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    data class Letter(val subject: String?, val body: String)

    /**
     * Sağlayıcının yayımladığı bütün modelleri çeker (OpenAI uyumlu `GET /models`,
     * Anthropic'te de aynı yol). Böylece DeepSeek yeni bir sürüm çıkardığında
     * listede kendiliğinden görünür; uygulamaya model adı gömmeye gerek kalmaz.
     */
    suspend fun listModels(): List<String> = withContext(Dispatchers.IO) {
        require(settings.aiApiKey.isNotBlank()) { "Önce API anahtarını gir." }
        val builder = Request.Builder()
            .url("${settings.effectiveBaseUrl}/models")
            .addHeader("Accept", "application/json")
            .get()

        if (settings.aiProvider.anthropicStyle) {
            builder.addHeader("x-api-key", settings.aiApiKey)
            builder.addHeader("anthropic-version", "2023-06-01")
        } else {
            builder.addHeader("Authorization", "Bearer ${settings.aiApiKey}")
        }

        Net.client.newCall(builder.build()).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException(aiError(response.code, raw))
            val root = Net.json.parseToJsonElement(raw).jsonObject
            val entries = root["data"]?.jsonArray ?: root["models"]?.jsonArray
            ?: throw IOException("Model listesi beklenen biçimde gelmedi.")
            entries.mapNotNull { it.jsonObject["id"]?.jsonPrimitive?.contentOrNull }
                .filter { it.isNotBlank() }
                .sorted()
        }
    }

    suspend fun ping(): String = complete(
        system = "You reply with a single short word.",
        user = "Reply with: OK",
        maxTokens = 16,
    ).trim()

    /**
     * İlanın görevlerini Türkçeye çevirip kısa bir özet çıkarır.
     */
    suspend fun summarizeInTurkish(job: Job): String {
        val system = """
            Sen bir iş ilanı çevirmenisin. Sana verilen ABD mevsimlik iş ilanını Türkçeye çevirip özetle.
            Kurallar:
            - En fazla 6 madde yaz, her madde tek satır olsun, başına "• " koy.
            - İşin ne olduğunu, çalışma koşullarını, ücreti, süreyi ve aranan şartları kapsa.
            - Uydurma bilgi ekleme; ilanda olmayan hiçbir şeyi yazma.
            - Yalnızca maddeleri döndür, başlık ya da açıklama yazma.
        """.trimIndent()
        return complete(system = system, user = job.toPromptBlock(), maxTokens = 700).trim()
    }

    /**
     * İlan listesini mimarlık / mimarlık dışı olarak sınıflandırır.
     * Yanıt {"case_number": true} biçiminde JSON'dur; true = mimarlıkla ilgili.
     */
    suspend fun classifyArchitectural(jobs: List<Job>): Map<String, Boolean> {
        if (jobs.isEmpty()) return emptyMap()
        val system = """
            You classify US seasonal job postings. For each posting decide whether it is an
            ARCHITECTURAL occupation (architect, landscape architect, naval architect,
            architectural/civil drafter, CAD/Revit/BIM modeller, urban planner, interior designer,
            building designer).
            Farm work, landscaping/groundskeeping labour, construction labour, housekeeping,
            forestry, fishing, food service and similar manual jobs are NOT architectural.
            Answer with a single JSON object mapping each case number to true (architectural)
            or false (not architectural). No prose, no markdown fences.
        """.trimIndent()

        val user = jobs.joinToString("\n") { "${it.caseNumber} | ${it.title} | ${it.socCode.orEmpty()} ${it.socTitle.orEmpty()}" }
        val raw = complete(system = system, user = user, maxTokens = 1500, jsonMode = true)
        val obj = runCatching { Net.json.parseToJsonElement(raw.stripFences()).jsonObject }.getOrNull()
            ?: return emptyMap()
        return obj.mapNotNull { (key, value) ->
            val flag = runCatching { value.jsonPrimitive.contentOrNull }.getOrNull()?.trim()?.lowercase()
            when (flag) {
                "true", "1", "yes" -> key to true
                "false", "0", "no" -> key to false
                else -> null
            }
        }.toMap()
    }

    /**
     * İlana özel başvuru mektubu yazar. `research` doluysa işveren hakkında
     * internetten toplanan bilgi de göz önüne alınır.
     */
    suspend fun writeLetter(
        job: Job,
        research: String? = null,
        memory: String? = null,
    ): Letter {
        val system = """
            You write short, concrete job application e-mails for seasonal work in the United States
            (H-2A / H-2B programme). Rules:
            - Language: ${settings.letterLanguage}.
            - 120-180 words. Plain text only, no markdown, no placeholders left unfilled.
            - Mention the exact job title and the case number so the employer can match it.
            - Refer to the attached CV once.
            - Be respectful and direct. Do not invent qualifications the applicant did not state.
            - Return strict JSON: {"subject": "...", "body": "..."} and nothing else.
        """.trimIndent()

        val user = buildString {
            appendLine("APPLICANT")
            appendLine("Name: ${settings.fullName.ifBlank { "(not given)" }}")
            appendLine("Phone: ${settings.phone.ifBlank { "(not given)" }}")
            appendLine("E-mail: ${settings.gmailAddress.ifBlank { "(not given)" }}")
            appendLine("Nationality: ${settings.nationality.ifBlank { "(not given)" }}")
            appendLine("Background: ${settings.summary.ifBlank { "(not given)" }}")
            appendLine()
            appendLine("JOB POSTING")
            appendLine(job.toPromptBlock())
            if (!research.isNullOrBlank()) {
                appendLine()
                appendLine("EMPLOYER RESEARCH (fetched from a live web search, may be incomplete)")
                appendLine(research.truncate(1500))
            }
            if (!memory.isNullOrBlank()) {
                appendLine()
                appendLine("PAST APPLICATIONS BY THIS APPLICANT (for tone and consistency only)")
                appendLine("Do not copy them verbatim and do not mention them to the employer.")
                appendLine(memory.truncate(2000))
            }
        }

        val raw = complete(system = system, user = user, maxTokens = 900, jsonMode = true)
        val obj = runCatching { Net.json.parseToJsonElement(raw.stripFences()).jsonObject }.getOrNull()
        val subject = obj?.get("subject")?.jsonPrimitive?.contentOrNull
        val body = obj?.get("body")?.jsonPrimitive?.contentOrNull ?: raw.stripFences()
        return Letter(subject = subject, body = body.trim())
    }

    /** Web arama sonuçlarını işveren hakkında kısa bir brifinge dönüştürür. */
    suspend fun summarizeResearch(job: Job, results: List<WebSearchClient.Result>): String {
        if (results.isEmpty()) return ""
        val system = """
            Sana bir işveren hakkında web arama sonuçları veriliyor. Türkçe olarak en fazla 5 madde yaz:
            işveren ne iş yapıyor, büyüklüğü, itibarı, işçi yorumları, dikkat edilecek noktalar.
            Sonuçlarda olmayan bilgiyi yazma. Bilgi yoksa "Yeterli bilgi bulunamadı." de.
        """.trimIndent()
        val user = buildString {
            appendLine("İşveren: ${job.employer} — ${job.location}")
            appendLine()
            results.forEachIndexed { index, result ->
                appendLine("[${index + 1}] ${result.title}")
                appendLine(result.url)
                appendLine(result.snippet.truncate(500))
                appendLine()
            }
        }
        return complete(system = system, user = user, maxTokens = 600).trim()
    }

    /**
     * İşveren için web arama sorgusu üretir. Modelin kendi araması yoktur;
     * sorguyu o yazar, aramayı uygulama yapar, sonucu yine ona veririz.
     */
    suspend fun buildEmployerQuery(job: Job): String {
        val system = """
            You write ONE web-search query that will reveal what kind of employer this is
            and how it treats seasonal workers. Output only the query string, max 10 words,
            no quotes, no explanation. Prefer the legal business name plus the town/state
            plus one discriminating word (reviews, complaints, H-2A, H-2B, workers).
        """.trimIndent()
        val user = "Employer: ${job.employer}\nLocation: ${job.location}\nJob: ${job.title}"
        val raw = complete(system = system, user = user, maxTokens = 60).trim().trim('"')
        return raw.ifBlank { "${job.employer} ${job.location} employer reviews" }
    }

    /** Serbest Türkçe isteği arama sorgusuna çevirir. */
    suspend fun buildSearchQuery(naturalRequest: String): String {
        val system = """
            Convert the user's request (usually Turkish) into a short English keyword query for a
            US seasonal-jobs search engine. Only output the keywords, max 6 words, no punctuation,
            no explanation. If the request has no usable keywords output an empty string.
        """.trimIndent()
        return complete(system = system, user = naturalRequest, maxTokens = 60).trim().trim('"')
    }

    // ---------------------------------------------------------------- transport

    private suspend fun complete(
        system: String,
        user: String,
        maxTokens: Int,
        jsonMode: Boolean = false,
    ): String = withContext(Dispatchers.IO) {
        require(settings.aiReady) { "Yapay zekâ ayarları eksik. Ayarlar sekmesinden API anahtarını gir." }
        if (settings.aiProvider.anthropicStyle) {
            anthropicCall(system, user, maxTokens)
        } else {
            openAiCall(system, user, maxTokens, jsonMode)
        }
    }

    private fun openAiCall(system: String, user: String, maxTokens: Int, jsonMode: Boolean): String {
        val payload = buildJsonObject {
            put("model", JsonPrimitive(settings.effectiveModel))
            put("max_tokens", JsonPrimitive(maxTokens))
            put("temperature", JsonPrimitive(0.4))
            put("stream", JsonPrimitive(false))
            if (jsonMode) {
                put("response_format", buildJsonObject { put("type", JsonPrimitive("json_object")) })
            }
            put(
                "messages",
                buildJsonArray {
                    add(message("system", system))
                    add(message("user", user))
                },
            )
        }

        val request = Request.Builder()
            .url("${settings.effectiveBaseUrl}/chat/completions")
            .addHeader("Authorization", "Bearer ${settings.aiApiKey}")
            .addHeader("Content-Type", "application/json")
            .post(Net.json.encodeToString(JsonObject.serializer(), payload).toRequestBody(jsonMedia))
            .build()

        Net.client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException(aiError(response.code, raw))
            val root = Net.json.parseToJsonElement(raw).jsonObject
            return root["choices"]?.jsonArray?.firstOrNull()
                ?.jsonObject?.get("message")
                ?.jsonObject?.get("content")
                ?.jsonPrimitive?.contentOrNull
                ?: throw IOException("Model boş yanıt döndürdü.")
        }
    }

    private fun anthropicCall(system: String, user: String, maxTokens: Int): String {
        val payload = buildJsonObject {
            put("model", JsonPrimitive(settings.effectiveModel))
            put("max_tokens", JsonPrimitive(maxTokens))
            put("system", JsonPrimitive(system))
            put(
                "messages",
                buildJsonArray {
                    add(message("user", user))
                },
            )
        }

        val request = Request.Builder()
            .url("${settings.effectiveBaseUrl}/messages")
            .addHeader("x-api-key", settings.aiApiKey)
            .addHeader("anthropic-version", "2023-06-01")
            .addHeader("Content-Type", "application/json")
            .post(Net.json.encodeToString(JsonObject.serializer(), payload).toRequestBody(jsonMedia))
            .build()

        Net.client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException(aiError(response.code, raw))
            val root = Net.json.parseToJsonElement(raw).jsonObject
            val blocks: JsonArray = root["content"]?.jsonArray ?: throw IOException("Model boş yanıt döndürdü.")
            return blocks.mapNotNull { it.jsonObject["text"]?.jsonPrimitive?.contentOrNull }
                .joinToString("\n")
                .ifBlank { throw IOException("Model boş yanıt döndürdü.") }
        }
    }

    private fun message(role: String, content: String): JsonObject = buildJsonObject {
        put("role", JsonPrimitive(role))
        put("content", JsonPrimitive(content))
    }

    private fun aiError(code: Int, raw: String): String {
        val detail = runCatching {
            Net.json.parseToJsonElement(raw).jsonObject["error"]?.jsonObject
                ?.get("message")?.jsonPrimitive?.contentOrNull
        }.getOrNull()
        val hint = when (code) {
            401, 403 -> " API anahtarını kontrol et."
            402 -> " Sağlayıcıdaki bakiyen bitmiş olabilir."
            404 -> " Model adı ya da adres yanlış olabilir."
            429 -> " İstek sınırına takıldın, biraz bekle."
            else -> ""
        }
        return "Yapay zekâ isteği başarısız (HTTP $code).$hint ${detail ?: raw.take(200)}"
    }
}

/** Bazı modeller JSON'u ``` bloklarının içinde döndürüyor. */
internal fun String.stripFences(): String {
    val trimmed = trim()
    if (!trimmed.startsWith("```")) return trimmed
    return trimmed
        .removePrefix("```json")
        .removePrefix("```JSON")
        .removePrefix("```")
        .removeSuffix("```")
        .trim()
}
