package com.satran.jobapply.data.mail

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

/**
 * Gmail'i hazır doldurulmuş taslakla açar: alıcı, konu, mesaj ve **ekli PDF**
 * yerinde gelir; kullanıcıya yalnızca Gönder'e basmak kalır.
 *
 * Ekin görünmesi için üç şeyin birden doğru olması gerekir:
 *  1. Dosya FileProvider ile paylaşılabilir bir `content://` adresine dönmeli,
 *  2. Adres hem `EXTRA_STREAM` hem `ClipData` içinde bulunmalı
 *     (sistem okuma iznini ClipData üzerinden taşır),
 *  3. Gmail'e okuma izni açıkça verilmeli — paket adını bildiğimiz için
 *     `grantUriPermission` ile veriyoruz.
 */
object MailIntentSender {

    const val GMAIL_PACKAGE = "com.google.android.gm"

    /** Taslağın hangi uygulamada açıldığı. */
    enum class Opened(val label: String) {
        GMAIL("Gmail"),
        CHOOSER("e-posta uygulaması"),
    }

    fun isGmailInstalled(context: Context): Boolean = runCatching {
        context.packageManager.getPackageInfo(GMAIL_PACKAGE, 0)
        true
    }.getOrElse { false }

    /**
     * Taslağı açar. Gmail kuruluysa doğrudan ona gider, değilse uygulama seçici çıkar.
     * @throws ActivityNotFoundException hiçbir e-posta uygulaması yoksa.
     */
    fun open(
        context: Context,
        to: String,
        subject: String,
        body: String,
        cv: CvFile?,
        bccSelf: String? = null,
    ): Opened {
        val attachment = cv?.let { cacheAttachment(context, it) }
        val intent = buildIntent(context, to, subject, body, cv, attachment, bccSelf)

        if (isGmailInstalled(context)) {
            attachment?.let {
                context.grantUriPermission(GMAIL_PACKAGE, it, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val gmail = Intent(intent).setPackage(GMAIL_PACKAGE)
            try {
                context.startActivity(gmail)
                return Opened.GMAIL
            } catch (e: ActivityNotFoundException) {
                // Gmail kurulu ama bu niyeti karşılamıyor; seçiciye düşülür.
            }
        }

        // Seçicide izin, ClipData üzerinden seçilen uygulamaya sistemce aktarılır.
        context.startActivity(
            Intent.createChooser(intent, "E-posta uygulaması seç")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        return Opened.CHOOSER
    }

    private fun buildIntent(
        context: Context,
        to: String,
        subject: String,
        body: String,
        cv: CvFile?,
        attachment: Uri?,
        bccSelf: String?,
    ): Intent {
        val intent = if (attachment != null) {
            Intent(Intent.ACTION_SEND).apply {
                type = cv?.mimeType ?: "application/pdf"
                putExtra(Intent.EXTRA_STREAM, attachment)
                // ClipData olmadan bazı sürümlerde ek "izin yok" diye düşüyor.
                clipData = ClipData.newUri(context.contentResolver, cv?.fileName ?: "CV", attachment)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        } else {
            // Ek yoksa mailto: yalnızca e-posta uygulamalarını hedefler.
            Intent(Intent.ACTION_SENDTO).apply { data = Uri.parse("mailto:") }
        }

        return intent.apply {
            putExtra(Intent.EXTRA_EMAIL, arrayOf(to))
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, body)
            bccSelf?.takeIf { it.isNotBlank() }?.let { putExtra(Intent.EXTRA_BCC, arrayOf(it)) }
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    /**
     * CV'yi paylaşılabilir bir adrese çevirir.
     * Aynı dosya için tekrar tekrar yazmaz; boyut aynıysa var olanı kullanır.
     */
    private fun cacheAttachment(context: Context, cv: CvFile): Uri? = runCatching {
        val dir = File(context.cacheDir, "cv").apply { mkdirs() }
        val safeName = cv.fileName
            .replace(Regex("[^A-Za-z0-9._-]"), "_")
            .ifBlank { "cv.pdf" }
            .let { if (it.endsWith(".pdf", ignoreCase = true)) it else "$it.pdf" }

        val file = File(dir, safeName)
        if (!file.exists() || file.length() != cv.bytes.size.toLong()) {
            file.writeBytes(cv.bytes)
        }
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    }.getOrNull()
}
