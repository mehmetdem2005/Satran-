package com.hermesforge.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Derin baglanti ayristirmasi guvenlik karari veriyor: uygulamanin Hermes
 * anahtarini kime gonderecegini burasi belirliyor. Bu yuzden testli.
 *
 * Kural degisti: Hermes artik kullanicinin bilgisayarinda calistigi icin uzak
 * adres gecerli. Onun yerine bicimsel dogrulama + "ayni cihazda mi, ev aginda
 * mi, internette mi" siniflandirmasi yapiyoruz; loopback disindaki her adres
 * icin MainActivity kullaniciya onay penceresi gosteriyor.
 */
class ConnectLinkTest {

    private val validKey = "hf-abc123"
    private val localUrl = "http%3A%2F%2F127.0.0.1%3A8642"

    @Test
    fun gecerliBaglantiAyristirilir() {
        val request = ConnectLink.parse("hermesforge://connect?url=$localUrl&key=$validKey")
        assertEquals("http://127.0.0.1:8642", request?.baseUrl)
        assertEquals(validKey, request?.apiKey)
        assertTrue(request!!.isLoopback)
    }

    @Test
    fun localhostKabulEdilir() {
        val request = ConnectLink.parse(
            "hermesforge://connect?url=http%3A%2F%2Flocalhost%3A8642&key=$validKey"
        )
        assertEquals("http://localhost:8642", request?.baseUrl)
        assertTrue(request!!.isLoopback)
    }

    @Test
    fun sondakiEgikCizgiTemizlenir() {
        val request = ConnectLink.parse(
            "hermesforge://connect?url=http%3A%2F%2F127.0.0.1%3A8642%2F&key=$validKey"
        )
        assertEquals("http://127.0.0.1:8642", request?.baseUrl)
    }

    @Test
    fun evAgindakiBilgisayarKabulEdilir() {
        // Beklenen kullanim: Hermes masaustunde, telefon ayni Wi-Fi'da.
        val request = ConnectLink.parse(
            "hermesforge://connect?url=http%3A%2F%2F192.168.1.20%3A8642&key=$validKey"
        )
        assertEquals("http://192.168.1.20:8642", request?.baseUrl)
        assertFalse(request!!.isLoopback)
        assertTrue(request.isPrivateNetwork)
        assertEquals("192.168.1.20:8642", request.host)
    }

    @Test
    fun digerOzelAraliklarDaEvAgiSayilir() {
        listOf("10.0.0.5", "172.16.4.9", "172.31.255.1", "macbook.local").forEach { host ->
            val request = ConnectLink.parse(
                "hermesforge://connect?url=http%3A%2F%2F$host%3A8642&key=$validKey"
            )
            assertTrue("$host ev agi sayilmali", request!!.isPrivateNetwork)
        }
    }

    @Test
    fun internettekiSunucuIsaretlenir() {
        // Reddetmiyoruz (VPS senaryosu gercek) ama kullaniciya sert bir uyari
        // gosterebilmek icin ayirt ediyoruz.
        val request = ConnectLink.parse(
            "hermesforge://connect?url=https%3A%2F%2Fhermes.ornek.com&key=$validKey"
        )
        assertEquals("https://hermes.ornek.com", request?.baseUrl)
        assertFalse(request!!.isPrivateNetwork)
        assertFalse(request.isLoopback)
        assertEquals("hermes.ornek.com", request.host)
    }

    @Test
    fun ozelAralikGibiGorunenGecersizAdresler() {
        listOf("172.15.0.1", "172.32.0.1", "11.0.0.1", "192.169.1.1").forEach { host ->
            val request = ConnectLink.parse(
                "hermesforge://connect?url=http%3A%2F%2F$host%3A8642&key=$validKey"
            )
            assertFalse("$host ev agi sayilmamali", request!!.isPrivateNetwork)
        }
    }

    @Test
    fun kullaniciBilgisiTasiyanAdresReddedilir() {
        // "http://guvenli.example@saldirgan.example" gosterilen makineyi
        // yaniltir; onay penceresi yanlis adi gosterirdi.
        assertNull(
            ConnectLink.parse(
                "hermesforge://connect?url=http%3A%2F%2F192.168.1.20%40kotu.example&key=$validKey"
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
    fun adressizBaglantiReddedilir() {
        assertNull(ConnectLink.parse("hermesforge://connect?key=$validKey"))
        assertNull(ConnectLink.parse("hermesforge://connect"))
        assertNull(ConnectLink.parse(""))
        assertNull(ConnectLink.parse(null))
    }

    @Test
    fun anahtarsizBaglantiKabulEdilir() {
        // Hermes anahtarsiz da calistirilabiliyor; adres tek basina yeterli.
        val request = ConnectLink.parse("hermesforge://connect?url=$localUrl")
        assertEquals("http://127.0.0.1:8642", request?.baseUrl)
        assertEquals("", request?.apiKey)
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
        assertNull(
            ConnectLink.parse("hermesforge://connect?url=$localUrl&key=abc%20def")
        )
    }

    @Test
    fun jsonGovdesiAnahtariTasir() {
        val json = istek(validKey).toSettingsJson()
        assertTrue(json.contains("hermes_base_url"))
        assertTrue(json.contains(validKey))
    }

    @Test
    fun jsonGovdesiKacisKarakterleriniKorur() {
        val json = istek("a" + QUOTE + "b").toSettingsJson()
        // Tirnak kacisli gelmeli ki govde bozulmasin.
        assertTrue(json.contains(BACKSLASH + QUOTE))
    }

    @Test
    fun bosAnahtarGonderilmez() {
        // Bos anahtar yazilsaydi kayitli anahtari silerdi.
        val json = istek("").toSettingsJson()
        assertTrue(json.contains("hermes_base_url"))
        assertFalse(json.contains("hermes_api_key"))
    }

    private fun istek(key: String) = ConnectRequest(
        baseUrl = "http://127.0.0.1:8642",
        apiKey = key,
        host = "127.0.0.1:8642",
        isLoopback = true,
        isPrivateNetwork = true
    )

    private companion object {
        const val QUOTE = "\""
        const val BACKSLASH = "\\"
    }
}
