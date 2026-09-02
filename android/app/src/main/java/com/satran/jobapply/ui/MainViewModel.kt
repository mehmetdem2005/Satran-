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
import com.satran.jobapply.data.mail.MailTemplate
import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.data.model.Job
import com.satran.jobapply.data.model.SendMode
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

    init {
        refresh()
    }

    // -------------------------------------------------------------- ilan listesi

    fun onQueryChange(value: String) = _jobs.update { it.copy(query = value) }

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
        refresh()
    }

    fun refresh() {
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            _jobs.update { it.copy(loading = true, error = null, page = 0) }
            runCatching { container.jobsApi.search(currentQuery(page = 0)) }
                .onSuccess { page ->
                    _jobs.update { state ->
                        state.copy(
                            loading = false,
                            results = applyLocalFilters(page.jobs, state),
                            rawCount = page.jobs.size,
                            total = page.totalCount,
                            stateFacets = page.stateFacets,
                            endReached = page.jobs.size < SeasonalJobsApi.PAGE_SIZE,
                        )
                    }
                    maybeAiClassify()
                }
                .onFailure { error ->
                    _jobs.update { it.copy(loading = false, error = error.friendly()) }
                }
        }
    }

    fun loadMore() {
        val state = _jobs.value
        if (state.loading || state.loadingMore || state.endReached) return
        viewModelScope.launch {
            _jobs.update { it.copy(loadingMore = true) }
            val nextPage = state.page + 1
            runCatching { container.jobsApi.search(currentQuery(page = nextPage)) }
                .onSuccess { page ->
                    _jobs.update { current ->
                        val merged = (current.results + applyLocalFilters(page.jobs, current))
                            .distinctBy { it.caseNumber }
                        current.copy(
                            loadingMore = false,
                            page = nextPage,
                            results = merged,
                            rawCount = current.rawCount + page.jobs.size,
                            endReached = page.jobs.size < SeasonalJobsApi.PAGE_SIZE,
                        )
                    }
                    maybeAiClassify()
                }
                .onFailure { error ->
                    _jobs.update { it.copy(loadingMore = false, error = error.friendly()) }
                }
        }
    }

    private fun currentQuery(page: Int): SeasonalJobsApi.Query {
        val state = _jobs.value
        return SeasonalJobsApi.Query(
            text = state.query,
            state = state.selectedState,
            visaClass = state.visaClass,
            emailOnly = state.emailOnly,
            sort = state.sort,
            page = page,
        )
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

    /** Anahtar sözcük süzgecinden geçenleri modele de doğrulatır. */
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

    // -------------------------------------------------------------- seçim

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
        state.results.filter { it.canEmail }.forEach { selected[it.caseNumber] = it }
        state.copy(selected = selected)
    }

    fun clearSelection() = _jobs.update { it.copy(selected = emptyMap()) }

    fun removeFromSelection(caseNumber: String) = _jobs.update {
        it.copy(selected = it.selected - caseNumber)
    }

    // -------------------------------------------------------------- yapay zekâ

    /** İlan açıklamasını Türkçeye çevirip özetler. */
    fun summarize(job: Job) {
        if (!settings.value.aiReady) {
            _message.value = "Önce Ayarlar'dan yapay zekâ API anahtarını gir."
            return
        }
        if (job.caseNumber in _jobs.value.summarizing) return
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

    /** İşvereni internetten araştırıp kısa bir brifing çıkarır. */
    fun research(job: Job) {
        val config = settings.value
        if (!config.searchReady) {
            _message.value = "${config.searchProvider.label} için arama API anahtarı gerekli."
            return
        }
        if (job.caseNumber in _jobs.value.researching) return
        viewModelScope.launch {
            _jobs.update { it.copy(researching = it.researching + job.caseNumber) }
            runCatching {
                val results = container.searchClient().researchEmployer(job.employer, job.location)
                if (config.aiReady) {
                    container.aiClient().summarizeResearch(job, results)
                } else {
                    results.joinToString("\n\n") { "• ${it.title}\n${it.url}\n${it.snippet}" }
                        .ifBlank { "Sonuç bulunamadı." }
                }
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

    /** Serbest Türkçe isteği arama sorgusuna çevirir ve aramayı yeniler. */
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
                    refresh()
                }
                .onFailure { error ->
                    _jobs.update { it.copy(loading = false) }
                    _message.value = error.friendly()
                }
        }
    }

    // -------------------------------------------------------------- ayarlar

    fun updateSettings(transform: (AppSettings) -> AppSettings) = container.settingsStore.update(transform)

    fun onCvPicked(uriString: String, fileName: String) {
        updateSettings { it.copy(cvUri = uriString, cvFileName = fileName) }
        _message.value = "CV seçildi: $fileName"
    }

    fun testAi() {
        viewModelScope.launch {
            _apply.update { it.copy(testing = true) }
            runCatching { container.aiClient().ping() }
                .onSuccess { _message.value = "Yapay zekâ bağlantısı çalışıyor ✓" }
                .onFailure { _message.value = it.friendly() }
            _apply.update { it.copy(testing = false) }
        }
    }

    fun testSmtp() {
        viewModelScope.launch {
            _apply.update { it.copy(testing = true) }
            runCatching {
                withContext(Dispatchers.IO) {
                    GmailSender(settings.value).use { it.connect() }
                }
            }
                .onSuccess { _message.value = "Gmail bağlantısı çalışıyor ✓" }
                .onFailure { _message.value = it.friendly() }
            _apply.update { it.copy(testing = false) }
        }
    }

    fun clearHistory() {
        container.historyStore.clear()
        _message.value = "Gönderim geçmişi temizlendi."
    }

    // -------------------------------------------------------------- gönderim

    /** Seçili ilanlar için önizleme üretir; AI açıksa mektupları modele yazdırır. */
    fun prepare(onlyCase: String? = null) {
        val selected = selectedJobs().let { list ->
            if (onlyCase != null) list.filter { it.caseNumber == onlyCase } else list
        }
        if (selected.isEmpty()) {
            _message.value = "Önce ilan seç."
            return
        }
        val config = settings.value
        if (config.fullName.isBlank()) {
            _message.value = "Ayarlar'dan adını soyadını gir; mektupta imza olarak kullanılıyor."
        }

        viewModelScope.launch {
            _apply.update { it.copy(preparing = true, prepared = emptyList(), progressText = null) }
            val prepared = mutableListOf<QueuedMail>()

            selected.forEachIndexed { index, job ->
                val to = job.email
                if (to == null) {
                    _apply.update { it.copy(progressText = "${job.employer}: e-posta adresi yok, atlandı") }
                    return@forEachIndexed
                }

                _apply.update {
                    it.copy(progressText = "Hazırlanıyor ${index + 1}/${selected.size} — ${job.employer}")
                }

                var subject = MailTemplate.render(config.subjectTemplate, job, config)
                var body = MailTemplate.render(config.bodyTemplate, job, config)

                if (config.aiWriteLetters && config.aiReady) {
                    val research = if (config.researchBeforeSending && config.searchReady) {
                        runCatching {
                            val results = container.searchClient().researchEmployer(job.employer, job.location)
                            container.aiClient().summarizeResearch(job, results)
                        }.getOrNull()
                    } else {
                        null
                    }

                    runCatching { container.aiClient().writeLetter(job, research) }
                        .onSuccess { letter ->
                            letter.subject?.takeIf { it.isNotBlank() }?.let { subject = it }
                            if (letter.body.isNotBlank()) body = letter.body
                        }
                        .onFailure { error ->
                            _apply.update {
                                it.copy(progressText = "${job.employer}: mektup üretilemedi, şablon kullanıldı (${error.message})")
                            }
                        }
                }

                prepared += QueuedMail(
                    caseNumber = job.caseNumber,
                    title = job.title,
                    employer = job.employer,
                    to = to,
                    subject = subject,
                    body = body,
                )
            }

            _apply.update {
                it.copy(
                    preparing = false,
                    prepared = prepared,
                    progressText = if (prepared.isEmpty()) "Gönderilecek ileti kalmadı." else null,
                )
            }
        }
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

    /** Hazırlanan iletileri SMTP kuyruğuna alıp arka plan işini başlatır. */
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

    /** Tek bir iletiyi Gmail uygulamasında açar. */
    fun openInGmail(mail: QueuedMail) {
        viewModelScope.launch {
            val config = settings.value
            val cv: CvFile? = config.cvUri.takeIf { it.isNotBlank() }?.let { uri ->
                withContext(Dispatchers.IO) {
                    runCatching { CvLoader.load(getApplication(), uri) }.getOrNull()
                }
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
    is java.net.UnknownHostException -> "İnternet bağlantısı yok gibi görünüyor."
    is java.net.SocketTimeoutException -> "Sunucu zamanında yanıt vermedi, tekrar dene."
    else -> message ?: this::class.java.simpleName
}
