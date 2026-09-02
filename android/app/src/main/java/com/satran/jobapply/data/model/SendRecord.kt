package com.satran.jobapply.data.model

import kotlinx.serialization.Serializable

enum class SendStatus { QUEUED, SENDING, SENT, FAILED, SKIPPED }

@Serializable
data class SendRecord(
    val caseNumber: String,
    val title: String,
    val employer: String,
    val email: String,
    val status: SendStatus,
    val timestamp: Long = System.currentTimeMillis(),
    val error: String? = null,
)
