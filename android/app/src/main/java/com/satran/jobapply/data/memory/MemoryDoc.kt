package com.satran.jobapply.data.memory

import kotlinx.serialization.Serializable

/** Bellekteki tek bir parça: bir ilan, gönderilmiş bir mektup ya da profil notu. */
@Serializable
data class MemoryDoc(
    val id: String,
    val kind: Kind,
    val title: String,
    val text: String,
    val timestamp: Long = System.currentTimeMillis(),
) {
    @Serializable
    enum class Kind(val label: String) {
        JOB("İlan"),
        LETTER("Gönderilen mektup"),
        RESEARCH("İşveren araştırması"),
        PROFILE("Profil notu"),
    }
}
