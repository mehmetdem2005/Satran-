package com.satran.jobapply

import com.satran.jobapply.data.mail.MailTemplate
import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.data.model.Job
import com.satran.jobapply.send.QueuedMail
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Toplu başvuruda ilanların bilgileri birbirine karışmamalı: her ileti
 * yalnızca kendi ilanının numarasını, başlığını, işverenini ve e-postasını
 * taşımalı.
 */
class BulkIntegrityTest {

    private fun job(index: Int) = Job(
        caseNumber = "H-300-2600$index-00000$index",
        title = "Job Title $index",
        employer = "Employer $index",
        email = "hr$index@example.com",
        phone = null,
        applyUrl = null,
        location = "City $index, State $index",
        socCode = "45-209$index.00",
        socTitle = "Occupation $index",
        visaClass = "H-2B",
        positions = index,
        wage = "\$1$index.00 / saat",
        period = "01.0$index.2026 – 30.0$index.2026",
        duties = "Duties for job $index",
        requirements = null,
        education = null,
        experience = null,
        schedule = null,
        postedOn = null,
    )

    /** applyToAllMatching ile aynı kurulum: her ileti kendi ilanından üretilir. */
    private fun buildQueue(jobs: List<Job>, settings: AppSettings): List<QueuedMail> =
        jobs.mapNotNull { job ->
            val to = job.email ?: return@mapNotNull null
            QueuedMail(
                caseNumber = job.caseNumber,
                title = job.title,
                employer = job.employer,
                to = to,
                subject = MailTemplate.render(settings.subjectTemplate, job, settings),
                body = MailTemplate.render(settings.bodyTemplate, job, settings),
            )
        }

    private val settings = AppSettings(
        fullName = "Mehmet Demir",
        phone = "+90 555 000 00 00",
        gmailAddress = "me@gmail.com",
    )

    @Test
    fun `her ileti yalnizca kendi ilan numarasini tasir`() {
        val jobs = (1..50).map { job(it) }
        val mails = buildQueue(jobs, settings)
        assertEquals(50, mails.size)

        mails.forEachIndexed { index, mail ->
            val own = jobs[index]
            val blob = "${mail.subject}\n${mail.body}"

            assertTrue("kendi ilan numarası yok: ${own.caseNumber}", blob.contains(own.caseNumber))
            assertTrue("kendi başlığı yok: ${own.title}", blob.contains(own.title))
            assertEquals(own.email, mail.to)

            // Başka hiçbir ilanın numarası bu iletide geçmemeli.
            jobs.filter { it.caseNumber != own.caseNumber }.forEach { other ->
                assertTrue(
                    "${own.caseNumber} iletisinde ${other.caseNumber} geçiyor",
                    !blob.contains(other.caseNumber),
                )
            }
        }
    }

    @Test
    fun `alicilar ilanlarla birebir eslesir`() {
        val jobs = (1..20).map { job(it) }
        val mails = buildQueue(jobs, settings)
        assertEquals(jobs.map { it.email }, mails.map { it.to })
        assertEquals(jobs.map { it.caseNumber }, mails.map { it.caseNumber })
    }

    @Test
    fun `e-postasi olmayan ilan kuyruga girmez`() {
        val jobs = listOf(job(1), job(2).copy(email = null), job(3))
        val mails = buildQueue(jobs, settings)
        assertEquals(2, mails.size)
        assertTrue(mails.none { it.caseNumber == job(2).caseNumber })
    }

    @Test
    fun `basvuru sahibinin bilgileri her iletide ayni kalir`() {
        val mails = buildQueue((1..10).map { job(it) }, settings)
        mails.forEach { mail ->
            assertTrue(mail.body.contains("Mehmet Demir"))
            assertTrue(mail.body.contains("me@gmail.com"))
        }
    }

    @Test
    fun `sablonda doldurulmamis yer tutucu kalmaz`() {
        buildQueue((1..10).map { job(it) }, settings).forEach { mail ->
            assertTrue("konuda yer tutucu kaldı: ${mail.subject}", !mail.subject.contains("{{"))
            assertTrue("gövdede yer tutucu kaldı", !mail.body.contains("{{"))
        }
    }
}
