package com.satran.jobapply.data.translate

import com.satran.jobapply.core.Net
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import java.io.IOException

/**
 * Anahtarsız yedek çeviri (MyMemory).
 *
 * Cihaz üstü motorun çalışmadığı durumlar için: Google Play Hizmetleri
 * bulunmayan cihazlar ya da model indirilemediğinde. Anonim kullanımda
 * günlük karakter sınırı vardır, bu yüzden birincil yol değildir.
 */
class HttpTranslator {

    suspend fun translate(text: String): String = withContext(Dispatchers.IO) {
        val chunks = TextChunks.split(text, MAX_CHUNK)
        if (chunks.isEmpty()) return@withContext ""
        chunks.joinToString("\n") { translateChunk(it) }
    }

    private fun translateChunk(chunk: String): String {
        val url = "https://api.mymemory.translated.net/get".toHttpUrl().newBuilder()
            .addQueryParameter("q", chunk)
            .addQueryParameter("langpair", "en|tr")
            .build()

        val request = Request.Builder()
            .url(url)
            .addHeader("Accept", "application/json")
            .addHeader("User-Agent", "SatranJobs/1.0 (Android)")
            .get()
            .build()

        Net.client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IOException("Çeviri servisi yanıt vermedi (HTTP ${response.code}).")
            }
            val root = Net.json.parseToJsonElement(raw).jsonObject
            val status = root["responseStatus"]?.jsonPrimitive?.contentOrNull
            val translated = root["responseData"]?.jsonObject
                ?.get("translatedText")?.jsonPrimitive?.contentOrNull

            if (translated.isNullOrBlank()) {
                val detail = root["responseDetails"]?.jsonPrimitive?.contentOrNull
                throw IOException("Çeviri alınamadı${if (detail.isNullOrBlank()) "" else ": $detail"} (durum $status)")
            }
            return translated
        }
    }

    private companion object {
        /** Anonim kullanımda istek başına metin sınırı var. */
        const val MAX_CHUNK = 450
    }
}
