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
import java.net.SocketTimeoutException
import kotlin.random.Random

/**
 * 200 başvuruluk bir gönderimi baştan sona çalıştırır.
 *
 * Sunucu, gerçek bir turda görülen karışımı taklit eder: ölü adresler, Gmail'in
 * hız sınırı, kopan bağlantı. Kuyruk geçişleri ([completed], [deferredToEnd])
 * ve karar mantığı ([SendPolicy]) uygulamanın kullandığı kodun **aynısıdır**;
 * burada yalnızca ağ ve zaman taklit edilir.
 *
 * Amacı, v28'de düzeltilen kaybı sabitlemek: eski mantık başarısız iletiyi
 * kuyruktan siliyordu, yani geçici bir hataya denk gelen başvuru bir daha hiç
 * denenmiyordu.
 */
class SendSimulationTest {

    // ----------------------------------------------------------- taklit sunucu

    /** İlanın gerçekte ne durumda olduğu; sunucu buna göre yanıt verir. */
    private enum class Truth { GOOD, DEAD_ADDRESS }

    private class FakeServer(
        private val truth: Map<String, Truth>,
        /** Bu sıradaki gönderimlerde hız sınırı verilir. */
        private val throttleAt: Set<Int>,
        /** Bu sıradaki gönderimlerde ağ kopar. */
        private val networkDropAt: Set<Int>,
    ) {
        var attempts = 0
            private set

        /** Gerçekten teslim edilen ilanlar. */
        val delivered = mutableSetOf<String>()

        fun send(mail: QueuedMail): Throwable? {
            attempts++
            if (attempts in throttleAt) {
                return Exception("421 4.7.0 Try again later")
            }
            if (attempts in networkDropAt) {
                return SocketTimeoutException("Read timed out")
            }
            return when (truth.getValue(mail.caseNumber)) {
                Truth.DEAD_ADDRESS ->
                    Exception("550 5.1.1 The email account that you tried to reach does not exist")
                Truth.GOOD -> {
                    delivered += mail.caseNumber
                    null
                }
            }
        }
    }

    private fun mail(index: Int) = QueuedMail(
        caseNumber = "H-400-26000-%06d".format(index),
        title = "İş $index",
        employer = "İşveren $index",
        to = "hr$index@example.com",
        subject = "Application $index",
        body = "Merhaba",
    )

    private data class Run(
        val delivered: Int,
        val droppedPermanently: Int,
        val stillQueued: Int,
        val attempts: Int,
    )

    // ------------------------------------------------------------- iki mantık

    /** v27 ve öncesi: başarısız olan her ileti kuyruktan silinirdi. */
    private fun runOldPolicy(mails: List<QueuedMail>, server: FakeServer): Run {
        var state = SendQueueState(pending = mails, totalQueued = mails.size)
        var guard = 0
        while (state.isActive && guard++ < MAX_STEPS) {
            val next = state.pending.first()
            val error = server.send(next)
            state = state.completed(next.caseNumber, succeeded = error == null)
        }
        return Run(
            delivered = server.delivered.size,
            droppedPermanently = state.failedTotal,
            stillQueued = state.pending.size,
            attempts = server.attempts,
        )
    }

    /**
     * v28: hata türüne göre düşür / sona al / duraklat. Duraklama günün
     * bitmesi demek; ertesi gün kuyruk kaldığı yerden sürer, bu yüzden
     * döngü dışarıdan yeniden başlatılır.
     */
    private fun runNewPolicy(mails: List<QueuedMail>, server: FakeServer): Run {
        var state = SendQueueState(pending = mails, totalQueued = mails.size)
        var days = 0
        while (state.isActive && days++ < MAX_DAYS) {
            var transientStreak = 0
            var guard = 0
            var paused = false
            while (state.isActive && !paused && guard++ < MAX_STEPS) {
                val next = state.pending.first()
                val error = server.send(next)
                when (val decision = SendPolicy.decide(error, transientStreak)) {
                    SendDecision.Sent -> {
                        state = state.completed(next.caseNumber, succeeded = true)
                        transientStreak = 0
                    }
                    is SendDecision.Drop -> {
                        state = state.completed(next.caseNumber, succeeded = false)
                        transientStreak = 0
                    }
                    is SendDecision.Defer -> {
                        state = state.deferredToEnd(next.caseNumber)
                        transientStreak++
                    }
                    is SendDecision.Pause -> {
                        state = state.deferredToEnd(next.caseNumber)
                        paused = true
                    }
                }
            }
        }
        return Run(
            delivered = server.delivered.size,
            droppedPermanently = state.failedTotal,
            stillQueued = state.pending.size,
            attempts = server.attempts,
        )
    }

    // ------------------------------------------------------------- senaryolar

    private fun scenario(): Triple<List<QueuedMail>, Map<String, Truth>, Pair<Set<Int>, Set<Int>>> {
        val random = Random(20260916)
        val mails = (1..TOTAL).map { mail(it) }
        // İlanların %20'sinde adres ölü — bounce'lar bunu gösteriyordu.
        val truth = mails.associate { m ->
            m.caseNumber to if (random.nextInt(100) < 20) Truth.DEAD_ADDRESS else Truth.GOOD
        }
        // Gmail 60. denemeden sonra hız sınırı veriyor, ağ iki kez kopuyor.
        val throttleAt = setOf(60, 61, 140, 141)
        val networkDropAt = setOf(25, 26, 90, 155, 156)
        return Triple(mails, truth, throttleAt to networkDropAt)
    }

    @Test
    fun `eski mantik gecici hataya denk gelen basvurulari kaybediyordu`() {
        val (mails, truth, faults) = scenario()
        val server = FakeServer(truth, faults.first, faults.second)
        val result = runOldPolicy(mails, server)

        val goodJobs = truth.count { it.value == Truth.GOOD }
        val lost = goodJobs - result.delivered

        println("ESKİ: ${result.delivered}/$goodJobs ulaştı, $lost KAYIP, ${result.attempts} deneme")

        // Adresi sağlam olduğu hâlde ulaşmayan başvurular: kalıcı kayıp.
        assertTrue("eski mantıkta kayıp beklenirdi", lost > 0)
        assertEquals("kuyrukta hiçbir şey kalmaz — hepsi silinmişti", 0, result.stillQueued)
    }

    @Test
    fun `yeni mantik adresi saglam olan her basvuruyu teslim ediyor`() {
        val (mails, truth, faults) = scenario()
        val server = FakeServer(truth, faults.first, faults.second)
        val result = runNewPolicy(mails, server)

        val goodJobs = truth.count { it.value == Truth.GOOD }
        val deadJobs = truth.count { it.value == Truth.DEAD_ADDRESS }

        println("YENİ: ${result.delivered}/$goodJobs ulaştı, ${result.droppedPermanently} ölü adres, ${result.attempts} deneme")

        assertEquals("adresi sağlam olan her ilana ulaşmalı", goodJobs, result.delivered)
        assertEquals("yalnızca ölü adresler düşmeli", deadJobs, result.droppedPermanently)
        assertEquals("kuyrukta bekleyen kalmamalı", 0, result.stillQueued)
    }

    @Test
    fun `iki mantik yan yana`() {
        val (mails, truth, faults) = scenario()
        val old = runOldPolicy(mails, FakeServer(truth, faults.first, faults.second))
        val new = runNewPolicy(mails, FakeServer(truth, faults.first, faults.second))
        val goodJobs = truth.count { it.value == Truth.GOOD }

        println(
            """
            |
            |  $TOTAL başvuru · ${goodJobs} adresi sağlam · ${TOTAL - goodJobs} adresi ölü
            |  Arızalar: 4 hız sınırı, 5 ağ kopması
            |
            |  ESKİ mantık : ${old.delivered} ulaştı · ${goodJobs - old.delivered} kayıp
            |  YENİ mantık : ${new.delivered} ulaştı · ${goodJobs - new.delivered} kayıp
            """.trimMargin(),
        )

        assertTrue("yeni mantık eskisinden az teslim edemez", new.delivered >= old.delivered)
        assertEquals(0, goodJobs - new.delivered)
    }

    @Test
    fun `hicbir ilana iki kez gonderilmez`() {
        val (mails, truth, faults) = scenario()
        val server = FakeServer(truth, faults.first, faults.second)
        runNewPolicy(mails, server)
        // delivered bir küme; teslim sayısı ile eşitse çift gönderim yok.
        assertEquals(truth.count { it.value == Truth.GOOD }, server.delivered.size)
    }

    @Test
    fun `agi tamamen kopuk telefonda kuyruk bozulmaz`() {
        // Her deneme hata verirse: hiçbir şey silinmemeli, hepsi kuyrukta kalmalı.
        val mails = (1..20).map { mail(it) }
        val truth = mails.associate { it.caseNumber to Truth.GOOD }
        val server = object {
            var attempts = 0
            fun send(): Throwable { attempts++; return IOException("Connection reset") }
        }

        var state = SendQueueState(pending = mails, totalQueued = mails.size)
        var transientStreak = 0
        var guard = 0
        while (state.isActive && guard++ < MAX_STEPS) {
            val next = state.pending.first()
            when (SendPolicy.decide(server.send(), transientStreak)) {
                is SendDecision.Defer -> {
                    state = state.deferredToEnd(next.caseNumber)
                    transientStreak++
                }
                is SendDecision.Pause -> {
                    state = state.deferredToEnd(next.caseNumber)
                    break
                }
                else -> throw AssertionError("ağ hatası kalıcı sayılmamalı")
            }
        }

        assertEquals("tek bir başvuru bile düşmemeli", 20, state.pending.size)
        assertEquals(0, state.failedTotal)
        assertTrue("ısrar edilmemeli", server.attempts <= SendPolicy.MAX_TRANSIENT_STREAK)
        println("KOPUK AĞ: ${server.attempts} deneme sonrası duruldu, ${state.pending.size}/20 kuyrukta duruyor")
    }

    private companion object {
        const val TOTAL = 200
        const val MAX_STEPS = 10_000
        const val MAX_DAYS = 50
    }
}
