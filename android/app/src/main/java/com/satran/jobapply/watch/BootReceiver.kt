package com.satran.jobapply.watch

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.satran.jobapply.SatranApp

/**
 * Telefon yeniden başladığında izlemeyi geri açar.
 *
 * Olmasaydı kullanıcı "arka planda izle" dediği hâlde her yeniden başlatmadan
 * sonra izleme sessizce durmuş olurdu — tam da "asla güncel olmayan liste
 * olmasın" isteğinin ters gittiği yer.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            return
        }
        val app = context.applicationContext as? SatranApp ?: return
        if (app.container.settingsStore.settings.value.backgroundWatch) {
            LiveWatchService.start(context)
        }
    }
}
