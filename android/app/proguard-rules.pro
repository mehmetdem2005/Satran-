-dontwarn javax.activation.**
-dontwarn com.sun.mail.**
-keep class com.sun.mail.** { *; }
-keep class javax.mail.** { *; }
-keep class myjava.awt.datatransfer.** { *; }

# --- ML Kit cihaz üstü çeviri ---
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_translate.** { *; }
-dontwarn com.google.mlkit.**

# --- kotlinx.serialization ---
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class com.satran.jobapply.** {
    *** Companion;
}
-keepclasseswithmembers class com.satran.jobapply.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.satran.jobapply.**$$serializer { *; }

# --- Adı korunması gereken sınıflar ---
# WorkManager işçiyi sınıf adıyla üretir; enum sabitleri ve veri modelleri
# ayarların JSON'una ad olarak yazılır. Yeniden adlandırılırlarsa kayıtlı
# ayarlar okunamaz hâle gelir.
-keep class com.satran.jobapply.SatranApp { *; }
-keep class com.satran.jobapply.MainActivity { *; }
-keep class com.satran.jobapply.send.BulkSendWorker { *; }
-keep class com.satran.jobapply.data.model.** { *; }
-keep class com.satran.jobapply.data.memory.** { *; }
-keep class com.satran.jobapply.send.QueuedMail { *; }
-keepclassmembers enum * { *; }
