package com.satran.jobapply.ui.jobs

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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Clear
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.satran.jobapply.data.model.Job
import com.satran.jobapply.data.remote.SeasonalJobsApi
import com.satran.jobapply.ui.JobsUiState
import com.satran.jobapply.ui.JobsView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JobsScreen(
    state: JobsUiState,
    onQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    onRefresh: () -> Unit,
    onNextPage: () -> Unit,
    onAiSearch: (String) -> Unit,
    onViewChange: (JobsView) -> Unit,
    onFilter: (state: String?, sort: SeasonalJobsApi.Sort, excludeAgricultural: Boolean, emailOnly: Boolean, hideApplied: Boolean) -> Unit,
    onFetchAll: () -> Unit,
    onRefreshArchive: () -> Unit,
    onToggleQueryPanel: () -> Unit,
    onToggleSelect: (Job) -> Unit,
    onToggleExpand: (String) -> Unit,
    onSummarize: (Job) -> Unit,
    onResearch: (Job) -> Unit,
    onOpenDetail: (String) -> Unit,
    onSelectAll: () -> Unit,
    onClearSelection: () -> Unit,
    onLoadMore: () -> Unit,
    contentPadding: PaddingValues,
) {
    val listState = rememberLazyListState()
    val keyboard = LocalSoftwareKeyboardController.current

    val shouldLoadMore by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= state.results.size - 4 && state.results.isNotEmpty()
        }
    }
    LaunchedEffect(listState, state.view) {
        if (state.view != JobsView.LIVE) return@LaunchedEffect
        snapshotFlow { shouldLoadMore }.collect { if (it) onLoadMore() }
    }

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) {
            OutlinedTextField(
                value = state.query,
                onValueChange = onQueryChange,
                label = { Text("Ara: iş, işveren, şehir…") },
                singleLine = true,
                leadingIcon = { Icon(Icons.Filled.Search, null) },
                trailingIcon = {
                    Row {
                        if (state.query.isNotEmpty()) {
                            IconButton(onClick = { onQueryChange("") }) {
                                Icon(Icons.Outlined.Clear, "Temizle")
                            }
                        }
                        IconButton(onClick = {
                            keyboard?.hide()
                            onAiSearch(state.query)
                        }) {
                            Icon(Icons.Outlined.AutoAwesome, "Yapay zekâ ile ara")
                        }
                    }
                },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = {
                    keyboard?.hide()
                    onSearch()
                }),
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(6.dp))

            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                JobsView.entries.forEachIndexed { index, view ->
                    SegmentedButton(
                        selected = state.view == view,
                        onClick = { onViewChange(view) },
                        shape = SegmentedButtonDefaults.itemShape(index, JobsView.entries.size),
                    ) {
                        Text(
                            when (view) {
                                JobsView.LIVE -> "Yeni (${state.results.size})"
                                JobsView.ARCHIVE -> "Geçmiş (${state.archived.size})"
                            },
                        )
                    }
                }
            }

            Spacer(Modifier.height(6.dp))
            FilterBar(state = state, onFilter = onFilter)

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = summaryLine(state),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = onSelectAll) { Text("Tümünü seç") }
                if (state.selectedCount > 0) {
                    TextButton(onClick = onClearSelection) { Text("Bırak") }
                }
            }

            if (state.view == JobsView.LIVE) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = onNextPage,
                        enabled = !state.loading && !state.loadingMore && !state.bulkFetching,
                        modifier = Modifier.weight(1f),
                    ) { Text("Sonraki sayfa →") }
                    Button(
                        onClick = onFetchAll,
                        enabled = !state.loading && !state.bulkFetching,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(if (state.bulkFetching) "Çekiliyor…" else "Tümünü çek")
                    }
                }
            } else {
                OutlinedButton(
                    onClick = onRefreshArchive,
                    enabled = !state.refreshingArchive,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (state.refreshingArchive) "Denetleniyor…" else "Arşivi tazele (kalkanları sil)")
                }
            }

            if (state.bulkFetching) {
                Spacer(Modifier.height(4.dp))
                Text(
                    "${state.bulkFetched} / ${state.bulkTotal} ilan çekildi",
                    style = MaterialTheme.typography.bodySmall,
                )
                LinearProgressIndicator(
                    progress = { if (state.bulkTotal == 0) 0f else state.bulkFetched.toFloat() / state.bulkTotal },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            if (state.sentFilter.isNotEmpty()) {
                TextButton(onClick = onToggleQueryPanel) {
                    Text(if (state.showQueryPanel) "Sorguyu gizle ▲" else "Sunucuya giden sorguyu göster ▼")
                }
            }
            if (state.showQueryPanel) {
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(10.dp)) {
                        Text("POST api.seasonaljobs.dol.gov/datahub/search", style = MaterialTheme.typography.labelSmall)
                        Spacer(Modifier.height(4.dp))
                        Text("search:", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        Text(state.sentSearch, style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.height(4.dp))
                        Text("filter:", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        Text(state.sentFilter, style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Her süzgeç bu ifadeye dönüşüp sunucuda çalışır. " +
                                "Tek istisna \"Başvurulanları gizle\" — gönderim geçmişi cihazda tutulduğu için o cihazda uygulanır.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.outline,
                        )
                    }
                }
            }
        }

        if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())

        state.error?.let { error ->
            Column(Modifier.padding(16.dp)) {
                Text(error, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(8.dp))
                Button(onClick = onSearch) { Text("Tekrar dene") }
            }
        }

        // Kart açıldığında ayrıca çekilen tam metinli sürüm varsa onu göster.
        val visible: List<Pair<Job, String?>> = when (state.view) {
            JobsView.LIVE -> state.results.map { (state.details[it.caseNumber] ?: it) to null }
            JobsView.ARCHIVE -> state.archived.map {
                (state.details[it.job.caseNumber] ?: it.job) to "görüldü ${ARCHIVE_FORMAT.format(Date(it.lastSeenAt))}"
            }
        }

        if (!state.loading && state.error == null && visible.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    when (state.view) {
                        JobsView.ARCHIVE -> "Arşiv boş. Arama yaptıkça ilanlar buraya birikir."
                        JobsView.LIVE ->
                            if (state.duplicatesSkipped > 0) {
                                "Bu sayfadaki ilanları daha önce gördün. 'Sonraki sayfa'ya bas."
                            } else {
                                "Sonuç yok. Aramayı ya da süzgeçleri değiştir."
                            }
                    },
                    color = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.padding(24.dp),
                )
            }
        }

        PullToRefreshBox(
            isRefreshing = state.refreshing,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                state = listState,
                contentPadding = PaddingValues(
                    start = 12.dp,
                    end = 12.dp,
                    top = 4.dp,
                    bottom = contentPadding.calculateBottomPadding() + 12.dp,
                ),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(visible, key = { it.first.caseNumber }) { (job, note) ->
                    JobCard(
                        job = job,
                        selected = state.selected.containsKey(job.caseNumber),
                        expanded = state.expanded.contains(job.caseNumber),
                        summary = state.summaries[job.caseNumber],
                        summarizing = state.summarizing.contains(job.caseNumber),
                        research = state.research[job.caseNumber],
                        researching = state.researching.contains(job.caseNumber),
                        onToggleSelect = { onToggleSelect(job) },
                        onToggleExpand = { onToggleExpand(job.caseNumber) },
                        loadingDetails = state.loadingDetails.contains(job.caseNumber),
                        onSummarize = { onSummarize(job) },
                        onResearch = { onResearch(job) },
                        onOpenDetail = { onOpenDetail(job.detailUrl) },
                        archivedNote = note,
                    )
                }
                if (state.loadingMore) {
                    item {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            contentAlignment = Alignment.Center,
                        ) { CircularProgressIndicator() }
                    }
                }
            }
        }
    }
}

@Composable
private fun FilterBar(
    state: JobsUiState,
    onFilter: (String?, SeasonalJobsApi.Sort, Boolean, Boolean, Boolean) -> Unit,
) {
    var stateMenu by remember { mutableStateOf(false) }
    var sortMenu by remember { mutableStateOf(false) }

    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        FilterChip(
            selected = state.excludeAgricultural,
            onClick = {
                onFilter(state.selectedState, state.sort, !state.excludeAgricultural, state.emailOnly, state.hideApplied)
            },
            label = { Text("Tarım dışı (H-2B)") },
        )
        FilterChip(
            selected = state.emailOnly,
            onClick = {
                onFilter(state.selectedState, state.sort, state.excludeAgricultural, !state.emailOnly, state.hideApplied)
            },
            label = { Text("E-postası olan") },
        )
        FilterChip(
            selected = state.hideApplied,
            onClick = {
                onFilter(state.selectedState, state.sort, state.excludeAgricultural, state.emailOnly, !state.hideApplied)
            },
            label = { Text("Başvurulanları gizle") },
        )

        Box {
            OutlinedButton(onClick = { stateMenu = true }) {
                Text(state.selectedState?.lowercase()?.replaceFirstChar { it.uppercase() } ?: "Eyalet")
            }
            DropdownMenu(expanded = stateMenu, onDismissRequest = { stateMenu = false }) {
                DropdownMenuItem(
                    text = { Text("Tüm eyaletler") },
                    onClick = {
                        stateMenu = false
                        onFilter(null, state.sort, state.excludeAgricultural, state.emailOnly, state.hideApplied)
                    },
                )
                state.stateFacets.forEach { facet ->
                    DropdownMenuItem(
                        text = { Text("${facet.value.lowercase().replaceFirstChar { it.uppercase() }} (${facet.count})") },
                        onClick = {
                            stateMenu = false
                            onFilter(facet.value, state.sort, state.excludeAgricultural, state.emailOnly, state.hideApplied)
                        },
                    )
                }
            }
        }

        Box {
            OutlinedButton(onClick = { sortMenu = true }) { Text(state.sort.label()) }
            DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                SeasonalJobsApi.Sort.entries.forEach { sort ->
                    DropdownMenuItem(
                        text = { Text(sort.label()) },
                        onClick = {
                            sortMenu = false
                            onFilter(state.selectedState, sort, state.excludeAgricultural, state.emailOnly, state.hideApplied)
                        },
                    )
                }
            }
        }
    }
}

private fun SeasonalJobsApi.Sort.label(): String = when (this) {
    SeasonalJobsApi.Sort.RELEVANCE -> "En uygun"
    SeasonalJobsApi.Sort.NEWEST -> "En yeni"
    SeasonalJobsApi.Sort.WAGE_HIGH -> "Ücret yüksek"
    SeasonalJobsApi.Sort.STARTING_SOON -> "Yakında başlayan"
}

private val ARCHIVE_FORMAT = SimpleDateFormat("dd.MM HH:mm", Locale("tr"))
private val UPDATED_FORMAT = SimpleDateFormat("HH:mm:ss", Locale("tr"))

private fun summaryLine(state: JobsUiState): String = buildString {
    when (state.view) {
        JobsView.ARCHIVE -> append("${state.archived.size} arşivlenmiş ilan")
        JobsView.LIVE -> {
            append("${state.results.size} yeni")
            if (state.total > 0) append(" / ${state.total} eşleşme")
            if (state.offset > 0) append(" · ${state.offset}. kayıttan")
            if (state.duplicatesSkipped > 0) append(" · ${state.duplicatesSkipped} tekrar atlandı")
            if (state.removedStale > 0) append(" · ${state.removedStale} kalkan ilan silindi")
        }
    }
    if (state.selectedCount > 0) append(" · ${state.selectedCount} seçili")
    if (state.lastUpdatedAt > 0) append(" · ${UPDATED_FORMAT.format(Date(state.lastUpdatedAt))}")
}
