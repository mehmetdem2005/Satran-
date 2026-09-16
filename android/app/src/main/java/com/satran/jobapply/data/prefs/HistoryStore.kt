package com.satran.jobapply.data.prefs

import android.content.Context
import com.satran.jobapply.core.Net
import com.satran.jobapply.data.model.SendRecord
import com.satran.jobapply.data.model.SendStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.SetSerializer
import kotlinx.serialization.builtins.serializer
import java.io.File

/** Gönderim geçmişi: hangi ilana ne zaman başvurduğun ve sonucu. */
class HistoryStore(context: Context) {

    private val file = File(context.applicationContext.filesDir, "send_history.json")

    /**
     * Başvurulan ilanların numaraları — ayrı ve **sınırsız** tutulur.
     *
     * Eskiden bu küme [records] listesinden türetiliyordu; o liste
     * [MAX_RECORDS] kayıtta kesildiği için 500. başvurudan sonra uygulama
     * en eski başvurularını unutuyor ve aynı işverene ikinci kez mektup
     * gönderiyordu. Numaraları saklamak kayıt başına ~20 bayt; 8000 ilan
     * için bile 160 KB.
     */
    private val appliedFile = File(context.applicationContext.filesDir, "applied_cases.json")

    private val _records = MutableStateFlow(load())
    val records: StateFlow<List<SendRecord>> = _records.asStateFlow()

    private val _applied = MutableStateFlow(loadApplied())

    /** Daha önce başarıyla başvurulan ilanların case numaraları. */
    val appliedCaseNumbers: Set<String> get() = _applied.value

    @Synchronized
    fun add(record: SendRecord) {
        val next = (listOf(record) + _records.value).take(MAX_RECORDS)
        _records.value = next
        persist(next)
        if (record.status == SendStatus.SENT) markApplied(setOf(record.caseNumber))
    }

    @Synchronized
    fun addAll(records: List<SendRecord>) {
        if (records.isEmpty()) return
        val next = (records.reversed() + _records.value).take(MAX_RECORDS)
        _records.value = next
        persist(next)
        markApplied(records.filter { it.status == SendStatus.SENT }.mapTo(HashSet()) { it.caseNumber })
    }

    @Synchronized
    fun clear() {
        _records.value = emptyList()
        persist(emptyList())
        _applied.value = emptySet()
        runCatching { appliedFile.delete() }
    }

    private fun markApplied(cases: Set<String>) {
        if (cases.isEmpty()) return
        val next = _applied.value + cases
        if (next.size == _applied.value.size) return
        _applied.value = next
        runCatching {
            appliedFile.writeText(Net.json.encodeToString(SetSerializer(String.serializer()), next))
        }
    }

    /**
     * Ayrı dosya yoksa eldeki kayıtlardan kurulur: eski kurulumlarda
     * başvurulanlar kaybolmasın diye.
     */
    private fun loadApplied(): Set<String> {
        if (appliedFile.exists()) {
            runCatching {
                return Net.json.decodeFromString(SetSerializer(String.serializer()), appliedFile.readText())
            }
        }
        val seeded = _records.value
            .filter { it.status == SendStatus.SENT }
            .mapTo(HashSet()) { it.caseNumber }
        if (seeded.isNotEmpty()) {
            runCatching {
                appliedFile.writeText(Net.json.encodeToString(SetSerializer(String.serializer()), seeded))
            }
        }
        return seeded
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
