package com.satran.jobapply.data.filter

/**
 * Arama isteğinin **gerçek** gövdesini kurar.
 *
 * Buradaki her süzgeç seasonaljobs.dol.gov'un Azure Search dizinindeki bir alana
 * karşılık gelir ve sunucuda çalışır — istemcide "gibi yapan" süzgeç yoktur.
 * Üretilen ifadeler [Built] içinde döner, arayüzde olduğu gibi gösterilir.
 *
 * Doğrulanmış alanlar ve söz dizimi (canlı uçta sınandı):
 *  - `active eq true`, `display eq true`
 *  - `apply_email ne null and apply_email ne 'N/A'`
 *  - `worksite_state eq '...'`, `visa_class eq 'H-2A' | 'H-2B'`
 *  - SOC aralığı: `soc_code_id ge '45-' and soc_code_id lt '46-'`
 *    (Azure Search `startswith` desteklemez; aralık karşılaştırması destekler.)
 *  - Kelime dışlama: simple söz diziminde `-kelime` (tek başına da çalışır)
 */
object JobQuery {

    /**
     * ABD'de mevsimlik iş iki programa ayrılır:
     *  - **H-2A** tarım işçiliği,
     *  - **H-2B** tarım dışı işler (otel, restoran, peyzaj, inşaat, temizlik...).
     *
     * "Tarım dışı" süzgeci bu resmî ayrımı kullanır ve ek olarak
     * SOC 45 ("Farming, Fishing, and Forestry") ana grubunu da eler.
     */
    const val NON_AGRICULTURAL_VISA = "H-2B"
    const val AGRICULTURAL_VISA = "H-2A"

    /** SOC 45-xxxx = Farming, Fishing, and Forestry Occupations. */
    private const val SOC_AGRICULTURE_FROM = "45-"
    private const val SOC_AGRICULTURE_TO = "46-"

    /**
     * Geri çekilmiş ya da reddedilmiş başvurular. Bunlara yazmanın anlamı yok;
     * "aktif" penceresi gevşetildiğinde araya karışmasınlar diye elenir.
     */
    private val DEAD_STATUSES = listOf(
        "Withdrawn",
        "Determination Issued - Denied",
        "Determination Issued - Withdrawn",
        "Pending Action - Recruitment Report not Received",
    )

    data class Input(
        val text: String = "",
        val state: String? = null,
        val visaClass: String? = null,
        val emailOnly: Boolean = true,
        val excludeAgricultural: Boolean = true,
        val blockedWords: List<String> = emptyList(),
        val requiredWords: List<String> = emptyList(),
        /**
         * İşe başlama tarihi gelecekte olan, belgesi çıkmış ama sitenin
         * "aktif" penceresi kapanmış ilanlar da gelsin mi?
         */
        val includeUpcoming: Boolean = true,
        /** Gelecek tarih karşılaştırması için OData zaman damgası. */
        val nowIso: String = "",
    )

    /** Sunucuya gönderilen iki dize. Arayüz bunları olduğu gibi gösterir. */
    data class Built(
        val filter: String,
        val search: String,
        val searchMode: String,
    )

    fun build(input: Input): Built = Built(
        filter = buildFilter(input),
        search = buildSearch(input),
        // Zorunlu ve yasaklı kelimelerin hepsi birden uygulansın diye "all".
        searchMode = if (input.requiredWords.isEmpty() && input.blockedWords.isEmpty()) "any" else "all",
    )

    private fun buildFilter(input: Input): String {
        val clauses = mutableListOf("display eq true")

        // `active`, DOL sitesinin kendi gösterim penceresidir; işi bitmemiş,
        // belgesi çıkmış binlerce ilan bu pencere kapandığı için gizli kalıyor.
        // Yurt dışından başvuran için asıl değerli olanlar bunlar: işe başlama
        // tarihi ileride olduğu için vize süreci yetişiyor.
        if (input.includeUpcoming && input.nowIso.isNotEmpty()) {
            clauses += "not search.in(case_status, '${DEAD_STATUSES.joinToString("|")}', '|')"
            clauses += "(active eq true or begin_date gt ${input.nowIso})"
        } else {
            clauses += "active eq true"
        }
        if (input.emailOnly) {
            clauses += "apply_email ne null"
            clauses += "apply_email ne 'N/A'"
        }
        if (input.excludeAgricultural) {
            clauses += "visa_class eq '$NON_AGRICULTURAL_VISA'"
            clauses += "not (soc_code_id ge '$SOC_AGRICULTURE_FROM' and soc_code_id lt '$SOC_AGRICULTURE_TO')"
        }
        input.state?.let { clauses += "worksite_state eq '${it.odataEscape()}'" }
        // Tarım dışı süzgeci zaten vizeyi sabitliyor; ikisi çakışmasın.
        if (!input.excludeAgricultural) {
            input.visaClass?.let { clauses += "visa_class eq '${it.odataEscape()}'" }
        }
        return clauses.joinToString(" and ")
    }

    private fun buildSearch(input: Input): String {
        val parts = mutableListOf<String>()
        val text = input.text.trim()
        if (text.isNotEmpty()) parts += text
        input.requiredWords.forEach { word -> normalize(word)?.let { parts += it } }
        input.blockedWords.forEach { word -> normalize(word)?.let { parts += "-$it" } }
        // Hiç terim yoksa "*" bütün dizini tarar.
        return parts.joinToString(" ").ifBlank { "*" }
    }

    /** Kullanıcının yazdığı kelimeyi sorguya güvenle koyulabilir hale getirir. */
    private fun normalize(word: String): String? {
        val cleaned = word.trim().trim(',', ';', '"').trim()
        if (cleaned.isEmpty()) return null
        // Boşluklu ifadeler tırnak içinde tam öbek olarak aranır.
        return if (cleaned.contains(' ')) "\"$cleaned\"" else cleaned
    }

    /** Virgül/satır ile ayrılmış kullanıcı girdisini kelime listesine çevirir. */
    fun parseWordList(raw: String): List<String> = raw
        .split(',', '\n', ';')
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .distinct()

    private fun String.odataEscape(): String = replace("'", "''")
}
