package com.satran.jobapply.data.model

import kotlinx.serialization.Serializable

/**
 * Yapay zekâ sağlayıcıları. Hepsi OpenAI uyumlu; Claude ayrı protokol kullanır.
 *
 * `fallbackModels` yalnızca sağlayıcının model listesi çekilemediğinde gösterilir.
 * Normalde Ayarlar'daki "Modelleri çek" düğmesi `GET /models` ile canlı listeyi
 * alır; sağlayıcı yeni model yayımladığında uygulamayı güncellemeye gerek kalmaz.
 */
enum class AiProvider(
    val label: String,
    val baseUrl: String,
    val defaultModel: String,
    val anthropicStyle: Boolean = false,
    val fallbackModels: List<String> = emptyList(),
) {
    DEEPSEEK(
        label = "DeepSeek",
        baseUrl = "https://api.deepseek.com/v1",
        defaultModel = "deepseek-v4-pro",
        fallbackModels = listOf(
            "deepseek-v4-pro",
            "deepseek-v4-flash",
            "deepseek-v4-flash-vision-exp",
            // Eski takma adlar; DeepSeek bunları kaldırıyor, yalnızca yedek olarak duruyor.
            "deepseek-chat",
            "deepseek-reasoner",
        ),
    ),
    CLAUDE(
        label = "Claude (Anthropic)",
        baseUrl = "https://api.anthropic.com/v1",
        defaultModel = "claude-sonnet-5",
        anthropicStyle = true,
        fallbackModels = listOf("claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5-20251001"),
    ),
    OPENAI(
        label = "OpenAI",
        baseUrl = "https://api.openai.com/v1",
        defaultModel = "gpt-4o-mini",
    ),
    OPENROUTER(
        label = "OpenRouter",
        baseUrl = "https://openrouter.ai/api/v1",
        defaultModel = "deepseek/deepseek-v4-pro",
    ),
    CUSTOM(label = "Özel (OpenAI uyumlu)", baseUrl = "", defaultModel = ""),
}

/**
 * İnternet arama sağlayıcıları.
 *
 * DeepSeek'in sohbet ucunda gömülü web araması yoktur: modelin internete
 * bakabilmesi için aramayı uygulama yapar, sonucu modele geri verir.
 * `signupUrl` anahtarın alınacağı adrestir; Ayarlar'dan tek dokunuşla açılır.
 */
enum class SearchProvider(
    val label: String,
    val needsKey: Boolean,
    val signupUrl: String,
    val hint: String,
) {
    TAVILY(
        label = "Tavily",
        needsKey = true,
        signupUrl = "https://app.tavily.com/home",
        hint = "Yapay zekâ için tasarlanmış arama. Ücretsiz katman: ayda 1000 arama. Anahtar 'tvly-' ile başlar.",
    ),
    SERPER(
        label = "Serper.dev (Google)",
        needsKey = true,
        signupUrl = "https://serper.dev/api-key",
        hint = "Gerçek Google sonuçları. Kayıt olunca 2500 ücretsiz arama verir.",
    ),
    BRAVE(
        label = "Brave Search",
        needsKey = true,
        signupUrl = "https://api-dashboard.search.brave.com/app/keys",
        hint = "Bağımsız dizin. Ücretsiz katman: ayda 2000 arama (kart doğrulaması ister).",
    ),
    DUCKDUCKGO(
        label = "DuckDuckGo (anahtarsız, sınırlı)",
        needsKey = false,
        signupUrl = "https://duckduckgo.com",
        hint = "Anahtar istemez ama yalnızca ansiklopedik özet döndürür; işveren araştırması için zayıftır.",
    ),
}

/**
 * Çeviri motoru.
 *
 * Varsayılan cihaz üstüdür: API anahtarı gerektirmez, ücretsizdir ve dil
 * modeli bir kez indikten sonra internetsiz çalışır. Yapay zekâ seçeneği
 * yalnızca özet + yorum isteyenler içindir ve anahtar ister.
 */
enum class TranslationEngine(val label: String, val needsAiKey: Boolean) {
    ON_DEVICE("Cihazda çevir (anahtarsız, ücretsiz)", false),
    AI_SUMMARY("Yapay zekâ ile özetle (anahtar ister)", true),
}

/** Gönderim yolu. */
enum class SendMode(val label: String) {
    SMTP("Doğrudan gönder (Gmail SMTP)"),
    INTENT("Gmail uygulamasında aç"),
}

@Serializable
data class AppSettings(
    // Gmail
    val gmailAddress: String = "",
    val gmailAppPassword: String = "",
    val senderName: String = "",
    val replyTo: String = "",
    val ccSelf: Boolean = true,
    val sendMode: SendMode = SendMode.SMTP,
    val sendDelaySeconds: Int = 8,

    // CV
    val cvUri: String = "",
    val cvFileName: String = "",

    // Başvuru profili
    val fullName: String = "",
    val phone: String = "",
    val nationality: String = "",
    val summary: String = "",
    val subjectTemplate: String = "Application for {{title}} – {{case}}",
    val bodyTemplate: String = DEFAULT_BODY_TEMPLATE,

    // Yapay zekâ
    val aiProvider: AiProvider = AiProvider.DEEPSEEK,
    val aiApiKey: String = "",
    val aiModel: String = "",
    val aiBaseUrl: String = "",
    val aiWriteLetters: Boolean = true,
    val letterLanguage: String = "İngilizce",
    /** Sağlayıcıdan çekilen canlı model listesi; Ayarlar'daki seçicide gösterilir. */
    val discoveredModels: List<String> = emptyList(),

    // Web arama
    val searchProvider: SearchProvider = SearchProvider.TAVILY,
    val searchApiKey: String = "",
    val researchBeforeSending: Boolean = false,
    /** İşveren başına kaç arama sonucu modele verilecek. */
    val searchResultsPerJob: Int = 5,

    // Arama davranışı
    /** Bir aramada kaç ilan çekilecek (API'den sayfa sayfa toplanır). */
    val jobsPerSearch: Int = 40,
    /** Metninde bu kelimeler geçen ilanlar elenir (virgülle ayrılır). */
    val blockedWords: String = "",
    /** Metninde bu kelimelerin hepsi geçen ilanlar kalır (virgülle ayrılır). */
    val requiredWords: String = "",
    /** Daha önce görülen ilanlar bir daha listelenmesin. */
    val hideSeenJobs: Boolean = true,
    /** Arşivin siteyle en son ne zaman karşılaştırıldığı (epoch ms). */
    val lastArchiveCheckAt: Long = 0L,
    /** Açılışta arşivi kendiliğinden denetle. */
    val autoRefreshArchive: Boolean = true,

    // Çeviri
    val translationEngine: TranslationEngine = TranslationEngine.ON_DEVICE,
    /** Açıkken listedeki bütün ilan başlıkları kendiliğinden Türkçeye çevrilir. */
    val translateAllJobs: Boolean = false,
    /** Dil modeli yalnızca Wi-Fi'dayken insin (~30 MB, tek seferlik). */
    val translationWifiOnly: Boolean = false,

    // Bellek / RAG
    /** Geçmiş ilanlar ve gönderilen mektuplar mektup yazarken bağlam olarak kullanılsın. */
    val useRagMemory: Boolean = true,
    /** Mektup yazarken kaç geçmiş parça bağlama eklenecek. */
    val ragContextSize: Int = 4,
) {
    val effectiveModel: String
        get() = aiModel.trim().ifEmpty { aiProvider.defaultModel }

    val effectiveBaseUrl: String
        get() = aiBaseUrl.trim().trimEnd('/').ifEmpty { aiProvider.baseUrl }

    val aiReady: Boolean
        get() = aiApiKey.isNotBlank() && effectiveBaseUrl.isNotBlank() && effectiveModel.isNotBlank()

    val smtpReady: Boolean
        get() = gmailAddress.isNotBlank() && gmailAppPassword.isNotBlank()

    val searchReady: Boolean
        get() = !searchProvider.needsKey || searchApiKey.isNotBlank()

    /** Model seçicide gösterilecek liste: canlı liste varsa o, yoksa yedek. */
    val modelChoices: List<String>
        get() = discoveredModels.ifEmpty { aiProvider.fallbackModels }

    val blockedWordList: List<String>
        get() = com.satran.jobapply.data.filter.JobQuery.parseWordList(blockedWords)

    val requiredWordList: List<String>
        get() = com.satran.jobapply.data.filter.JobQuery.parseWordList(requiredWords)


    companion object {
        /** ABD ilanlarında ağırlık en çok "lbs" olarak geçer; varyantların hepsi gerekir. */
        const val WEIGHT_WORDS = "lbs, lb, pounds, pound"
        const val LIFTING_WORDS = "lifting, lift, carry, heavy"
        const val NIGHT_SHIFT_WORDS = "night shift, overnight, graveyard"

        const val DEFAULT_BODY_TEMPLATE = """Dear Hiring Manager at {{employer}},

I am writing to apply for the position of {{title}} ({{case}}) in {{location}}.

I am highly motivated, reliable and available for the full contract period {{period}}. My CV is attached to this e-mail for your review.

I would be glad to provide any further documents you may need and I am ready for an interview at your convenience.

Kind regards,
{{name}}
{{phone}}
{{email}}"""
    }
}
