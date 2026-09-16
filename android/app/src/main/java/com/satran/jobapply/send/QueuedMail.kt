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
    /**
     * Bu iletiye kaç kez denendi.
     *
     * Geçici hatalar sona alınıp tekrar deneniyor; sayaç olmasaydı
     * sürekli hata veren tek bir ileti kuyruktan hiç çıkmaz, gönderim
     * sonsuza kadar onun etrafında dönerdi.
     */
    val attempts: Int = 0,
)
