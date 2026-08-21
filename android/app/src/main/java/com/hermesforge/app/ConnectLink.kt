package com.hermesforge.app

import java.net.URI
import java.net.URLDecoder

/**
 * ``hermesforge://connect`` baglantisinin ayristirilmasi.
 *
 * Termux kurulum betigi Hermes'i kurup baslattiktan sonra bu baglantiyi acar;
 * kullanicinin adresi ve anahtari elle yazmasi gerekmez.
 *
 * Ayristirma bilerek ``android.net.Uri`` yerine ``java.net.URI`` kullaniyor:
 * burada guvenlik karari veriliyor (hangi adrese baglanilacagi) ve bu kararin
 * Android olmadan, duz JVM testiyle dogrulanabilmesi gerekiyor.
 */
data class ConnectRequest(
    val baseUrl: String,
    val apiKey: String,
    val providerKey: String = "",
    val providerModel: String = ""
) {
    /** Ayarlar ucuna gonderilecek govde. */
    fun toSettingsJson(): String {
        val parts = mutableListOf(
            QUOTE + "hermes_base_url" + QUOTE + ":" + QUOTE + escape(baseUrl) + QUOTE,
            QUOTE + "hermes_api_key" + QUOTE + ":" + QUOTE + escape(apiKey) + QUOTE
        )
        if (providerKey.isNotBlank()) {
            parts += QUOTE + "fallback_api_key" + QUOTE + ":" + QUOTE + escape(providerKey) + QUOTE
        }
        if (providerModel.isNotBlank()) {
            parts += QUOTE + "fallback_model" + QUOTE + ":" + QUOTE + escape(providerModel) + QUOTE
        }
        return "{" + parts.joinToString(",") + "}"
    }

    private fun escape(value: String) =
        value.replace("\\", "\\\\").replace(QUOTE, "\\" + QUOTE)

    private companion object {
        const val QUOTE = "\""
    }
}

object ConnectLink {

    private val LOCAL_HOSTS = setOf("127.0.0.1", "localhost", "::1", "[::1]")

    /**
     * Baglantiyi dogrular ve ayristirir; gecersizse null doner.
     *
     * Yalnizca ayni cihazdaki adresler kabul edilir. Bu baglantiyi bir web
     * sayfasi da acabilir; uygulamanin anahtarini tanimadigi bir sunucuya
     * gondermesine ya da yabanci bir sunucuyu motor diye ayarlamasina
     * izin vermiyoruz.
     */
    fun parse(raw: String?): ConnectRequest? {
        if (raw.isNullOrBlank()) return null

        val uri = try {
            URI(raw)
        } catch (throwable: Throwable) {
            return null
        }
        if (!"hermesforge".equals(uri.scheme, ignoreCase = true)) return null
        if (!"connect".equals(uri.host ?: uri.authority, ignoreCase = true)) return null

        val query = parseQuery(uri.rawQuery)
        val url = query["url"]?.trim().orEmpty().trimEnd('/')
        val key = query["key"]?.trim().orEmpty()
        if (url.isEmpty() || key.isEmpty()) return null
        if (!isLocal(url)) return null
        // Kontrol karakteri tasiyan bir anahtar HTTP basligini bozar.
        if (key.any { it == '\n' || it == '\r' || it == ' ' }) return null

        return ConnectRequest(
            baseUrl = url,
            apiKey = key,
            providerKey = query["provider_key"]?.trim().orEmpty(),
            providerModel = query["model"]?.trim().orEmpty()
        )
    }

    private fun parseQuery(rawQuery: String?): Map<String, String> {
        if (rawQuery.isNullOrEmpty()) return emptyMap()
        return rawQuery.split('&').mapNotNull { pair ->
            val index = pair.indexOf('=')
            if (index <= 0) return@mapNotNull null
            decode(pair.substring(0, index)) to decode(pair.substring(index + 1))
        }.toMap()
    }

    private fun decode(value: String): String = try {
        URLDecoder.decode(value, "UTF-8")
    } catch (throwable: Throwable) {
        value
    }

    /** Ayni cihazda calisan bir Hermes mi? */
    private fun isLocal(rawUrl: String): Boolean {
        val uri = try {
            URI(rawUrl)
        } catch (throwable: Throwable) {
            return false
        }
        val scheme = uri.scheme?.lowercase() ?: return false
        if (scheme != "http" && scheme != "https") return false
        val host = (uri.host ?: return false).lowercase()
        return host in LOCAL_HOSTS
    }
}
