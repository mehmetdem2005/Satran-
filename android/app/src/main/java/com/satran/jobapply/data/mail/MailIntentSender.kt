package com.satran.jobapply.data.mail

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

/**
 * Gmail uygulamasında hazır doldurulmuş bir taslak açar.
 * SMTP kurmak istemeyen kullanıcı için yedek yol; göndermeye kullanıcı basar.
 */
object MailIntentSender {

    fun buildIntent(
        context: Context,
        to: String,
        subject: String,
        body: String,
        cv: CvFile?,
    ): Intent {
        val attachmentUri = cv?.let { cacheAttachment(context, it) }

        val intent = if (attachmentUri != null) {
            Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, attachmentUri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        } else {
            Intent(Intent.ACTION_SENDTO).apply {
                data = Uri.parse("mailto:")
            }
        }

        intent.putExtra(Intent.EXTRA_EMAIL, arrayOf(to))
        intent.putExtra(Intent.EXTRA_SUBJECT, subject)
        intent.putExtra(Intent.EXTRA_TEXT, body)
        return intent
    }

    /**
     * Taslağı açar: önce Gmail uygulaması denenir, kurulu değilse uygulama seçici gösterilir.
     */
    fun open(context: Context, intent: Intent) {
        val gmail = Intent(intent).setPackage(GMAIL_PACKAGE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(gmail)
        } catch (e: android.content.ActivityNotFoundException) {
            context.startActivity(
                Intent.createChooser(intent, "E-posta uygulaması seç")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
    }

    /** Ek dosyayı FileProvider ile paylaşılabilir hale getirir. */
    private fun cacheAttachment(context: Context, cv: CvFile): Uri? = runCatching {
        val dir = File(context.cacheDir, "cv").apply { mkdirs() }
        val safeName = cv.fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
        val file = File(dir, safeName)
        file.writeBytes(cv.bytes)
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    }.getOrNull()

    private const val GMAIL_PACKAGE = "com.google.android.gm"
}
