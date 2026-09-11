package com.satran.jobapply.data.prefs

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.satran.jobapply.core.Net
import com.satran.jobapply.data.model.AppSettings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Ayarları cihazda şifreli olarak saklar. Gmail uygulama şifresi ve API
 * anahtarları buradadır; hiçbiri cihaz dışına çıkmaz.
 */
class SettingsStore(context: Context) {

    private val prefs: SharedPreferences = createPrefs(context.applicationContext)

    private val _settings = MutableStateFlow(load())
    val settings: StateFlow<AppSettings> = _settings.asStateFlow()

    fun update(transform: (AppSettings) -> AppSettings) {
        val next = transform(_settings.value)
        _settings.value = next
        prefs.edit().putString(KEY_SETTINGS, Net.json.encodeToString(AppSettings.serializer(), next)).apply()
    }

    private fun load(): AppSettings {
        val raw = prefs.getString(KEY_SETTINGS, null) ?: return AppSettings(translateDefaultApplied = true)
        val stored = runCatching { Net.json.decodeFromString(AppSettings.serializer(), raw) }
            .getOrElse { return AppSettings(translateDefaultApplied = true) }
        return migrate(stored)
    }

    /**
     * Kayıtlı ayarlara sonradan gelen varsayılanları uygular.
     *
     * Başlık çevirisi artık varsayılan açık; ama kayıtlı ayar eski varsayılanı
     * (kapalı) taşıdığı için mevcut kurulumlarda kendiliğinden açılmazdı.
     */
    private fun migrate(stored: AppSettings): AppSettings {
        var migrated = stored

        if (!migrated.translateDefaultApplied) {
            migrated = migrated.copy(translateAllJobs = true, translateDefaultApplied = true)
        }

        // İlk sürümün mektubu kalıplaşmış cümlelerle doluydu. Kullanıcı
        // şablonuna dokunmadıysa sadeleştirilmiş metinle değiştirilir;
        // kendi yazdıysa elleme.
        if (migrated.bodyTemplate.trim() == AppSettings.LEGACY_BODY_TEMPLATE.trim()) {
            migrated = migrated.copy(bodyTemplate = AppSettings.DEFAULT_BODY_TEMPLATE)
        }

        if (migrated == stored) return stored
        prefs.edit().putString(KEY_SETTINGS, Net.json.encodeToString(AppSettings.serializer(), migrated)).apply()
        return migrated
    }

    private fun createPrefs(context: Context): SharedPreferences = runCatching {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "satran_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        ) as SharedPreferences
    }.getOrElse { error ->
        // Keystore'un bozuk olduğu nadir cihazlarda uygulamayı çökertmek yerine
        // düz depoya düşüyoruz; kullanıcı yine de çalışmaya devam edebilsin.
        Log.w("SettingsStore", "Şifreli depo açılamadı, düz depoya geçiliyor", error)
        context.getSharedPreferences("satran_prefs", Context.MODE_PRIVATE)
    }

    private companion object {
        const val KEY_SETTINGS = "settings_json"
    }
}
