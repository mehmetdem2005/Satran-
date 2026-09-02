package com.satran.jobapply.ui.apply

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.work.WorkInfo
import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.data.model.Job
import com.satran.jobapply.data.model.SendMode
import com.satran.jobapply.send.BulkSendWorker
import com.satran.jobapply.send.QueuedMail
import com.satran.jobapply.ui.ApplyUiState

@Composable
fun ApplyScreen(
    selectedJobs: List<Job>,
    state: ApplyUiState,
    settings: AppSettings,
    workInfos: List<WorkInfo>,
    onPrepare: () -> Unit,
    onPrepareOne: (String) -> Unit,
    onEdit: (String, String, String) -> Unit,
    onDrop: (String) -> Unit,
    onRemoveSelection: (String) -> Unit,
    onSendAll: () -> Unit,
    onOpenInGmail: (QueuedMail) -> Unit,
    onPickCv: () -> Unit,
    contentPadding: PaddingValues,
) {
    val running = workInfos.firstOrNull { it.state == WorkInfo.State.RUNNING }
    val finished = workInfos.firstOrNull { it.state.isFinished }

    LazyColumn(
        contentPadding = PaddingValues(
            start = 12.dp,
            end = 12.dp,
            top = 8.dp,
            bottom = contentPadding.calculateBottomPadding() + 16.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item { ReadinessCard(settings = settings, selectedCount = selectedJobs.size, onPickCv = onPickCv) }

        running?.let { info ->
            item {
                val done = info.progress.getInt(BulkSendWorker.KEY_PROGRESS, 0)
                val total = info.progress.getInt(BulkSendWorker.KEY_TOTAL, selectedJobs.size.coerceAtLeast(1))
                val current = info.progress.getString(BulkSendWorker.KEY_CURRENT).orEmpty()
                Card {
                    Column(Modifier.padding(12.dp)) {
                        Text("Gönderiliyor: ${done + 1}/$total", fontWeight = FontWeight.SemiBold)
                        Text(current, style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.height(6.dp))
                        LinearProgressIndicator(
                            progress = { if (total == 0) 0f else (done.toFloat() / total) },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }

        if (running == null) {
            finished?.let { info ->
                val sent = info.outputData.getInt(BulkSendWorker.KEY_SENT, 0)
                val failed = info.outputData.getInt(BulkSendWorker.KEY_FAILED, 0)
                val error = info.outputData.getString(BulkSendWorker.KEY_ERROR)
                if (sent > 0 || failed > 0 || error != null) {
                    item {
                        Surface(
                            color = if (failed > 0 || error != null) {
                                MaterialTheme.colorScheme.errorContainer
                            } else {
                                MaterialTheme.colorScheme.primaryContainer
                            },
                            shape = MaterialTheme.shapes.medium,
                        ) {
                            Column(Modifier.padding(12.dp)) {
                                Text("Son gönderim: $sent başarılı, $failed başarısız", fontWeight = FontWeight.SemiBold)
                                error?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                                Text(
                                    "Ayrıntı için Ayarlar > Gönderim geçmişi.",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }
                }
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Button(
                    onClick = onPrepare,
                    enabled = selectedJobs.isNotEmpty() && !state.preparing,
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        when {
                            state.preparing -> "Hazırlanıyor…"
                            settings.aiWriteLetters && settings.aiReady -> "AI ile hazırla (${selectedJobs.size})"
                            else -> "Şablonla hazırla (${selectedJobs.size})"
                        },
                    )
                }
                if (state.prepared.isNotEmpty() && settings.sendMode == SendMode.SMTP) {
                    Button(onClick = onSendAll, enabled = running == null) {
                        Icon(Icons.Outlined.Send, null)
                        Text(" Gönder (${state.prepared.size})")
                    }
                }
            }
        }

        state.progressText?.let {
            item { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline) }
        }
        if (state.preparing) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }

        if (state.prepared.isEmpty()) {
            item {
                Text(
                    if (selectedJobs.isEmpty()) {
                        "İlanlar sekmesinden kutucukları işaretle, sonra buraya gel."
                    } else {
                        "${selectedJobs.size} ilan seçili. 'Hazırla'ya bas, mektupları gözden geçir, sonra gönder."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.outline,
                )
            }
            items(selectedJobs, key = { it.caseNumber }) { job ->
                SelectedRow(
                    job = job,
                    onRemove = { onRemoveSelection(job.caseNumber) },
                    onPrepareOne = { onPrepareOne(job.caseNumber) },
                )
            }
        } else {
            items(state.prepared, key = { it.caseNumber }) { mail ->
                PreparedMailCard(
                    mail = mail,
                    sendMode = settings.sendMode,
                    onEdit = { subject, body -> onEdit(mail.caseNumber, subject, body) },
                    onDrop = { onDrop(mail.caseNumber) },
                    onOpenInGmail = { onOpenInGmail(mail) },
                )
            }
        }
    }
}

@Composable
private fun ReadinessCard(settings: AppSettings, selectedCount: Int, onPickCv: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))) {
        Column(Modifier.padding(12.dp)) {
            Text("Gönderim hazırlığı", fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            CheckLine("Seçili ilan", selectedCount > 0, "$selectedCount ilan")
            CheckLine(
                "PDF CV",
                settings.cvFileName.isNotBlank(),
                settings.cvFileName.ifBlank { "seçilmedi" },
            )
            CheckLine(
                "Gmail",
                settings.smtpReady,
                if (settings.smtpReady) settings.gmailAddress else "adres + uygulama şifresi gerekli",
            )
            CheckLine(
                "Yapay zekâ",
                settings.aiReady,
                if (settings.aiReady) "${settings.aiProvider.label} · ${settings.effectiveModel}" else "kapalı (şablon kullanılır)",
                optional = true,
            )
            Spacer(Modifier.height(6.dp))
            OutlinedButton(onClick = onPickCv) { Text("PDF CV seç") }
        }
    }
}

@Composable
private fun CheckLine(label: String, ok: Boolean, detail: String, optional: Boolean = false) {
    Row(Modifier.padding(vertical = 1.dp)) {
        Text(
            if (ok) "✓" else if (optional) "○" else "✗",
            color = if (ok) {
                MaterialTheme.colorScheme.primary
            } else if (optional) {
                MaterialTheme.colorScheme.outline
            } else {
                MaterialTheme.colorScheme.error
            },
            fontWeight = FontWeight.Bold,
        )
        Text(" $label: ", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
        Text(detail, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun SelectedRow(job: Job, onRemove: () -> Unit, onPrepareOne: () -> Unit) {
    Card {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(job.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                Text(
                    "${job.employer} · ${job.location}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline,
                )
                Text(job.email ?: "e-posta yok", style = MaterialTheme.typography.bodySmall)
            }
            TextButton(onClick = onPrepareOne) { Text("Tek hazırla") }
            IconButton(onClick = onRemove) { Icon(Icons.Outlined.Delete, "Listeden çıkar") }
        }
    }
}

@Composable
private fun PreparedMailCard(
    mail: QueuedMail,
    sendMode: SendMode,
    onEdit: (String, String) -> Unit,
    onDrop: () -> Unit,
    onOpenInGmail: () -> Unit,
) {
    var editing by remember(mail.caseNumber) { mutableStateOf(false) }
    var subject by remember(mail.caseNumber) { mutableStateOf(mail.subject) }
    var body by remember(mail.caseNumber) { mutableStateOf(mail.body) }

    Card {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(mail.employer, fontWeight = FontWeight.SemiBold)
                    Text(mail.to, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }
                IconButton(onClick = onDrop) { Icon(Icons.Outlined.Delete, "Çıkar") }
            }
            HorizontalDivider(Modifier.padding(vertical = 6.dp))

            if (editing) {
                OutlinedTextField(
                    value = subject,
                    onValueChange = { subject = it },
                    label = { Text("Konu") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(
                    value = body,
                    onValueChange = { body = it },
                    label = { Text("Mesaj") },
                    minLines = 8,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = {
                        onEdit(subject, body)
                        editing = false
                    }) { Text("Kaydet") }
                    TextButton(onClick = {
                        subject = mail.subject
                        body = mail.body
                        editing = false
                    }) { Text("Vazgeç") }
                }
            } else {
                Text(mail.subject, fontWeight = FontWeight.Medium, style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(4.dp))
                Text(mail.body, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(4.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = { editing = true }) { Text("Düzenle") }
                    if (sendMode == SendMode.INTENT) {
                        Button(onClick = onOpenInGmail) { Text("Gmail'de aç") }
                    } else {
                        TextButton(onClick = onOpenInGmail) { Text("Gmail'de aç") }
                    }
                }
            }
        }
    }
}
