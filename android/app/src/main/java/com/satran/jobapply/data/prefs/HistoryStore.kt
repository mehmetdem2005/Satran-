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

    private val appliedEmailFile = File(context.applicationContext.filesDir, "applied_emails.json")

    private val _applied = MutableStateFlow(loadApplied())
    private val _appliedEmails = MutableStateFlow(loadAppliedEmails())

    /** Daha önce başarıyla başvurulan ilanların case numaraları. */
    val appliedCaseNumbers: Set<String> get() = _applied.value

    /**
     * Daha önce mektup gönderilen işveren adresleri.
     *
     * Kaynaklar ayrı listeler hâlinde duruyor ama **aynı işveren iki
     * kaynakta birden** çıkabiliyor: ölçüldü, 6.660 OFLC adresinin 1.994'ü
     * seasonaljobs'ta da var. İlan numarasına bakmak yetmez, numaralar
     * farklı; aynı kişiye iki mektup gitmesin diye adres de tutulur.
     */
    val appliedEmails: Set<String> get() = _appliedEmails.value

    /** Bu adrese daha önce mektup gitti mi? */
    fun hasWrittenTo(email: String?): Boolean =
        email != null && email.trim().lowercase() in _appliedEmails.value

    @Synchronized
    fun add(record: SendRecord) {
        val next = (listOf(record) + _records.value).take(MAX_RECORDS)
        _records.value = next
        persist(next)
        if (record.status == SendStatus.SENT) {
            markApplied(setOf(record.caseNumber))
            markEmailed(setOf(record.email))
        }
    }

    @Synchronized
    fun addAll(records: List<SendRecord>) {
        if (records.isEmpty()) return
        val next = (records.reversed() + _records.value).take(MAX_RECORDS)
        _records.value = next
        persist(next)
        val sent = records.filter { it.status == SendStatus.SENT }
        markApplied(sent.mapTo(HashSet()) { it.caseNumber })
        markEmailed(sent.mapTo(HashSet()) { it.email })
    }

    @Synchronized
    fun clear() {
        _records.value = emptyList()
        persist(emptyList())
        _applied.value = emptySet()
        _appliedEmails.value = emptySet()
        runCatching { appliedFile.delete() }
        runCatching { appliedEmailFile.delete() }
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

    private fun markEmailed(emails: Set<String>) {
        val cleaned = emails.mapNotNull { it.trim().lowercase().takeIf { e -> "@" in e } }.toSet()
        if (cleaned.isEmpty()) return
        val next = _appliedEmails.value + cleaned
        if (next.size == _appliedEmails.value.size) return
        _appliedEmails.value = next
        runCatching {
            appliedEmailFile.writeText(Net.json.encodeToString(SetSerializer(String.serializer()), next))
        }
    }

    private fun loadAppliedEmails(): Set<String> {
        if (appliedEmailFile.exists()) {
            runCatching {
                return Net.json.decodeFromString(SetSerializer(String.serializer()), appliedEmailFile.readText())
            }
        }
        // Eski kurulumlarda adres listesi yok; eldeki kayıtlardan kurulur.
        val seeded = _records.value
            .filter { it.status == SendStatus.SENT }
            .mapNotNullTo(HashSet()) { it.email.trim().lowercase().takeIf { e -> "@" in e } }
        if (seeded.isNotEmpty()) {
            runCatching {
                appliedEmailFile.writeText(Net.json.encodeToString(SetSerializer(String.serializer()), seeded))
            }
        }
        return seeded
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
