package com.satran.jobapply.core

import android.content.Context
import com.satran.jobapply.data.memory.JobArchiveStore
import com.satran.jobapply.data.memory.RagStore
import com.satran.jobapply.data.memory.SearchHistoryStore
import com.satran.jobapply.data.pipeline.ApplicationPipeline
import com.satran.jobapply.data.prefs.HistoryStore
import com.satran.jobapply.data.prefs.SettingsStore
import com.satran.jobapply.data.remote.AiClient
import com.satran.jobapply.data.remote.SeasonalJobsApi
import com.satran.jobapply.data.remote.WebSearchClient
import com.satran.jobapply.data.translate.JobTranslator
import com.satran.jobapply.send.SendQueueStore

/** Uygulamanın tek bağımlılık kabı. Çerçeve kullanmadan elle kurulur. */
class AppContainer(context: Context) {

    val settingsStore = SettingsStore(context)
    val historyStore = HistoryStore(context)
    val sendQueueStore = SendQueueStore(context)
    val jobsApi = SeasonalJobsApi()

    /** Çeviri anahtar istemez; tek örnek olarak tutulur (dil modeli paylaşılsın). */
    val translator = JobTranslator()

    // Bellek katmanı: arşiv (tekrar engelleme + geçmiş), arama geçmişi, RAG.
    val jobArchive = JobArchiveStore(context)
    val searchHistory = SearchHistoryStore(context)
    val ragStore = RagStore(context)

    /** İstemciler o anki ayarlara bağlı olduğundan her çağrıda yeniden kurulur. */
    fun aiClient() = AiClient(settingsStore.settings.value)

    fun searchClient() = WebSearchClient(settingsStore.settings.value)

    fun pipeline() = ApplicationPipeline(
        settings = settingsStore.settings.value,
        ai = aiClient(),
        search = searchClient(),
        rag = ragStore,
    )
}
