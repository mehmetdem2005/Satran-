package com.satran.jobapply

import com.satran.jobapply.data.translate.TextChunks
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TextChunksTest {

    @Test
    fun `kisa metin bolunmez`() {
        assertEquals(listOf("Harvest fruit by hand."), TextChunks.split("Harvest fruit by hand.", 100))
    }

    @Test
    fun `ondalik sayi ve kisaltma bolunmez`() {
        val text = "Wage is $18.93 per hour. Schedule is Mon.-Fri. from 8 A.M. to 4 P.M. " +
            "Housing is provided at no cost to the worker and all tools are supplied."
        val chunks = TextChunks.split(text, 60)
        // Bozuk bölme "$18." + "93" üretiyordu; hiçbir parça noktayla bitip
        // rakamla başlayamaz.
        assertTrue(chunks.none { it.endsWith("$18.") })
        assertTrue(chunks.none { it.trim().startsWith("93") })
        assertTrue(chunks.all { it.length <= 60 })
    }

    @Test
    fun `parca icindeki paragraf ayraci korunur`() {
        val text = "Job Duties:\n\nPick apples carefully.\n\n" +
            "Load bins onto the truck and stack them. ".repeat(12)
        val chunks = TextChunks.split(text, 200)
        // Boş satır atılırsa çeviri tek yoğun blok hâline geliyordu.
        assertTrue("paragraf ayracı kayboldu: ${chunks.first()}", chunks.first().contains("\n\n"))
    }

    @Test
    fun `sinirdan uzun tek kelime de bolunur`() {
        val long = "A".repeat(600)
        val chunks = TextChunks.split("See $long now", 100)
        // Bölünemeyen tek kelime sınırı aşan parça üretiyor, çeviri servisi de
        // onu reddedip alanın tamamını çevrilmemiş bırakıyordu.
        assertTrue("sınırı aşan parça var: ${chunks.map { it.length }}", chunks.all { it.length <= 100 })
    }

    @Test
    fun `bos metin bos liste dondurur`() {
        assertEquals(emptyList<String>(), TextChunks.split("   \n  ", 50))
    }

    @Test
    fun `butun icerik korunur`() {
        val text = "First sentence here. Second sentence follows. Third one ends it."
        val rebuilt = TextChunks.split(text, 25).joinToString(" ").replace(Regex("\\s+"), " ")
        assertEquals(text, rebuilt)
    }
}
