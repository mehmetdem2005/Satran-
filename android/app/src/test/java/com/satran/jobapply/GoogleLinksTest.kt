package com.satran.jobapply

import com.satran.jobapply.core.GoogleLinks
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tarayıcıda birden çok Google hesabı açıkken bağlantı doğru hesaba gitmeli.
 * Gitmezse kullanıcı şifreyi yanlış hesapta üretir ve giriş reddedilir.
 */
class GoogleLinksTest {

    @Test
    fun `adres verilince hesap sabitlenir`() {
        assertEquals(
            "https://myaccount.google.com/apppasswords?authuser=kisi%40gmail.com",
            GoogleLinks.appPasswords("kisi@gmail.com"),
        )
    }

    @Test
    fun `iki adimli sayfasi da hesaba sabitlenir`() {
        assertTrue(GoogleLinks.twoStep("kisi@gmail.com").contains("authuser=kisi%40gmail.com"))
        assertTrue(GoogleLinks.twoStep("kisi@gmail.com").startsWith("https://myaccount.google.com/signinoptions/twosv"))
    }

    @Test
    fun `adres bossa duz baglanti acilir`() {
        assertEquals("https://myaccount.google.com/apppasswords", GoogleLinks.appPasswords(""))
        assertEquals("https://myaccount.google.com/apppasswords", GoogleLinks.appPasswords("   "))
    }

    @Test
    fun `bastaki sondaki bosluk temizlenir`() {
        assertEquals(
            GoogleLinks.appPasswords("kisi@gmail.com"),
            GoogleLinks.appPasswords("  kisi@gmail.com  "),
        )
    }
}
