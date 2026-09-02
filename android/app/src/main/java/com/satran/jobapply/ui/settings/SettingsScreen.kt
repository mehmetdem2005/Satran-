package com.satran.jobapply.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import com.satran.jobapply.data.mail.MailTemplate
import com.satran.jobapply.data.model.AiProvider
import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.data.model.SearchProvider
import com.satran.jobapply.data.model.SendMode
import com.satran.jobapply.data.memory.SearchEntry
import com.satran.jobapply.data.remote.SeasonalJobsApi
import com.satran.jobapply.data.model.SendRecord
import com.satran.jobapply.data.model.SendStatus
import com.satran.jobapply.ui.common.LabeledField
import com.satran.jobapply.ui.common.SectionTitle
import com.satran.jobapply.ui.common.SwitchRow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun SettingsScreen(
    settings: AppSettings,
    history: List<SendRecord>,
    searchHistory: List<SearchEntry>,
    memorySize: Int,
    archiveSize: Int,
    testing: Boolean,
    loadingModels: Boolean,
    verifying: Boolean,
    sourceProof: SeasonalJobsApi.SourceProof?,
    onUpdate: ((AppSettings) -> AppSettings) -> Unit,
    onPickCv: () -> Unit,
    onTestSmtp: () -> Unit,
    onTestAi: () -> Unit,
    onTestSearch: () -> Unit,
    onVerifySource: () -> Unit,
    onLoadModels: () -> Unit,
    onClearHistory: () -> Unit,
    onClearArchive: () -> Unit,
    onClearSearchHistory: () -> Unit,
    onClearMemory: () -> Unit,
    onOpenUrl: (String) -> Unit,
    contentPadding: PaddingValues,
) {
    LazyColumn(
        contentPadding = PaddingValues(
            start = 12.dp,
            end = 12.dp,
            top = 8.dp,
            bottom = contentPadding.calculateBottomPadding() + 24.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        // ------------------------------------------------------------ veri kaynağı
        item { SectionTitle("İlan verisi nereden geliyor") }
        item {
            Text(
                "İlanlar ABD Çalışma Bakanlığı'nın açık kaydından (seasonaljobs.dol.gov) canlı çekilir. " +
                    "Bu veri için API anahtarı gerekmez — anahtar girmeden ilan görmen bu yüzden normaldir. " +
                    "Uygulamanın içinde gömülü tek bir ilan yoktur; uçağa alma kipinde liste boş kalır.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline,
            )
        }
        item {
            Button(onClick = onVerifySource, enabled = !verifying) {
                Text(if (verifying) "Sorgulanıyor…" else "Kaynağı şimdi doğrula")
            }
        }
        sourceProof?.let { proof ->
            item {
                Card {
                    Column(Modifier.padding(12.dp)) {
                        Text("Canlı yanıt", fontWeight = FontWeight.SemiBold)
                        ProofLine("Sunucu", proof.endpointHost)
                        ProofLine("HTTP durumu", proof.httpCode.toString())
                        proof.serverDate?.let { ProofLine("Sunucu saati", it) }
                        ProofLine("Yanıt süresi", "${proof.elapsedMs} ms")
                        ProofLine("Aktif ilan", proof.totalActive.toString())
                        proof.newestCaseNumber?.let { ProofLine("En yeni ilan no", it) }
                        proof.newestTitle?.let { ProofLine("En yeni başlık", it) }
                        proof.newestEmployer?.let { ProofLine("İşveren", it) }
                        proof.newestAcceptedDate?.let { ProofLine("Kabul tarihi", it) }
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Bu satırlar her basışta değişir. Sunucu saati cihazının saatinden bağımsızdır; " +
                                "gömülü veri bunu üretemez.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.outline,
                        )
                    }
                }
            }
        }
        item {
            OutlinedButton(onClick = { onOpenUrl("https://seasonaljobs.dol.gov/jobs") }) {
                Text("Resmî siteyi aç ve karşılaştır")
            }
        }

        // ------------------------------------------------------------ Gmail
        item { SectionTitle("Gmail hesabı") }
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
                hint = "Normal hesap şifresi çalışmaz. 2 adımlı doğrulamayı aç, sonra uygulama şifresi üret.",
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { onOpenUrl("https://myaccount.google.com/apppasswords") }) {
                    Text("Uygulama şifresi al")
                }
                Button(onClick = onTestSmtp, enabled = !testing && settings.smtpReady) {
                    Text(if (testing) "Deneniyor…" else "Bağlantıyı test et")
                }
            }
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
        item {
            EnumPicker(
                label = "Gönderim yolu",
                current = settings.sendMode.label,
                options = SendMode.entries.map { it.label to it },
                onSelect = { mode -> onUpdate { it.copy(sendMode = mode) } },
            )
        }
        item {
            LabeledField(
                label = "İletiler arası bekleme (saniye)",
                value = settings.sendDelaySeconds.toString(),
                onValueChange = { v ->
                    val seconds = v.filter { it.isDigit() }.toIntOrNull()?.coerceIn(0, 300) ?: 0
                    onUpdate { it.copy(sendDelaySeconds = seconds) }
                },
                keyboardType = KeyboardType.Number,
                hint = "Gmail günde ~500 ileti sınırı koyar. 5-10 saniye güvenlidir.",
                modifier = Modifier.fillMaxWidth(),
            )
        }

        // ------------------------------------------------------------ CV
        item { SectionTitle("PDF CV") }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onPickCv) { Text("CV seç") }
                Text(
                    settings.cvFileName.ifBlank { "Henüz seçilmedi" },
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
        }

        // ------------------------------------------------------------ profil
        item { SectionTitle("Başvuru profilin") }
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
                hint = "Deneyimin, dil bilgin, ne zaman müsait olduğun. Yapay zekâ mektubu buradan yazar.",
                singleLine = false,
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        // ------------------------------------------------------------ şablon
        item { SectionTitle("Mesaj şablonu") }
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
        item {
            Column {
                Text("Yer tutucular", style = MaterialTheme.typography.labelMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    MailTemplate.PLACEHOLDERS.forEach { (token, _) ->
                        AssistChip(
                            onClick = { onUpdate { it.copy(bodyTemplate = it.bodyTemplate + token) } },
                            label = { Text(token, style = MaterialTheme.typography.labelSmall) },
                        )
                    }
                }
                Text(
                    "Bir yer tutucuya dokunursan mesajın sonuna eklenir.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline,
                )
            }
        }
        item {
            TextButton(onClick = { onUpdate { it.copy(bodyTemplate = AppSettings.DEFAULT_BODY_TEMPLATE) } }) {
                Text("Şablonu sıfırla")
            }
        }

        // ------------------------------------------------------------ AI
        item { SectionTitle("Yapay zekâ") }
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
            Column {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = onLoadModels, enabled = !loadingModels && settings.aiApiKey.isNotBlank()) {
                        Text(if (loadingModels) "Çekiliyor…" else "Modelleri çek")
                    }
                    Text(
                        if (settings.discoveredModels.isEmpty()) {
                            "Sağlayıcıdan canlı liste al"
                        } else {
                            "${settings.discoveredModels.size} model bulundu"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
                Spacer(Modifier.height(4.dp))
                if (settings.modelChoices.isNotEmpty()) {
                    EnumPicker(
                        label = "Model",
                        current = settings.effectiveModel,
                        options = settings.modelChoices.map { it to it },
                        onSelect = { model -> onUpdate { it.copy(aiModel = model) } },
                    )
                }
                Spacer(Modifier.height(4.dp))
                LabeledField(
                    label = "Model adını elle yaz",
                    value = settings.aiModel,
                    onValueChange = { v -> onUpdate { it.copy(aiModel = v.trim()) } },
                    hint = "Boş bırakırsan ${settings.aiProvider.defaultModel.ifBlank { "sağlayıcı varsayılanı" }} kullanılır.",
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        if (settings.aiProvider == AiProvider.CUSTOM) {
            item {
                LabeledField(
                    label = "Sunucu adresi",
                    value = settings.aiBaseUrl,
                    onValueChange = { v -> onUpdate { it.copy(aiBaseUrl = v.trim()) } },
                    hint = "Örn. https://api.deepseek.com/v1 — sonuna /chat/completions eklenir.",
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        item {
            Button(onClick = onTestAi, enabled = !testing && settings.aiReady) {
                Text(if (testing) "Deneniyor…" else "Yapay zekâyı test et")
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
            SwitchRow(
                title = "Mimarlık ilanlarını modele de eletsin",
                subtitle = "Anahtar sözcük süzgecinin kaçırdıklarını yakalar",
                checked = settings.aiFilterArchitectural,
                onCheckedChange = { v -> onUpdate { it.copy(aiFilterArchitectural = v) } },
            )
        }
        item {
            LabeledField(
                label = "Mektup dili",
                value = settings.letterLanguage,
                onValueChange = { v -> onUpdate { it.copy(letterLanguage = v) } },
                hint = "ABD işverenleri için 'İngilizce' önerilir.",
                modifier = Modifier.fillMaxWidth(),
            )
        }

        // ------------------------------------------------------------ arama
        item { SectionTitle("İnternet araması") }
        item {
            Text(
                "DeepSeek'in sohbet ucunda gömülü web araması yok. Bu yüzden iş bölümü şöyle: " +
                    "aranacak sorguyu model yazar, aramayı buradaki API yapar, gelen sonuçları " +
                    "model okuyup işveren brifingine çevirir.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline,
            )
        }
        item {
            EnumPicker(
                label = "Arama sağlayıcısı",
                current = settings.searchProvider.label,
                options = SearchProvider.entries.map { it.label to it },
                onSelect = { provider -> onUpdate { it.copy(searchProvider = provider) } },
            )
        }
        item {
            Text(
                settings.searchProvider.hint,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline,
            )
        }
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
                    Text(if (testing) "Deneniyor…" else "Aramayı test et")
                }
            }
        }
        item {
            SwitchRow(
                title = "Göndermeden önce işvereni araştır",
                subtitle = "Her ilan için gerçek web araması yapar; yavaşlatır ama mektubu güçlendirir",
                checked = settings.researchBeforeSending,
                onCheckedChange = { v -> onUpdate { it.copy(researchBeforeSending = v) } },
            )
        }
        item {
            NumberChoiceRow(
                label = "İşveren başına arama sonucu",
                value = settings.searchResultsPerJob,
                options = listOf(3, 5, 8, 10),
                onSelect = { n -> onUpdate { it.copy(searchResultsPerJob = n) } },
            )
        }

        // ------------------------------------------------------------ arama davranışı
        item { SectionTitle("Arama davranışı ve bellek") }
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
                subtitle = "Görülen ilanlar Geçmiş sekmesinde durur, Yeni listesinde tekrar çıkmaz",
                checked = settings.hideSeenJobs,
                onCheckedChange = { v -> onUpdate { it.copy(hideSeenJobs = v) } },
            )
        }
        item {
            SwitchRow(
                title = "Bellek (RAG) kullan",
                subtitle = "Geçmiş ilanlar ve yazdığın mektuplar yeni mektuba bağlam olur",
                checked = settings.useRagMemory,
                onCheckedChange = { v -> onUpdate { it.copy(useRagMemory = v) } },
            )
        }
        item {
            NumberChoiceRow(
                label = "Mektuba eklenecek bellek parçası",
                value = settings.ragContextSize,
                options = listOf(2, 4, 6, 8),
                onSelect = { n -> onUpdate { it.copy(ragContextSize = n) } },
            )
        }
        item {
            Column {
                Text(
                    "Arşiv: $archiveSize ilan · Bellek: $memorySize parça · Arama geçmişi: ${searchHistory.size} kayıt",
                    style = MaterialTheme.typography.bodySmall,
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = onClearArchive) { Text("Arşivi sıfırla") }
                    TextButton(onClick = onClearMemory) { Text("Belleği sıfırla") }
                    TextButton(onClick = onClearSearchHistory) { Text("Arama geçmişi") }
                }
            }
        }

        // ------------------------------------------------------------ arama geçmişi
        if (searchHistory.isNotEmpty()) {
            item { SectionTitle("Son aramalar") }
            items(searchHistory.take(20), key = { it.timestamp }) { entry ->
                SearchHistoryRow(entry)
            }
        }

        // ------------------------------------------------------------ geçmiş
        item { SectionTitle("Gönderim geçmişi (${history.size})") }
        if (history.isEmpty()) {
            item {
                Text(
                    "Henüz başvuru gönderilmedi.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline,
                )
            }
        } else {
            item {
                TextButton(onClick = onClearHistory) { Text("Geçmişi temizle") }
            }
            items(history.take(60), key = { it.caseNumber + it.timestamp }) { record ->
                HistoryRow(record)
            }
        }

        item {
            Spacer(Modifier.height(12.dp))
            Text(
                "İlan verisi: seasonaljobs.dol.gov (ABD Çalışma Bakanlığı açık verisi). " +
                    "Gmail şifren ve API anahtarların yalnızca bu cihazda, şifreli olarak saklanır.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline,
            )
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

@Composable
private fun NumberChoiceRow(
    label: String,
    value: Int,
    options: List<Int>,
    onSelect: (Int) -> Unit,
) {
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

private val SEARCH_FORMAT = SimpleDateFormat("dd.MM HH:mm", Locale("tr"))

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
                buildString {
                    append(SEARCH_FORMAT.format(Date(entry.timestamp)))
                    append(" · ${entry.offset}. kayıttan ${entry.fetched} ilan")
                    append(" · ${entry.newJobs} yeni")
                    if (entry.totalMatches > 0) append(" · ${entry.totalMatches} eşleşme")
                    entry.state?.let { append(" · ${it.lowercase().replaceFirstChar { c -> c.uppercase() }}") }
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline,
            )
        }
    }
}

@Composable
private fun <T> EnumPicker(
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

private val HISTORY_FORMAT = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale("tr"))

@Composable
private fun HistoryRow(record: SendRecord) {
    Card {
        Column(Modifier.padding(10.dp)) {
            Row {
                Text(
                    when (record.status) {
                        SendStatus.SENT -> "✓"
                        SendStatus.FAILED -> "✗"
                        else -> "•"
                    },
                    color = if (record.status == SendStatus.SENT) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.error
                    },
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(0.dp))
                Column(Modifier.padding(start = 6.dp)) {
                    Text(record.title, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        "${record.employer} · ${record.email}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline,
                    )
                    Text(
                        HISTORY_FORMAT.format(Date(record.timestamp)),
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
}
