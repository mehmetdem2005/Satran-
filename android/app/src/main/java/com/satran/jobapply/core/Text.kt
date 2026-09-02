package com.satran.jobapply.core

/** "N/A", boş dize ve null değerlerini tek noktada temizler. */
fun String?.orNa(): String? {
    val v = this?.trim().orEmpty()
    if (v.isEmpty()) return null
    if (v.equals("N/A", ignoreCase = true)) return null
    if (v.equals("null", ignoreCase = true)) return null
    return v
}

private val EMAIL_REGEX = Regex("^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}$")

fun String?.asEmailOrNull(): String? {
    val v = orNa() ?: return null
    // Bazı kayıtlar birden fazla adresi tek alanda taşıyor.
    val first = v.split(';', ',', ' ', '/').map { it.trim() }.firstOrNull { EMAIL_REGEX.matches(it) }
    return first?.lowercase()
}

/** ISO 8601 tarihini gg.aa.yyyy biçiminde gösterir. */
fun String?.toDisplayDate(): String? {
    val v = orNa() ?: return null
    val date = v.substringBefore('T')
    val parts = date.split('-')
    if (parts.size != 3) return v
    if (parts[0] == "1970") return null
    return "${parts[2]}.${parts[1]}.${parts[0]}"
}

fun String.titleCaseWords(): String = split(' ').joinToString(" ") { w ->
    if (w.length <= 2) w.uppercase()
    else w.lowercase().replaceFirstChar { it.uppercase() }
}

fun String.truncate(max: Int): String = if (length <= max) this else take(max).trimEnd() + "…"
