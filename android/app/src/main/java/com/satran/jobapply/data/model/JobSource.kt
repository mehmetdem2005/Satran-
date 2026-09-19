package com.satran.jobapply.data.model

/**
 * İlanın hangi resmî kaynaktan geldiği.
 *
 * Kaynaklar **ayrı** tutulur: listeler karışmaz, gönderim kuyrukları ayrıdır,
 * her birine ayrı ayrı toplu başvuru yapılır. Tek ortak kural, aynı işverene
 * iki kaynaktan iki mektup gitmemesidir — o kontrol e-posta adresi üzerinden
 * yapılır (bkz. `HistoryStore.appliedEmails`).
 */
enum class JobSource(
    val id: String,
    val label: String,
    val shortLabel: String,
    /** Kaynağın ne olduğu; arayüzde olduğu gibi gösterilir. */
    val description: String,
    /** Adresin ne için yayımlandığı — gönderim beklentisini doğru kurar. */
    val contactNote: String,
) {
    SEASONAL_JOBS(
        id = "seasonaljobs",
        label = "SeasonalJobs (DOL iş ilanı sitesi)",
        shortLabel = "SeasonalJobs",
        description = "seasonaljobs.dol.gov — Çalışma Bakanlığı'nın canlı ilan sitesi. " +
            "İlanlar dakika dakika güncellenir.",
        contactNote = "Buradaki adresler doğrudan başvuru için yayımlanır; mektup beklenen yerdir.",
    ),

    OFLC_DISCLOSURE(
        id = "oflc",
        label = "OFLC açıklama verisi (onaylı H-2B başvuruları)",
        shortLabel = "OFLC verisi",
        description = "dol.gov — Çalışma Bakanlığı'nın üç ayda bir yayımladığı onaylı " +
            "H-2B başvuru dosyası. İlan sitesinde görünmeyen işverenleri içerir.",
        contactNote = "Bu adresler şirketin DOL'a bildirdiği **idari irtibat** kişisidir, " +
            "ilan adresi değildir. Dönüş oranı düşüktür; yazarken bunu bil.",
    );

    companion object {
        fun from(id: String?): JobSource = entries.firstOrNull { it.id == id } ?: SEASONAL_JOBS
    }
}
