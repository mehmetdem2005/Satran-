package com.satran.jobapply.ui

import com.satran.jobapply.data.model.Job
import com.satran.jobapply.data.remote.SeasonalJobsApi
import com.satran.jobapply.send.QueuedMail

data class JobsUiState(
    val query: String = "",
    val results: List<Job> = emptyList(),
    val rawCount: Int = 0,
    val total: Int = 0,
    val page: Int = 0,
    val loading: Boolean = false,
    val loadingMore: Boolean = false,
    val endReached: Boolean = false,
    val error: String? = null,

    val stateFacets: List<SeasonalJobsApi.Facet> = emptyList(),
    val selectedState: String? = null,
    val visaClass: String? = null,
    val sort: SeasonalJobsApi.Sort = SeasonalJobsApi.Sort.NEWEST,
    val emailOnly: Boolean = true,
    val hideArchitectural: Boolean = true,
    val hideApplied: Boolean = true,

    val expanded: Set<String> = emptySet(),
    val selected: Map<String, Job> = emptyMap(),

    val summaries: Map<String, String> = emptyMap(),
    val summarizing: Set<String> = emptySet(),
    val research: Map<String, String> = emptyMap(),
    val researching: Set<String> = emptySet(),

    val aiChecked: Set<String> = emptySet(),
    val aiRemoved: Int = 0,
) {
    val selectedCount: Int get() = selected.size
}

data class ApplyUiState(
    val preparing: Boolean = false,
    val prepared: List<QueuedMail> = emptyList(),
    val progressText: String? = null,
    val testing: Boolean = false,
)
