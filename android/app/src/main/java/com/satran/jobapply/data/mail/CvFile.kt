package com.satran.jobapply.data.mail

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.core.net.toUri
import java.io.IOException

/** Kullanıcının seçtiği PDF CV dosyası. */
data class CvFile(
    val fileName: String,
    val mimeType: String,
    val bytes: ByteArray,
) {
    override fun equals(other: Any?): Boolean =
        other is CvFile && other.fileName == fileName && other.bytes.contentEquals(bytes)

    override fun hashCode(): Int = 31 * fileName.hashCode() + bytes.contentHashCode()
}

object CvLoader {

    const val MAX_BYTES = 20 * 1024 * 1024

    /** Belge sağlayıcıdan CV'yi belleğe okur. Gönderim başına tek kez çağrılır. */
    fun load(context: Context, uriString: String): CvFile {
        require(uriString.isNotBlank()) { "Önce bir PDF CV seç." }
        val uri = uriString.toUri()
        val resolver = context.contentResolver

        val name = queryName(context, uri) ?: "cv.pdf"
        val mime = resolver.getType(uri) ?: "application/pdf"

        val bytes = try {
            resolver.openInputStream(uri)?.use { it.readBytes() }
        } catch (e: SecurityException) {
            throw IOException("CV dosyasına erişim izni kaybolmuş. Ayarlar'dan CV'yi yeniden seç.", e)
        } ?: throw IOException("CV dosyası okunamadı. Ayarlar'dan yeniden seç.")

        if (bytes.isEmpty()) throw IOException("CV dosyası boş görünüyor.")
        if (bytes.size > MAX_BYTES) {
            throw IOException("CV dosyası çok büyük (${bytes.size / (1024 * 1024)} MB). Gmail eki 20 MB'ı aşmamalı.")
        }
        return CvFile(fileName = name, mimeType = mime, bytes = bytes)
    }

    fun queryName(context: Context, uri: Uri): String? = runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
    }.getOrNull()
}
