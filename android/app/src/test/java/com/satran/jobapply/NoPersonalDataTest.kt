package com.satran.jobapply

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Uygulama tek kişiye değil, herkese göre olmalı: kuran kişi kendi CV'sini
 * ve kendi bilgilerini girer.
 *
 * Bir süre kişisel bir CV `res/raw` altında gömülüydü. Böyle bir dosya geri
 * sızarsa uygulamayı kuran herkes bir başkasının özgeçmişini, telefonunu ve
 * adresini taşımış olur — ve farkına varmadan işverenlere gönderir.
 */
class NoPersonalDataTest {

    private val mainSrc = File("src/main")

    @Test
    fun `kaynaklarda gomulu belge yok`() {
        val documents = mainSrc.walkTopDown()
            .filter { it.isFile }
            .filter { it.extension.lowercase() in setOf("pdf", "doc", "docx", "odt") }
            .toList()
        assertTrue(
            "Uygulamaya belge gömülmüş: ${documents.joinToString { it.path }}",
            documents.isEmpty(),
        )
    }

    @Test
    fun `kaynaklarda fotograf gomulu degil`() {
        // Uygulama simgeleri dışında resim olmamalı; kişisel fotoğraf hiç.
        val photos = mainSrc.walkTopDown()
            .filter { it.isFile }
            .filter { it.extension.lowercase() in setOf("jpg", "jpeg") }
            .toList()
        assertTrue("Gömülü fotoğraf var: ${photos.joinToString { it.path }}", photos.isEmpty())
    }

    @Test
    fun `kodda kisisel iletisim bilgisi yok`() {
        // Varsayılan olarak gelen bir e-posta ya da telefon, kuran kişinin
        // başvurularının yanlış adrese gitmesi demek.
        val suspicious = Regex(
            """[A-Za-z0-9._%+-]+@(gmail|hotmail|outlook|yahoo)\.com|\+90[ \d]{10,}""",
        )
        val offenders = mainSrc.walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .mapNotNull { file ->
                suspicious.find(file.readText())?.let { "${file.name}: ${it.value}" }
            }
            .toList()
        assertTrue("Kodda kişisel iletişim bilgisi var: $offenders", offenders.isEmpty())
    }
}
