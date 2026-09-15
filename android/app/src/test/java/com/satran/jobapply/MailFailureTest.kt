package com.satran.jobapply

import com.satran.jobapply.send.FailureKind
import com.satran.jobapply.send.MailFailures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.net.SocketTimeoutException

/**
 * Ayrım başvuru kaybettirir ya da kurtarır: kuyruk başarısız iletiyi siliyordu,
 * yani ağ koptuğu an denk gelen ilana bir daha hiç yazılmıyordu.
 */
class MailFailureTest {

    private fun kind(message: String) = MailFailures.classify(Exception(message)).kind

    @Test
    fun `adresi olmayan ilan tekrar denenmez`() {
        listOf(
            "550 5.1.1 The email account that you tried to reach does not exist",
            "553 5.1.3 Invalid address",
            "Address not found",
            "user unknown",
        ).forEach {
            assertEquals("'$it' kalıcı olmalı", FailureKind.PERMANENT, kind(it))
        }
    }

    @Test
    fun `gunluk kota gonderimi durdurur`() {
        // Gmail kotayı 5xx ile bildiriyor ama ertesi gün geçiyor; kalıcı
        // sayılırsa o ilanlar bir daha hiç denenmez.
        listOf(
            "550-5.4.5 Daily user sending limit exceeded",
            "Daily sending quota exceeded",
        ).forEach {
            assertEquals("'$it' kota olmalı", FailureKind.THROTTLED, kind(it))
        }
    }

    @Test
    fun `hiz siniri gonderimi durdurur`() {
        assertEquals(FailureKind.THROTTLED, kind("421 4.7.0 Try again later"))
        assertEquals(FailureKind.THROTTLED, kind("454 4.7.0 Too many login attempts"))
    }

    @Test
    fun `ag hatasi gecicidir`() {
        assertEquals(FailureKind.TRANSIENT, MailFailures.classify(SocketTimeoutException("timed out")).kind)
        assertEquals(FailureKind.TRANSIENT, MailFailures.classify(IOException("Connection reset")).kind)
    }

    @Test
    fun `sarmalanmis hata da taninir`() {
        val wrapped = RuntimeException("gönderilemedi", IOException("connection reset by peer"))
        assertEquals(FailureKind.TRANSIENT, MailFailures.classify(wrapped).kind)
    }

    @Test
    fun `bilinmeyen hata kaybettirmemek icin gecici sayilir`() {
        // Şüphede kalınca tekrar denemek, başvuruyu sessizce düşürmekten iyi.
        assertEquals(FailureKind.TRANSIENT, MailFailures.classify(null).kind)
        assertEquals(FailureKind.TRANSIENT, kind("bambaşka bir şey"))
    }

    @Test
    fun `yalnizca kalici hatalar tekrar denenmez`() {
        assertFalse(MailFailures.classify(Exception("550 5.1.1 does not exist")).retryable)
        assertTrue(MailFailures.classify(Exception("421 try again later")).retryable)
        assertTrue(MailFailures.classify(IOException("timeout")).retryable)
    }

    @Test
    fun `sebep metni gruplanabilir olsun`() {
        // Ekranda sebep sebep sayılıyor; metin her seferinde aynı olmalı.
        assertEquals(
            MailFailures.classify(Exception("550 5.1.1 does not exist")).reason,
            MailFailures.classify(Exception("550 5.1.1 user unknown")).reason,
        )
    }
}
