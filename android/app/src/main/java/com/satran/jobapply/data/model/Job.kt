package com.satran.jobapply.data.model

import com.satran.jobapply.core.asEmailOrNull
import com.satran.jobapply.core.orNa
import com.satran.jobapply.core.titleCaseWords
import com.satran.jobapply.core.toDisplayDate
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.util.Locale

/**
 * seasonaljobs.dol.gov arama dizinindeki bir iş ilanı.
 * Alan adları DOL/OFLC veri havuzundaki adlarla birebir aynıdır.
 */
@Serializable
data class JobDto(
    @SerialName("case_number") val caseNumber: String? = null,
    @SerialName("job_title") val jobTitle: String? = null,
    @SerialName("job_duties") val jobDuties: String? = null,
    @SerialName("special_req") val specialRequirements: String? = null,
    @SerialName("employer_business_name") val employerName: String? = null,
    @SerialName("employer_trade_name") val employerTradeName: String? = null,
    @SerialName("employer_city") val employerCity: String? = null,
    @SerialName("employer_state") val employerState: String? = null,
    @SerialName("employer_email") val employerEmail: String? = null,
    @SerialName("apply_email") val applyEmail: String? = null,
    @SerialName("apply_url") val applyUrl: String? = null,
    @SerialName("apply_phone") val applyPhone: String? = null,
    @SerialName("worksite_address") val worksiteAddress: String? = null,
    @SerialName("worksite_city") val worksiteCity: String? = null,
    @SerialName("worksite_state") val worksiteState: String? = null,
    @SerialName("begin_date") val beginDate: String? = null,
    @SerialName("end_date") val endDate: String? = null,
    @SerialName("accepted_date") val acceptedDate: String? = null,
    @SerialName("basic_rate_from") val rateFrom: Double? = null,
    @SerialName("basic_rate_to") val rateTo: Double? = null,
    @SerialName("pay_range_desc") val payRange: String? = null,
    @SerialName("add_wage_info") val addWageInfo: String? = null,
    @SerialName("total_positions") val totalPositions: Int? = null,
    @SerialName("visa_class") val visaClass: String? = null,
    @SerialName("soc_code_id") val socCode: String? = null,
    @SerialName("soc_title") val socTitle: String? = null,
    @SerialName("education_level") val educationLevel: String? = null,
    @SerialName("emp_experience_reqd") val experienceRequired: Boolean? = null,
    @SerialName("emp_exp_num_months") val experienceMonths: Int? = null,
    @SerialName("full_time") val fullTime: Boolean? = null,
    @SerialName("work_hour_num_basic") val weeklyHours: Double? = null,
)

/** Arayüzde kullanılan, temizlenmiş iş kaydı. Arşive yazıldığı için serileştirilebilir. */
@Serializable
data class Job(
    val caseNumber: String,
    val title: String,
    val employer: String,
    val email: String?,
    val phone: String?,
    val applyUrl: String?,
    val location: String,
    val socCode: String?,
    val socTitle: String?,
    val visaClass: String?,
    val positions: Int?,
    val wage: String?,
    val period: String?,
    val duties: String?,
    val requirements: String?,
    val education: String?,
    val experience: String?,
    val schedule: String?,
    val postedOn: String?,
) {
    val detailUrl: String get() = "https://seasonaljobs.dol.gov/jobs/$caseNumber"

    val canEmail: Boolean get() = email != null

    /** AI'ya ve mektup şablonuna verilen kısa özet. */
    fun toPromptBlock(): String = buildString {
        appendLine("Case: $caseNumber")
        appendLine("Title: $title")
        appendLine("Employer: $employer")
        appendLine("Location: $location")
        socTitle?.let { appendLine("SOC: $socCode $it") }
        wage?.let { appendLine("Wage: $it") }
        period?.let { appendLine("Period: $it") }
        positions?.let { appendLine("Openings: $it") }
        education?.let { appendLine("Education: $it") }
        experience?.let { appendLine("Experience: $it") }
        duties?.let { appendLine("Duties: ${it.take(1200)}") }
        requirements?.let { appendLine("Requirements: ${it.take(600)}") }
    }.trim()
}

fun JobDto.toJob(): Job? {
    val case = caseNumber.orNa() ?: return null
    val title = jobTitle.orNa() ?: socTitle.orNa() ?: return null
    val employer = (employerTradeName.orNa() ?: employerName.orNa() ?: "Bilinmeyen işveren").titleCaseWords()

    val city = (worksiteCity.orNa() ?: employerCity.orNa())?.titleCaseWords()
    val state = (worksiteState.orNa() ?: employerState.orNa())?.titleCaseWords()
    val location = listOfNotNull(city, state).joinToString(", ").ifBlank { "ABD" }

    val wage = buildWage()
    val begin = beginDate.toDisplayDate()
    val end = endDate.toDisplayDate()
    val period = when {
        begin != null && end != null -> "$begin – $end"
        begin != null -> "$begin'den itibaren"
        else -> null
    }

    val experience = when {
        experienceRequired == true && (experienceMonths ?: 0) > 0 -> "${experienceMonths} ay deneyim isteniyor"
        experienceRequired == true -> "Deneyim isteniyor"
        experienceRequired == false -> "Deneyim şartı yok"
        else -> null
    }

    val schedule = weeklyHours?.takeIf { it > 0 }?.let {
        val h = if (it % 1.0 == 0.0) it.toInt().toString() else it.toString()
        if (fullTime == true) "Haftada $h saat (tam zamanlı)" else "Haftada $h saat"
    }

    return Job(
        caseNumber = case,
        title = title.titleCaseWords(),
        employer = employer,
        email = applyEmail.asEmailOrNull() ?: employerEmail.asEmailOrNull(),
        phone = applyPhone.orNa(),
        applyUrl = applyUrl.orNa()?.takeIf { it.startsWith("http", ignoreCase = true) },
        location = location,
        socCode = socCode.orNa(),
        socTitle = socTitle.orNa(),
        visaClass = visaClass.orNa(),
        positions = totalPositions?.takeIf { it > 0 },
        wage = wage,
        period = period,
        duties = jobDuties.orNa(),
        requirements = specialRequirements.orNa(),
        education = educationLevel.orNa()?.takeIf { !it.equals("None", true) },
        experience = experience,
        schedule = schedule,
        postedOn = acceptedDate.toDisplayDate(),
    )
}

private fun JobDto.buildWage(): String? {
    val unit = when (payRange.orNa()?.lowercase()) {
        "hour" -> "saat"
        "week" -> "hafta"
        "month" -> "ay"
        "year" -> "yıl"
        "bi-weekly" -> "iki hafta"
        else -> payRange.orNa()
    }
    val from = rateFrom?.takeIf { it > 0.0 }
    val to = rateTo?.takeIf { it > 0.0 && it != from }
    val base = when {
        from != null && to != null -> String.format(Locale.US, "\$%.2f – \$%.2f", from, to)
        from != null -> String.format(Locale.US, "\$%.2f", from)
        else -> null
    }
    val withUnit = when {
        base != null && unit != null -> "$base / $unit"
        else -> base
    }
    return withUnit ?: addWageInfo.orNa()
}
