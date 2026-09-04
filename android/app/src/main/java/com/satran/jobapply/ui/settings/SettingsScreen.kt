package com.satran.jobapply.ui.settings

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.satran.jobapply.data.memory.SearchEntry
import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.data.model.SendRecord
import com.satran.jobapply.data.remote.SeasonalJobsApi

/**
 * Ayarlar.
 *
 * Tek uzun kaydırma yerine kısa bir ana liste ve alt sayfalar. Ana listede
 * yalnızca yedi satır var ve her satır o bölümün durumunu özetliyor; ayrıntı
 * ancak içine girilince görünüyor.
 */
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
    var section by remember { mutableStateOf<SettingsSection?>(null) }
    BackHandler(enabled = section != null) { section = null }

    val padding = PaddingValues(
        start = 12.dp,
        end = 12.dp,
        top = 8.dp,
        bottom = contentPadding.calculateBottomPadding() + 24.dp,
    )

    if (section == null) {
        SettingsHome(
            settings = settings,
            historyCount = history.size,
            archiveSize = archiveSize,
            onOpen = { section = it },
            onPickCv = onPickCv,
            contentPadding = padding,
        )
        return
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(start = 4.dp, end = 12.dp, top = 4.dp),
        ) {
            IconButton(onClick = { section = null }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri")
            }
            Text(
                section!!.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
        HorizontalDivider()

        LazyColumn(
            contentPadding = padding,
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            when (section!!) {
                SettingsSection.GMAIL -> gmailSection(settings, testing, onUpdate, onTestSmtp, onOpenUrl)
                SettingsSection.PROFILE -> profileSection(settings, onUpdate, onPickCv)
                SettingsSection.TEMPLATE -> templateSection(settings, onUpdate)
                SettingsSection.TRANSLATION -> translationSection(settings, onUpdate)
                SettingsSection.SEARCH -> searchSection(settings, onUpdate)
                SettingsSection.AI -> aiSection(
                    settings, testing, loadingModels, onUpdate,
                    onTestAi, onTestSearch, onLoadModels, onOpenUrl,
                )
                SettingsSection.DATA -> dataSection(
                    settings, history, searchHistory, memorySize, archiveSize,
                    verifying, sourceProof, onVerifySource, onClearHistory,
                    onClearArchive, onClearSearchHistory, onClearMemory, onOpenUrl,
                )
            }
        }
    }
}

// ==================================================================== ana liste

@Composable
private fun SettingsHome(
    settings: AppSettings,
    historyCount: Int,
    archiveSize: Int,
    onOpen: (SettingsSection) -> Unit,
    onPickCv: () -> Unit,
    contentPadding: PaddingValues,
) {
    LazyColumn(
        contentPadding = contentPadding,
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item { ReadinessCard(settings, onPickCv, onOpen) }

        items(SettingsSection.entries) { entry ->
            SectionRow(
                title = entry.title,
                subtitle = entry.subtitle(settings, historyCount, archiveSize),
                onClick = { onOpen(entry) },
            )
        }

        item {
            Spacer(Modifier.height(8.dp))
            Text(
                "İlan verisi ABD Çalışma Bakanlığı'nın açık kaydından gelir ve anahtar " +
                    "gerektirmez. Gmail şifren ve API anahtarların yalnızca bu cihazda, " +
                    "şifreli olarak saklanır.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline,
            )
        }
    }
}

/** Başvuru gönderebilmek için eksik olan üç şeyi tek bakışta gösterir. */
@Composable
private fun ReadinessCard(
    settings: AppSettings,
    onPickCv: () -> Unit,
    onOpen: (SettingsSection) -> Unit,
) {
    val missing = buildList {
        if (!settings.smtpReady) add("Gmail" to SettingsSection.GMAIL)
        if (settings.cvFileName.isBlank()) add("PDF CV" to SettingsSection.PROFILE)
        if (settings.fullName.isBlank()) add("Ad soyad" to SettingsSection.PROFILE)
    }

    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (missing.isEmpty()) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.errorContainer
            },
        ),
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(
                if (missing.isEmpty()) "Başvuruya hazırsın ✓" else "Eksikler var",
                fontWeight = FontWeight.SemiBold,
            )
            if (missing.isEmpty()) {
                Text(
                    "Gmail, CV ve profil tamam. İlanlar sekmesinden seçip gönderebilirsin.",
                    style = MaterialTheme.typography.bodySmall,
                )
            } else {
                Spacer(Modifier.height(6.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    missing.forEach { (label, target) ->
                        AssistChip(
                            onClick = { if (label == "PDF CV") onPickCv() else onOpen(target) },
                            label = { Text(label) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionRow(title: String, subtitle: String, onClick: () -> Unit) {
    Card(onClick = onClick) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.bodyLarge)
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline,
                )
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null)
        }
    }
}
