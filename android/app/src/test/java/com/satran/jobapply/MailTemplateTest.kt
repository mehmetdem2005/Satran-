package com.satran.jobapply

import com.satran.jobapply.data.mail.MailTemplate
import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.data.model.Job
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
        fullName = "Mehmet Demir",
        phone = "+90 555 000 00 00",
        gmailAddress = "me@gmail.com",
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
                "— Mehmet Demir +90 555 000 00 00 me@gmail.com",
            rendered,
        )
    }

    @Test
    fun `default template leaves no placeholder behind`() {
        val rendered = MailTemplate.render(AppSettings.DEFAULT_BODY_TEMPLATE, job, settings)
        assertFalse(rendered.contains("{{"))
    }
}
