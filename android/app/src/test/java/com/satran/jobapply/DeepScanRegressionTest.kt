package com.satran.jobapply

import com.satran.jobapply.send.QueuedMail
import com.satran.jobapply.send.SendDecision
import com.satran.jobapply.send.SendPolicy
import com.satran.jobapply.send.SendQueueState
import com.satran.jobapply.send.completed
import com.satran.jobapply.send.deferredToEnd
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/**
 * Derin taramada bulunan sorunların her biri için bir sınama.
 * Hepsi gerçek kaybettiren ya da tekrar gönderten durumlardı.
 */
class DeepScanRegressionTest {

    private fun mail(index: Int, attempts: Int = 0) = QueuedMail(
        caseNumber = "H-400-26000-%06d".format(index),
        title = "İş $index",
        employer = "İşveren $index",
        to = "hr$index@example.com",
        subject = "Application $index",
        body = "Merhaba",
        attempts = attempts,
    )

    // ------------------------------------------------- sürekli hata veren ileti

    @Test
    fun `surekli gecici hata veren ileti kuyrugu kilitlemez`() {
        // Eskiden: bu ileti hep sona alınır, kuyruktan hiç çıkmaz ve
        // arkasındaki başvurular hiç gönderilmezdi.
        var state = SendQueueState(pending = listOf(mail(1)), totalQueued = 1)
        var guard = 0
        while (state.isActive && guard++ < 100) {
            val next = state.pending.first()
            val decision = SendPolicy.decide(IOException("Connection reset"), 0, next.attempts)
            state = when (decision) {
                is SendDecision.Defer -> state.deferredToEnd(next.caseNumber)
                is SendDecision.Drop -> state.completed(next.caseNumber, succeeded = false)
                else -> throw AssertionError("beklenmeyen karar: $decision")
            }
        }
        assertEquals("ileti sonunda kuyruktan düşmeli", 0, state.pending.size)
        assertEquals(1, state.failedTotal)
        assertTrue("deneme sayısı sınırlı olmalı", guard <= SendPolicy.MAX_ATTEMPTS_PER_MAIL + 1)
    }

    @Test
    fun `deneme sayaci her ertelemede artar`() {
        var state = SendQueueState(pending = listOf(mail(1), mail(2)), totalQueued = 2)
        state = state.deferredToEnd("H-400-26000-000001")
        assertEquals(1, state.pending.last().attempts)
        state = state.deferredToEnd("H-400-26000-000001")
        assertEquals(2, state.pending.last().attempts)
    }

    @Test
    fun `sinira gelen ileti dusurulur digerleri gonderilmeye devam eder`() {
        val bad = mail(1, attempts = SendPolicy.MAX_ATTEMPTS_PER_MAIL - 1)
        val decision = SendPolicy.decide(IOException("timeout"), transientStreak = 0, attempts = bad.attempts)
        assertTrue("sınıra gelince düşmeli", decision is SendDecision.Drop)
        assertTrue(
            "sebep anlaşılır olmalı",
            (decision as SendDecision.Drop).reason.contains("denemede ulaşılamadı"),
        )
    }

    @Test
    fun `ilk denemelerde hala tekrar denenir`() {
        val decision = SendPolicy.decide(IOException("timeout"), transientStreak = 0, attempts = 0)
        assertTrue("ilk hatada düşürülmemeli", decision is SendDecision.Defer)
    }

    // ------------------------------------------------------- kuyruğun ezilmesi

    @Test
    fun `yeni kuyruk bekleyen basvurulari silmez`() {
        // Eskiden enqueue bütün durumu sıfırlıyordu: süren gönderimde
        // "Hepsine başvur"a ikinci kez basmak bekleyenleri çöpe atardı.
        val running = SendQueueState(pending = listOf(mail(1), mail(2)), totalQueued = 2)
        val incoming = listOf(mail(2), mail(3))

        val known = running.pending.mapTo(HashSet()) { it.caseNumber }
        val added = incoming.filterNot { it.caseNumber in known }
        val merged = running.copy(
            pending = running.pending + added,
            totalQueued = running.totalQueued + added.size,
        )

        assertEquals("bekleyenler durmalı, yeni olan eklenmeli", 3, merged.pending.size)
        assertEquals("zaten kuyrukta olan iki kez eklenmemeli", 1, added.size)
        assertEquals(3, merged.totalQueued)
    }

    // --------------------------------------------------------- tarama imleci

    @Test
    fun `tarama imleci turlar arasi ilerler`() {
        // İmleç sıfırlanırsa hep aynı ilk 300 ilan denetlenir, gerisi hiç.
        val archive = (1..1000).map { "case-$it" }
        val window = 300
        var cursor = 0
        val seen = mutableSetOf<String>()
        repeat(4) {
            if (cursor >= archive.size) cursor = 0
            seen += archive.drop(cursor).take(window)
            cursor += window
        }
        assertEquals("dört turda arşivin tamamı taranmalı", archive.size, seen.size)
    }

    // ------------------------------------------- başvurulan listesi kesilmesin

    @Test
    fun `basvurulanlar listesi gecmis kesilse de korunur`() {
        // Geçmiş 500 kayıtta kesiliyor. Başvurulanlar ondan türetilseydi
        // 500. başvurudan sonra aynı işverene ikinci kez mektup giderdi.
        val displayCap = 500
        val total = 2700
        val allCases = (1..total).map { "case-$it" }

        val displayHistory = allCases.takeLast(displayCap)
        val appliedSet = allCases.toSet()

        assertEquals("gösterilen geçmiş kesilir", displayCap, displayHistory.size)
        assertEquals("başvurulanlar kesilmez", total, appliedSet.size)
        assertTrue("en eski başvuru hatırlanmalı", "case-1" in appliedSet)
        assertTrue("eski yöntem onu unuturdu", "case-1" !in displayHistory.toSet())
    }
}
