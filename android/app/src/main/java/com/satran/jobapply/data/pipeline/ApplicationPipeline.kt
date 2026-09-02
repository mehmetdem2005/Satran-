package com.satran.jobapply.data.pipeline

import com.satran.jobapply.core.truncate
import com.satran.jobapply.data.mail.MailTemplate
import com.satran.jobapply.data.memory.MemoryDoc
import com.satran.jobapply.data.memory.RagStore
import com.satran.jobapply.data.model.AppSettings
import com.satran.jobapply.data.model.Job
import com.satran.jobapply.data.remote.AiClient
import com.satran.jobapply.data.remote.WebSearchClient
import com.satran.jobapply.send.QueuedMail

/**
 * Her ilan için çalışan zincir.
 *
 * DeepSeek'in sohbet ucunda gömülü web araması yoktur; bu yüzden iş bölümü şu:
 *
 * ```
 * 1. Sorgu       model  -> "Deer Valley Resort Park City Utah H-2B worker reviews"
 * 2. Arama       Tavily/Serper/Brave -> gerçek web sonuçları
 * 3. Özet        model  -> sonuçları işveren brifingine çevirir
 * 4. Bellek      RAG    -> benzer geçmiş ilan/mektupları getirir
 * 5. Mektup      model  -> brifing + bellek + ilan ile mektubu yazar
 * 6. Kayıt       RAG    -> mektup ve brifing belleğe geri yazılır
 * ```
 *
 * Kapalı olan adım sessizce atlanır; zincir hiçbir adımda kırılmaz, en kötü
 * ihtimalle şablon mektubuna düşer.
 */
class ApplicationPipeline(
    private val settings: AppSettings,
    private val ai: AiClient,
    private val search: WebSearchClient,
    private val rag: RagStore,
) {

    /** Zincirin hangi adımda olduğunu arayüze bildirir. */
    enum class Step(val label: String) {
        QUERY("arama sorgusu yazılıyor"),
        SEARCH("internet aranıyor"),
        BRIEF("işveren brifingi çıkarılıyor"),
        MEMORY("geçmiş başvurular getiriliyor"),
        LETTER("mektup yazılıyor"),
        DONE("hazır"),
    }

    data class Result(
        val mail: QueuedMail,
        val research: String?,
        val searchHits: Int,
        val memoryHits: Int,
        val usedAi: Boolean,
        val warning: String?,
    )

    suspend fun run(job: Job, onStep: (Step) -> Unit): Result {
        val to = job.email ?: error("Bu ilanda başvuru e-postası yok.")

        var subject = MailTemplate.render(settings.subjectTemplate, job, settings)
        var body = MailTemplate.render(settings.bodyTemplate, job, settings)
        var research: String? = null
        var searchHits = 0
        var memoryHits = 0
        var warning: String? = null

        val aiOn = settings.aiWriteLetters && settings.aiReady
        if (!aiOn) {
            onStep(Step.DONE)
            return Result(
                mail = QueuedMail(job.caseNumber, job.title, job.employer, to, subject, body),
                research = null,
                searchHits = 0,
                memoryHits = 0,
                usedAi = false,
                warning = if (settings.aiWriteLetters && !settings.aiReady) {
                    "Yapay zekâ ayarı eksik, şablon kullanıldı"
                } else {
                    null
                },
            )
        }

        // 1-3. İnternet araması: sorguyu model yazar, aramayı uygulama yapar.
        if (settings.researchBeforeSending && settings.searchReady) {
            val outcome = runCatching {
                onStep(Step.QUERY)
                val query = ai.buildEmployerQuery(job)

                onStep(Step.SEARCH)
                val hits = search.search(query, settings.searchResultsPerJob)
                searchHits = hits.size

                if (hits.isEmpty()) {
                    null
                } else {
                    onStep(Step.BRIEF)
                    ai.summarizeResearch(job, hits)
                }
            }
            research = outcome.getOrNull()
            outcome.exceptionOrNull()?.let { warning = "araştırma atlandı (${it.message?.truncate(80)})" }
        }

        // 4. Bellek: bu ilana benzeyen geçmiş ilanlar ve onlara yazılan mektuplar.
        var memoryBlock: String? = null
        if (settings.useRagMemory) {
            onStep(Step.MEMORY)
            val related = rag.retrieve(
                query = "${job.title} ${job.socTitle.orEmpty()} ${job.employer} ${job.duties.orEmpty().take(400)}",
                limit = settings.ragContextSize,
                kinds = setOf(MemoryDoc.Kind.LETTER, MemoryDoc.Kind.JOB, MemoryDoc.Kind.PROFILE),
            )
            memoryHits = related.size
            if (related.isNotEmpty()) {
                memoryBlock = related.joinToString("\n\n") { "[${it.kind.label}] ${it.title}\n${it.text.truncate(500)}" }
            }
        }

        // 5. Mektup.
        onStep(Step.LETTER)
        runCatching { ai.writeLetter(job, research = research, memory = memoryBlock) }
            .onSuccess { letter ->
                letter.subject?.takeIf { it.isNotBlank() }?.let { subject = it }
                if (letter.body.isNotBlank()) body = letter.body
            }
            .onFailure { error ->
                warning = listOfNotNull(warning, "mektup üretilemedi, şablon kullanıldı (${error.message?.truncate(80)})")
                    .joinToString(" · ")
            }

        // 6. Belleğe geri yaz — bir sonraki başvuru bunları bağlam olarak görür.
        val remembered = mutableListOf(
            MemoryDoc(
                id = "job:${job.caseNumber}",
                kind = MemoryDoc.Kind.JOB,
                title = "${job.title} — ${job.employer} (${job.location})",
                text = job.toPromptBlock(),
            ),
            MemoryDoc(
                id = "letter:${job.caseNumber}",
                kind = MemoryDoc.Kind.LETTER,
                title = subject,
                text = body,
            ),
        )
        research?.takeIf { it.isNotBlank() }?.let {
            remembered += MemoryDoc(
                id = "research:${job.caseNumber}",
                kind = MemoryDoc.Kind.RESEARCH,
                title = "${job.employer} araştırması",
                text = it,
            )
        }
        rag.putAll(remembered)

        onStep(Step.DONE)
        return Result(
            mail = QueuedMail(job.caseNumber, job.title, job.employer, to, subject, body),
            research = research,
            searchHits = searchHits,
            memoryHits = memoryHits,
            usedAi = true,
            warning = warning,
        )
    }
}
