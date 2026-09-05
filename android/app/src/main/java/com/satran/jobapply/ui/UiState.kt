package com.satran.jobapply.ui

import com.satran.jobapply.data.memory.ArchivedJob
import com.satran.jobapply.data.model.Job
import com.satran.jobapply.data.remote.SeasonalJobsApi
import com.satran.jobapply.data.translate.JobTranslation
import com.satran.jobapply.send.QueuedMail

/** İlanlar sekmesi hangi listeyi gösteriyor. */
enum class JobsView(val label: String) {
    LIVE("Yeni"),
    ARCHIVE("Geçmiş"),
}

data class JobsUiState(
    val query: String = "",
    val results: List<Job> = emptyList(),
    val archived: List<ArchivedJob> = emptyList(),
    val view: JobsView = JobsView.LIVE,

    /** Bu sorguda API'de kaçıncı kayda kadar gelindi. */
    val offset: Int = 0,
    val fetchedThisSearch: Int = 0,
    val total: Int = 0,
    val duplicatesSkipped: Int = 0,
    val lastUpdatedAt: Long = 0L,

    val loading: Boolean = false,
    val loadingMore: Boolean = false,
    val refreshing: Boolean = false,
    val endReached: Boolean = false,
    val error: String? = null,

    val stateFacets: List<SeasonalJobsApi.Facet> = emptyList(),
    val selectedState: String? = null,
    val visaClass: String? = null,
    val sort: SeasonalJobsApi.Sort = SeasonalJobsApi.Sort.NEWEST,
    val emailOnly: Boolean = true,
    /** Tarım dışı: H-2B vizesi + SOC 45 (tarım/balıkçılık/ormancılık) hariç. */
    val excludeAgricultural: Boolean = true,
    val hideApplied: Boolean = true,

    val expanded: Set<String> = emptySet(),
    val selected: Map<String, Job> = emptyMap(),
    /** Daha önce başvurulan ilanlar — süzgeç kapalıyken kartta işaretlenir. */
    val appliedCases: Set<String> = emptySet(),

    /** İlan başına çevrilmiş alanlar. Açıp kapatınca hepsi birlikte döner. */
    val translations: Map<String, JobTranslation> = emptyMap(),
    val translating: Set<String> = emptySet(),
    /** Genel anahtar kapalıyken tek tek açılmış kartlar. */
    val translatedCards: Set<String> = emptySet(),
    val translateAll: Boolean = false,
    val translatingAll: Boolean = false,
    val translateProgress: Int = 0,
    val translateTotal: Int = 0,
    val research: Map<String, String> = emptyMap(),
    val researching: Set<String> = emptySet(),

    /** Kart açıldığında ayrıca çekilen görev tanımları. */
    val details: Map<String, Job> = emptyMap(),
    val loadingDetails: Set<String> = emptySet(),

    /** Sunucuya gönderilen gerçek ifadeler — arayüzde olduğu gibi gösterilir. */
    val sentFilter: String = "",
    val sentSearch: String = "",
    val showQueryPanel: Boolean = false,

    /** "Tümünü çek" ilerlemesi. */
    val bulkFetching: Boolean = false,
    val bulkFetched: Int = 0,
    val bulkTotal: Int = 0,

    val refreshingArchive: Boolean = false,
    val removedStale: Int = 0,
) {
    val selectedCount: Int get() = selected.size

    /** Bir ağ işi sürerken yeni sayfalama isteği kabul edilmez. */
    val isBusy: Boolean get() = loading || loadingMore || refreshing || bulkFetching

    /** Sonraki sayfanın başlangıç kaydı. */
    val nextOffset: Int get() = offset + fetchedThisSearch

    /** Bu ilanın çevirisi şu an gösterilmeli mi? */
    fun showsTranslation(caseNumber: String): Boolean =
        translateAll || caseNumber in translatedCards

    fun translationFor(caseNumber: String): JobTranslation? =
        if (showsTranslation(caseNumber)) translations[caseNumber] else null
}

/** Zincirin bir ilan için nerede olduğunu gösteren satır. */
data class PrepareProgress(
    val caseNumber: String,
    val employer: String,
    val stepLabel: String,
    val index: Int,
    val total: Int,
)

data class ApplyUiState(
    val preparing: Boolean = false,
    val prepared: List<QueuedMail> = emptyList(),
    val progress: PrepareProgress? = null,
    val notes: List<String> = emptyList(),
    val testing: Boolean = false,
    val loadingModels: Boolean = false,
    val verifying: Boolean = false,
    val sourceProof: SeasonalJobsApi.SourceProof? = null,

    /** Gmail'de tek tek açarken sırada hangi ileti var. */
    val gmailCursor: Int = 0,
    /** Gmail'de açılmış (ama gönderildiği doğrulanamayan) iletiler. */
    val openedInGmail: Set<String> = emptySet(),
    val gmailInstalled: Boolean = true,
)
