package com.satran.jobapply.data.memory

import android.content.Context
import com.satran.jobapply.core.Net
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import java.io.File
import kotlin.math.ln

/**
 * Yerel geri getirme belleği (RAG).
 *
 * Sunucu ya da gömme (embedding) servisi gerektirmez: BM25 sıralamasıyla
 * telefonda çalışır. Mektup yazılırken "bu ilana benzeyen, daha önce
 * başvurduğun işler" ve "o işlere yazdığın mektuplar" bağlam olarak modele
 * verilir; böylece model her seferinde sıfırdan başlamaz.
 */
class RagStore(context: Context) {

    private val file = File(context.applicationContext.filesDir, "rag_memory.json")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _docs = MutableStateFlow<List<MemoryDoc>>(emptyList())
    val docs: StateFlow<List<MemoryDoc>> = _docs.asStateFlow()

    init {
        scope.launch { _docs.value = load() }
    }

    @Synchronized
    fun put(doc: MemoryDoc) = putAll(listOf(doc))

    @Synchronized
    fun putAll(incoming: List<MemoryDoc>) {
        if (incoming.isEmpty()) return
        val byId = LinkedHashMap<String, MemoryDoc>()
        // Yeni gelenler eskisinin üstüne yazar, sonra en yeniden eskiye sıralanır.
        _docs.value.forEach { byId[it.id] = it }
        incoming.forEach { byId[it.id] = it }
        val next = byId.values.sortedByDescending { it.timestamp }.take(MAX_DOCS)
        _docs.value = next
        persist(next)
    }

    @Synchronized
    fun clear() {
        _docs.value = emptyList()
        persist(emptyList())
    }

    /**
     * Sorguya en yakın [limit] parçayı BM25 ile döndürür.
     * Boş sorguda ya da boş bellekte boş liste verir.
     */
    fun retrieve(query: String, limit: Int, kinds: Set<MemoryDoc.Kind>? = null): List<MemoryDoc> {
        val corpus = _docs.value.let { all -> if (kinds == null) all else all.filter { it.kind in kinds } }
        if (corpus.isEmpty() || limit <= 0) return emptyList()

        val queryTerms = tokenize(query)
        if (queryTerms.isEmpty()) return emptyList()

        val tokenized = corpus.map { doc -> doc to tokenize("${doc.title} ${doc.text}") }
        val averageLength = tokenized.sumOf { it.second.size }.toDouble() / tokenized.size
        if (averageLength == 0.0) return emptyList()

        // Terim başına kaç belgede geçtiği — IDF için.
        val documentFrequency = HashMap<String, Int>()
        tokenized.forEach { (_, terms) ->
            terms.toSet().forEach { term -> documentFrequency[term] = (documentFrequency[term] ?: 0) + 1 }
        }

        val total = tokenized.size
        return tokenized
            .map { (doc, terms) ->
                val counts = terms.groupingBy { it }.eachCount()
                var score = 0.0
                queryTerms.toSet().forEach { term ->
                    val frequency = counts[term] ?: return@forEach
                    val df = documentFrequency[term] ?: 0
                    val idf = ln(1.0 + (total - df + 0.5) / (df + 0.5))
                    val norm = 1 - B + B * (terms.size / averageLength)
                    score += idf * (frequency * (K1 + 1)) / (frequency + K1 * norm)
                }
                doc to score
            }
            .filter { it.second > 0.0 }
            .sortedByDescending { it.second }
            .take(limit)
            .map { it.first }
    }

    private fun tokenize(text: String): List<String> = text
        .lowercase()
        .split(TOKEN_SPLIT)
        .filter { it.length > 2 && it !in STOP_WORDS }

    private fun persist(docs: List<MemoryDoc>) {
        scope.launch {
            runCatching {
                file.writeText(Net.json.encodeToString(ListSerializer(MemoryDoc.serializer()), docs))
            }
        }
    }

    private fun load(): List<MemoryDoc> {
        if (!file.exists()) return emptyList()
        return runCatching {
            Net.json.decodeFromString(ListSerializer(MemoryDoc.serializer()), file.readText())
        }.getOrElse { emptyList() }
    }

    private companion object {
        const val MAX_DOCS = 1200
        const val K1 = 1.2
        const val B = 0.75
        val TOKEN_SPLIT = Regex("[^\\p{L}\\p{N}]+")
        val STOP_WORDS = setOf(
            "the", "and", "for", "with", "will", "must", "not", "are", "you", "your", "our",
            "this", "that", "from", "have", "has", "may", "all", "any", "per", "job", "work",
            "ile", "ve", "bir", "bu", "icin", "için", "olan", "daha", "gibi",
        )
    }
}
