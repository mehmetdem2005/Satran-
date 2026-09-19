package com.satran.jobapply

import com.satran.jobapply.data.mail.MailTemplate
import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.data.model.Job
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MailTemplateTest {

    private val job = Job(
        caseNumber = "H-300-26173-037509",
        title = "Farmworkers & Laborers, Crop",
        employer = "Lakeside Orchards Inc.",
        email = "lakesideorchards@yahoo.com",
        phone = "+17167787631",
        applyUrl = null,
        location = "Burt, New York",
        socCode = "45-2092.00",
        socTitle = "Farmworkers and Laborers, Crop",
        visaClass = "H-2A",
        positions = 115,
        wage = "\$18.75 / saat",
        period = "03.09.2026 – 14.11.2026",
        duties = "Harvest fruit by hand.",
        requirements = null,
        education = null,
        experience = null,
        schedule = null,
        postedOn = null,
    )

    private val settings = AppSettings(
        fullName = "Ada Yılmaz",
        phone = "+90 500 000 00 00",
        gmailAddress = "ornek@example.com",
    )

    @Test
    fun `renders every placeholder`() {
        val rendered = MailTemplate.render(
            "{{title}} @ {{employer}} ({{case}}) in {{location}} — {{period}} — {{wage}} — {{positions}} — {{soc}} — {{name}} {{phone}} {{email}}",
            job,
            settings,
        )
        assertEquals(
            "Farmworkers & Laborers, Crop @ Lakeside Orchards Inc. (H-300-26173-037509) in Burt, New York " +
                "— 03.09.2026 – 14.11.2026 — \$18.75 / saat — 115 — Farmworkers and Laborers, Crop " +
                "— Ada Yılmaz +90 500 000 00 00 ornek@example.com",
            rendered,
        )
    }

    @Test
    fun `default template leaves no placeholder behind`() {
        val rendered = MailTemplate.render(AppSettings.DEFAULT_BODY_TEMPLATE, job, settings)
        assertFalse(rendered.contains("{{"))
    }

    @Test
    fun `varsayilan mektupta kalipsmis dolgu cumleleri yok`() {
        val rendered = MailTemplate.render(AppSettings.DEFAULT_BODY_TEMPLATE, job, settings).lowercase()
        // Bu ifadeler her toplu başvuruda geçiyor; okuyan kişi atlıyor.
        listOf(
            "i am writing to apply",
            "highly motivated",
            "hardworking",
            "at your convenience",
            "for your review",
            "do not hesitate",
        ).forEach { cliche ->
            assertFalse("kalıplaşmış ifade kaldı: $cliche", rendered.contains(cliche))
        }
    }

    @Test
    fun `varsayilan mektup kisa kalir`() {
        val words = MailTemplate.render(AppSettings.DEFAULT_BODY_TEMPLATE, job, settings)
            .split(Regex("\\s+")).size
        assertTrue("mektup çok uzun: $words kelime", words < 70)
    }

    @Test
    fun `telefon girilmemisse bosluk birakmaz`() {
        val noPhone = settings.copy(phone = "")
        val rendered = MailTemplate.render(AppSettings.DEFAULT_BODY_TEMPLATE, job, noPhone)
        // Boş alan ardında sarkan satır ya da üst üste boşluk kalmamalı.
        assertFalse("üç boş satır kaldı", rendered.contains("\n\n\n"))
        assertFalse("sonda boşluk kaldı", rendered != rendered.trim())
        assertTrue(rendered.endsWith(noPhone.fullName))
    }

    @Test
    fun `eski sablon yenisiyle ayni degil`() {
        // Geçiş yalnızca dokunulmamış eski şablonu değiştirir; ikisi farklı olmalı.
        assertFalse(AppSettings.LEGACY_BODY_TEMPLATE == AppSettings.DEFAULT_BODY_TEMPLATE)
    }

    @Test
    fun `onizleme ornek ilanda hic yer tutucu birakmaz`() {
        // Ayarlardaki önizleme kullanıcıya "{{title}} ne işe yarıyor" sorusunun
        // cevabı; içinde ham yer tutucu kalırsa tam tersini anlatır.
        val subject = MailTemplate.render(
            AppSettings().subjectTemplate,
            MailTemplate.SAMPLE_JOB,
            settings,
        )
        val body = MailTemplate.render(
            AppSettings.DEFAULT_BODY_TEMPLATE,
            MailTemplate.SAMPLE_JOB,
            settings,
        )
        assertFalse("konuda yer tutucu kaldı: $subject", subject.contains("{{"))
        assertFalse("gövdede yer tutucu kaldı: $body", body.contains("{{"))
    }

    @Test
    fun `ornek ilan her yer tutucuyu doldurabilir`() {
        // Her çipin karşılığı örnek ilanda dolu olmalı; boş kalan bir alan
        // önizlemede sessizce kaybolur ve kullanıcı o çipi bozuk sanır.
        val template = MailTemplate.PLACEHOLDERS.joinToString("\n") { (token, label) -> "$label: $token" }
        val rendered = MailTemplate.render(template, MailTemplate.SAMPLE_JOB, settings)
        MailTemplate.PLACEHOLDERS.forEach { (_, label) ->
            val line = rendered.lines().first { it.startsWith("$label:") }
            assertTrue("$label boş kaldı", line.removePrefix("$label:").isNotBlank())
        }
    }

    @Test
    fun `ornek ilan gercek ilan bicimindedir`() {
        val job = MailTemplate.SAMPLE_JOB
        // Gerçek DOL ilan numarası biçimi: H-400-26245-210160
        assertTrue(job.caseNumber.matches(Regex("H-\\d{3}-\\d{5}-\\d{6}")))
        assertEquals("H-2B", job.visaClass)
    }
}
