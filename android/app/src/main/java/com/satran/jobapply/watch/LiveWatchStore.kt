package com.satran.jobapply.watch

import android.content.Context
import com.satran.jobapply.core.Net
import com.satran.jobapply.data.model.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import java.io.File

/**
 * Arka plan izleyicisinin bulgularını uygulama ile paylaştığı yer.
 *
 * Servis kendi sürecinde döner; kullanıcı uygulamayı açtığında bulduklarının
 * kaybolmaması için diske yazar. Yeni ilanlar **arşive yazılmaz**: arşiv
 * "bunu zaten gördün, bir daha gösterme" listesidir, oraya yazılırsa yeni
 * ilanlar hiç görünmezdi.
 */
@Serializable
data class LiveWatchState(
    /** Son denetimin zamanı (epoch ms). */
    val lastCheckAt: Long = 0L,
    /** Son denetimde kaç ilanın tazeliği soruldu. */
    val watchedCount: Int = 0,
    /** İzleme başladığından beri listeden düşen ilan sayısı. */
    val removedTotal: Int = 0,
    /** Uygulama açılınca listeye eklenecek, arka planda bulunmuş ilanlar. */
    val newJobs: List<Job> = emptyList(),
    /** Son denetim hatası; arayüzde dürüstçe gösterilir. */
    val lastError: String? = null,
)

class LiveWatchStore(context: Context) {

    private val file = File(context.applicationContext.filesDir, "live_watch.json")

    private val _state = MutableStateFlow(load())
    val state: StateFlow<LiveWatchState> = _state.asStateFlow()

    @Synchronized
    fun update(transform: (LiveWatchState) -> LiveWatchState) {
        val next = transform(_state.value)
        _state.value = next
        runCatching { file.writeText(Net.json.encodeToString(LiveWatchState.serializer(), next)) }
    }

    /** Bulunan yeni ilanları ekler; en fazla [MAX_NEW] tutulur. */
    fun addNew(jobs: List<Job>) {
        if (jobs.isEmpty()) return
        update { current ->
            current.copy(
                newJobs = (jobs + current.newJobs).distinctBy { it.caseNumber }.take(MAX_NEW),
            )
        }
    }

    /** Uygulama bulguları listeye aldıktan sonra kuyruğu boşaltır. */
    fun drainNew(): List<Job> {
        val drained = _state.value.newJobs
        if (drained.isNotEmpty()) update { it.copy(newJobs = emptyList()) }
        return drained
    }

    fun clear() = update { LiveWatchState() }

    private fun load(): LiveWatchState {
        if (!file.exists()) return LiveWatchState()
        return runCatching {
            Net.json.decodeFromString(LiveWatchState.serializer(), file.readText())
        }.getOrDefault(LiveWatchState())
    }

    companion object {
        /** Arka planda biriken ilan sayısının üst sınırı. */
        const val MAX_NEW = 500
    }
}
