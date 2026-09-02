package com.satran.jobapply

import com.satran.jobapply.data.filter.JobQuery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Bu testler süzgeçlerin **gerçek** olduğunu, yani canlı uçta sınanmış
 * ifadelere dönüştüğünü sabitler. İfadeler değişirse test kırılır.
 */
class JobQueryTest {

    @Test
    fun `tarim disi suzgeci H-2B ve SOC 45 haric uretir`() {
        val built = JobQuery.build(JobQuery.Input(excludeAgricultural = true, emailOnly = false))
        assertTrue(built.filter.contains("visa_class eq 'H-2B'"))
        assertTrue(built.filter.contains("not (soc_code_id ge '45-' and soc_code_id lt '46-')"))
    }

    @Test
    fun `tarim suzgeci kapaliyken vize kisiti eklenmez`() {
        val built = JobQuery.build(JobQuery.Input(excludeAgricultural = false, emailOnly = false))
        assertFalse(built.filter.contains("visa_class"))
        assertFalse(built.filter.contains("soc_code_id"))
    }

    @Test
    fun `aktif ve gorunur kosullari her zaman var`() {
        val built = JobQuery.build(JobQuery.Input())
        assertTrue(built.filter.contains("active eq true"))
        assertTrue(built.filter.contains("display eq true"))
    }

    @Test
    fun `e-posta suzgeci N-A degerini de eler`() {
        val built = JobQuery.build(JobQuery.Input(emailOnly = true))
        assertTrue(built.filter.contains("apply_email ne null"))
        assertTrue(built.filter.contains("apply_email ne 'N/A'"))
    }

    @Test
    fun `yasakli kelimeler eksi isaretiyle sorguya girer`() {
        val built = JobQuery.build(
            JobQuery.Input(text = "hotel", blockedWords = listOf("lbs", "pounds")),
        )
        assertEquals("hotel -lbs -pounds", built.search)
        // Hepsi birden uygulansın diye searchMode "all" olmalı.
        assertEquals("all", built.searchMode)
    }

    @Test
    fun `yalnizca yasakli kelime varken de sorgu gecerli kalir`() {
        val built = JobQuery.build(JobQuery.Input(blockedWords = listOf("lbs")))
        assertEquals("-lbs", built.search)
    }

    @Test
    fun `hic terim yoksa yildiz kullanilir`() {
        assertEquals("*", JobQuery.build(JobQuery.Input()).search)
    }

    @Test
    fun `zorunlu kelimeler dogrudan terim olarak eklenir`() {
        val built = JobQuery.build(JobQuery.Input(requiredWords = listOf("housing"), blockedWords = listOf("lbs")))
        assertEquals("housing -lbs", built.search)
    }

    @Test
    fun `bosluklu ifade tirnak icine alinir`() {
        val built = JobQuery.build(JobQuery.Input(blockedWords = listOf("night shift")))
        assertEquals("-\"night shift\"", built.search)
    }

    @Test
    fun `eyalet adindaki tek tirnak kacirilir`() {
        val built = JobQuery.build(JobQuery.Input(state = "O'HARA", excludeAgricultural = false, emailOnly = false))
        assertTrue(built.filter.contains("worksite_state eq 'O''HARA'"))
    }

    @Test
    fun `kelime listesi virgul ve satirla ayrilir`() {
        assertEquals(
            listOf("lbs", "lb", "pounds"),
            JobQuery.parseWordList(" lbs , lb \n pounds ,, "),
        )
    }

    @Test
    fun `ayni kelime iki kez sayilmaz`() {
        assertEquals(listOf("lbs"), JobQuery.parseWordList("lbs, lbs , LBS ".lowercase()))
    }
}
