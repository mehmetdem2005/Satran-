package com.satran.jobapply

import com.satran.jobapply.data.filter.ArchitecturalFilter
import com.satran.jobapply.data.model.Job
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ArchitecturalFilterTest {

    private fun job(title: String, socCode: String? = null, socTitle: String? = null) = Job(
        caseNumber = "H-300-TEST",
        title = title,
        employer = "Test",
        email = "a@b.com",
        phone = null,
        applyUrl = null,
        location = "Texas",
        socCode = socCode,
        socTitle = socTitle,
        visaClass = "H-2A",
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

    @Test
    fun `landscaping labour is not architectural`() {
        // 37-3011 bahçe/peyzaj işçiliği — mimarlık değil, elenmemeli.
        val landscaper = job("Landscaper/ Nurseryman", "37-3011.00", "Landscaping and Groundskeeping Workers")
        assertFalse(ArchitecturalFilter.isArchitectural(landscaper))
    }

    @Test
    fun `landscape architect is architectural`() {
        val architect = job("Landscape Architect", "17-1012.00", "Landscape Architects")
        assertTrue(ArchitecturalFilter.isArchitectural(architect))
    }

    @Test
    fun `farm work is kept`() {
        val farmer = job("Farmworkers and Laborers, Crop", "45-2092.00", "Farmworkers and Laborers")
        assertFalse(ArchitecturalFilter.isArchitectural(farmer))
    }

    @Test
    fun `engineering major group is filtered even without keyword`() {
        val engineer = job("Civil Engineering Technician", "17-3022.00", "Civil Engineering Technologists")
        assertTrue(ArchitecturalFilter.isArchitectural(engineer))
    }

    @Test
    fun `keyword catches architectural job with missing soc code`() {
        assertTrue(ArchitecturalFilter.isArchitectural(job("AutoCAD Drafter")))
        assertTrue(ArchitecturalFilter.isArchitectural(job("Interior Design Assistant")))
    }

    @Test
    fun `hotel and construction labour survive the filter`() {
        assertFalse(ArchitecturalFilter.isArchitectural(job("Housekeeper", "37-2012.00", "Maids and Housekeeping Cleaners")))
        assertFalse(ArchitecturalFilter.isArchitectural(job("Concrete Finisher", "47-2051.00", "Cement Masons")))
    }

    @Test
    fun `keepNonArchitectural removes only architectural entries`() {
        val jobs = listOf(
            job("Farmworker", "45-2092.00"),
            job("Architect", "17-1011.00"),
            job("Landscaper", "37-3011.00"),
        )
        val kept = ArchitecturalFilter.keepNonArchitectural(jobs)
        assertEquals(2, kept.size)
        assertTrue(kept.none { it.title == "Architect" })
    }
}
