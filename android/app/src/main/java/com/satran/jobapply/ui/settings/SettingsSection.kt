package com.satran.jobapply.ui.settings

import com.satran.jobapply.data.mail.CvLoader
import com.satran.jobapply.data.model.AppSettings

/**
 * Ayarlar tek uzun kaydırma yerine kısa bir ana liste ve alt sayfalara ayrıldı.
 * Her satırın alt yazısı o bölümün **o anki durumunu** gösterir; kullanıcı
 * içine girmeden neyin kurulu olduğunu görebilir.
 */
enum class SettingsSection(val title: String) {
    GMAIL("Gmail ve gönderim"),
    PROFILE("CV ve profilim"),
    TEMPLATE("Mesaj şablonu"),
    TRANSLATION("Çeviri"),
    SEARCH("Arama ve süzgeçler"),
    AI("Yapay zekâ ve web araması"),
    DATA("Geçmiş ve veri kaynağı"),
    ;

    fun subtitle(settings: AppSettings, historyCount: Int, archiveSize: Int): String = when (this) {
        GMAIL -> when {
            settings.smtpReady -> "${settings.gmailAddress} · ${settings.sendMode.label}"
            // Şifresiz yol kuruluma gerek duymaz; "kurulmadı" demek yanlış olur.
            settings.sendReady -> settings.sendMode.label
            else -> "Kurulmadı — başvuru gönderemezsin"
        }

        // CV artık uygulamanın içinde geliyor; eksik olabilecek tek alan ad.
        PROFILE -> listOfNotNull(
            settings.fullName.takeIf { it.isNotBlank() } ?: "Ad soyad gerekli",
            settings.cvFileName.takeIf { it.isNotBlank() } ?: CvLoader.BUILT_IN_NAME,
        ).joinToString(" · ")

        TEMPLATE -> "Konu ve mesaj metni"

        TRANSLATION -> if (settings.translateAllJobs) {
            "Açık — tüm liste Türkçe"
        } else {
            "Kapalı — kart kart çevirebilirsin"
        }

        SEARCH -> buildList {
            add("${settings.jobsPerSearch} ilan")
            settings.blockedWordList.size.takeIf { it > 0 }?.let { add("$it yasaklı kelime") }
            settings.requiredWordList.size.takeIf { it > 0 }?.let { add("$it zorunlu kelime") }
        }.joinToString(" · ")

        AI -> if (settings.aiReady) {
            "${settings.aiProvider.label} · ${settings.effectiveModel}"
        } else {
            "Kapalı — isteğe bağlı, çeviri bundan bağımsız"
        }

        DATA -> "$historyCount gönderim kaydı · $archiveSize arşivlenmiş ilan"
    }
}
