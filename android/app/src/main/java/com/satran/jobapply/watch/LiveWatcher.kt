package com.satran.jobapply.watch

import com.satran.jobapply.core.AppContainer
import com.satran.jobapply.core.runCatchingCancellable
import com.satran.jobapply.data.filter.JobQuery
import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.data.model.Job
import com.satran.jobapply.data.remote.SeasonalJobsApi
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Bir denetim turunun tamamı: kalkanları sil, yenileri bul.
 *
 * Ön plan servisi ve yedek WorkManager işi aynı kodu çağırsın diye ayrı
 * duruyor; iki ayrı uygulama olsaydı biri düzeltilip öteki unutulurdu.
 */
class LiveWatcher(private val container: AppContainer) {

    data class Result(
        val watched: Int = 0,
        val removed: Int = 0,
        val fresh: List<Job> = emptyList(),
        val error: String? = null,
    )

    /** Uzun arşivlerde taramanın kaldığı yer; tur tur ilerler. */
    private var sweepCursor = 0

    suspend fun sweep(settings: AppSettings): Result {
        val nowIso = nowIso()
        var removed = 0
        var error: String? = null

        val watched = sweepSlice()
        if (watched.isNotEmpty()) {
            runCatchingCancellable {
                container.jobsApi.stillActive(watched, JobQuery.livenessInput(nowIso))
            }.onSuccess { alive ->
                // Boş küme dönmesi süzgeç ya da uç hatasıdır; böyle bir yanıta
                // bakıp arşivin tamamını silmeyiz.
                if (alive.isNotEmpty()) {
                    removed = container.jobArchive.remove(watched.filterNot { it in alive }.toSet())
                }
            }.onFailure { error = it.message ?: "Ağ hatası" }
        }

        val queued = container.liveWatch.state.value.newJobs.mapTo(HashSet()) { it.caseNumber }
        val applied = container.historyStore.appliedCaseNumbers
        val fresh = runCatchingCancellable {
            container.jobsApi.search(
                SeasonalJobsApi.Query(
                    input = watchInput(settings, nowIso),
                    sort = SeasonalJobsApi.Sort.NEWEST,
                    offset = 0,
                    limit = PROBE_SIZE,
                ),
            ).jobs
        }.onFailure { error = it.message ?: "Ağ hatası" }
            .getOrDefault(emptyList())
            .filterNot { it.caseNumber in queued || it.caseNumber in applied }
            .filterNot { container.jobArchive.contains(it.caseNumber) }

        container.liveWatch.addNew(fresh)
        container.liveWatch.update {
            it.copy(
                lastCheckAt = System.currentTimeMillis(),
                watchedCount = watched.size,
                removedTotal = it.removedTotal + removed,
                lastError = error,
            )
        }

        return Result(watched = watched.size, removed = removed, fresh = fresh, error = error)
    }

    /**
     * Bu turda tazeliği sorulacak ilanlar. "Tümünü çek" sonrası arşivde 2000
     * kayıt olabiliyor; hepsini her dakika sormak 14 istek eder. Pencere
     * hâlinde ilerlenir, denetim yine dakikada bir olur.
     */
    private fun sweepSlice(): List<String> {
        val all = container.jobArchive.seenCaseNumbers.toList()
        if (all.size <= SWEEP_SIZE) {
            sweepCursor = 0
            return all
        }
        if (sweepCursor >= all.size) sweepCursor = 0
        val slice = all.drop(sweepCursor).take(SWEEP_SIZE)
        sweepCursor += SWEEP_SIZE
        return slice
    }

    /** Servis arayüzü göremez; en son bakılan süzgeç ayarlardan okunur. */
    private fun watchInput(settings: AppSettings, nowIso: String) = JobQuery.Input(
        text = settings.watchQuery,
        state = settings.watchState,
        emailOnly = settings.watchEmailOnly,
        excludeAgricultural = settings.watchExcludeAgricultural,
        blockedWords = settings.blockedWordList,
        requiredWords = settings.requiredWordList,
        includeUpcoming = settings.watchIncludeUpcoming,
        nowIso = nowIso,
    )

    private fun nowIso(): String = SimpleDateFormat("yyyy-MM-dd'T'00:00:00'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date())

    companion object {
        /** Bir turda tazeliği sorulacak en fazla ilan. */
        const val SWEEP_SIZE = 300

        /** Yeni ilan aramak için çekilen sayfa boyu. */
        const val PROBE_SIZE = 40
    }
}
