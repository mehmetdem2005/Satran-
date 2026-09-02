package com.satran.jobapply.data.model

import kotlinx.serialization.Serializable

/** Yapay zekâ sağlayıcıları. Hepsi OpenAI uyumlu; Claude ayrı protokol kullanır. */
enum class AiProvider(
    val label: String,
    val baseUrl: String,
    val defaultModel: String,
    val anthropicStyle: Boolean = false,
) {
    DEEPSEEK("DeepSeek", "https://api.deepseek.com/v1", "deepseek-chat"),
    CLAUDE("Claude (Anthropic)", "https://api.anthropic.com/v1", "claude-sonnet-5", anthropicStyle = true),
    OPENAI("OpenAI", "https://api.openai.com/v1", "gpt-4o-mini"),
    OPENROUTER("OpenRouter", "https://openrouter.ai/api/v1", "deepseek/deepseek-chat"),
    CUSTOM("Özel (OpenAI uyumlu)", "", ""),
}

enum class SearchProvider(val label: String, val needsKey: Boolean) {
    TAVILY("Tavily", true),
    SERPER("Serper.dev (Google)", true),
    BRAVE("Brave Search", true),
    DUCKDUCKGO("DuckDuckGo (anahtarsız, sınırlı)", false),
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
    val aiTranslateToTurkish: Boolean = true,
    val aiFilterArchitectural: Boolean = true,
    val letterLanguage: String = "İngilizce",

    // Web arama
    val searchProvider: SearchProvider = SearchProvider.TAVILY,
    val searchApiKey: String = "",
    val researchBeforeSending: Boolean = false,
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

    companion object {
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
