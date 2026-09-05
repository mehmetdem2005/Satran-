package com.satran.jobapply.ui.jobs

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.outlined.Translate
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
import androidx.compose.ui.graphics.Color
import com.satran.jobapply.data.translate.JobTranslation
import com.satran.jobapply.ui.theme.satranColors
import com.satran.jobapply.ui.common.SmallSpinner

@Composable
fun JobCard(
    job: Job,
    selected: Boolean,
    expanded: Boolean,
    translation: JobTranslation?,
    translating: Boolean,
    applied: Boolean = false,
    research: String?,
    researching: Boolean,
    onToggleSelect: () -> Unit,
    onToggleExpand: () -> Unit,
    onSummarize: () -> Unit,
    onResearch: () -> Unit,
    onOpenDetail: () -> Unit,
    archivedNote: String? = null,
    loadingDetails: Boolean = false,
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
        Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
            Row(
                verticalAlignment = Alignment.Top,
                // Kartın gövdesine dokunmak da açıp kapatsın; küçük oka nişan
                // almak zorunda kalmamak için.
                modifier = Modifier.clickable(onClick = onToggleExpand),
            ) {
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
                    Text(
                        translation?.title ?: job.title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        // Başvurulmuş ilanın başlığı mavi: listede tek bakışta ayrılır.
                        color = if (applied) satranColors.applied else Color.Unspecified,
                        maxLines = 2,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    )
                    // Başvuru e-postasında İngilizce başlık geçtiği için özgün hâli
                    // de görünür kalır.
                    if (translation?.title != null) {
                        Text(
                            job.title,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.outline,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        "${job.employer} · ${job.location}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline,
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    )
                }
                // Çeviri tuşu kart kapalıyken de görünür; basınca kart açılıp
                // başlık, meslek adı ve açıklama birlikte Türkçeye döner.
                IconButton(onClick = onSummarize, enabled = !translating) {
                    if (translating) {
                        SmallSpinner()
                    } else {
                        Icon(
                            imageVector = Icons.Outlined.Translate,
                            contentDescription = if (translation != null) "Özgün metne dön" else "Türkçeye çevir",
                            tint = if (translation != null) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                }
                IconButton(onClick = onToggleExpand) {
                    Icon(
                        imageVector = if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                        contentDescription = if (expanded) "Kapat" else "Açıklamayı göster",
                    )
                }
            }

            // Kapalı kartta yalnızca en ayırt edici bilgiler; gerisi açılınca gelir.
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.padding(start = 48.dp, top = 2.dp, bottom = 2.dp),
            ) {
                job.wage?.let { Meta(it, strong = true) }
                job.visaClass?.let { Meta(it) }
                job.positions?.let { Meta("$it kişi") }
                if (!job.canEmail) Meta("e-posta yok", warning = true)
                if (applied) Meta("başvuruldu ✓", color = satranColors.applied)
                archivedNote?.let { Meta(it) }
            }
            if (expanded) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.padding(start = 48.dp),
                ) {
                    job.period?.let { Tag(it) }
                    job.schedule?.let { Tag(it) }
                }
            }

            AnimatedVisibility(visible = expanded) {
                Column {
                    Spacer(Modifier.height(8.dp))

                    translation?.aiSummary?.let {
                        Surface(
                            color = MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.5f),
                            shape = MaterialTheme.shapes.small,
                        ) {
                            Column(Modifier.padding(10.dp)) {
                                Text(
                                    "Yapay zekâ özeti",
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
                    job.socTitle?.let {
                        DetailRow("Meslek", "${translation?.socTitle ?: it} (${job.socCode.orEmpty()})")
                    }
                    job.email?.let { DetailRow("Başvuru e-postası", it) }
                    job.phone?.let { DetailRow("Telefon", it) }
                    job.schedule?.let { DetailRow("Çalışma", it) }
                    job.experience?.let { DetailRow("Deneyim", it) }
                    job.education?.let { DetailRow("Eğitim", it) }
                    job.postedOn?.let { DetailRow("Yayın", it) }

                    // Çeviri sürerken gösterge kaybolmamalı: en yavaş adım
                    // metin geldikten sonra çalışan çeviridir.
                    if (loadingDetails || translating) {
                        Spacer(Modifier.height(6.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            SmallSpinner()
                            Text(
                                when {
                                    job.duties == null && loadingDetails -> " Görev tanımı getiriliyor…"
                                    translating -> " Çevriliyor…"
                                    else -> " Yükleniyor…"
                                },
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                    job.duties?.let {
                        Spacer(Modifier.height(6.dp))
                        Text("Görev tanımı", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                        Text(translation?.duties ?: it, style = MaterialTheme.typography.bodySmall)
                    }
                    job.requirements?.let {
                        Spacer(Modifier.height(6.dp))
                        Text("Özel şartlar", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                        Text(translation?.requirements ?: it, style = MaterialTheme.typography.bodySmall)
                    }

                    Spacer(Modifier.height(4.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TextButton(onClick = onSummarize, enabled = !translating) {
                            if (translating) SmallSpinner() else Icon(Icons.Outlined.Translate, null)
                            Text(if (translation != null) " Özgün metne dön" else " Türkçeye çevir")
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

/** Kart başlığının altındaki ince bilgi satırı — çip değil, yer kaplamaz. */
@Composable
private fun Meta(
    text: String,
    strong: Boolean = false,
    warning: Boolean = false,
    color: Color? = null,
) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = if (strong || color != null) FontWeight.SemiBold else FontWeight.Normal,
        color = color ?: when {
            warning -> MaterialTheme.colorScheme.error
            strong -> MaterialTheme.colorScheme.primary
            else -> MaterialTheme.colorScheme.onSurfaceVariant
        },
    )
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
