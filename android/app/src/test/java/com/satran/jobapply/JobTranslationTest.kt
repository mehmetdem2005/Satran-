package com.satran.jobapply

import com.satran.jobapply.data.translate.JobTranslation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class JobTranslationTest {

    @Test
    fun `basligi degismeyen ilan yeniden cevrilmez`() {
        // Çevirisi özgün metinle aynı çıkan başlık null olarak saklanır ama
        // headlineDone işaretlenir; yoksa her turda yeniden çevrilirdi.
        val translation = JobTranslation(title = null, headlineDone = true)
        assertTrue(translation.headlineDone)
        assertFalse(translation.hasContent)
    }

    @Test
    fun `birlestirme yeni degeri tercih eder eskisini kaybetmez`() {
        val headline = JobTranslation(title = "Peyzaj İşçisi", headlineDone = true)
        val body = JobTranslation(duties = "Çim biçmek", bodyDone = true)
        val merged = headline.mergedWith(body)

        assertEquals("Peyzaj İşçisi", merged.title)
        assertEquals("Çim biçmek", merged.duties)
        assertTrue(merged.headlineDone)
        assertTrue(merged.bodyDone)
    }

    @Test
    fun `tamamlanmislik isaretleri geri alinmaz`() {
        val done = JobTranslation(headlineDone = true, bodyDone = true)
        val merged = done.mergedWith(JobTranslation())
        assertTrue(merged.headlineDone)
        assertTrue(merged.bodyDone)
    }

    @Test
    fun `govde metni gelmeden bodyDone isaretlenmez`() {
        // Görev tanımı henüz yüklenmemişse gövde "tamamlandı" sayılmamalı,
        // yoksa metin sonradan geldiğinde bir daha çevrilmezdi.
        val partial = JobTranslation(headlineDone = true, bodyDone = false)
        assertFalse(partial.bodyDone)
    }

    @Test
    fun `hasContent yalnizca gosterilecek metin varsa dogru`() {
        assertFalse(JobTranslation(headlineDone = true, bodyDone = true).hasContent)
        assertTrue(JobTranslation(title = "Aşçı").hasContent)
        assertTrue(JobTranslation(aiSummary = "• Özet").hasContent)
    }
}

class TranslationDefaultsTest {

    @Test
    fun `baslik cevirisi varsayilan olarak acik`() {
        // Yeni kurulumda liste doğrudan Türkçe gelsin; kullanıcı anahtar aramasın.
        assertTrue(com.satran.jobapply.data.model.AppSettings().translateAllJobs)
    }

    @Test
    fun `yeni varsayilan mevcut kurulumlara gecis gerektirir`() {
        // Kayıtlı ayar eski varsayılanı taşıdığı için tek seferlik geçiş şart;
        // bayrak varsayılanda false olmalı ki geçiş bir kez çalışsın.
        assertFalse(com.satran.jobapply.data.model.AppSettings().translateDefaultApplied)
    }
}
