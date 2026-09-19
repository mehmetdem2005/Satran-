package com.satran.jobapply

import com.satran.jobapply.data.mail.CvLoader
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Yerleşik CV'nin APK'ya gerçekten girdiğini ve geçerli bir PDF olduğunu
 * sabitler.
 *
 * Android çalıştırmadan `openRawResource` sınanamaz; sınanabilen ve yanlış
 * giderse her mektubu eksiz gönderecek olan kısım kaynağın kendisi: dosya
 * yerinde mi, PDF mi, Gmail ek sınırını aşıyor mu.
 */
class BuiltInCvTest {

    private val cv = File("src/main/res/raw/builtin_cv.pdf")

    @Test
    fun `yerlesik cv kaynak agacinda duruyor`() {
        assertTrue("builtin_cv.pdf bulunamadı: ${cv.absolutePath}", cv.isFile)
        assertTrue("dosya boş", cv.length() > 0)
    }

    @Test
    fun `yerlesik cv gercek bir pdf`() {
        val header = cv.inputStream().use { input ->
            ByteArray(5).also { input.read(it) }
        }
        assertEquals("%PDF-", String(header, Charsets.US_ASCII))
    }

    @Test
    fun `yerlesik cv gmail ek sinirini asmiyor`() {
        // Sınırı aşan bir CV her gönderimi tek tek düşürürdü.
        assertTrue(
            "CV çok büyük: ${cv.length() / (1024 * 1024)} MB",
            cv.length() < CvLoader.MAX_BYTES,
        )
    }

    @Test
    fun `ek adi pdf uzantili ve boslusuz`() {
        // Boşluklu ek adları bazı posta sunucularında bozuluyor.
        assertTrue(CvLoader.BUILT_IN_NAME.endsWith(".pdf"))
        assertTrue("ek adında boşluk var", !CvLoader.BUILT_IN_NAME.contains(' '))
    }

    @Test
    fun `yerlesik cv fotograf icermez`() {
        // ABD'de fotoğraflı özgeçmişler ayrımcılık iddiası riski yüzünden
        // çoğu zaman okunmadan eleniyor. Fotoğraf geri sızarsa her başvuru
        // sessizce zarar görür; bu yüzden gömülü resim olmadığı sabitlenir.
        val bytes = cv.readBytes()
        val text = String(bytes, Charsets.ISO_8859_1)
        listOf("/Subtype /Image", "/Subtype/Image", "/DCTDecode", "/JPXDecode").forEach { marker ->
            assertFalse("CV'de gömülü resim işareti var: $marker", text.contains(marker))
        }
    }

    @Test
    fun `yerlesik cv ek olarak makul boyutta`() {
        // 2700 ilana gönderiliyor; her megabayt doğrudan yükleme süresi.
        assertTrue(
            "CV beklenenden büyük: ${cv.length() / 1024} KB",
            cv.length() < 300 * 1024,
        )
    }

    @Test
    fun `yerlesik cv metin katmani tasiyor`() {
        // Tarama sistemleri metni okuyabilmeli; resme çevrilmiş CV elenir.
        val text = String(cv.readBytes(), Charsets.ISO_8859_1)
        assertTrue("font bulunamadı — CV resme dönüşmüş olabilir", text.contains("/Type /Font") || text.contains("/Type/Font") || text.contains("/FontFile"))
    }
}
