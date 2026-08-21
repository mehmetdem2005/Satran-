package com.hermesforge.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Derin baglanti ayristirmasi guvenlik karari veriyor: uygulamanin Hermes
 * anahtarini kime gonderecegini burasi belirliyor. Bu yuzden testli.
 */
class ConnectLinkTest {

    private val validKey = "hf-abc123"
    private val localUrl = "http%3A%2F%2F127.0.0.1%3A8642"

    @Test
    fun gecerliBaglantiAyristirilir() {
        val request = ConnectLink.parse("hermesforge://connect?url=$localUrl&key=$validKey")
        assertEquals("http://127.0.0.1:8642", request?.baseUrl)
        assertEquals(validKey, request?.apiKey)
    }

    @Test
    fun localhostKabulEdilir() {
        val request = ConnectLink.parse(
            "hermesforge://connect?url=http%3A%2F%2Flocalhost%3A8642&key=$validKey"
        )
        assertEquals("http://localhost:8642", request?.baseUrl)
    }

    @Test
    fun sondakiEgikCizgiTemizlenir() {
        val request = ConnectLink.parse(
            "hermesforge://connect?url=http%3A%2F%2F127.0.0.1%3A8642%2F&key=$validKey"
        )
        assertEquals("http://127.0.0.1:8642", request?.baseUrl)
    }

    @Test
    fun uzakSunucuReddedilir() {
        // Bir web sayfasi bu baglantiyi acip anahtari kendi sunucusuna
        // yonlendirmeye calisabilir.
        assertNull(
            ConnectLink.parse(
                "hermesforge://connect?url=http%3A%2F%2Fkotu.example%3A8642&key=$validKey"
            )
        )
        assertNull(
            ConnectLink.parse(
                "hermesforge://connect?url=https%3A%2F%2F10.0.0.5%3A8642&key=$validKey"
            )
        )
    }

    @Test
    fun yanlisSemaReddedilir() {
        assertNull(ConnectLink.parse("https://connect?url=$localUrl&key=$validKey"))
    }

    @Test
    fun yanlisHostReddedilir() {
        assertNull(ConnectLink.parse("hermesforge://baskasey?url=$localUrl&key=$validKey"))
    }

    @Test
    fun eksikAlanlarReddedilir() {
        assertNull(ConnectLink.parse("hermesforge://connect?url=$localUrl"))
        assertNull(ConnectLink.parse("hermesforge://connect?key=$validKey"))
        assertNull(ConnectLink.parse("hermesforge://connect"))
        assertNull(ConnectLink.parse(""))
        assertNull(ConnectLink.parse(null))
    }

    @Test
    fun fileSemasiReddedilir() {
        assertNull(
            ConnectLink.parse(
                "hermesforge://connect?url=file%3A%2F%2F%2Fetc%2Fpasswd&key=$validKey"
            )
        )
    }

    @Test
    fun kontrolKarakterliAnahtarReddedilir() {
        assertNull(
            ConnectLink.parse("hermesforge://connect?url=$localUrl&key=abc%0Ainjected")
        )
    }

    @Test
    fun saglayiciAnahtariDaTasinabilir() {
        val request = ConnectLink.parse(
            "hermesforge://connect?url=$localUrl&key=$validKey" +
                "&provider_key=sk-test&model=deepseek-v4-pro"
        )
        assertEquals("sk-test", request?.providerKey)
        assertEquals("deepseek-v4-pro", request?.providerModel)
    }

    @Test
    fun jsonGovdesiAnahtariTasir() {
        val json = ConnectRequest("http://127.0.0.1:8642", validKey).toSettingsJson()
        assertTrue(json.contains("hermes_base_url"))
        assertTrue(json.contains(validKey))
    }

    @Test
    fun jsonGovdesiKacisKarakterleriniKorur() {
        val tricky = "a" + QUOTE + "b"
        val json = ConnectRequest("http://127.0.0.1:8642", tricky).toSettingsJson()
        // Tirnak kacisli gelmeli ki govde bozulmasin.
        assertTrue(json.contains(BACKSLASH + QUOTE))
    }

    @Test
    fun saglayiciAlanlariBossaGonderilmez() {
        val json = ConnectRequest("http://127.0.0.1:8642", validKey).toSettingsJson()
        assertFalse(json.contains("fallback_api_key"))
        assertFalse(json.contains("fallback_model"))
    }

    private companion object {
        const val QUOTE = "\""
        const val BACKSLASH = "\\"
    }
}
