package com.satran.jobapply

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.satran.jobapply.core.AppContainer

class SatranApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.send_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Toplu başvuru gönderiminin ilerlemesi"
            setShowBadge(false)
        }
        val watchChannel = NotificationChannel(
            WATCH_CHANNEL_ID,
            "İlan izleme",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Kalkan ve yeni eklenen ilanların dakikalık denetimi"
            setShowBadge(true)
        }
        getSystemService(NotificationManager::class.java)?.apply {
            createNotificationChannel(channel)
            createNotificationChannel(watchChannel)
        }
    }

    companion object {
        const val CHANNEL_ID = "satran_send_channel"
        const val WATCH_CHANNEL_ID = "satran_watch_channel"
    }
}
