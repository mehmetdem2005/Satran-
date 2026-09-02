package com.satran.jobapply.data.memory

import android.content.Context
import com.satran.jobapply.core.Net
import com.satran.jobapply.data.model.Job
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.io.File

/** Arşivdeki bir ilan: ilanın kendisi + ne zaman, hangi aramada görüldüğü. */
@Serializable
data class ArchivedJob(
    val job: Job,
    val firstSeenAt: Long,
    val lastSeenAt: Long,
    val sourceQuery: String,
)

/**
 * Görülen bütün ilanların kalıcı arşivi.
 *
 * İki işi var:
 *  1. **Tekrar engelleme** — bir kez listelenen ilan yeni aramalarda tekrar çıkmaz.
 *  2. **Geçmiş** — eski ilanlar silinmez; "Geçmiş" görünümünde okunmaya devam eder.
 *
 * Arşiv [MAX_JOBS] kayıtta tutulur; taşınca en eski *görülen* kayıtlar düşer.
 */
class JobArchiveStore(context: Context) {

    private val file = File(context.applicationContext.filesDir, "job_archive.json")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _archive = MutableStateFlow<List<ArchivedJob>>(emptyList())
    val archive: StateFlow<List<ArchivedJob>> = _archive.asStateFlow()

    /** Yüklenme bitene kadar tekrar süzgeci uygulanmasın diye izlenir. */
    private val _ready = MutableStateFlow(false)
    val ready: StateFlow<Boolean> = _ready.asStateFlow()

    init {
        scope.launch {
            _archive.value = load()
            _ready.value = true
        }
    }

    val seenCaseNumbers: Set<String>
        get() = _archive.value.mapTo(HashSet()) { it.job.caseNumber }

    fun contains(caseNumber: String): Boolean = _archive.value.any { it.job.caseNumber == caseNumber }

    /**
     * Yeni gelen ilanları arşive işler ve **daha önce hiç görülmemiş** olanları döndürür.
     * Zaten arşivde olanların yalnızca `lastSeenAt` alanı tazelenir.
     */
    @Synchronized
    fun recordAndFilterNew(jobs: List<Job>, query: String): List<Job> {
        if (jobs.isEmpty()) return emptyList()
        val now = System.currentTimeMillis()
        val existing = _archive.value.associateByTo(LinkedHashMap()) { it.job.caseNumber }

        val fresh = mutableListOf<Job>()
        jobs.forEach { job ->
            val previous = existing[job.caseNumber]
            if (previous == null) {
                fresh += job
                existing[job.caseNumber] = ArchivedJob(job, now, now, query)
            } else {
                existing[job.caseNumber] = previous.copy(job = job, lastSeenAt = now)
            }
        }

        val next = existing.values.sortedByDescending { it.lastSeenAt }.take(MAX_JOBS)
        _archive.value = next
        persist(next)
        return fresh
    }

    @Synchronized
    fun clear() {
        _archive.value = emptyList()
        persist(emptyList())
    }

    private fun persist(archive: List<ArchivedJob>) {
        scope.launch {
            runCatching {
                file.writeText(Net.json.encodeToString(ListSerializer(ArchivedJob.serializer()), archive))
            }
        }
    }

    private fun load(): List<ArchivedJob> {
        if (!file.exists()) return emptyList()
        return runCatching {
            Net.json.decodeFromString(ListSerializer(ArchivedJob.serializer()), file.readText())
        }.getOrElse { emptyList() }
    }

    private companion object {
        const val MAX_JOBS = 2000
    }
}
