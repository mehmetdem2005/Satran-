package com.satran.jobapply.data.prefs

import android.content.Context
import com.satran.jobapply.core.Net
import com.satran.jobapply.data.model.SendRecord
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.builtins.ListSerializer
import java.io.File

/** Gönderim geçmişi: hangi ilana ne zaman başvurduğun ve sonucu. */
class HistoryStore(context: Context) {

    private val file = File(context.applicationContext.filesDir, "send_history.json")

    private val _records = MutableStateFlow(load())
    val records: StateFlow<List<SendRecord>> = _records.asStateFlow()

    /** Daha önce başarıyla başvurulan ilanların case numaraları. */
    val appliedCaseNumbers: Set<String>
        get() = _records.value.filter { it.status == com.satran.jobapply.data.model.SendStatus.SENT }
            .map { it.caseNumber }
            .toSet()

    @Synchronized
    fun add(record: SendRecord) {
        val next = (listOf(record) + _records.value).take(MAX_RECORDS)
        _records.value = next
        persist(next)
    }

    @Synchronized
    fun addAll(records: List<SendRecord>) {
        if (records.isEmpty()) return
        val next = (records.reversed() + _records.value).take(MAX_RECORDS)
        _records.value = next
        persist(next)
    }

    @Synchronized
    fun clear() {
        _records.value = emptyList()
        persist(emptyList())
    }

    private fun persist(records: List<SendRecord>) {
        runCatching {
            file.writeText(Net.json.encodeToString(ListSerializer(SendRecord.serializer()), records))
        }
    }

    private fun load(): List<SendRecord> {
        if (!file.exists()) return emptyList()
        return runCatching {
            Net.json.decodeFromString(ListSerializer(SendRecord.serializer()), file.readText())
        }.getOrElse { emptyList() }
    }

    private companion object {
        const val MAX_RECORDS = 500
    }
}
