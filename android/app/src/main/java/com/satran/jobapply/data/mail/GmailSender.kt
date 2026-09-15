package com.satran.jobapply.data.mail

import android.util.Log
import com.satran.jobapply.data.model.AppSettings
import java.util.Properties
import javax.activation.CommandMap
import javax.activation.DataHandler
import javax.activation.MailcapCommandMap
import javax.mail.Authenticator
import javax.mail.Message
import javax.mail.Part
import javax.mail.PasswordAuthentication
import javax.mail.Session
import javax.mail.Transport
import javax.mail.internet.InternetAddress
import javax.mail.internet.MimeBodyPart
import javax.mail.internet.MimeMessage
import javax.mail.internet.MimeMultipart
import javax.mail.util.ByteArrayDataSource

/**
 * Gmail SMTP üzerinden doğrudan gönderim.
 *
 * Gmail normal hesap şifresini kabul etmez: hesapta 2 adımlı doğrulama açık
 * olmalı ve https://myaccount.google.com/apppasswords adresinden 16 haneli bir
 * "uygulama şifresi" üretilmelidir.
 *
 * Toplu gönderimde bağlantı bir kez açılır ve tüm iletiler aynı oturumda
 * gönderilir; bu hem hızlıdır hem de Gmail'in oran sınırlarına takılmayı azaltır.
 */
class GmailSender(private val settings: AppSettings) : AutoCloseable {

    private var session: Session? = null
    private var transport: Transport? = null

    data class Outgoing(
        val to: String,
        val subject: String,
        val body: String,
        val attachment: CvFile?,
    )

    fun connect() {
        require(settings.smtpReady) {
            "Gmail adresi ve uygulama şifresi eksik. Ayarlar sekmesinden gir."
        }
        ensureMailcap()

        val props = Properties().apply {
            put("mail.transport.protocol", "smtp")
            put("mail.smtp.host", HOST)
            put("mail.smtp.port", PORT)
            put("mail.smtp.auth", "true")
            put("mail.smtp.starttls.enable", "true")
            put("mail.smtp.starttls.required", "true")
            put("mail.smtp.ssl.protocols", "TLSv1.2 TLSv1.3")
            put("mail.smtp.ssl.trust", HOST)
            put("mail.smtp.connectiontimeout", "25000")
            put("mail.smtp.timeout", "40000")
            put("mail.smtp.writetimeout", "60000")
            put("mail.mime.charset", "UTF-8")
        }

        val user = settings.gmailAddress.trim()
        val secret = settings.appPasswordClean()

        val auth = object : Authenticator() {
            override fun getPasswordAuthentication(): PasswordAuthentication =
                PasswordAuthentication(user, secret)
        }

        val newSession = Session.getInstance(props, auth)
        val newTransport = newSession.getTransport("smtp")
        try {
            newTransport.connect(HOST, user, secret)
        } catch (e: javax.mail.AuthenticationFailedException) {
            // Google reddin sebebini bildirmiyor; bütün nedenler aynı hatayla
            // dönüyor. Kullanıcı kendi kendine ayırt edebilsin diye elimizdeki
            // tek somut bilgiyi yazıyoruz: hangi adresle, kaç haneyle denendi.
            // En sık iki sebep, şifrenin başka bir hesapta üretilmiş olması ve
            // iptal edilmiş eski şifrenin alanda kalmış olması.
            throw IllegalStateException(
                buildString {
                    appendLine("Gmail girişi reddedildi.")
                    appendLine()
                    appendLine("Denenen adres: $user")
                    append("Girilen şifre: ${secret.length} hane")
                    if (secret.length != APP_PASSWORD_LENGTH) append(" — $APP_PASSWORD_LENGTH olmalı")
                    appendLine()
                    appendLine()
                    appendLine("Sırayla kontrol et:")
                    appendLine("1. Uygulama şifresini tam olarak $user hesabında mı ürettin?")
                    appendLine("2. Eski şifreyi iptal ettiysen buradaki artık geçersizdir; yenisini gir.")
                    appendLine("3. 2 adımlı doğrulama açık mı? Kapalıysa Google uygulama şifresi vermez.")
                    append("4. Normal hesap şifresi çalışmaz; 16 haneli uygulama şifresi gerekir.")
                },
                e,
            )
        }
        session = newSession
        transport = newTransport
    }

    fun send(outgoing: Outgoing) {
        val activeSession = session ?: error("Önce connect() çağrılmalı.")
        val activeTransport = transport ?: error("Önce connect() çağrılmalı.")

        val message = MimeMessage(activeSession).apply {
            val from = if (settings.senderName.isBlank()) {
                InternetAddress(settings.gmailAddress.trim())
            } else {
                InternetAddress(settings.gmailAddress.trim(), settings.senderName.trim(), "UTF-8")
            }
            setFrom(from)
            settings.replyTo.trim().takeIf { it.isNotEmpty() }?.let {
                replyTo = arrayOf(InternetAddress(it))
            }
            setRecipients(Message.RecipientType.TO, InternetAddress.parse(outgoing.to, false))
            if (settings.ccSelf) {
                setRecipients(Message.RecipientType.BCC, InternetAddress.parse(settings.gmailAddress.trim(), false))
            }
            setSubject(outgoing.subject, "UTF-8")
            sentDate = java.util.Date()

            val textPart = MimeBodyPart().apply { setText(outgoing.body, "UTF-8") }
            val multipart = MimeMultipart().apply { addBodyPart(textPart) }

            outgoing.attachment?.let { cv ->
                val attachmentPart = MimeBodyPart().apply {
                    dataHandler = DataHandler(ByteArrayDataSource(cv.bytes, cv.mimeType))
                    fileName = cv.fileName
                    disposition = Part.ATTACHMENT
                }
                multipart.addBodyPart(attachmentPart)
            }
            setContent(multipart)
        }

        message.saveChanges()
        activeTransport.sendMessage(message, message.allRecipients)
    }

    override fun close() {
        runCatching { transport?.close() }.onFailure { Log.w(TAG, "SMTP kapatılamadı", it) }
        transport = null
        session = null
    }

    private companion object {
        /** Google'ın uygulama şifresi uzunluğu. */
        const val APP_PASSWORD_LENGTH = 16
        const val TAG = "GmailSender"
        const val HOST = "smtp.gmail.com"
        const val PORT = "587"

        /**
         * JavaMail'in Android sürümü DataContentHandler kayıtlarını kendiliğinden
         * yüklemez; kaydedilmezse ek gönderirken "no object DCH for MIME type" hatası verir.
         */
        @Volatile
        private var mailcapReady = false

        @Synchronized
        fun ensureMailcap() {
            if (mailcapReady) return
            val map = CommandMap.getDefaultCommandMap() as? MailcapCommandMap ?: MailcapCommandMap()
            map.addMailcap("text/html;; x-java-content-handler=com.sun.mail.handlers.text_html")
            map.addMailcap("text/xml;; x-java-content-handler=com.sun.mail.handlers.text_xml")
            map.addMailcap("text/plain;; x-java-content-handler=com.sun.mail.handlers.text_plain")
            map.addMailcap("multipart/*;; x-java-content-handler=com.sun.mail.handlers.multipart_mixed")
            map.addMailcap("message/rfc822;; x-java-content-handler=com.sun.mail.handlers.message_rfc822")
            CommandMap.setDefaultCommandMap(map)
            mailcapReady = true
        }
    }
}
