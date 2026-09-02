package com.satran.jobapply.send

import kotlinx.serialization.Serializable

/** Kuyruğa alınmış tek bir başvuru e-postası. */
@Serializable
data class QueuedMail(
    val caseNumber: String,
    val title: String,
    val employer: String,
    val to: String,
    val subject: String,
    val body: String,
)
