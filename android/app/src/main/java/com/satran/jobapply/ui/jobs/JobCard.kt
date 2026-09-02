package com.satran.jobapply.ui.jobs

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.TravelExplore
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.satran.jobapply.data.model.Job
import com.satran.jobapply.ui.common.SmallSpinner

@Composable
fun JobCard(
    job: Job,
    selected: Boolean,
    expanded: Boolean,
    summary: String?,
    summarizing: Boolean,
    research: String?,
    researching: Boolean,
    onToggleSelect: () -> Unit,
    onToggleExpand: () -> Unit,
    onSummarize: () -> Unit,
    onResearch: () -> Unit,
    onOpenDetail: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (selected) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
            },
        ),
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Checkbox(
                    checked = selected,
                    onCheckedChange = { onToggleSelect() },
                    enabled = job.canEmail,
                )
                Column(
                    Modifier
                        .weight(1f)
                        .padding(start = 4.dp),
                ) {
                    Text(job.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        job.employer,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        job.location,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline,
                    )
                }
                IconButton(onClick = onToggleExpand) {
                    Icon(
                        imageVector = if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                        contentDescription = if (expanded) "Kapat" else "Açıklamayı göster",
                    )
                }
            }

            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                job.wage?.let { Tag(it) }
                job.visaClass?.let { Tag(it) }
                job.positions?.let { Tag("$it kişi") }
                job.period?.let { Tag(it) }
                if (!job.canEmail) Tag("e-posta yok", warning = true)
            }

            AnimatedVisibility(visible = expanded) {
                Column {
                    Spacer(Modifier.height(8.dp))

                    summary?.let {
                        Surface(
                            color = MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.5f),
                            shape = MaterialTheme.shapes.small,
                        ) {
                            Column(Modifier.padding(10.dp)) {
                                Text(
                                    "Türkçe özet",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(it, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                    }

                    research?.let {
                        Surface(
                            color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f),
                            shape = MaterialTheme.shapes.small,
                        ) {
                            Column(Modifier.padding(10.dp)) {
                                Text(
                                    "İşveren araştırması",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(it, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                    }

                    DetailRow("İlan no", job.caseNumber)
                    job.socTitle?.let { DetailRow("Meslek", "$it (${job.socCode.orEmpty()})") }
                    job.email?.let { DetailRow("Başvuru e-postası", it) }
                    job.phone?.let { DetailRow("Telefon", it) }
                    job.schedule?.let { DetailRow("Çalışma", it) }
                    job.experience?.let { DetailRow("Deneyim", it) }
                    job.education?.let { DetailRow("Eğitim", it) }
                    job.postedOn?.let { DetailRow("Yayın", it) }

                    job.duties?.let {
                        Spacer(Modifier.height(6.dp))
                        Text("Görev tanımı", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                        Text(it, style = MaterialTheme.typography.bodySmall)
                    }
                    job.requirements?.let {
                        Spacer(Modifier.height(6.dp))
                        Text("Özel şartlar", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                        Text(it, style = MaterialTheme.typography.bodySmall)
                    }

                    Spacer(Modifier.height(4.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TextButton(onClick = onSummarize, enabled = !summarizing) {
                            if (summarizing) SmallSpinner() else Icon(Icons.Outlined.AutoAwesome, null)
                            Spacer(Modifier.height(0.dp))
                            Text(" Türkçe özet")
                        }
                        TextButton(onClick = onResearch, enabled = !researching) {
                            if (researching) SmallSpinner() else Icon(Icons.Outlined.TravelExplore, null)
                            Text(" İşvereni araştır")
                        }
                        TextButton(onClick = onOpenDetail) {
                            Icon(Icons.AutoMirrored.Outlined.OpenInNew, null)
                            Text(" İlan sayfası")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Tag(text: String, warning: Boolean = false) {
    AssistChip(
        onClick = {},
        enabled = false,
        label = { Text(text, style = MaterialTheme.typography.labelSmall) },
        colors = androidx.compose.material3.AssistChipDefaults.assistChipColors(
            disabledLabelColor = if (warning) {
                MaterialTheme.colorScheme.error
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
        ),
    )
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(Modifier.padding(vertical = 1.dp)) {
        Text(
            "$label: ",
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
        )
        Text(value, style = MaterialTheme.typography.bodySmall)
    }
}
