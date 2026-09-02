package com.satran.jobapply.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.satran.jobapply.SatranApp
import com.satran.jobapply.data.filter.JobQuery
import com.satran.jobapply.data.mail.CvFile
import com.satran.jobapply.data.mail.CvLoader
import com.satran.jobapply.data.mail.GmailSender
import com.satran.jobapply.data.mail.MailIntentSender
import com.satran.jobapply.data.memory.MemoryDoc
import com.satran.jobapply.data.memory.SearchEntry
import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.data.model.Job
import com.satran.jobapply.data.model.SendRecord
import com.satran.jobapply.data.model.SendStatus
import com.satran.jobapply.data.pipeline.ApplicationPipeline
import com.satran.jobapply.data.remote.SeasonalJobsApi
import com.satran.jobapply.send.BulkSendWorker
import com.satran.jobapply.send.QueuedMail
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job as CoroutineJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
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

    private companion object {
        /** Arşiv tazelik denetiminin en sık çalışma aralığı. */
        const val ARCHIVE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000L

        /** Tamamı görülmüş sayfalarda en fazla kaç kez ileri atlanacağı. */
        const val MAX_EMPTY_PAGE_SKIPS = 6
    }

    init {
        viewModelScope.launch {
            container.jobArchive.archive.collect { archive ->
                _jobs.update { it.copy(archived = archive) }
            }
        }
        rememberProfile()
        search(reset = true)
        maybeAutoRefreshArchive()
        refreshGmailAvailability()
    }

    /**
     * Açılışta arşivi siteyle sessizce karşılaştırır: yayından kalkmış ilanlar
     * Geçmiş görünümünden de düşer. Her açılışta ağ yakmamak için altı saatte
     * bir çalışır; kullanıcı istediğinde düğmeyle hemen tetikleyebilir.
     */
    private fun maybeAutoRefreshArchive() {
        val config = settings.value
        if (!config.autoRefreshArchive) return
        val age = System.currentTimeMillis() - config.lastArchiveCheckAt
        if (age < ARCHIVE_CHECK_INTERVAL_MS) return
        refreshArchive(silent = true)
    }

    // ============================================================ arama

    fun onQueryChange(value: String) = _jobs.update { it.copy(query = value) }

    fun setView(view: JobsView) = _jobs.update { it.copy(view = view) }

    fun onFilterChange(
        state: String? = _jobs.value.selectedState,
        visa: String? = _jobs.value.visaClass,
        sort: SeasonalJobsApi.Sort = _jobs.value.sort,
        emailOnly: Boolean = _jobs.value.emailOnly,
        excludeAgricultural: Boolean = _jobs.value.excludeAgricultural,
        hideApplied: Boolean = _jobs.value.hideApplied,
    ) {
        _jobs.update {
            it.copy(
                selectedState = state,
                visaClass = visa,
                sort = sort,
                emailOnly = emailOnly,
                excludeAgricultural = excludeAgricultural,
                hideApplied = hideApplied,
            )
        }
        search(reset = true)
    }

    fun toggleQueryPanel() = _jobs.update { it.copy(showQueryPanel = !it.showQueryPanel) }

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
        if (state.isBusy) return
        if (state.endReached) {
            _message.value = "Bu süzgeçte son sayfadasın. Süzgeci değiştir ya da Yenile'ye bas."
            return
        }
        search(reset = false, offsetOverride = state.nextOffset)
    }

    /** Liste sonundaki "Daha fazla yükle" — mevcut listeye ekler. */
    fun loadMore() {
        val state = _jobs.value
        if (state.isBusy || state.endReached) return
        search(reset = false, offsetOverride = state.nextOffset, append = true)
    }

    private fun search(reset: Boolean, offsetOverride: Int? = null, append: Boolean = false) {
        // Yeni bir arama (reset) çalışan işi devirebilir; sayfalama devremez,
        // yoksa iptal edilen iş loadingMore'u açık bırakıp sayfalamayı kilitler.
        if (!reset && searchJob?.isActive == true) return
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
                input = queryInput(current, config),
                sort = current.sort,
                offset = offset,
                limit = config.jobsPerSearch,
            )

            // Bir sayfadaki ilanların tamamı zaten görülmüşse ekran boş kalmasın:
            // yeni ilan çıkana kadar sonraki sayfalara geç.
            var attemptOffset = offset
            var attempts = 0
            var lastError: Throwable? = null

            while (attempts < MAX_EMPTY_PAGE_SKIPS) {
                attempts++
                val attemptQuery = query.copy(offset = attemptOffset)
                val result = runCatching { container.jobsApi.search(attemptQuery) }
                if (result.isFailure) {
                    lastError = result.exceptionOrNull()
                    break
                }
                val page = result.getOrThrow()

                val filtered = applyLocalFilters(page.jobs, current)
                val fresh = container.jobArchive.recordAndFilterNew(filtered, current.query)
                val shown = if (config.hideSeenJobs) fresh else filtered
                val skipped = filtered.size - fresh.size
                val exhausted = page.jobs.size < attemptQuery.safeLimit

                container.searchHistory.add(
                    SearchEntry(
                        query = current.query,
                        state = current.selectedState,
                        sortLabel = current.sort.name,
                        offset = attemptOffset,
                        fetched = page.jobs.size,
                        newJobs = fresh.size,
                        totalMatches = page.totalCount,
                    ),
                )

                val shouldSkip = shown.isEmpty() && !exhausted && page.jobs.isNotEmpty() && !append
                if (shouldSkip) {
                    attemptOffset += page.jobs.size
                    continue
                }

                val landedOffset = attemptOffset
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
                        offset = landedOffset,
                        fetchedThisSearch = page.jobs.size,
                        total = page.totalCount,
                        duplicatesSkipped = if (append) state.duplicatesSkipped + skipped else skipped,
                        lastUpdatedAt = System.currentTimeMillis(),
                        stateFacets = page.stateFacets.ifEmpty { state.stateFacets },
                        sentFilter = page.sentFilter,
                        sentSearch = page.sentSearch,
                        endReached = exhausted,
                    )
                }

                if (shown.isEmpty()) {
                    _message.value = if (exhausted) {
                        "Bu süzgeçte gösterilecek yeni ilan kalmadı."
                    } else {
                        "Bu sayfadaki ilanların hepsini daha önce görmüştün."
                    }
                }
                lastError = null
                break
            }

            lastError?.let { error ->
                _jobs.update {
                    it.copy(loading = false, loadingMore = false, refreshing = false, error = error.friendly())
                }
            }
            if (lastError == null && attempts >= MAX_EMPTY_PAGE_SKIPS) {
                _jobs.update { it.copy(loading = false, loadingMore = false, refreshing = false) }
            }
        }
    }

    /** UI durumunu + ayarları sunucuya gidecek gerçek sorgu girdisine çevirir. */
    private fun queryInput(state: JobsUiState, config: AppSettings) = JobQuery.Input(
        text = state.query,
        state = state.selectedState,
        visaClass = state.visaClass,
        emailOnly = state.emailOnly,
        excludeAgricultural = state.excludeAgricultural,
        blockedWords = config.blockedWordList,
        requiredWords = config.requiredWordList,
    )

    /**
     * Sunucuda ifade edilemeyen tek süzgeç: "zaten başvurduklarımı gizle".
     * Gönderim geçmişi cihazda tutulduğu için bu istemcide uygulanır.
     */
    private fun applyLocalFilters(jobs: List<Job>, state: JobsUiState): List<Job> {
        if (!state.hideApplied) return jobs
        val applied = container.historyStore.appliedCaseNumbers
        return jobs.filterNot { it.caseNumber in applied }
    }

    /**
     * Süzgeçlere uyan **bütün** ilanları çeker (~8000, 1000'lik turlar hâlinde).
     * Uzun metinler alınmaz; açıklama kart açılınca ayrıca getirilir.
     */
    fun fetchAllJobs() {
        val current = _jobs.value
        if (current.bulkFetching) return
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            val config = settings.value
            _jobs.update {
                it.copy(bulkFetching = true, bulkFetched = 0, bulkTotal = 0, error = null, view = JobsView.LIVE)
            }

            runCatching {
                container.jobsApi.fetchAll(
                    input = queryInput(current, config),
                    sort = current.sort,
                ) { fetched, total ->
                    _jobs.update { it.copy(bulkFetched = fetched, bulkTotal = total) }
                }
            }
                .onSuccess { page ->
                    val filtered = applyLocalFilters(page.jobs, current)
                    val fresh = container.jobArchive.recordAndFilterNew(filtered, current.query)
                    val shown = if (config.hideSeenJobs) fresh else filtered

                    _jobs.update { state ->
                        state.copy(
                            bulkFetching = false,
                            loading = false,
                            results = shown,
                            offset = 0,
                            fetchedThisSearch = page.jobs.size,
                            total = page.totalCount,
                            duplicatesSkipped = filtered.size - fresh.size,
                            lastUpdatedAt = System.currentTimeMillis(),
                            stateFacets = page.stateFacets.ifEmpty { state.stateFacets },
                            sentFilter = page.sentFilter,
                            sentSearch = page.sentSearch,
                            endReached = true,
                        )
                    }
                    container.searchHistory.add(
                        SearchEntry(
                            query = current.query,
                            state = current.selectedState,
                            sortLabel = "TÜMÜ",
                            offset = 0,
                            fetched = page.jobs.size,
                            newJobs = fresh.size,
                            totalMatches = page.totalCount,
                        ),
                    )
                    _message.value = "${page.jobs.size} ilan çekildi (${page.totalCount} eşleşmeden), ${fresh.size} tanesi yeni."
                }
                .onFailure { error ->
                    _jobs.update { it.copy(bulkFetching = false, error = error.friendly()) }
                }
        }
    }

    /**
     * Arşivi siteyle karşılaştırır: yayından kalkmış ilanları siler.
     * "Sitede bir ilan kalkarsa uygulamadan da kalksın" bunu sağlar.
     */
    fun refreshArchive(silent: Boolean = false) {
        if (_jobs.value.refreshingArchive) return
        viewModelScope.launch {
            _jobs.update { it.copy(refreshingArchive = true, removedStale = 0) }
            // Arşiv diskten yüklenene kadar bekle, yoksa boş sanıp atlarız.
            container.jobArchive.ready.first { it }
            val cases = container.jobArchive.archive.value.map { it.job.caseNumber }
            if (cases.isEmpty()) {
                _jobs.update { it.copy(refreshingArchive = false) }
                if (!silent) _message.value = "Arşiv boş."
                return@launch
            }
            runCatching { container.jobsApi.stillActive(cases) }
                .onSuccess { alive ->
                    val removed = container.jobArchive.retainOnly(alive)
                    updateSettings { it.copy(lastArchiveCheckAt = System.currentTimeMillis()) }
                    // Listede duran ama artık yayında olmayanları da düşür.
                    _jobs.update { state ->
                        state.copy(
                            refreshingArchive = false,
                            removedStale = removed,
                            results = state.results.filter { it.caseNumber in alive },
                            selected = state.selected.filterKeys { it in alive },
                        )
                    }
                    when {
                        silent && removed == 0 -> Unit
                        removed == 0 -> _message.value = "Arşivdeki ${cases.size} ilanın hepsi hâlâ yayında ✓"
                        else -> _message.value = "$removed ilan siteden kalkmış, listeden çıkarıldı."
                    }
                }
                .onFailure {
                    _jobs.update { it.copy(refreshingArchive = false) }
                    if (!silent) _message.value = it.friendly()
                }
        }
    }

    /** Kart açıldığında görev tanımını ve özel şartları ayrıca getirir. */
    fun loadDetails(job: Job) {
        val state = _jobs.value
        if (job.caseNumber in state.details || job.caseNumber in state.loadingDetails) return
        if (job.duties != null) return

        viewModelScope.launch {
            _jobs.update { it.copy(loadingDetails = it.loadingDetails + job.caseNumber) }
            runCatching { container.jobsApi.detailsFor(job.caseNumber) }
                .onSuccess { full ->
                    _jobs.update { current ->
                        current.copy(
                            details = if (full != null) current.details + (job.caseNumber to full) else current.details,
                            loadingDetails = current.loadingDetails - job.caseNumber,
                        )
                    }
                }
                .onFailure {
                    _jobs.update { it.copy(loadingDetails = it.loadingDetails - job.caseNumber) }
                }
        }
    }

    /** Kart açılır ve açıklaması yoksa hemen çekilir. */
    fun toggleExpandedAndLoad(job: Job) {
        toggleExpanded(job.caseNumber)
        if (job.caseNumber in _jobs.value.expanded) loadDetails(job)
    }

    /** AI ve mektup için tam metinli sürüm; yoksa listedeki hafif sürüm. */
    fun fullJob(job: Job): Job = _jobs.value.details[job.caseNumber] ?: job

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
        loadDetails(job)
        if (job.caseNumber in _jobs.value.summarizing) return
        if (_jobs.value.summaries.containsKey(job.caseNumber)) return

        viewModelScope.launch {
            _jobs.update { it.copy(summarizing = it.summarizing + job.caseNumber) }
            runCatching { container.aiClient().summarizeInTurkish(fullJob(job)) }
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
        }.map { fullJob(it) }
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

            // Kalkmış bir ilana başvuru göndermemek için son bir tazelik denetimi.
            val notes = mutableListOf<String>()
            val live = runCatching {
                container.jobsApi.stillActive(selected.map { it.caseNumber })
            }.getOrNull()

            val targets = if (live == null) {
                notes += "Tazelik denetimi yapılamadı; ilanlar olduğu gibi kullanıldı."
                selected
            } else {
                val stale = selected.filterNot { it.caseNumber in live }
                if (stale.isNotEmpty()) {
                    notes += "${stale.size} ilan artık yayında değil, atlandı: " +
                        stale.take(3).joinToString(", ") { it.employer }
                    container.jobArchive.retainOnly(container.jobArchive.seenCaseNumbers - stale.map { it.caseNumber }.toSet())
                    _jobs.update { state ->
                        state.copy(selected = state.selected.filterKeys { it in live })
                    }
                }
                selected.filter { it.caseNumber in live }
            }

            if (targets.isEmpty()) {
                _apply.update {
                    it.copy(preparing = false, progress = null, notes = notes + "Gönderilecek geçerli ilan kalmadı.")
                }
                return@launch
            }
            _apply.update { it.copy(notes = notes.toList()) }

            val pipeline = container.pipeline()
            val prepared = mutableListOf<QueuedMail>()

            targets.forEachIndexed { index, job ->
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
                                    total = targets.size,
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
                    gmailCursor = 0,
                    openedInGmail = emptySet(),
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

    /**
     * Tek bir iletiyi Gmail'de açar: alıcı, konu, mesaj dolu, PDF ekli gelir.
     * Kullanıcıya yalnızca Gönder'e basmak kalır.
     */
    fun openInGmail(mail: QueuedMail) {
        viewModelScope.launch {
            val config = settings.value
            val cv: CvFile? = config.cvUri.takeIf { it.isNotBlank() }?.let { uri ->
                withContext(Dispatchers.IO) { runCatching { CvLoader.load(getApplication(), uri) }.getOrNull() }
            }
            if (config.cvUri.isNotBlank() && cv == null) {
                _message.value = "CV okunamadı, ileti eksiz açılıyor. Ayarlar'dan CV'yi yeniden seç."
            }
            if (config.cvUri.isBlank()) {
                _message.value = "CV seçilmemiş; ileti eksiz açılıyor."
            }

            runCatching {
                MailIntentSender.open(
                    context = getApplication(),
                    to = mail.to,
                    subject = mail.subject,
                    body = mail.body,
                    cv = cv,
                    bccSelf = config.gmailAddress.takeIf { config.ccSelf },
                )
            }
                .onSuccess {
                    _apply.update { state ->
                        val index = state.prepared.indexOfFirst { it.caseNumber == mail.caseNumber }
                        state.copy(
                            openedInGmail = state.openedInGmail + mail.caseNumber,
                            gmailCursor = if (index >= 0) index + 1 else state.gmailCursor,
                        )
                    }
                }
                .onFailure {
                    _message.value = "E-posta uygulaması açılamadı. Gmail kurulu mu? (${it.message})"
                }
        }
    }

    /** Sıradaki hazırlanmış iletiyi Gmail'de açar. */
    fun openNextInGmail() {
        val state = _apply.value
        val next = state.prepared.getOrNull(state.gmailCursor)
            ?: state.prepared.firstOrNull { it.caseNumber !in state.openedInGmail }
        if (next == null) {
            _message.value = "Sırada açılacak ileti kalmadı."
            return
        }
        openInGmail(next)
    }

    /**
     * Gmail'de gönderdiğini işaretler.
     *
     * Uygulama, Gmail'in gerçekten gönderip göndermediğini göremez — bu yüzden
     * onay kullanıcıdan gelir. İşaretlenen ilan geçmişe yazılır ve bir daha
     * listelenmez.
     */
    fun markSentManually(mail: QueuedMail) {
        container.historyStore.add(
            SendRecord(
                caseNumber = mail.caseNumber,
                title = mail.title,
                employer = mail.employer,
                email = mail.to,
                status = SendStatus.SENT,
            ),
        )
        _apply.update { state ->
            state.copy(
                prepared = state.prepared.filterNot { it.caseNumber == mail.caseNumber },
                openedInGmail = state.openedInGmail - mail.caseNumber,
                gmailCursor = state.gmailCursor.coerceAtMost((state.prepared.size - 2).coerceAtLeast(0)),
            )
        }
        _jobs.update { it.copy(selected = it.selected - mail.caseNumber) }
        _message.value = "${mail.employer} gönderildi olarak işaretlendi."
    }

    fun refreshGmailAvailability() {
        val installed = MailIntentSender.isGmailInstalled(getApplication())
        _apply.update { it.copy(gmailInstalled = installed) }
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
