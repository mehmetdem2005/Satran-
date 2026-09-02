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
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.io.File

/** Yapılmış bir arama ve sonucu. */
@Serializable
data class SearchEntry(
    val query: String,
    val state: String? = null,
    val sortLabel: String = "",
    val offset: Int = 0,
    val fetched: Int = 0,
    val newJobs: Int = 0,
    val totalMatches: Int = 0,
    val timestamp: Long = System.currentTimeMillis(),
)

/** Arama geçmişi — en yeni arama en üstte, silinmez. */
class SearchHistoryStore(context: Context) {

    private val file = File(context.applicationContext.filesDir, "search_history.json")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _entries = MutableStateFlow<List<SearchEntry>>(emptyList())
    val entries: StateFlow<List<SearchEntry>> = _entries.asStateFlow()

    init {
        scope.launch { _entries.value = load() }
    }

    @Synchronized
    fun add(entry: SearchEntry) {
        val next = (listOf(entry) + _entries.value).take(MAX_ENTRIES)
        _entries.value = next
        persist(next)
    }

    /** Aynı sorgu için en son nereye kadar gelindiği — "sonraki sayfa" bunu kullanır. */
    fun lastOffsetFor(query: String, state: String?): Int =
        _entries.value.firstOrNull { it.query == query && it.state == state }?.let { it.offset + it.fetched } ?: 0

    @Synchronized
    fun clear() {
        _entries.value = emptyList()
        persist(emptyList())
    }

    private fun persist(entries: List<SearchEntry>) {
        scope.launch {
            runCatching {
                file.writeText(Net.json.encodeToString(ListSerializer(SearchEntry.serializer()), entries))
            }
        }
    }

    private fun load(): List<SearchEntry> {
        if (!file.exists()) return emptyList()
        return runCatching {
            Net.json.decodeFromString(ListSerializer(SearchEntry.serializer()), file.readText())
        }.getOrElse { emptyList() }
    }

    private companion object {
        const val MAX_ENTRIES = 300
    }
}
