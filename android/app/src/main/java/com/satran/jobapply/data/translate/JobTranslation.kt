package com.satran.jobapply.data.translate

/**
 * Bir ilanın çevrilmiş alanları.
 *
 * Tek bir kayıtta tutulur ki çeviri açılıp kapandığında **bütün alanlar
 * birlikte** özgün hâline dönsün. Önceden başlık ve açıklama ayrı yerlerde
 * tutuluyordu; kapatınca başlık İngilizceye dönüyor ama açıklama Türkçe
 * kalıyordu.
 */
data class JobTranslation(
    val title: String? = null,
    val socTitle: String? = null,
    val duties: String? = null,
    val requirements: String? = null,
    /** Yapay zekâ motoru seçiliyse düz çeviri yerine üretilen özet. */
    val aiSummary: String? = null,
) {
    /** Başlık çevrildi mi — liste görünümü buna bakar. */
    val hasHeadline: Boolean get() = !title.isNullOrBlank()

    /** Açıklama çevrildi mi — kart açılınca buna bakılır. */
    val hasBody: Boolean get() = !duties.isNullOrBlank() || !aiSummary.isNullOrBlank()
}
