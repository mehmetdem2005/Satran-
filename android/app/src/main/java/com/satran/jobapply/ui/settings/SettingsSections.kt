package com.satran.jobapply.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.satran.jobapply.data.filter.JobQuery
import com.satran.jobapply.core.GoogleLinks
import com.satran.jobapply.data.mail.CvLoader
import com.satran.jobapply.data.mail.MailTemplate
import com.satran.jobapply.data.memory.SearchEntry
import com.satran.jobapply.data.model.AiProvider
import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.ui.SmtpTestResult
import com.satran.jobapply.data.model.SearchProvider
import com.satran.jobapply.data.model.SendMode
import com.satran.jobapply.data.model.SendRecord
import com.satran.jobapply.data.model.SendStatus
import com.satran.jobapply.data.model.failureReasons
import com.satran.jobapply.data.model.summarize
import com.satran.jobapply.data.model.TranslationEngine
import com.satran.jobapply.data.remote.SeasonalJobsApi
import com.satran.jobapply.ui.common.LabeledField
import com.satran.jobapply.ui.common.SectionTitle
import com.satran.jobapply.ui.common.SwitchRow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private typealias Update = ((AppSettings) -> AppSettings) -> Unit

// ==================================================================== Gmail

fun LazyListScope.gmailSection(
    settings: AppSettings,
    testing: Boolean,
    smtpResult: SmtpTestResult?,
    onUpdate: Update,
    onTestSmtp: () -> Unit,
    onOpenUrl: (String) -> Unit,
) {
    item {
        Hint(
            "Gmail normal hesap şifreni kabul etmez. 2 adımlı doğrulamayı aç, sonra " +
                "16 haneli bir uygulama şifresi üret ve buraya gir.",
        )
    }
    item {
        LabeledField(
            label = "Gmail adresin",
            value = settings.gmailAddress,
            onValueChange = { v -> onUpdate { it.copy(gmailAddress = v.trim()) } },
            keyboardType = KeyboardType.Email,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    item {
        LabeledField(
            label = "Uygulama şifresi (16 hane)",
            value = settings.gmailAppPassword,
            onValueChange = { v -> onUpdate { it.copy(gmailAppPassword = v) } },
            password = true,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    item {
        // Şifre gizli yazıldığı için eksik/fazla hane görünmüyordu; kullanıcı
        // "şifre yanlış" hatasını alıp nerede yanlış yaptığını bulamıyordu.
        val digits = settings.appPasswordClean().length
        if (digits > 0 && digits != 16) {
            Text(
                "$digits hane girildi, 16 olmalı. Google boşluklu gösterir; " +
                    "boşlukları kendim siliyorum, sen olduğu gibi yapıştırabilirsin.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.error,
            )
        } else if (digits == 16) {
            Text(
                "16 hane tamam ✓ Şimdi \"Bağlantıyı test et\"e bas.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
    item {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { onOpenUrl(GoogleLinks.appPasswords(settings.gmailAddress)) }) {
                Text("Şifre al")
            }
            OutlinedButton(onClick = { onOpenUrl(GoogleLinks.twoStep(settings.gmailAddress)) }) {
                Text("2 adımlı")
            }
            Button(onClick = onTestSmtp, enabled = !testing && settings.smtpReady) {
                Text(if (testing) "Deneniyor…" else "Bağlantıyı test et")
            }
        }
    }
    item {
        // Reddin sebebini anlatan satırlar snackbar'da kesiliyordu; burada
        // tamamı duruyor ve kullanıcı okuyarak sırayla eleyebiliyor.
        smtpResult?.let { result ->
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = if (result.ok) {
                        MaterialTheme.colorScheme.secondaryContainer
                    } else {
                        MaterialTheme.colorScheme.errorContainer
                    },
                ),
            ) {
                Text(
                    result.text,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(12.dp),
                )
            }
        }
    }

    item { SectionTitle("Gönderim") }
    item {
        EnumPicker(
            label = "Gönderim yolu",
            current = settings.sendMode.label,
            options = SendMode.entries.map { it.label to it },
            onSelect = { mode -> onUpdate { it.copy(sendMode = mode) } },
        )
    }
    item {
        Hint(
            when (settings.sendMode) {
                SendMode.SMTP -> "Uygulama hepsini arka planda yollar; tek dokunuş yeter."
                SendMode.INTENT ->
                    "Her ilan Gmail'de hazır açılır (mesaj yazılı, PDF ekli); " +
                        "Gönder'e sen basarsın. Şifre gerekmez."
            },
        )
    }
    item {
        LabeledField(
            label = "Gönderen adı (isteğe bağlı)",
            value = settings.senderName,
            onValueChange = { v -> onUpdate { it.copy(senderName = v) } },
            modifier = Modifier.fillMaxWidth(),
        )
    }
    item {
        SwitchRow(
            title = "Bir kopyasını bana da gönder",
            subtitle = "Her başvurunun gizli kopyası kendi kutuna düşer",
            checked = settings.ccSelf,
            onCheckedChange = { v -> onUpdate { it.copy(ccSelf = v) } },
        )
    }
    if (settings.sendMode == SendMode.SMTP) {
        item {
            NumberChoiceRow(
                label = "İletiler arası bekleme (saniye)",
                value = settings.sendDelaySeconds,
                options = listOf(0, 5, 8, 15, 30),
                onSelect = { n -> onUpdate { it.copy(sendDelaySeconds = n) } },
            )
        }
        item { Hint("Gmail günde ~500 ileti sınırı koyar. 5-10 saniye güvenlidir.") }
    }
}

// ==================================================================== profil

fun LazyListScope.profileSection(settings: AppSettings, onUpdate: Update, onPickCv: () -> Unit) {
    item {
        val usingBuiltIn = settings.cvUri.isBlank()
        Card {
            Column(Modifier.padding(12.dp)) {
                Text("Her mektuba eklenen CV", style = MaterialTheme.typography.labelMedium)
                Spacer(Modifier.height(4.dp))
                Text(
                    if (usingBuiltIn) CvLoader.BUILT_IN_NAME else settings.cvFileName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    if (usingBuiltIn) {
                        "Uygulamanın içinde geliyor — telefonda dosya olmasa da gider."
                    } else {
                        "Telefonundan seçtiğin dosya. Okunamazsa yerleşik CV gider."
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.outline,
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = onPickCv) { Text("Başka PDF seç") }
                    if (!usingBuiltIn) {
                        TextButton(onClick = { onUpdate { it.copy(cvUri = "", cvFileName = "") } }) {
                            Text("Yerleşiğe dön")
                        }
                    }
                }
            }
        }
    }
    item {
        LabeledField(
            label = "Ad soyad",
            value = settings.fullName,
            onValueChange = { v -> onUpdate { it.copy(fullName = v) } },
            modifier = Modifier.fillMaxWidth(),
        )
    }
    item {
        LabeledField(
            label = "Telefon",
            value = settings.phone,
            onValueChange = { v -> onUpdate { it.copy(phone = v) } },
            keyboardType = KeyboardType.Phone,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    item {
        LabeledField(
            label = "Uyruk",
            value = settings.nationality,
            onValueChange = { v -> onUpdate { it.copy(nationality = v) } },
            modifier = Modifier.fillMaxWidth(),
        )
    }
    item {
        LabeledField(
            label = "Kendini kısaca anlat",
            value = settings.summary,
            onValueChange = { v -> onUpdate { it.copy(summary = v) } },
            hint = "Deneyimin, dil bilgin, ne zaman müsait olduğun.",
            singleLine = false,
            minLines = 3,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

// ==================================================================== şablon

fun LazyListScope.templateSection(settings: AppSettings, onUpdate: Update) {
    item {
        Hint(
            "Tek mektup yazıyorsun, binlerce ilana gidiyor. {{...}} yazan yerler " +
                "gönderilirken her ilanın kendi bilgisiyle değişir — yani her " +
                "işverene kendi işinin adını yazmış olursun. Aşağıdaki " +
                "önizlemede ne olduklarını görebilirsin.",
        )
    }
    item {
        LabeledField(
            label = "Konu",
            value = settings.subjectTemplate,
            onValueChange = { v -> onUpdate { it.copy(subjectTemplate = v) } },
            modifier = Modifier.fillMaxWidth(),
        )
    }
    item {
        LabeledField(
            label = "Mesaj gövdesi",
            value = settings.bodyTemplate,
            onValueChange = { v -> onUpdate { it.copy(bodyTemplate = v) } },
            singleLine = false,
            minLines = 8,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    item { TemplatePreview(settings) }
    item {
        Column {
            Text(
                "Ekle — dokununca gövdenin sonuna gelir",
                style = MaterialTheme.typography.labelMedium,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                // Çip üstünde Türkçe adı yazıyor; metne giren şey yer tutucu.
                // Ham "{{title}}" yazan çip kullanıcıya kod artığı gibi geliyordu.
                MailTemplate.PLACEHOLDERS.forEach { (token, label) ->
                    AssistChip(
                        onClick = { onUpdate { it.copy(bodyTemplate = it.bodyTemplate + token) } },
                        label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                    )
                }
            }
        }
    }
    item {
        TextButton(onClick = { onUpdate { it.copy(bodyTemplate = AppSettings.DEFAULT_BODY_TEMPLATE) } }) {
            Text("Şablonu sıfırla")
        }
    }
}

/**
 * Şablonun örnek bir ilanla doldurulmuş hâli.
 *
 * Yer tutucuların ne işe yaradığını anlatmanın en kısa yolu göstermek;
 * ayrıca kendi adını/telefonunu girmediysen eksik kaldığı da burada belli olur.
 */
@Composable
private fun TemplatePreview(settings: AppSettings) {
    val job = MailTemplate.SAMPLE_JOB
    val subject = MailTemplate.render(settings.subjectTemplate, job, settings)
    val body = MailTemplate.render(settings.bodyTemplate, job, settings)

    Card {
        Column(Modifier.padding(12.dp)) {
            Text(
                "Örnek ilanla önizleme",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                "${job.title} · ${job.location}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.outline,
            )
            Spacer(Modifier.height(8.dp))
            Text("Konu", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
            Text(subject, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            Text("Gövde", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
            Text(body, style = MaterialTheme.typography.bodySmall)

            if (settings.fullName.isBlank() || settings.phone.isBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Adın ya da telefonun boş görünüyor — Profil bölümünden doldur, " +
                        "yoksa mektupta da boş gider.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

// ==================================================================== çeviri

fun LazyListScope.translationSection(
    settings: AppSettings,
    onUpdate: Update,
    onToggleTranslateAll: (Boolean) -> Unit,
) {
    item {
        Hint(
            "Çeviri için API anahtarı gerekmez. Google'ın cihaz üstü çeviri modeli " +
                "kullanılır; ilk seferde bir kez iner (~30 MB) ve sonrasında internetsiz " +
                "de çalışır.",
        )
    }
    item {
        SwitchRow(
            title = "Tüm listeyi Türkçeye çevir",
            subtitle = "İlanlar sekmesindeki \"Türkçe\" anahtarıyla aynı",
            checked = settings.translateAllJobs,
            // Doğrudan ayarı yazmak yetmez: liste durumunu da kuran ve
            // çeviriyi başlatan tek yer setTranslateAll'dır.
            onCheckedChange = onToggleTranslateAll,
        )
    }
    item {
        SwitchRow(
            title = "Dil modelini yalnızca Wi-Fi'da indir",
            subtitle = "Kapalıysa mobil veriyle de iner",
            checked = settings.translationWifiOnly,
            onCheckedChange = { v -> onUpdate { it.copy(translationWifiOnly = v) } },
        )
    }
    item {
        EnumPicker(
            label = "Motor",
            current = settings.translationEngine.label,
            options = TranslationEngine.entries.map { it.label to it },
            onSelect = { engine -> onUpdate { it.copy(translationEngine = engine) } },
        )
    }
    item {
        Hint(
            "Yapay zekâ seçeneği düz çeviri yerine maddelenmiş özet verir ve " +
                "anahtar ister. Seçmezsen hiç devreye girmez.",
        )
    }
}

// ==================================================================== arama

fun LazyListScope.searchSection(
    settings: AppSettings,
    onUpdate: Update,
    onBackgroundWatch: (Boolean) -> Unit,
) {
    item {
        NumberChoiceRow(
            label = "Bir aramada kaç ilan çekilsin",
            value = settings.jobsPerSearch,
            options = listOf(20, 40, 60, 100, 200),
            onSelect = { n -> onUpdate { it.copy(jobsPerSearch = n) } },
        )
    }
    item {
        SwitchRow(
            title = "Aynı ilanı bir daha gösterme",
            subtitle = "Görülenler Geçmiş sekmesinde durur",
            checked = settings.hideSeenJobs,
            onCheckedChange = { v -> onUpdate { it.copy(hideSeenJobs = v) } },
        )
    }
    item { SectionTitle("Canlı liste") }
    item {
        LabelledChoiceRow(
            label = "Listeyi kaç saniyede bir denetlesin",
            value = settings.liveRefreshSeconds,
            options = listOf(0 to "Kapalı", 30 to "30 sn", 60 to "1 dk", 120 to "2 dk", 300 to "5 dk"),
            onSelect = { n -> onUpdate { it.copy(liveRefreshSeconds = n) } },
        )
    }
    item {
        Hint(
            "Kalkan, sezonu biten ve geri çekilen ilanlar listeden kendiliğinden " +
                "düşer; yeni gelenler \"↑ yeni ilan\" olarak belirir.",
        )
    }
    item {
        SwitchRow(
            title = "Uygulama kapalıyken de izle",
            subtitle = "Kalıcı bildirimle, aynı sıklıkta",
            checked = settings.backgroundWatch,
            onCheckedChange = onBackgroundWatch,
        )
    }
    item {
        Hint(
            "Android'de zamanlanmış işler en sık 15 dakikada bir çalışabilir; " +
                "dakikalık denetimin tek yolu ön plan servisidir ve o da kalıcı " +
                "bir bildirim ister — bildirim Android'in şartı, kaldıramıyorum. " +
                "Yeni ilan çıkınca bildirim düşer, uygulamayı açınca listenin " +
                "başında bekler. Pil: saatte kabaca 60 küçük istek. Telefon " +
                "ayarlarından uygulamayı \"pil optimizasyonundan\" muaf tutmazsan " +
                "bazı markalar (Xiaomi, Huawei, Samsung) servisi yine de uyutabilir.",
        )
    }


    item { SectionTitle("Kelime süzgeci") }
    item {
        Hint(
            "İlanın başlığında, görev tanımında ve özel şartlarında arar — sonuçlar " +
                "geldikten sonra değil, sunucuda. Virgülle ayır.",
        )
    }
    item {
        LabeledField(
            label = "Yasaklı kelimeler",
            value = settings.blockedWords,
            onValueChange = { v -> onUpdate { it.copy(blockedWords = v) } },
            hint = "Geçen ilan elenir. Örn: lbs, lb, pounds",
            singleLine = false,
            minLines = 2,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    item {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            AssistChip(
                onClick = { onUpdate { it.copy(blockedWords = AppSettings.WEIGHT_WORDS) } },
                label = { Text("Ağırlık") },
            )
            AssistChip(
                onClick = { onUpdate { it.copy(blockedWords = AppSettings.LIFTING_WORDS) } },
                label = { Text("Kaldırma") },
            )
            AssistChip(
                onClick = { onUpdate { it.copy(blockedWords = AppSettings.NIGHT_SHIFT_WORDS) } },
                label = { Text("Gece vardiyası") },
            )
            AssistChip(
                onClick = { onUpdate { it.copy(blockedWords = "") } },
                label = { Text("Temizle") },
            )
        }
    }
    item {
        LabeledField(
            label = "Zorunlu kelimeler",
            value = settings.requiredWords,
            onValueChange = { v -> onUpdate { it.copy(requiredWords = v) } },
            hint = "Hepsi geçmeli. Örn: housing, transportation",
            singleLine = false,
            minLines = 2,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    item {
        val built = JobQuery.build(
            JobQuery.Input(
                excludeAgricultural = true,
                blockedWords = settings.blockedWordList,
                requiredWords = settings.requiredWordList,
            ),
        )
        Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = MaterialTheme.shapes.small) {
            Column(Modifier.padding(10.dp)) {
                Text("Sunucuya gidecek sorgu", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                Text("search: ${built.search}", style = MaterialTheme.typography.bodySmall)
                Text("filter: ${built.filter}", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

// ==================================================================== yapay zekâ

fun LazyListScope.aiSection(
    settings: AppSettings,
    testing: Boolean,
    loadingModels: Boolean,
    onUpdate: Update,
    onTestAi: () -> Unit,
    onTestSearch: () -> Unit,
    onLoadModels: () -> Unit,
    onOpenUrl: (String) -> Unit,
) {
    item {
        Hint(
            "Bu bölüm tamamen isteğe bağlı. Kapalıyken ilanlar, çeviri ve gönderim " +
                "aynen çalışır; yalnızca ilana özel mektup yazma ve işveren araştırması devre dışı kalır.",
        )
    }
    item {
        EnumPicker(
            label = "Sağlayıcı",
            current = settings.aiProvider.label,
            options = AiProvider.entries.map { it.label to it },
            onSelect = { provider -> onUpdate { it.copy(aiProvider = provider, aiModel = "", aiBaseUrl = "") } },
        )
    }
    item {
        LabeledField(
            label = "API anahtarı",
            value = settings.aiApiKey,
            onValueChange = { v -> onUpdate { it.copy(aiApiKey = v.trim()) } },
            password = true,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    item {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onLoadModels, enabled = !loadingModels && settings.aiApiKey.isNotBlank()) {
                Text(if (loadingModels) "Çekiliyor…" else "Modelleri çek")
            }
            Button(onClick = onTestAi, enabled = !testing && settings.aiReady) {
                Text(if (testing) "Deneniyor…" else "Test et")
            }
        }
    }
    if (settings.modelChoices.isNotEmpty()) {
        item {
            EnumPicker(
                label = "Model",
                current = settings.effectiveModel,
                options = settings.modelChoices.map { it to it },
                onSelect = { model -> onUpdate { it.copy(aiModel = model) } },
            )
        }
    }
    if (settings.aiProvider == AiProvider.CUSTOM) {
        item {
            LabeledField(
                label = "Sunucu adresi",
                value = settings.aiBaseUrl,
                onValueChange = { v -> onUpdate { it.copy(aiBaseUrl = v.trim()) } },
                hint = "Örn. https://api.deepseek.com/v1",
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
    item {
        SwitchRow(
            title = "Her ilana özel mektup yaz",
            subtitle = "Kapalıysa şablon aynen kullanılır",
            checked = settings.aiWriteLetters,
            onCheckedChange = { v -> onUpdate { it.copy(aiWriteLetters = v) } },
        )
    }
    item {
        LabeledField(
            label = "Mektup dili",
            value = settings.letterLanguage,
            onValueChange = { v -> onUpdate { it.copy(letterLanguage = v) } },
            modifier = Modifier.fillMaxWidth(),
        )
    }

    item { SectionTitle("İşveren araştırması") }
    item {
        Hint(
            "Modelin kendi web araması yoktur: aranacak sorguyu o yazar, aramayı " +
                "buradaki servis yapar, sonucu yine model okur.",
        )
    }
    item {
        SwitchRow(
            title = "Göndermeden önce işvereni araştır",
            subtitle = "Yavaşlatır ama mektubu güçlendirir",
            checked = settings.researchBeforeSending,
            onCheckedChange = { v -> onUpdate { it.copy(researchBeforeSending = v) } },
        )
    }
    if (settings.researchBeforeSending) {
        item {
            EnumPicker(
                label = "Arama sağlayıcısı",
                current = settings.searchProvider.label,
                options = SearchProvider.entries.map { it.label to it },
                onSelect = { provider -> onUpdate { it.copy(searchProvider = provider) } },
            )
        }
        item { Hint(settings.searchProvider.hint) }
        if (settings.searchProvider.needsKey) {
            item {
                LabeledField(
                    label = "Arama API anahtarı",
                    value = settings.searchApiKey,
                    onValueChange = { v -> onUpdate { it.copy(searchApiKey = v.trim()) } },
                    password = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { onOpenUrl(settings.searchProvider.signupUrl) }) {
                    Text("Anahtar al")
                }
                Button(onClick = onTestSearch, enabled = !testing && settings.searchReady) {
                    Text(if (testing) "Deneniyor…" else "Test et")
                }
            }
        }
        item {
            NumberChoiceRow(
                label = "İşveren başına sonuç",
                value = settings.searchResultsPerJob,
                options = listOf(3, 5, 8, 10),
                onSelect = { n -> onUpdate { it.copy(searchResultsPerJob = n) } },
            )
        }
    }

    item { SectionTitle("Bellek") }
    item {
        SwitchRow(
            title = "Geçmiş başvuruları bağlam olarak kullan",
            subtitle = "Yazdığın mektuplar yeni mektuba örnek olur",
            checked = settings.useRagMemory,
            onCheckedChange = { v -> onUpdate { it.copy(useRagMemory = v) } },
        )
    }
    if (settings.useRagMemory) {
        item {
            NumberChoiceRow(
                label = "Kaç geçmiş parça eklensin",
                value = settings.ragContextSize,
                options = listOf(2, 4, 6, 8),
                onSelect = { n -> onUpdate { it.copy(ragContextSize = n) } },
            )
        }
    }
}

// ==================================================================== veri

fun LazyListScope.dataSection(
    settings: AppSettings,
    history: List<SendRecord>,
    searchHistory: List<SearchEntry>,
    memorySize: Int,
    archiveSize: Int,
    verifying: Boolean,
    sourceProof: SeasonalJobsApi.SourceProof?,
    funnel: SeasonalJobsApi.FilterFunnel?,
    onVerifySource: () -> Unit,
    onCompareWithSite: () -> Unit,
    onClearHistory: () -> Unit,
    onClearArchive: () -> Unit,
    onClearSearchHistory: () -> Unit,
    onClearMemory: () -> Unit,
    onOpenUrl: (String) -> Unit,
) {
    item { SectionTitle("Veri kaynağı") }
    item {
        Hint(
            "İlanlar seasonaljobs.dol.gov'dan canlı çekilir ve API anahtarı gerektirmez. " +
                "Uygulamada gömülü ilan yoktur; uçak modunda liste boş kalır.",
        )
    }
    item {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onVerifySource, enabled = !verifying) {
                Text(if (verifying) "Sorgulanıyor…" else "Kaynağı doğrula")
            }
            Button(onClick = onCompareWithSite, enabled = !verifying) {
                Text("Site ile karşılaştır")
            }
            OutlinedButton(onClick = { onOpenUrl("https://seasonaljobs.dol.gov/jobs") }) {
                Text("Siteyi aç")
            }
        }
    }
    funnel?.let { f ->
        item {
            // "Sitede 5455 yazıyor, burada 2750" sorusunun cevabı: her
            // süzgecin kaç ilan elediği canlı sayımla gösteriliyor.
            Card {
                Column(Modifier.padding(12.dp)) {
                    Text("Sayılar neden farklı", fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(6.dp))
                    ProofLine("Sitenin saydığı (tüm programlar)", f.siteTotal.toString())
                    ProofLine("— tarım (H-2A), bilerek eleniyor", "−${f.agricultural}")
                    ProofLine("Tarım dışı (H-2B)", f.nonAgricultural.toString())
                    ProofLine("— tarım mesleği sayılanlar", "−${f.socFarming}")
                    ProofLine("— e-postası olmayan", "−${f.withoutEmail}")
                    ProofLine("Süzgece uyan, yayındakiler", f.activeMatching.toString())
                    ProofLine("+ işi başlamamış ilanlar", "+${f.upcoming}")
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Uygulamada görünen: ${f.appTotal}",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Site ana sayfada tarım ilanlarını da sayıyor; ilanların çoğu " +
                            "tarım olduğu için sayı büyük görünüyor. Buna karşılık site " +
                            "işi başlamamış ilanları gizliyor, uygulama onları da " +
                            "gösteriyor — yurt dışından başvuran için asıl değerli " +
                            "olanlar onlar.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.outline,
                    )
                }
            }
        }
    }
    sourceProof?.let { proof ->
        item {
            Card {
                Column(Modifier.padding(12.dp)) {
                    Text("Canlı yanıt", fontWeight = FontWeight.SemiBold)
                    ProofLine("Sunucu", proof.endpointHost)
                    ProofLine("HTTP", proof.httpCode.toString())
                    proof.serverDate?.let { ProofLine("Sunucu saati", it) }
                    ProofLine("Yanıt", "${proof.elapsedMs} ms")
                    ProofLine("Aktif ilan", proof.totalActive.toString())
                    proof.newestCaseNumber?.let { ProofLine("En yeni ilan", it) }
                    proof.newestEmployer?.let { ProofLine("İşveren", it) }
                }
            }
        }
    }

    item { SectionTitle("Gönderim özeti") }
    item {
        // history.size hem başarılıyı hem başarısızı sayıyor. Tek sayı olarak
        // "gönderim" demek yanıltıcıydı: kullanıcı Gmail'in Gönderilenler
        // klasöründe daha az ileti görüp arada bir hata sanıyordu.
        val summary = history.summarize()
        val sent = summary.sent
        val failed = summary.failed
        Card {
            Column(Modifier.padding(12.dp)) {
                Text(
                    "$sent ileti gönderildi",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                if (failed > 0) {
                    Text(
                        "$failed deneme başarısız oldu",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Spacer(Modifier.height(6.dp))
                    // 95 kaydı tek tek okumak yerine sebep sebep döküm:
                    // "neden başarısız oluyor" sorusunun cevabı burada.
                    history.failureReasons().forEach { (reason, count) ->
                        Text(
                            "• $count × $reason",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Gmail'in \"Gönderilenler\" klasöründe yalnızca başarılı olanlar görünür; " +
                            "sayıların farklı olması normaldir. Adresi kapanmış ilanlar tekrar " +
                            "denenmez; bağlantı ve sınır hataları kuyrukta kalıp yeniden denenir.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.outline,
                    )
                }
            }
        }
    }
    item { SectionTitle("Depolanan veri") }
    item {
        Text(
            "$archiveSize arşivlenmiş ilan · $memorySize bellek parçası · " +
                "${searchHistory.size} arama · ${history.size} gönderim kaydı",
            style = MaterialTheme.typography.bodySmall,
        )
    }
    item {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton(onClick = onClearArchive) { Text("Arşivi sıfırla") }
            TextButton(onClick = onClearMemory) { Text("Belleği sıfırla") }
            TextButton(onClick = onClearSearchHistory) { Text("Aramaları sil") }
            TextButton(onClick = onClearHistory) { Text("Gönderimleri sil") }
        }
    }

    if (searchHistory.isNotEmpty()) {
        item { SectionTitle("Son aramalar") }
        items(searchHistory.take(15), key = { "s" + it.timestamp }) { SearchHistoryRow(it) }
    }
    if (history.isNotEmpty()) {
        item { SectionTitle("Gönderim geçmişi") }
        items(history.take(40), key = { it.caseNumber + it.timestamp }) { HistoryRow(it) }
    }
}

// ==================================================================== ortak parçalar

@Composable
private fun Hint(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.outline,
    )
}

@Composable
fun <T> EnumPicker(
    label: String,
    current: String,
    options: List<Pair<String, T>>,
    onSelect: (T) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Box {
            OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                Text(current)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                options.forEach { (text, value) ->
                    DropdownMenuItem(
                        text = { Text(text) },
                        onClick = {
                            expanded = false
                            onSelect(value)
                        },
                    )
                }
            }
        }
    }
}

@Composable
fun NumberChoiceRow(label: String, value: Int, options: List<Int>, onSelect: (Int) -> Unit) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            options.forEach { option ->
                FilterChip(
                    selected = option == value,
                    onClick = { onSelect(option) },
                    label = { Text(option.toString()) },
                )
            }
        }
    }
}

/** Değeri sayı, etiketi metin olan seçim satırı (0 = "Kapalı" gibi). */
@Composable
fun LabelledChoiceRow(
    label: String,
    value: Int,
    options: List<Pair<Int, String>>,
    onSelect: (Int) -> Unit,
) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            options.forEach { (option, text) ->
                FilterChip(
                    selected = option == value,
                    onClick = { onSelect(option) },
                    label = { Text(text) },
                )
            }
        }
    }
}

@Composable
private fun ProofLine(label: String, value: String) {
    Row(Modifier.padding(vertical = 1.dp)) {
        Text("$label: ", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
        Text(value, style = MaterialTheme.typography.bodySmall)
    }
}

private val STAMP = SimpleDateFormat("dd.MM HH:mm", Locale("tr"))

@Composable
private fun SearchHistoryRow(entry: SearchEntry) {
    Card {
        Column(Modifier.padding(10.dp)) {
            Text(
                entry.query.ifBlank { "(tüm ilanlar)" },
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                "${STAMP.format(Date(entry.timestamp))} · ${entry.fetched} ilan · ${entry.newJobs} yeni",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline,
            )
        }
    }
}

@Composable
private fun HistoryRow(record: SendRecord) {
    Card {
        Row(Modifier.padding(10.dp)) {
            Text(
                if (record.status == SendStatus.SENT) "✓" else "✗",
                color = if (record.status == SendStatus.SENT) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.error
                },
                fontWeight = FontWeight.Bold,
            )
            Column(Modifier.padding(start = 6.dp)) {
                Text(record.title, style = MaterialTheme.typography.bodyMedium)
                Text(
                    "${record.employer} · ${STAMP.format(Date(record.timestamp))}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline,
                )
                record.error?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}
