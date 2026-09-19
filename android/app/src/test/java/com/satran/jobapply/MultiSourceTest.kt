package com.satran.jobapply

import com.satran.jobapply.data.model.Job
import com.satran.jobapply.data.model.JobSource
import com.satran.jobapply.data.remote.OflcDisclosureApi
import com.satran.jobapply.data.xlsx.XlsxRows
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Kaynaklar ayrı kategorilerdir: listeler karışmaz, her birine ayrı ayrı
 * toplu başvuru yapılır. Tek ortak kural aynı işverene iki mektup gitmemesi.
 */
class MultiSourceTest {

    private fun job(case: String, email: String?, source: JobSource) = Job(
        caseNumber = case,
        title = "İş",
        employer = "İşveren",
        email = email,
        phone = null,
        applyUrl = null,
        location = "Denver, CO",
        socCode = null,
        socTitle = null,
        visaClass = "H-2B",
        positions = 1,
        wage = null,
        period = null,
        duties = null,
        requirements = null,
        education = null,
        experience = null,
        schedule = null,
        postedOn = null,
        source = source,
    )

    // ------------------------------------------------------- kaynak ayrımı

    @Test
    fun `kaynagin ilan sayfasi kendi sitesine gider`() {
        val site = job("H-400-1", "a@b.com", JobSource.SEASONAL_JOBS)
        val oflc = job("H-400-2", "c@d.com", JobSource.OFLC_DISCLOSURE)
        assertTrue(site.detailUrl.startsWith("https://seasonaljobs.dol.gov/jobs/"))
        // Açıklama verisindeki kaydın ilan sayfası yok; uydurma bağlantı
        // kullanıcıyı 404'e götürürdü.
        assertFalse(oflc.detailUrl.contains("/jobs/"))
        assertTrue(oflc.detailUrl.contains("dol.gov"))
    }

    @Test
    fun `eski arsiv kayitlari varsayilan kaynakla okunur`() {
        // Kaynak alanı sonradan eklendi; eski kayıtlarda yok.
        assertEquals(JobSource.SEASONAL_JOBS, job("H-1", null, JobSource.SEASONAL_JOBS).source)
        assertEquals(JobSource.SEASONAL_JOBS, JobSource.from(null))
        assertEquals(JobSource.OFLC_DISCLOSURE, JobSource.from("oflc"))
        assertEquals(JobSource.SEASONAL_JOBS, JobSource.from("bilinmeyen"))
    }

    // ------------------------------------------- aynı işverene iki mektup

    @Test
    fun `iki kaynakta birden cikan isverene tek mektup gider`() {
        // Ölçüldü: 6.660 OFLC adresinin 1.994'ü seasonaljobs'ta da var.
        // İlan numaraları farklı olduğu için numara bazlı eleme yetmiyor.
        val written = setOf("ortak@firma.com")
        val oflcList = listOf(
            job("H-400-10", "ortak@firma.com", JobSource.OFLC_DISCLOSURE),
            job("H-400-11", "yeni@firma.com", JobSource.OFLC_DISCLOSURE),
        )
        val targets = oflcList.filterNot { it.email?.lowercase() in written }
        assertEquals(1, targets.size)
        assertEquals("yeni@firma.com", targets.single().email)
    }

    @Test
    fun `ayni kuyrukta ayni adres iki kez bulunmaz`() {
        val jobs = listOf(
            job("H-400-20", "ayni@firma.com", JobSource.OFLC_DISCLOSURE),
            job("H-400-21", "AYNI@firma.com", JobSource.OFLC_DISCLOSURE),
            job("H-400-22", "baska@firma.com", JobSource.OFLC_DISCLOSURE),
        )
        val unique = jobs.distinctBy { it.caseNumber }.distinctBy { it.email!!.lowercase() }
        assertEquals(2, unique.size)
    }

    // ------------------------------------------------ sürüm bağlantısı

    @Test
    fun `surum baglantisi yalnizca href icinden alinir`() {
        // Sayfada dosya adı bağlantı METNİ olarak da geçiyor; onu adres
        // sanmak "https://www.dol.gov>H-2B_..." gibi bozuk bir URL üretirdi.
        val api = OflcDisclosureApi(File("."))
        val html = """
            <a href="https://www.dol.gov/media/H-2B_Disclosure_Data_FY2026_Q3.xlsx">
              H-2B_Disclosure_Data_FY2026_Q3.xlsx</a>
            <a href="/sites/dolgov/files/H-2B_Disclosure_Data_FY2025_Q4.xlsx">eski</a>
        """.trimIndent()

        val found = api.parseReleases(html)
        assertEquals("iki bağlantı bulunmalı", 2, found.size)
        found.forEach {
            assertTrue("bozuk adres: ${it.release.url}", it.release.url.startsWith("https://www.dol.gov/"))
            assertFalse("adreste '>' olmamalı", it.release.url.contains(">"))
        }
        val newest = found.maxByOrNull { it.sortKey }!!
        assertEquals("FY2026 Q3", newest.release.label)
        assertEquals("https://www.dol.gov/media/H-2B_Disclosure_Data_FY2026_Q3.xlsx", newest.release.url)
    }

    @Test
    fun `cift egik cizgili baglanti duzeltilir`() {
        val api = OflcDisclosureApi(File("."))
        val html = """<a href="//media/H-2B_Disclosure_Data_FY2026_Q1.xlsx">x</a>"""
        val url = api.parseReleases(html).single().release.url
        assertFalse("çift eğik çizgi kalmamalı", url.removePrefix("https://").contains("//"))
    }

    // ------------------------------------------------------ sütun çözümü

    @Test
    fun `sutun harfi indise cevrilir`() {
        assertEquals(0, XlsxRows.columnIndex("A"))
        assertEquals(25, XlsxRows.columnIndex("Z"))
        assertEquals(26, XlsxRows.columnIndex("AA"))
        // Açıklama dosyasında 80'den fazla sütun var; iki harfli sütunlar
        // yanlış çözülürse e-posta sütunu kayar ve yanlış adrese yazılır.
        assertEquals(42, XlsxRows.columnIndex("AQ"))
        assertEquals(701, XlsxRows.columnIndex("ZZ"))
    }
}
