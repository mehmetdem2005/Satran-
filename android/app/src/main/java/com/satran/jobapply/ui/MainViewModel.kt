package com.satran.jobapply.ui

import android.app.Application
import android.content.Intent
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.satran.jobapply.SatranApp
import com.satran.jobapply.data.filter.ArchitecturalFilter
import com.satran.jobapply.data.mail.CvFile
import com.satran.jobapply.data.mail.CvLoader
import com.satran.jobapply.data.mail.GmailSender
import com.satran.jobapply.data.mail.MailIntentSender
import com.satran.jobapply.data.memory.MemoryDoc
import com.satran.jobapply.data.memory.SearchEntry
import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.data.model.Job
import com.satran.jobapply.data.pipeline.ApplicationPipeline
import com.satran.jobapply.data.remote.SeasonalJobsApi
import com.satran.jobapply.send.BulkSendWorker
import com.satran.jobapply.send.QueuedMail
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job as CoroutineJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val container = (app as SatranApp).container
    private val workManager = WorkManager.getInstance(app)

    val settings: StateFlow<AppSettings> = container.settingsStore.settings
    val history = container.historyStore.records
    val searchHistory = container.searchHistory.entries
    val memory = container.ragStore.docs

    private val _jobs = MutableStateFlow(JobsUiState())
    val jobs: StateFlow<JobsUiState> = _jobs.asStateFlow()

    private val _apply = MutableStateFlow(ApplyUiState())
    val apply: StateFlow<ApplyUiState> = _apply.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    val sendWork: StateFlow<List<WorkInfo>> = MutableStateFlow<List<WorkInfo>>(emptyList()).also { flow ->
        viewModelScope.launch {
            workManager.getWorkInfosForUniqueWorkFlow(BulkSendWorker.WORK_NAME).collect { flow.value = it }
        }
    }.asStateFlow()

    private var searchJob: CoroutineJob? = null
    private var prepareJob: CoroutineJob? = null

    init {
        viewModelScope.launch {
            container.jobArchive.archive.collect { archive ->
                _jobs.update { it.copy(archived = archive) }
            }
        }
        rememberProfile()
        search(reset = true)
    }

    // ============================================================ arama

    fun onQueryChange(value: String) = _jobs.update { it.copy(query = value) }

    fun setView(view: JobsView) = _jobs.update { it.copy(view = view) }

    fun onFilterChange(
        state: String? = _jobs.value.selectedState,
        visa: String? = _jobs.value.visaClass,
        sort: SeasonalJobsApi.Sort = _jobs.value.sort,
        emailOnly: Boolean = _jobs.value.emailOnly,
        hideArchitectural: Boolean = _jobs.value.hideArchitectural,
        hideApplied: Boolean = _jobs.value.hideApplied,
    ) {
        _jobs.update {
            it.copy(
                selectedState = state,
                visaClass = visa,
                sort = sort,
                emailOnly = emailOnly,
                hideArchitectural = hideArchitectural,
                hideApplied = hideApplied,
            )
        }
        search(reset = true)
    }

    /** Aşağı çekip yenileme ve yenile düğmesi — aynı noktadan taze veri çeker. */
    fun refresh() {
        _jobs.update { it.copy(refreshing = true) }
        search(reset = true)
    }

    /**
     * "Sonraki sayfa": API'de kaldığı yerden devam eder, daha önce görülmüş
     * ilanları atlar. Eski ilanlar silinmez, Geçmiş görünümünde durur.
     */
    fun fetchNextPage() {
        val state = _jobs.value
        if (state.loading || state.loadingMore) return
        search(reset = false, offsetOverride = state.offset + state.fetchedThisSearch)
    }

    fun loadMore() {
        val state = _jobs.value
        if (state.loading || state.loadingMore || state.endReached) return
        search(reset = false, offsetOverride = state.offset + state.fetchedThisSearch, append = true)
    }

    private fun search(reset: Boolean, offsetOverride: Int? = null, append: Boolean = false) {
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            val config = settings.value
            val current = _jobs.value
            val offset = when {
                offsetOverride != null -> offsetOverride
                reset -> 0
                else -> current.offset
            }

            _jobs.update {
                it.copy(
                    loading = reset && !it.refreshing,
                    loadingMore = !reset,
                    error = null,
                    view = JobsView.LIVE,
                )
            }

            val query = SeasonalJobsApi.Query(
                text = current.query,
                state = current.selectedState,
                visaClass = current.visaClass,
                emailOnly = current.emailOnly,
                sort = current.sort,
                offset = offset,
                limit = config.jobsPerSearch,
            )

            runCatching { container.jobsApi.search(query) }
                .onSuccess { page ->
                    // 1. Mimarlık ve "başvuruldu" süzgeçleri.
                    val filtered = applyLocalFilters(page.jobs, current)

                    // 2. Arşive işle; yalnızca daha önce hiç görülmemişleri al.
                    val fresh = container.jobArchive.recordAndFilterNew(filtered, current.query)
                    val shown = if (config.hideSeenJobs) fresh else filtered
                    val skipped = filtered.size - fresh.size

                    _jobs.update { state ->
                        val merged = if (append) {
                            (state.results + shown).distinctBy { it.caseNumber }
                        } else {
                            shown
                        }
                        state.copy(
                            loading = false,
                            loadingMore = false,
                            refreshing = false,
                            results = merged,
                            offset = offset,
                            fetchedThisSearch = page.jobs.size,
                            total = page.totalCount,
                            duplicatesSkipped = if (append) state.duplicatesSkipped + skipped else skipped,
                            lastUpdatedAt = System.currentTimeMillis(),
                            stateFacets = page.stateFacets.ifEmpty { state.stateFacets },
                            endReached = page.jobs.size < query.safeLimit,
                        )
                    }

                    container.searchHistory.add(
                        SearchEntry(
                            query = current.query,
                            state = current.selectedState,
                            sortLabel = current.sort.name,
                            offset = offset,
                            fetched = page.jobs.size,
                            newJobs = fresh.size,
                            totalMatches = page.totalCount,
                        ),
                    )

                    if (shown.isEmpty() && page.jobs.isNotEmpty()) {
                        _message.value = "Bu sayfadaki $skipped ilanı daha önce görmüştün. 'Sonraki sayfa'ya bas."
                    }
                    maybeAiClassify()
                }
                .onFailure { error ->
                    _jobs.update {
                        it.copy(loading = false, loadingMore = false, refreshing = false, error = error.friendly())
                    }
                }
        }
    }

    private fun applyLocalFilters(jobs: List<Job>, state: JobsUiState): List<Job> {
        var out = jobs
        if (state.hideArchitectural) out = ArchitecturalFilter.keepNonArchitectural(out)
        if (state.hideApplied) {
            val applied = container.historyStore.appliedCaseNumbers
            out = out.filterNot { it.caseNumber in applied }
        }
        return out
    }

    private fun maybeAiClassify() {
        val state = _jobs.value
        val config = settings.value
        if (!state.hideArchitectural || !config.aiFilterArchitectural || !config.aiReady) return

        val unchecked = state.results.filter { it.caseNumber !in state.aiChecked }.take(40)
        if (unchecked.isEmpty()) return

        viewModelScope.launch {
            runCatching { container.aiClient().classifyArchitectural(unchecked) }
                .onSuccess { verdicts ->
                    if (verdicts.isEmpty()) return@onSuccess
                    _jobs.update { current ->
                        val architectural = verdicts.filterValues { it }.keys
                        current.copy(
                            results = current.results.filterNot { it.caseNumber in architectural },
                            aiChecked = current.aiChecked + unchecked.map { it.caseNumber },
                            aiRemoved = current.aiRemoved + architectural.size,
                        )
                    }
                }
        }
    }

    fun clearArchive() {
        container.jobArchive.clear()
        _message.value = "İlan arşivi temizlendi; ilanlar yeniden görünecek."
    }

    fun clearSearchHistory() {
        container.searchHistory.clear()
        _message.value = "Arama geçmişi temizlendi."
    }

    fun clearMemory() {
        container.ragStore.clear()
        rememberProfile()
        _message.value = "Yapay zekâ belleği temizlendi."
    }

    /** Profil metni de belleğe girer; mektup yazarken bağlam olur. */
    private fun rememberProfile() {
        val config = settings.value
        if (config.summary.isBlank() && config.fullName.isBlank()) return
        container.ragStore.put(
            MemoryDoc(
                id = "profile:self",
                kind = MemoryDoc.Kind.PROFILE,
                title = "Başvuru profili — ${config.fullName}",
                text = listOfNotNull(
                    config.fullName.takeIf { it.isNotBlank() }?.let { "Ad: $it" },
                    config.nationality.takeIf { it.isNotBlank() }?.let { "Uyruk: $it" },
                    config.phone.takeIf { it.isNotBlank() }?.let { "Telefon: $it" },
                    config.summary.takeIf { it.isNotBlank() },
                ).joinToString("\n"),
            ),
        )
    }

    // ============================================================ seçim

    fun toggleExpanded(caseNumber: String) = _jobs.update {
        val next = if (caseNumber in it.expanded) it.expanded - caseNumber else it.expanded + caseNumber
        it.copy(expanded = next)
    }

    fun toggleSelected(job: Job) = _jobs.update { state ->
        val selected = state.selected.toMutableMap()
        if (selected.remove(job.caseNumber) == null) selected[job.caseNumber] = job
        state.copy(selected = selected)
    }

    fun selectAllVisible() = _jobs.update { state ->
        val selected = state.selected.toMutableMap()
        val source = if (state.view == JobsView.LIVE) state.results else state.archived.map { it.job }
        source.filter { it.canEmail }.forEach { selected[it.caseNumber] = it }
        state.copy(selected = selected)
    }

    fun clearSelection() = _jobs.update { it.copy(selected = emptyMap()) }

    fun removeFromSelection(caseNumber: String) = _jobs.update {
        it.copy(selected = it.selected - caseNumber)
    }

    // ============================================================ yapay zekâ

    /** İlan açıklamasını Türkçeye çevirip özetler. Kartı da açar. */
    fun summarize(job: Job) {
        if (!settings.value.aiReady) {
            _message.value = "Önce Ayarlar'dan yapay zekâ API anahtarını gir."
            return
        }
        _jobs.update { it.copy(expanded = it.expanded + job.caseNumber) }
        if (job.caseNumber in _jobs.value.summarizing) return
        if (_jobs.value.summaries.containsKey(job.caseNumber)) return

        viewModelScope.launch {
            _jobs.update { it.copy(summarizing = it.summarizing + job.caseNumber) }
            runCatching { container.aiClient().summarizeInTurkish(job) }
                .onSuccess { summary ->
                    _jobs.update {
                        it.copy(
                            summaries = it.summaries + (job.caseNumber to summary),
                            summarizing = it.summarizing - job.caseNumber,
                        )
                    }
                }
                .onFailure { error ->
                    _jobs.update { it.copy(summarizing = it.summarizing - job.caseNumber) }
                    _message.value = error.friendly()
                }
        }
    }

    /** İşvereni internetten araştırır: sorguyu model yazar, aramayı API yapar. */
    fun research(job: Job) {
        val config = settings.value
        if (!config.searchReady) {
            _message.value = "${config.searchProvider.label} için arama API anahtarı gerekli (Ayarlar > İnternet araması)."
            return
        }
        _jobs.update { it.copy(expanded = it.expanded + job.caseNumber) }
        if (job.caseNumber in _jobs.value.researching) return

        viewModelScope.launch {
            _jobs.update { it.copy(researching = it.researching + job.caseNumber) }
            runCatching {
                val client = container.searchClient()
                val query = if (config.aiReady) {
                    runCatching { container.aiClient().buildEmployerQuery(job) }.getOrNull()
                } else {
                    null
                } ?: "${job.employer} ${job.location} employer reviews"

                val results = client.search(query, config.searchResultsPerJob)
                val text = when {
                    results.isEmpty() -> "\"$query\" için sonuç bulunamadı."
                    config.aiReady -> container.aiClient().summarizeResearch(job, results)
                    else -> results.joinToString("\n\n") { "• ${it.title}\n${it.url}\n${it.snippet}" }
                }
                container.ragStore.put(
                    MemoryDoc(
                        id = "research:${job.caseNumber}",
                        kind = MemoryDoc.Kind.RESEARCH,
                        title = "${job.employer} araştırması",
                        text = text,
                    ),
                )
                text
            }
                .onSuccess { text ->
                    _jobs.update {
                        it.copy(
                            research = it.research + (job.caseNumber to text),
                            researching = it.researching - job.caseNumber,
                        )
                    }
                }
                .onFailure { error ->
                    _jobs.update { it.copy(researching = it.researching - job.caseNumber) }
                    _message.value = error.friendly()
                }
        }
    }

    fun aiSearch(naturalRequest: String) {
        if (!settings.value.aiReady) {
            _message.value = "Önce Ayarlar'dan yapay zekâ API anahtarını gir."
            return
        }
        viewModelScope.launch {
            _jobs.update { it.copy(loading = true) }
            runCatching { container.aiClient().buildSearchQuery(naturalRequest) }
                .onSuccess { query ->
                    _jobs.update { it.copy(query = query) }
                    search(reset = true)
                }
                .onFailure { error ->
                    _jobs.update { it.copy(loading = false) }
                    _message.value = error.friendly()
                }
        }
    }

    // ============================================================ ayarlar

    fun updateSettings(transform: (AppSettings) -> AppSettings) {
        container.settingsStore.update(transform)
        rememberProfile()
    }

    fun onCvPicked(uriString: String, fileName: String) {
        updateSettings { it.copy(cvUri = uriString, cvFileName = fileName) }
        _message.value = "CV seçildi: $fileName"
    }

    /** Sağlayıcının bütün modellerini çeker; yeni sürümler listede kendiliğinden çıkar. */
    fun loadModels() {
        viewModelScope.launch {
            _apply.update { it.copy(loadingModels = true) }
            runCatching { container.aiClient().listModels() }
                .onSuccess { models ->
                    if (models.isEmpty()) {
                        _message.value = "Sağlayıcı boş model listesi döndürdü."
                    } else {
                        updateSettings { it.copy(discoveredModels = models) }
                        _message.value = "${models.size} model bulundu: ${models.take(4).joinToString(", ")}…"
                    }
                }
                .onFailure { _message.value = it.friendly() }
            _apply.update { it.copy(loadingModels = false) }
        }
    }

    fun testAi() {
        viewModelScope.launch {
            _apply.update { it.copy(testing = true) }
            runCatching { container.aiClient().ping() }
                .onSuccess { _message.value = "Yapay zekâ çalışıyor ✓ (${settings.value.effectiveModel})" }
                .onFailure { _message.value = it.friendly() }
            _apply.update { it.copy(testing = false) }
        }
    }

    fun testSmtp() {
        viewModelScope.launch {
            _apply.update { it.copy(testing = true) }
            runCatching {
                withContext(Dispatchers.IO) { GmailSender(settings.value).use { it.connect() } }
            }
                .onSuccess { _message.value = "Gmail bağlantısı çalışıyor ✓" }
                .onFailure { _message.value = it.friendly() }
            _apply.update { it.copy(testing = false) }
        }
    }

    /** Arama API'sini gerçekten çağırıp kaç sonuç döndüğünü söyler. */
    fun testSearch() {
        viewModelScope.launch {
            _apply.update { it.copy(testing = true) }
            runCatching { container.searchClient().search("H-2A seasonal farm work employer reviews", 5) }
                .onSuccess { results ->
                    _message.value = if (results.isEmpty()) {
                        "${settings.value.searchProvider.label} bağlandı ama sonuç dönmedi."
                    } else {
                        "Arama çalışıyor ✓ ${results.size} sonuç — ilki: ${results.first().title.take(60)}"
                    }
                }
                .onFailure { _message.value = it.friendly() }
            _apply.update { it.copy(testing = false) }
        }
    }

    /** Canlı kaynak kanıtı: gerçekten ağa çıkıp ham yanıtı gösterir. */
    fun verifySource() {
        viewModelScope.launch {
            _apply.update { it.copy(verifying = true, sourceProof = null) }
            runCatching { container.jobsApi.verifySource() }
                .onSuccess { proof ->
                    _apply.update { it.copy(sourceProof = proof) }
                    _message.value = "Canlı kaynak yanıt verdi ✓ ${proof.totalActive} aktif ilan"
                }
                .onFailure { _message.value = it.friendly() }
            _apply.update { it.copy(verifying = false) }
        }
    }

    fun clearHistory() {
        container.historyStore.clear()
        _message.value = "Gönderim geçmişi temizlendi."
    }

    // ============================================================ hazırlık ve gönderim

    /** Seçili ilanlar için zinciri çalıştırır: sorgu → arama → brifing → bellek → mektup. */
    fun prepare(onlyCase: String? = null) {
        val selected = selectedJobs().let { list ->
            if (onlyCase != null) list.filter { it.caseNumber == onlyCase } else list
        }
        if (selected.isEmpty()) {
            _message.value = "Önce ilan seç."
            return
        }
        if (settings.value.fullName.isBlank()) {
            _message.value = "Ayarlar'dan adını soyadını gir; mektupta imza olarak kullanılıyor."
        }

        prepareJob?.cancel()
        prepareJob = viewModelScope.launch {
            _apply.update { it.copy(preparing = true, prepared = emptyList(), notes = emptyList(), progress = null) }

            val pipeline = container.pipeline()
            val prepared = mutableListOf<QueuedMail>()
            val notes = mutableListOf<String>()

            selected.forEachIndexed { index, job ->
                if (job.email == null) {
                    notes += "${job.employer}: e-posta adresi yok, atlandı"
                    return@forEachIndexed
                }

                val outcome = runCatching {
                    pipeline.run(job) { step ->
                        _apply.update {
                            it.copy(
                                progress = PrepareProgress(
                                    caseNumber = job.caseNumber,
                                    employer = job.employer,
                                    stepLabel = step.label,
                                    index = index + 1,
                                    total = selected.size,
                                ),
                            )
                        }
                    }
                }

                outcome
                    .onSuccess { result ->
                        prepared += result.mail
                        val detail = buildList {
                            if (result.searchHits > 0) add("${result.searchHits} web sonucu")
                            if (result.memoryHits > 0) add("${result.memoryHits} bellek parçası")
                            result.warning?.let { add(it) }
                        }
                        if (detail.isNotEmpty()) notes += "${job.employer}: ${detail.joinToString(" · ")}"
                        _apply.update { it.copy(prepared = prepared.toList(), notes = notes.toList()) }
                    }
                    .onFailure { error ->
                        notes += "${job.employer}: ${error.message ?: "hazırlanamadı"}"
                        _apply.update { it.copy(notes = notes.toList()) }
                    }
            }

            _apply.update {
                it.copy(
                    preparing = false,
                    progress = null,
                    prepared = prepared.toList(),
                    notes = if (prepared.isEmpty()) notes + "Gönderilecek ileti kalmadı." else notes,
                )
            }
        }
    }

    fun cancelPrepare() {
        prepareJob?.cancel()
        _apply.update { it.copy(preparing = false, progress = null) }
        _message.value = "Hazırlık durduruldu."
    }

    fun editPrepared(caseNumber: String, subject: String, body: String) = _apply.update { state ->
        state.copy(
            prepared = state.prepared.map {
                if (it.caseNumber == caseNumber) it.copy(subject = subject, body = body) else it
            },
        )
    }

    fun dropPrepared(caseNumber: String) = _apply.update { state ->
        state.copy(prepared = state.prepared.filterNot { it.caseNumber == caseNumber })
    }

    fun sendAll() {
        val mails = _apply.value.prepared
        if (mails.isEmpty()) {
            _message.value = "Önce 'Hazırla' butonuna bas."
            return
        }
        val config = settings.value
        if (!config.smtpReady) {
            _message.value = "Ayarlar'dan Gmail adresini ve uygulama şifreni gir."
            return
        }

        container.sendQueueStore.write(mails)
        val request = OneTimeWorkRequestBuilder<BulkSendWorker>().build()
        workManager.enqueueUniqueWork(BulkSendWorker.WORK_NAME, ExistingWorkPolicy.REPLACE, request)
        _message.value = "${mails.size} başvuru kuyruğa alındı."
    }

    fun openInGmail(mail: QueuedMail) {
        viewModelScope.launch {
            val config = settings.value
            val cv: CvFile? = config.cvUri.takeIf { it.isNotBlank() }?.let { uri ->
                withContext(Dispatchers.IO) { runCatching { CvLoader.load(getApplication(), uri) }.getOrNull() }
            }
            if (config.cvUri.isNotBlank() && cv == null) {
                _message.value = "CV okunamadı, ileti eksiz açılıyor."
            }
            val intent: Intent = MailIntentSender.buildIntent(
                context = getApplication(),
                to = mail.to,
                subject = mail.subject,
                body = mail.body,
                cv = cv,
            )
            runCatching { MailIntentSender.open(getApplication(), intent) }
                .onFailure { _message.value = "E-posta uygulaması açılamadı: ${it.message}" }
        }
    }

    fun selectedJobs(): List<Job> = _jobs.value.selected.values.toList()

    fun consumeMessage() {
        _message.value = null
    }

    fun showMessage(text: String) {
        _message.value = text
    }
}

private fun Throwable.friendly(): String = when (this) {
    is java.net.UnknownHostException ->
        "api.seasonaljobs.dol.gov adresine ulaşılamadı — internet bağlantın yok. " +
            "İlanlar canlı çekildiği için bağlantı olmadan liste boş kalır."
    is java.net.SocketTimeoutException -> "Sunucu zamanında yanıt vermedi, tekrar dene."
    is java.net.ConnectException -> "Sunucuya bağlanılamadı. Bağlantını kontrol et."
    else -> message ?: this::class.java.simpleName
}
