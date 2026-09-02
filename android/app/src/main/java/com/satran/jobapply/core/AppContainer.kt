package com.satran.jobapply.core

import android.content.Context
import com.satran.jobapply.data.prefs.HistoryStore
import com.satran.jobapply.data.prefs.SettingsStore
import com.satran.jobapply.data.remote.AiClient
import com.satran.jobapply.data.remote.SeasonalJobsApi
import com.satran.jobapply.data.remote.WebSearchClient
import com.satran.jobapply.send.SendQueueStore

/** Uygulamanın tek bağımlılık kabı. Çerçeve kullanmadan elle kurulur. */
class AppContainer(context: Context) {

    val settingsStore = SettingsStore(context)
    val historyStore = HistoryStore(context)
    val sendQueueStore = SendQueueStore(context)
    val jobsApi = SeasonalJobsApi()

    /** İstemciler o anki ayarlara bağlı olduğundan her çağrıda yeniden kurulur. */
    fun aiClient() = AiClient(settingsStore.settings.value)

    fun searchClient() = WebSearchClient(settingsStore.settings.value)
}
