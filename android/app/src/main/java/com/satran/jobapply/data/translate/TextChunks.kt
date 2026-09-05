package com.satran.jobapply.data.translate

/**
 * Uzun ilan metnini çeviriye uygun parçalara böler.
 *
 * Bölme sırası: **satır → cümle → kelime**. Cümle sonu sayılmak için noktadan
 * sonra boşluk gelmesi şartı aranır; böylece `$18.93`, `Mon.-Fri.`, `U.S.`
 * gibi yerlerdeki noktalar metni parçalamaz. (Önceki sürüm her noktada
 * bölüyordu ve çeviri bozuluyordu.)
 *
 * Paragraf ayracı (boş satır) parça **içinde** korunur. Ayraç tam parça
 * sınırına denk gelirse tek satır sonuna iner: parçalar ayrı ayrı çevrilip
 * `\n` ile birleştirildiği için sınırı aşan bağlam taşınamıyor. 800 karakterlik
 * gerçek parça boyunda bu nadir ve zararsızdır.
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
            // Boş satır paragraf ayracıdır; atılırsa çeviri tek blok hâline gelir.
            if (clean.isEmpty()) {
                if (builder.isNotEmpty()) builder.append('\n')
                return@forEach
            }

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

    /**
     * Tek bir cümle bile sınırı aşıyorsa kelime sınırından böler.
     * Tek bir "kelime" (uzun bir bağlantı gibi) bile sığmıyorsa harf harf
     * kesilir — aksi hâlde sınırı aşan bir parça üretilir ve çeviri servisi
     * onu reddedip alanın tamamı çevrilmemiş kalır.
     */
    private fun hardSplit(sentence: String, maxChars: Int): List<String> {
        val out = mutableListOf<String>()
        val builder = StringBuilder()

        fun flushWord() {
            builder.toString().trim().takeIf { it.isNotEmpty() }?.let { out += it }
            builder.setLength(0)
        }

        sentence.split(' ').forEach { word ->
            if (word.length > maxChars) {
                flushWord()
                word.chunked(maxChars).forEach { out += it }
                return@forEach
            }
            if (builder.isNotEmpty() && builder.length + word.length + 1 > maxChars) flushWord()
            if (builder.isNotEmpty()) builder.append(' ')
            builder.append(word)
        }
        flushWord()
        return out
    }
}
