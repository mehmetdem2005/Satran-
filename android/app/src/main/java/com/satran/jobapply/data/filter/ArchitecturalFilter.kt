package com.satran.jobapply.data.filter

import com.satran.jobapply.data.model.Job

/**
 * "Mimarlık dışı" süzgeci.
 *
 * İki katman kullanılır:
 *  1. SOC kodu — 17-xxxx (Architecture and Engineering) ana grubu ve mimarlığa özgü kodlar.
 *  2. Başlık/görev metnindeki anahtar sözcükler.
 *
 * "Landscaping and Groundskeeping" (37-3011) gibi bahçe işleri mimarlık DEĞİLDİR;
 * bu yüzden yalnızca "landscape architect" tam ifadesi elenir, tek başına "landscape" elenmez.
 */
object ArchitecturalFilter {

    /** Mimarlık/mühendislik çizim mesleklerinin SOC kodları. */
    private val ARCHITECTURAL_SOC_PREFIXES = listOf(
        "17-1011", // Architects, Except Landscape and Naval
        "17-1012", // Landscape Architects
        "17-1013", // Naval Architects
        "17-3011", // Architectural and Civil Drafters
        "17-3012", // Electrical and Electronics Drafters
        "17-3013", // Mechanical Drafters
        "27-1025", // Interior Designers
    )

    /** 17- ana grubu bütünüyle "Architecture and Engineering Occupations". */
    private const val ARCH_ENG_MAJOR_GROUP = "17-"

    private val KEYWORDS = listOf(
        "architect", "architecture", "architectural", "mimar",
        "landscape architect", "naval architect",
        "draftsman", "draftsperson", "drafter", "drafting",
        "autocad", "auto cad", "revit", "bim modeler", "bim modeller",
        "urban planner", "urban planning", "city planner",
        "interior designer", "interior design",
        "building designer", "structural designer",
    )

    /** Başlık ya da meslek adı mimarlık işaret ediyorsa true. */
    fun isArchitectural(job: Job): Boolean {
        val soc = job.socCode.orEmpty()
        if (ARCHITECTURAL_SOC_PREFIXES.any { soc.startsWith(it) }) return true
        if (soc.startsWith(ARCH_ENG_MAJOR_GROUP)) return true

        val haystack = buildString {
            append(job.title.lowercase())
            append(' ')
            append(job.socTitle.orEmpty().lowercase())
        }
        return KEYWORDS.any { haystack.contains(it) }
    }

    fun keepNonArchitectural(jobs: List<Job>): List<Job> = jobs.filterNot { isArchitectural(it) }
}
