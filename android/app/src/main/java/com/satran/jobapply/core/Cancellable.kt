package com.satran.jobapply.core

import kotlinx.coroutines.CancellationException

/**
 * `runCatching` **iptali de yakalar** — askıya alınabilir kodda bu, iş iptal
 * edildiğinde döngünün sessizce devam etmesine ve iptalin kullanıcıya hata
 * gibi görünmesine yol açar. Bu sarmalayıcı iptali yeniden fırlatır.
 */
inline fun <T> runCatchingCancellable(block: () -> T): Result<T> = try {
    Result.success(block())
} catch (cancellation: CancellationException) {
    throw cancellation
} catch (error: Throwable) {
    Result.failure(error)
}
