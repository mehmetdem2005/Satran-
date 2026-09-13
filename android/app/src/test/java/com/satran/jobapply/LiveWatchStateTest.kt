package com.satran.jobapply

import com.satran.jobapply.data.model.Job
import com.satran.jobapply.watch.LiveWatchState
import com.satran.jobapply.watch.LiveWatchStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Arka plan izleyicisinin biriktirdiği bulguların kuralları.
 *
 * Servis Android çalıştırmadan sınanamaz; sınanabilen ve yanlış giderse
 * kullanıcıyı doğrudan yakan kısım biriktirme mantığı: aynı ilanın iki kez
 * sayılması ya da listenin sınırsız büyümesi.
 */
class LiveWatchStateTest {

    private fun job(case: String) = Job(
        caseNumber = case,
        title = "İş $case",
        employer = "İşveren",
        email = "a@b.com",
        phone = null,
        applyUrl = null,
        location = "Denver, CO",
        socCode = null,
        socTitle = null,
        visaClass = "H-2B",
        positions = 1,
        wage = null,
        period = null,
        duties = null,
        requirements = null,
        education = null,
        experience = null,
        schedule = null,
        postedOn = null,
    )

    /** [LiveWatchStore.addNew] ile aynı kural; dosyaya dokunmadan sınanır. */
    private fun addNew(state: LiveWatchState, jobs: List<Job>): LiveWatchState =
        state.copy(
            newJobs = (jobs + state.newJobs)
                .distinctBy { it.caseNumber }
                .take(LiveWatchStore.MAX_NEW),
        )

    @Test
    fun `ayni ilan iki kez birikmez`() {
        var state = LiveWatchState()
        state = addNew(state, listOf(job("A"), job("B")))
        state = addNew(state, listOf(job("B"), job("C")))
        assertEquals(listOf("B", "C", "A"), state.newJobs.map { it.caseNumber })
    }

    @Test
    fun `en yeni bulunan basa gelir`() {
        var state = addNew(LiveWatchState(), listOf(job("eski")))
        state = addNew(state, listOf(job("yeni")))
        assertEquals("yeni", state.newJobs.first().caseNumber)
    }

    @Test
    fun `birikme sinirsiz buyumez`() {
        var state = LiveWatchState()
        repeat(20) { round ->
            state = addNew(state, (0 until 50).map { job("tur$round-ilan$it") })
        }
        assertEquals(LiveWatchStore.MAX_NEW, state.newJobs.size)
    }

    @Test
    fun `kalkan sayaci birikimlidir`() {
        var state = LiveWatchState()
        state = state.copy(removedTotal = state.removedTotal + 3)
        state = state.copy(removedTotal = state.removedTotal + 2)
        assertEquals(5, state.removedTotal)
    }

    @Test
    fun `varsayilan durum bos ve hatasizdir`() {
        val state = LiveWatchState()
        assertTrue(state.newJobs.isEmpty())
        assertEquals(0L, state.lastCheckAt)
        assertEquals(null, state.lastError)
    }
}
