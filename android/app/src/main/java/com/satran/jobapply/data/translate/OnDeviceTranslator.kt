package com.satran.jobapply.data.translate

import com.google.android.gms.tasks.Task
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Cihaz üstünde İngilizce → Türkçe çeviri (Google ML Kit).
 *
 * **API anahtarı istemez, ücretsizdir.** İlk kullanımda dil modeli bir kez
 * indirilir (~30 MB); sonrasında çeviri internetsiz de çalışır.
 */
class OnDeviceTranslator {

    private val options = TranslatorOptions.Builder()
        .setSourceLanguage(TranslateLanguage.ENGLISH)
        .setTargetLanguage(TranslateLanguage.TURKISH)
        .build()

    private val translator: Translator by lazy { Translation.getClient(options) }
    private val modelManager by lazy { RemoteModelManager.getInstance() }
    private val turkishModel by lazy { TranslateRemoteModel.Builder(TranslateLanguage.TURKISH).build() }

    /** Dil modeli cihazda hazır mı? */
    suspend fun isModelReady(): Boolean = withContext(Dispatchers.IO) {
        runCatching { modelManager.isModelDownloaded(turkishModel).await() }.getOrElse { false }
    }

    /** Modeli indirir. Zaten indiriliyse anında döner. */
    suspend fun ensureModel(requireWifi: Boolean) = withContext(Dispatchers.IO) {
        val conditions = DownloadConditions.Builder()
            .apply { if (requireWifi) requireWifi() }
            .build()
        translator.downloadModelIfNeeded(conditions).await()
    }

    suspend fun translate(text: String): String = withContext(Dispatchers.IO) {
        // joinToString askıya alınabilir çağrı kabul etmiyor; düz döngü kullanılıyor.
        val translated = mutableListOf<String>()
        TextChunks.split(text, MAX_CHUNK).forEach { chunk ->
            translated += translator.translate(chunk).await()
        }
        translated.joinToString("\n")
    }

    fun close() = runCatching { translator.close() }.let { }

    private companion object {
        /** ML Kit uzun metinde kaliteyi düşürüyor; paragraf boyunda tutuyoruz. */
        const val MAX_CHUNK = 800
    }
}

/** ML Kit `Task` nesnesini askıya alınabilir çağrıya çevirir. */
internal suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
    addOnSuccessListener { result -> continuation.resume(result) }
    addOnFailureListener { error -> continuation.resumeWithException(error) }
    addOnCanceledListener { continuation.cancel() }
}
