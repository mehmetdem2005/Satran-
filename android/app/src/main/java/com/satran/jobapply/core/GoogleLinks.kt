package com.satran.jobapply.core

/**
 * Google hesap sayfalarına, **doğru hesapta açılacak** bağlantılar.
 *
 * Tarayıcıda birden fazla Google hesabı açıksa `myaccount.google.com/...`
 * adresi varsayılan hesabı (`/u/0`) açar. Kullanıcı 9. hesapta olsa bile
 * uygulama şifresini yanlış hesapta üretir, sonra giriş reddedilir ve
 * nedenini göremez — bu tam olarak yaşandı. `authuser` parametresi adrese
 * göre doğru hesabı seçtiriyor.
 */
object GoogleLinks {

    private const val APP_PASSWORDS = "https://myaccount.google.com/apppasswords"
    private const val TWO_STEP = "https://myaccount.google.com/signinoptions/twosv"

    fun appPasswords(gmailAddress: String): String = withAccount(APP_PASSWORDS, gmailAddress)

    fun twoStep(gmailAddress: String): String = withAccount(TWO_STEP, gmailAddress)

    private fun withAccount(url: String, gmailAddress: String): String {
        val account = gmailAddress.trim()
        if (account.isEmpty()) return url
        return "$url?authuser=${account.urlEncode()}"
    }

    private fun String.urlEncode(): String = java.net.URLEncoder.encode(this, "UTF-8")
}
