package com.satran.jobapply

import com.satran.jobapply.data.model.SendRecord
import com.satran.jobapply.data.model.SendStatus
import com.satran.jobapply.data.model.summarize
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Geçmiş hem başarılıyı hem başarısızı tutuyor. Ekranda tek sayı gösterilince
 * kullanıcı Gmail'in Gönderilenler klasöründeki daha küçük sayıyı görüp
 * uygulamada hata var sanıyordu; döküm ayrı ayrı doğru olmalı.
 */
class SendSummaryTest {

    private fun record(status: SendStatus) = SendRecord(
        caseNumber = "H-400-$status",
        title = "İş",
        employer = "İşveren",
        email = "a@b.com",
        status = status,
    )

    @Test
    fun `basarili ve basarisiz ayri sayilir`() {
        val history = List(89) { record(SendStatus.SENT) } + List(95) { record(SendStatus.FAILED) }
        val summary = history.summarize()
        assertEquals(89, summary.sent)
        assertEquals(95, summary.failed)
        assertEquals(184, summary.total)
    }

    @Test
    fun `atlananlar gonderilmis sayilmaz`() {
        val summary = listOf(
            record(SendStatus.SENT),
            record(SendStatus.SKIPPED),
            record(SendStatus.QUEUED),
        ).summarize()
        assertEquals(1, summary.sent)
        assertEquals(0, summary.failed)
        assertEquals(2, summary.other)
    }

    @Test
    fun `bos gecmis sifir doner`() {
        val summary = emptyList<SendRecord>().summarize()
        assertEquals(0, summary.total)
    }
}
