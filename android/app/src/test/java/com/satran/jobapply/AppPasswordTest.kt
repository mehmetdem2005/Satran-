package com.satran.jobapply

import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.data.model.SendMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Google uygulama şifresini "abcd efgh ijkl mnop" diye boşluklu gösterir.
 * Kullanıcı ne yapıştırırsa yapıştırsın giriş çalışmalı; aksi hâlde
 * "şifre yanlış" hatası alır ve neyi yanlış yaptığını göremez.
 */
class AppPasswordTest {

    private fun settings(password: String) = AppSettings(
        gmailAddress = "kisi@gmail.com",
        gmailAppPassword = password,
    )

    @Test
    fun `bosluklu yapistirma temizlenir`() {
        assertEquals("abcdefghijklmnop", settings("abcd efgh ijkl mnop").appPasswordClean())
    }

    @Test
    fun `bastaki ve sondaki bosluklar atilir`() {
        assertEquals("abcdefghijklmnop", settings("  abcd efgh ijkl mnop  ").appPasswordClean())
    }

    @Test
    fun `satir sonu ve sekme atilir`() {
        assertEquals("abcdefghijklmnop", settings("abcd\tefgh\nijkl mnop").appPasswordClean())
    }

    @Test
    fun `kirilmaz bosluk atilir`() {
        // Bazı tarayıcılar kopyalarken normal boşluk yerine U+00A0 koyuyor.
        assertEquals("abcdefghijklmnop", settings("abcd efgh ijkl mnop").appPasswordClean())
    }

    @Test
    fun `yalnizca bosluk girilmisse hazir sayilmaz`() {
        assertFalse(settings("    ").smtpReady)
    }

    @Test
    fun `adres ve sifre varsa hazir`() {
        assertTrue(settings("abcd efgh ijkl mnop").smtpReady)
    }

    @Test
    fun `sifre yoksa hazir degil`() {
        assertFalse(settings("").smtpReady)
    }

    // ------------------------------------------- 2 adımlı doğrulaması olmayan

    @Test
    fun `sifresiz yolda gonderim hazir sayilir`() {
        // "Gmail'de aç" şifre istemez; 2 adımlı doğrulaması olmayan da
        // uygulamayı kullanabilmeli.
        val noPassword = AppSettings(sendMode = SendMode.INTENT)
        assertTrue(noPassword.sendReady)
        assertFalse(noPassword.smtpReady)
    }

    @Test
    fun `toplu gonderim yolunda sifre sart`() {
        val noPassword = AppSettings(gmailAddress = "kisi@gmail.com", sendMode = SendMode.SMTP)
        assertFalse(noPassword.sendReady)
    }

    @Test
    fun `sifre girilince toplu gonderim acilir`() {
        val ready = AppSettings(
            gmailAddress = "kisi@gmail.com",
            gmailAppPassword = "abcd efgh ijkl mnop",
            sendMode = SendMode.SMTP,
        )
        assertTrue(ready.sendReady)
        assertTrue(ready.smtpReady)
    }
}
