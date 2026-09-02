package com.satran.jobapply.ui.jobs

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Clear
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.satran.jobapply.data.model.Job
import com.satran.jobapply.data.remote.SeasonalJobsApi
import com.satran.jobapply.ui.JobsUiState
import com.satran.jobapply.ui.JobsView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * İlan listesi.
 *
 * Başlık alanı bilerek dar tutuldu: arama kutusu, tek satır kayan süzgeç şeridi
 * ve tek bir özet satırı. Seyrek kullanılan eylemler (tümünü çek, arşivi tazele,
 * sorguyu göster) sağ üstteki ⋮ menüsünde durur; böylece ekranın büyük kısmı
 * ilanlara kalır.
 */
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

    val visible: List<Pair<Job, String?>> = when (state.view) {
        JobsView.LIVE -> state.results.map { (state.details[it.caseNumber] ?: it) to null }
        JobsView.ARCHIVE -> state.archived.map {
            (state.details[it.job.caseNumber] ?: it.job) to ARCHIVE_FORMAT.format(Date(it.lastSeenAt))
        }
    }

    Column(Modifier.fillMaxSize()) {

        // ---------------------------------------------------------- başlık
        Column(Modifier.padding(horizontal = 12.dp)) {
            OutlinedTextField(
                value = state.query,
                onValueChange = onQueryChange,
                placeholder = { Text("İş, işveren, şehir ara") },
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
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp),
            )

            Spacer(Modifier.height(6.dp))

            // Süzgeçler tek satırda kalır ve yana kayar; alt alta binip yer yemez.
            FilterStrip(state = state, onFilter = onFilter)

            Spacer(Modifier.height(2.dp))
            SummaryRow(
                state = state,
                onViewChange = onViewChange,
                onSelectAll = onSelectAll,
                onClearSelection = onClearSelection,
                onFetchAll = onFetchAll,
                onRefresh = onRefresh,
                onRefreshArchive = onRefreshArchive,
                onToggleQueryPanel = onToggleQueryPanel,
            )
        }

        if (state.showQueryPanel && state.sentFilter.isNotEmpty()) {
            QueryPanel(state, Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
        }

        if (state.bulkFetching) {
            Column(Modifier.padding(horizontal = 12.dp)) {
                Text(
                    "${state.bulkFetched} / ${state.bulkTotal} ilan çekiliyor",
                    style = MaterialTheme.typography.labelSmall,
                )
                LinearProgressIndicator(
                    progress = { if (state.bulkTotal == 0) 0f else state.bulkFetched.toFloat() / state.bulkTotal },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())

        HorizontalDivider()

        // ---------------------------------------------------------- içerik
        state.error?.let { error ->
            Column(Modifier.padding(16.dp)) {
                Text(error, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(8.dp))
                Button(onClick = onSearch) { Text("Tekrar dene") }
            }
        }

        PullToRefreshBox(
            isRefreshing = state.refreshing,
            onRefresh = onRefresh,
            modifier = Modifier
                .fillMaxSize()
                .weight(1f),
        ) {
            if (!state.loading && state.error == null && visible.isEmpty()) {
                EmptyState(state, onNextPage)
            }

            LazyColumn(
                state = listState,
                contentPadding = PaddingValues(
                    start = 12.dp,
                    end = 12.dp,
                    top = 8.dp,
                    bottom = contentPadding.calculateBottomPadding() + 88.dp,
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

                // Sonsuz kaydırma yerine açık düğme: iki yol aynı sayacı
                // itmediği için sayfa atlama ve kilitlenme olmuyor.
                if (state.view == JobsView.LIVE && visible.isNotEmpty()) {
                    item {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            when {
                                state.loadingMore -> CircularProgressIndicator()
                                state.endReached -> Text(
                                    "Bu süzgeçte son ilan.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.outline,
                                )
                                else -> OutlinedButton(onClick = onLoadMore) { Text("Daha fazla yükle") }
                            }
                        }
                    }
                }
            }
        }

        // ---------------------------------------------------------- alt eylem
        if (state.view == JobsView.LIVE) {
            Surface(tonalElevation = 3.dp) {
                Button(
                    onClick = onNextPage,
                    enabled = !state.isBusy && !state.endReached,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Text(if (state.endReached) "Son sayfadasın" else "Sonraki sayfa →")
                }
            }
        }
    }
}

@Composable
private fun FilterStrip(
    state: JobsUiState,
    onFilter: (String?, SeasonalJobsApi.Sort, Boolean, Boolean, Boolean) -> Unit,
) {
    var stateMenu by remember { mutableStateOf(false) }
    var sortMenu by remember { mutableStateOf(false) }

    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        item {
            FilterChip(
                selected = state.excludeAgricultural,
                onClick = {
                    onFilter(state.selectedState, state.sort, !state.excludeAgricultural, state.emailOnly, state.hideApplied)
                },
                label = { Text("Tarım dışı") },
            )
        }
        item {
            FilterChip(
                selected = state.emailOnly,
                onClick = {
                    onFilter(state.selectedState, state.sort, state.excludeAgricultural, !state.emailOnly, state.hideApplied)
                },
                label = { Text("E-postalı") },
            )
        }
        item {
            FilterChip(
                selected = state.hideApplied,
                onClick = {
                    onFilter(state.selectedState, state.sort, state.excludeAgricultural, state.emailOnly, !state.hideApplied)
                },
                label = { Text("Başvurulanı gizle") },
            )
        }
        item {
            Box {
                FilterChip(
                    selected = state.selectedState != null,
                    onClick = { stateMenu = true },
                    label = { Text(state.selectedState?.titleCase() ?: "Eyalet") },
                )
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
                            text = { Text("${facet.value.titleCase()} (${facet.count})") },
                            onClick = {
                                stateMenu = false
                                onFilter(facet.value, state.sort, state.excludeAgricultural, state.emailOnly, state.hideApplied)
                            },
                        )
                    }
                }
            }
        }
        item {
            Box {
                FilterChip(
                    selected = false,
                    onClick = { sortMenu = true },
                    label = { Text(state.sort.label()) },
                )
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
}

@Composable
private fun SummaryRow(
    state: JobsUiState,
    onViewChange: (JobsView) -> Unit,
    onSelectAll: () -> Unit,
    onClearSelection: () -> Unit,
    onFetchAll: () -> Unit,
    onRefresh: () -> Unit,
    onRefreshArchive: () -> Unit,
    onToggleQueryPanel: () -> Unit,
) {
    var menu by remember { mutableStateOf(false) }

    Row(verticalAlignment = Alignment.CenterVertically) {
        SingleChoiceSegmentedButtonRow(Modifier.weight(1f)) {
            JobsView.entries.forEachIndexed { index, view ->
                SegmentedButton(
                    selected = state.view == view,
                    onClick = { onViewChange(view) },
                    shape = SegmentedButtonDefaults.itemShape(index, JobsView.entries.size),
                ) {
                    Text(
                        when (view) {
                            JobsView.LIVE -> "Yeni ${state.results.size}"
                            JobsView.ARCHIVE -> "Geçmiş ${state.archived.size}"
                        },
                        style = MaterialTheme.typography.labelMedium,
                    )
                }
            }
        }

        Box {
            IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "Daha fazla") }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(
                    text = { Text("Tümünü seç") },
                    onClick = { menu = false; onSelectAll() },
                )
                if (state.selectedCount > 0) {
                    DropdownMenuItem(
                        text = { Text("Seçimi bırak (${state.selectedCount})") },
                        onClick = { menu = false; onClearSelection() },
                    )
                }
                DropdownMenuItem(
                    text = { Text("Yenile") },
                    onClick = { menu = false; onRefresh() },
                )
                DropdownMenuItem(
                    text = { Text("Tümünü çek (~${state.total})") },
                    onClick = { menu = false; onFetchAll() },
                )
                DropdownMenuItem(
                    text = { Text("Arşivi tazele") },
                    onClick = { menu = false; onRefreshArchive() },
                )
                DropdownMenuItem(
                    text = { Text(if (state.showQueryPanel) "Sorguyu gizle" else "Giden sorguyu göster") },
                    onClick = { menu = false; onToggleQueryPanel() },
                )
            }
        }
    }

    Text(
        text = summaryLine(state),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.outline,
        modifier = Modifier.padding(bottom = 4.dp),
    )
}

@Composable
private fun QueryPanel(state: JobsUiState, modifier: Modifier = Modifier) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.small,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(10.dp)) {
            Text("POST api.seasonaljobs.dol.gov/datahub/search", style = MaterialTheme.typography.labelSmall)
            Spacer(Modifier.height(4.dp))
            Text("search: ${state.sentSearch}", style = MaterialTheme.typography.bodySmall)
            Text("filter: ${state.sentFilter}", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(4.dp))
            Text(
                "Süzgeçler bu ifadeye dönüşüp sunucuda çalışır. Tek istisna " +
                    "\"Başvurulanı gizle\" — gönderim geçmişi cihazda tutulur.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.outline,
            )
        }
    }
}

@Composable
private fun EmptyState(state: JobsUiState, onNextPage: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp),
        ) {
            Text(
                when {
                    state.view == JobsView.ARCHIVE -> "Arşiv boş. Arama yaptıkça ilanlar buraya birikir."
                    state.endReached -> "Bu süzgeçte gösterilecek yeni ilan kalmadı."
                    state.duplicatesSkipped > 0 -> "Bu sayfadaki ilanları daha önce görmüştün."
                    else -> "Sonuç yok. Aramayı ya da süzgeçleri değiştir."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.outline,
            )
            if (state.view == JobsView.LIVE && !state.endReached && state.duplicatesSkipped > 0) {
                Spacer(Modifier.height(12.dp))
                Button(onClick = onNextPage) { Text("Sonraki sayfa →") }
            }
        }
    }
}

private fun String.titleCase(): String = lowercase().replaceFirstChar { it.uppercase() }

private fun SeasonalJobsApi.Sort.label(): String = when (this) {
    SeasonalJobsApi.Sort.RELEVANCE -> "En uygun"
    SeasonalJobsApi.Sort.NEWEST -> "En yeni"
    SeasonalJobsApi.Sort.WAGE_HIGH -> "Ücret ↓"
    SeasonalJobsApi.Sort.STARTING_SOON -> "Yakında"
}

private val ARCHIVE_FORMAT = SimpleDateFormat("dd.MM", Locale("tr"))
private val UPDATED_FORMAT = SimpleDateFormat("HH:mm", Locale("tr"))

private fun summaryLine(state: JobsUiState): String = buildString {
    when (state.view) {
        JobsView.ARCHIVE -> append("${state.archived.size} arşivlenmiş ilan")
        JobsView.LIVE -> {
            if (state.total > 0) append("${state.total} eşleşme")
            if (state.offset > 0) append(" · ${state.offset}. kayıttan")
            if (state.duplicatesSkipped > 0) append(" · ${state.duplicatesSkipped} tekrar atlandı")
        }
    }
    if (state.selectedCount > 0) append(" · ${state.selectedCount} seçili")
    if (state.removedStale > 0) append(" · ${state.removedStale} kalkan silindi")
    if (state.lastUpdatedAt > 0) append(" · ${UPDATED_FORMAT.format(Date(state.lastUpdatedAt))}")
}
