package com.satran.jobapply.data.xlsx

import java.io.File
import java.io.InputStream
import java.util.zip.ZipFile

/**
 * XLSX dosyasını **satır satır** okur; dosyanın tamamını belleğe almaz.
 *
 * Neden elle yazıldı: Apache POI tek başına APK'yı ~10 MB büyütüyor ve
 * 47 MB'lık açıklama dosyasında bütün sayfayı nesneye çeviriyor. Burada
 * yalnızca paylaşılan dizeler bellekte tutulur, sayfa akıtılır.
 *
 * XLSX bir zip içinde XML'dir. Üretici araçların yazdığı XML makine üretimi
 * ve düzenlidir; bu yüzden tam bir XML ayrıştırıcı yerine satır sınırına
 * göre çalışan küçük bir tarayıcı yetiyor — ve bu, Android ile JVM
 * sınamalarında birebir aynı kodun çalışması demek.
 */
object XlsxRows {

    /** Bir hücrenin ham değeri; sütun harfi ("A", "BC") ile anahtarlanır. */
    private val CELL = Regex("""<c\s+r="([A-Z]+)\d+"([^>/]*)(?:/>|>(.*?)</c>)""", RegexOption.DOT_MATCHES_ALL)
    private val VALUE = Regex("""<v>(.*?)</v>""", RegexOption.DOT_MATCHES_ALL)
    private val INLINE = Regex("""<t[^>]*>(.*?)</t>""", RegexOption.DOT_MATCHES_ALL)

    /**
     * İlk satırı başlık kabul eder ve sonraki her satırı
     * `başlık -> değer` eşlemesi olarak [onRow]'a verir.
     *
     * [onRow] false dönerse okuma durur (erken çıkış).
     */
    fun read(file: File, onRow: (Map<String, String>) -> Boolean) {
        ZipFile(file).use { zip ->
            val shared = zip.getEntry("xl/sharedStrings.xml")
                ?.let { zip.getInputStream(it).use(::readSharedStrings) }
                ?: emptyList()

            val sheet = zip.entries().asSequence()
                .firstOrNull { it.name.startsWith("xl/worksheets/sheet") && it.name.endsWith(".xml") }
                ?: return

            zip.getInputStream(sheet).use { input ->
                streamRows(input, shared, onRow)
            }
        }
    }

    /**
     * Paylaşılan dize tablosu. Bir `<si>` içinde birden çok `<t>` olabilir
     * (biçimi değişen parçalar); hepsi birleştirilir, yoksa metin bölünür.
     */
    private fun readSharedStrings(input: InputStream): List<String> {
        val out = ArrayList<String>(1024)
        scan(input, "<si", "</si>") { block ->
            out += INLINE.findAll(block).joinToString("") { unescape(it.groupValues[1]) }
            true
        }
        return out
    }

    private fun streamRows(
        input: InputStream,
        shared: List<String>,
        onRow: (Map<String, String>) -> Boolean,
    ) {
        var header: List<String>? = null
        scan(input, "<row", "</row>") { block ->
            val cells = cellsOf(block, shared)
            if (header == null) {
                // Başlık satırı: boş sütunlar da yer tutsun diye en geniş
                // indise kadar doldurulur.
                val width = (cells.keys.maxOrNull() ?: -1) + 1
                header = (0 until width).map { cells[it].orEmpty() }
                true
            } else {
                val names = header!!
                val row = HashMap<String, String>(names.size)
                cells.forEach { (index, value) ->
                    names.getOrNull(index)?.takeIf { it.isNotEmpty() }?.let { row[it] = value }
                }
                if (row.isEmpty()) true else onRow(row)
            }
        }
    }

    private fun cellsOf(block: String, shared: List<String>): Map<Int, String> {
        val out = HashMap<Int, String>()
        CELL.findAll(block).forEach { m ->
            val column = columnIndex(m.groupValues[1])
            val attrs = m.groupValues[2]
            val body = m.groupValues[3]
            if (body.isEmpty()) return@forEach
            val text = when {
                attrs.contains("""t="s"""") ->
                    VALUE.find(body)?.groupValues?.get(1)?.toIntOrNull()
                        ?.let { shared.getOrNull(it) }.orEmpty()

                attrs.contains("""t="inlineStr"""") ->
                    INLINE.findAll(body).joinToString("") { unescape(it.groupValues[1]) }

                else -> VALUE.find(body)?.groupValues?.get(1)?.let(::unescape).orEmpty()
            }
            if (text.isNotEmpty()) out[column] = text
        }
        return out
    }

    /** "A" -> 0, "Z" -> 25, "AA" -> 26 */
    internal fun columnIndex(letters: String): Int {
        var n = 0
        letters.forEach { ch -> n = n * 26 + (ch - 'A' + 1) }
        return n - 1
    }

    /**
     * Akışı [open] ile [close] arasındaki bloklara böler.
     *
     * Tamponda yalnızca işlenmemiş kuyruk tutulur; 47 MB'lık sayfa bu yüzden
     * sabit bellekle okunabiliyor.
     */
    private fun scan(
        input: InputStream,
        open: String,
        close: String,
        onBlock: (String) -> Boolean,
    ) {
        val reader = input.bufferedReader()
        val buffer = StringBuilder()
        val chunk = CharArray(64 * 1024)

        while (true) {
            val read = reader.read(chunk)
            if (read < 0) break
            buffer.append(chunk, 0, read)

            while (true) {
                val start = buffer.indexOf(open)
                if (start < 0) break
                val end = buffer.indexOf(close, start)
                if (end < 0) break
                val block = buffer.substring(start, end + close.length)
                buffer.delete(0, end + close.length)
                if (!onBlock(block)) return
            }

            // Eşleşme yoksa tampon sonsuza kadar büyümesin: açılış etiketinden
            // önceki kısım bir daha lazım olmaz.
            val keep = buffer.indexOf(open)
            if (keep > 0) buffer.delete(0, keep)
        }
    }

    private fun unescape(raw: String): String = raw
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#10;", "\n")
        .replace("&amp;", "&")
}
