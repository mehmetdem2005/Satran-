package com.satran.jobapply

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.WorkOutline
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.satran.jobapply.data.mail.CvLoader
import com.satran.jobapply.ui.MainViewModel
import com.satran.jobapply.ui.apply.ApplyScreen
import com.satran.jobapply.ui.jobs.JobsScreen
import com.satran.jobapply.ui.settings.SettingsScreen
import com.satran.jobapply.ui.theme.SatranTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SatranTheme {
                AppRoot()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppRoot() {
    val viewModel: MainViewModel = viewModel()
    val context = androidx.compose.ui.platform.LocalContext.current

    val jobsState by viewModel.jobs.collectAsState()
    val applyState by viewModel.apply.collectAsState()
    val settings by viewModel.settings.collectAsState()
    val history by viewModel.history.collectAsState()
    val workInfos by viewModel.sendWork.collectAsState()
    val message by viewModel.message.collectAsState()

    var tab by rememberSaveable { mutableIntStateOf(0) }
    val snackbarHostState = remember { SnackbarHostState() }

    // PDF CV seçici — okuma izni kalıcı olarak saklanır.
    val cvPicker = androidx.activity.compose.rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        runCatching {
            context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val name = CvLoader.queryName(context, uri) ?: "cv.pdf"
        viewModel.onCvPicked(uri.toString(), name)
    }

    val notificationPermission = androidx.activity.compose.rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    LaunchedEffect(message) {
        message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }

    val openUrl: (String) -> Unit = { url ->
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        }.onFailure { viewModel.showMessage("Tarayıcı açılamadı.") }
    }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text(TAB_TITLES[tab]) })
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = tab == 0,
                    onClick = { tab = 0 },
                    icon = { Icon(Icons.Outlined.WorkOutline, null) },
                    label = { Text("İlanlar") },
                )
                NavigationBarItem(
                    selected = tab == 1,
                    onClick = { tab = 1 },
                    icon = {
                        BadgedBox(badge = {
                            if (jobsState.selectedCount > 0) Badge { Text("${jobsState.selectedCount}") }
                        }) { Icon(Icons.AutoMirrored.Outlined.Send, null) }
                    },
                    label = { Text("Başvuru") },
                )
                NavigationBarItem(
                    selected = tab == 2,
                    onClick = { tab = 2 },
                    icon = { Icon(Icons.Filled.Settings, null) },
                    label = { Text("Ayarlar") },
                )
            }
        },
    ) { padding ->
        androidx.compose.foundation.layout.Box(Modifier.padding(top = padding.calculateTopPadding())) {
            when (tab) {
                0 -> JobsScreen(
                    state = jobsState,
                    onQueryChange = viewModel::onQueryChange,
                    onSearch = viewModel::refresh,
                    onAiSearch = viewModel::aiSearch,
                    onFilter = { state, sort, hideArch, emailOnly, hideApplied ->
                        viewModel.onFilterChange(
                            state = state,
                            sort = sort,
                            hideArchitectural = hideArch,
                            emailOnly = emailOnly,
                            hideApplied = hideApplied,
                        )
                    },
                    onToggleSelect = viewModel::toggleSelected,
                    onToggleExpand = viewModel::toggleExpanded,
                    onSummarize = viewModel::summarize,
                    onResearch = viewModel::research,
                    onOpenDetail = openUrl,
                    onSelectAll = viewModel::selectAllVisible,
                    onClearSelection = viewModel::clearSelection,
                    onLoadMore = viewModel::loadMore,
                    contentPadding = padding,
                )

                1 -> ApplyScreen(
                    selectedJobs = jobsState.selected.values.toList(),
                    state = applyState,
                    settings = settings,
                    workInfos = workInfos,
                    onPrepare = { viewModel.prepare() },
                    onPrepareOne = { viewModel.prepare(onlyCase = it) },
                    onEdit = viewModel::editPrepared,
                    onDrop = viewModel::dropPrepared,
                    onRemoveSelection = viewModel::removeFromSelection,
                    onSendAll = viewModel::sendAll,
                    onOpenInGmail = viewModel::openInGmail,
                    onPickCv = { cvPicker.launch(arrayOf("application/pdf")) },
                    contentPadding = padding,
                )

                else -> SettingsScreen(
                    settings = settings,
                    history = history,
                    testing = applyState.testing,
                    onUpdate = viewModel::updateSettings,
                    onPickCv = { cvPicker.launch(arrayOf("application/pdf")) },
                    onTestSmtp = viewModel::testSmtp,
                    onTestAi = viewModel::testAi,
                    onClearHistory = viewModel::clearHistory,
                    onOpenUrl = openUrl,
                    contentPadding = padding,
                )
            }
        }
    }
}

private val TAB_TITLES = listOf("Mevsimlik iş ilanları", "Başvuru gönder", "Ayarlar")
