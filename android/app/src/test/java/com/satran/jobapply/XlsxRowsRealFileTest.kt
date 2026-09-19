package com.satran.jobapply

import com.satran.jobapply.data.xlsx.XlsxRows
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/**
 * Okuyucuyu **gerçek** DOL dosyasıyla sınar.
 *
 * Dosya 47 MB ve içinde gerçek işverenlerin e-posta adresleri var; depoya
 * konamaz. Bu yüzden sınama yalnızca dosya elde varsa çalışır:
 *   OFLC_XLSX=/yol/H-2B_Disclosure_Data_FY2026_Q3.xlsx ./gradlew test
 * Yoksa atlanır — sentetik sınamalar ayrıca var.
 */
class XlsxRowsRealFileTest {

    @Test
    fun `gercek dosyadan isveren e-postalari okunur`() {
        val path = System.getenv("OFLC_XLSX")
        assumeTrue("OFLC_XLSX tanımlı değil, atlanıyor", path != null && File(path).isFile)

        var rows = 0
        var certified = 0
        val emails = HashSet<String>()
        val started = System.currentTimeMillis()

        XlsxRows.read(File(path!!)) { row ->
            rows++
            val status = row["CASE_STATUS"].orEmpty()
            val email = row["EMPLOYER_POC_EMAIL"].orEmpty().trim().lowercase()
            val end = row["EMPLOYMENT_END_DATE"].orEmpty().take(10)
            if (status.contains("Certif", ignoreCase = true) && end >= "2026-09-19") {
                certified++
                if ("@" in email) emails += email
            }
            true
        }

        val seconds = (System.currentTimeMillis() - started) / 1000.0
        println("GERÇEK DOSYA: $rows satır · $certified onaylı · ${emails.size} benzersiz e-posta · ${seconds}s")

        // Python ile ayni dosyadan olculen degerler: 12.512 onayli, 6.660 e-posta.
        assert(certified in 12_000..13_000) { "onaylı sayısı beklenenin dışında: $certified" }
        assert(emails.size in 6_000..7_500) { "e-posta sayısı beklenenin dışında: ${emails.size}" }
    }
}
