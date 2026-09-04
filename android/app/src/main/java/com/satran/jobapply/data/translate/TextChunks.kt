package com.satran.jobapply.data.translate

/**
 * Uzun ilan metnini çeviriye uygun parçalara böler.
 *
 * Bölme sırası: **satır → cümle → kelime**. Cümle sonu sayılmak için noktadan
 * sonra boşluk gelmesi şartı aranır; böylece `$18.93`, `Mon.-Fri.`, `U.S.`
 * gibi yerlerdeki noktalar metni parçalamaz. (Önceki sürüm her noktada
 * bölüyordu ve çeviri bozuluyordu.)
 */
object TextChunks {

    /** Noktalama + boşluk = cümle sonu. Ondalık sayılar ve kısaltmalar korunur. */
    private val SENTENCE_BREAK = Regex("(?<=[.!?])\\s+")

    fun split(text: String, maxChars: Int): List<String> {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return emptyList()
        if (trimmed.length <= maxChars) return listOf(trimmed)

        val chunks = mutableListOf<String>()
        val builder = StringBuilder()

        fun flush() {
            builder.toString().trim().takeIf { it.isNotEmpty() }?.let { chunks += it }
            builder.setLength(0)
        }

        fun appendPart(part: String, separator: String) {
            if (part.isEmpty()) return
            if (builder.isNotEmpty() && builder.length + part.length + separator.length > maxChars) flush()
            if (builder.isNotEmpty()) builder.append(separator)
            builder.append(part)
        }

        // Satır yapısı çeviri kalitesi için önemli: madde madde yazılmış
        // görev tanımları satır sınırında bölünürse anlam korunur.
        trimmed.split('\n').forEach { line ->
            val clean = line.trim()
            if (clean.isEmpty()) return@forEach

            if (clean.length <= maxChars) {
                appendPart(clean, "\n")
                return@forEach
            }
            clean.split(SENTENCE_BREAK).forEach { sentence ->
                val piece = sentence.trim()
                if (piece.isEmpty()) return@forEach
                if (piece.length <= maxChars) {
                    appendPart(piece, " ")
                } else {
                    hardSplit(piece, maxChars).forEach { appendPart(it, " ") }
                }
            }
        }
        flush()
        return chunks
    }

    /** Tek bir cümle bile sınırı aşıyorsa kelime sınırından böler. */
    private fun hardSplit(sentence: String, maxChars: Int): List<String> {
        val out = mutableListOf<String>()
        val builder = StringBuilder()
        sentence.split(' ').forEach { word ->
            if (builder.isNotEmpty() && builder.length + word.length + 1 > maxChars) {
                out += builder.toString().trim()
                builder.setLength(0)
            }
            if (builder.isNotEmpty()) builder.append(' ')
            builder.append(word)
        }
        builder.toString().trim().takeIf { it.isNotEmpty() }?.let { out += it }
        return out
    }
}
