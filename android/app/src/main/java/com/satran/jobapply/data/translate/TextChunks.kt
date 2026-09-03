package com.satran.jobapply.data.translate

/**
 * Uzun ilan metnini çeviriye uygun parçalara böler.
 *
 * Hem cihaz üstü motorun kalitesi hem de anahtarsız HTTP servisinin istek
 * başına karakter sınırı için gerekli. Bölme satır ve cümle sınırlarında
 * yapılır, böylece anlam ortadan kesilmez.
 */
object TextChunks {

    fun split(text: String, maxChars: Int): List<String> {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return emptyList()
        if (trimmed.length <= maxChars) return listOf(trimmed)

        val chunks = mutableListOf<String>()
        val builder = StringBuilder()

        fun flush() {
            val piece = builder.toString().trim()
            if (piece.isNotEmpty()) chunks += piece
            builder.setLength(0)
        }

        trimmed.split('\n').forEach { line ->
            if (line.isBlank()) {
                if (builder.isNotEmpty()) builder.append('\n')
                return@forEach
            }
            sentences(line).forEach { sentence ->
                val piece = if (sentence.length > maxChars) hardSplit(sentence, maxChars) else listOf(sentence)
                piece.forEach { part ->
                    if (builder.length + part.length + 1 > maxChars) flush()
                    if (builder.isNotEmpty()) builder.append(' ')
                    builder.append(part)
                }
            }
            if (builder.isNotEmpty()) builder.append('\n')
        }
        flush()
        return chunks
    }

    private fun sentences(line: String): List<String> {
        val out = mutableListOf<String>()
        val builder = StringBuilder()
        line.forEach { char ->
            builder.append(char)
            if (char == '.' || char == '!' || char == '?' || char == ';') {
                out += builder.toString().trim()
                builder.setLength(0)
            }
        }
        builder.toString().trim().takeIf { it.isNotEmpty() }?.let { out += it }
        return out.filter { it.isNotEmpty() }
    }

    /** Tek bir cümle bile sınırı aşıyorsa kelime sınırından böler. */
    private fun hardSplit(sentence: String, maxChars: Int): List<String> {
        val out = mutableListOf<String>()
        val builder = StringBuilder()
        sentence.split(' ').forEach { word ->
            if (builder.length + word.length + 1 > maxChars) {
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
