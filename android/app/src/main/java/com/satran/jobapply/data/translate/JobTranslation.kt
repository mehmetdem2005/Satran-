package com.satran.jobapply.data.translate

/**
 * Bir ilanın çevrilmiş alanları.
 *
 * Tek kayıtta tutulur ki çeviri açılıp kapandığında bütün alanlar birlikte
 * özgün hâline dönsün.
 *
 * [headlineDone] / [bodyDone] alanların **denenmiş** olduğunu söyler; değerin
 * kendisi null olabilir (çeviri özgün metinle aynı çıktıysa saklamaya gerek
 * yok). Bu ayrım olmadan, çevirisi değişmeyen başlıklar her turda yeniden
 * çevrilmeye çalışılırdı.
 */
data class JobTranslation(
    val title: String? = null,
    val socTitle: String? = null,
    val duties: String? = null,
    val requirements: String? = null,
    /** Yapay zekâ motoru seçiliyse düz çeviri yerine üretilen özet. */
    val aiSummary: String? = null,
    val headlineDone: Boolean = false,
    val bodyDone: Boolean = false,
) {
    /** Gösterilecek bir şey var mı — kart bu durumda "çevrili" sayılır. */
    val hasContent: Boolean
        get() = !title.isNullOrBlank() || !socTitle.isNullOrBlank() ||
            !duties.isNullOrBlank() || !requirements.isNullOrBlank() ||
            !aiSummary.isNullOrBlank()

    fun mergedWith(other: JobTranslation) = JobTranslation(
        title = other.title ?: title,
        socTitle = other.socTitle ?: socTitle,
        duties = other.duties ?: duties,
        requirements = other.requirements ?: requirements,
        aiSummary = other.aiSummary ?: aiSummary,
        headlineDone = headlineDone || other.headlineDone,
        bodyDone = bodyDone || other.bodyDone,
    )
}
