package com.hermesforge.app

import java.net.URI
import java.net.URLDecoder

/**
 * ``hermesforge://connect`` baglantisinin ayristirilmasi.
 *
 * Hermes artik telefonda degil, kullanicinin bilgisayarinda calisiyor. O
 * makinedeki ``scripts/hermes_sunucu.sh`` betigi ekrana bir QR kod basiyor;
 * telefonun kamerasi bu QR'i okuyunca asagidaki baglanti aciliyor ve adres ile
 * anahtar elle yazilmadan yerine oturuyor.
 *
 * Ayristirma bilerek ``android.net.Uri`` yerine ``java.net.URI`` kullaniyor:
 * burada guvenlik karari veriliyor (hangi adrese baglanilacagi) ve bu kararin
 * Android olmadan, duz JVM testiyle dogrulanabilmesi gerekiyor.
 */
data class ConnectRequest(
    val baseUrl: String,
    val apiKey: String,
    /** Kullaniciya gosterilecek makine adi/adresi (dogrulama penceresi icin). */
    val host: String,
    /** Ayni cihazdaki Hermes: soru sormaya gerek yok. */
    val isLoopback: Boolean,
    /** Ev agi (RFC1918) adresi mi? Degilse internete acik bir sunucudur. */
    val isPrivateNetwork: Boolean
) {
    /** Ayarlar ucuna gonderilecek govde. */
    fun toSettingsJson(): String {
        val parts = mutableListOf(
            QUOTE + "hermes_base_url" + QUOTE + ":" + QUOTE + escape(baseUrl) + QUOTE
        )
        if (apiKey.isNotBlank()) {
            parts += QUOTE + "hermes_api_key" + QUOTE + ":" + QUOTE + escape(apiKey) + QUOTE
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

    private val LOOPBACK_HOSTS = setOf("127.0.0.1", "localhost", "::1", "[::1]")

    /**
     * Baglantiyi dogrular ve ayristirir; gecersizse null doner.
     *
     * Uzak adres artik gecerli: Hermes'in kullanicinin bilgisayarinda calismasi
     * isin tam kendisi. Ama bu baglantiyi bir web sayfasi da acabilir. Bu
     * yuzden burada yalnizca *bicimsel* dogrulama yapiyoruz; "bu makineye
     * baglanayim mi?" karari kullaniciya soruluyor (bkz. MainActivity). Tek
     * istisna ayni cihazdaki adres: orada sorulacak bir sey yok.
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
        if (url.isEmpty()) return null
        // Kontrol karakteri tasiyan bir anahtar HTTP basligini bozar.
        if (key.any { it.isControlLike() }) return null

        val target = try {
            URI(url)
        } catch (throwable: Throwable) {
            return null
        }
        val scheme = target.scheme?.lowercase() ?: return null
        if (scheme != "http" && scheme != "https") return null
        // Adreste kullanici adi/parola olmasi ("http://banka.com@saldirgan")
        // gosterilen makineyi yaniltir; boyle bir adresi hic kabul etmiyoruz.
        if (target.userInfo != null) return null
        val host = (target.host ?: return null).lowercase()
        if (host.isEmpty()) return null

        return ConnectRequest(
            baseUrl = url,
            apiKey = key,
            host = if (target.port > 0) "$host:${target.port}" else host,
            isLoopback = host in LOOPBACK_HOSTS,
            isPrivateNetwork = isPrivateNetwork(host)
        )
    }

    private fun Char.isControlLike(): Boolean = this.code < 0x21 || this.code == 0x7f

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

    /**
     * Ev agi adresi mi? (RFC1918 + link-local)
     *
     * Beklenen kullanim bu: telefon ve bilgisayar ayni Wi-Fi'da. Disaridaki bir
     * adres mumkun ama daha yuksek sesle sorulmasi gerekiyor.
     */
    private fun isPrivateNetwork(host: String): Boolean {
        if (host in LOOPBACK_HOSTS) return true
        if (host.endsWith(".local")) return true
        val octets = host.split('.')
        if (octets.size != 4) return false
        val numbers = octets.map { it.toIntOrNull() ?: return false }
        if (numbers.any { it !in 0..255 }) return false
        return when {
            numbers[0] == 10 -> true
            numbers[0] == 192 && numbers[1] == 168 -> true
            numbers[0] == 172 && numbers[1] in 16..31 -> true
            numbers[0] == 169 && numbers[1] == 254 -> true
            else -> false
        }
    }
}
