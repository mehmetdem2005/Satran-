package com.satran.jobapply.data.mail

import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.data.model.Job

/** Şablondaki {{...}} yer tutucularını ilan bilgileriyle doldurur. */
object MailTemplate {

    val PLACEHOLDERS = listOf(
        "{{title}}" to "İş başlığı",
        "{{employer}}" to "İşveren adı",
        "{{case}}" to "İlan numarası",
        "{{location}}" to "Şehir, eyalet",
        "{{period}}" to "Çalışma dönemi",
        "{{wage}}" to "Ücret",
        "{{positions}}" to "Açık pozisyon sayısı",
        "{{soc}}" to "Meslek adı",
        "{{name}}" to "Senin adın",
        "{{phone}}" to "Senin telefonun",
        "{{email}}" to "Senin e-postan",
    )

    fun render(template: String, job: Job, settings: AppSettings): String {
        var out = template
        val values = mapOf(
            "{{title}}" to job.title,
            "{{employer}}" to job.employer,
            "{{case}}" to job.caseNumber,
            "{{location}}" to job.location,
            "{{period}}" to (job.period ?: "the announced season"),
            "{{wage}}" to (job.wage ?: ""),
            "{{positions}}" to (job.positions?.toString() ?: ""),
            "{{soc}}" to (job.socTitle ?: job.title),
            "{{name}}" to settings.fullName,
            "{{phone}}" to settings.phone,
            "{{email}}" to settings.gmailAddress,
        )
        values.forEach { (key, value) -> out = out.replace(key, value) }
        return out.trim()
    }
}
