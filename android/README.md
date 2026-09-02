# Satran Jobs — toplu mevsimlik iş başvurusu (Android / Kotlin)

ABD Çalışma Bakanlığı'nın **seasonaljobs.dol.gov** ilan havuzundan mimarlık dışı
mevsimlik işleri listeler, ilanları kutucuklarla seçtirir ve **PDF CV'ni + mesajını
Gmail üzerinden tek tek ya da toplu** gönderir. Mektupları isteğe bağlı olarak
yapay zekâ yazar, işvereni internetten araştırır.

Saf Android + Kotlin + Jetpack Compose. Ek sunucu yok, her şey telefonda çalışır.

---

## Ne yapar

| Sekme | İçerik |
|---|---|
| **İlanlar** | Canlı arama, eyalet/sıralama süzgeçleri, "Mimarlık dışı" · "E-postası olan" · "Başvurulanları gizle" anahtarları. Her kart açılınca tam görev tanımı, özel şartlar, ücret, dönem, başvuru e-postası görünür. Kutucukla seçim. |
| **Başvuru** | Seçilen ilanlar için konu + mesaj hazırlar (şablon veya AI), tek tek düzenletir, PDF CV ekler, toplu gönderir. İlerleme bildirimi ön plan servisiyle akar. |
| **Ayarlar** | Gmail hesabı, PDF CV, başvuru profili, mesaj şablonu, yapay zekâ sağlayıcısı, internet arama sağlayıcısı, gönderim geçmişi. |

### Yapay zekâ (isteğe bağlı)
- **İlana özel başvuru mektubu** — profilin + ilanın görev tanımı okunarak yazılır.
- **Türkçe özet** — İngilizce ilan metnini maddeleyip çevirir.
- **Mimarlık süzgeci** — anahtar sözcüklerin kaçırdığı ilanları model eler.
- **Akıllı arama** — "Florida'da otel temizlik işi" yazarsın, model arama sorgusuna çevirir.

Sağlayıcılar: **DeepSeek** (varsayılan), **Claude**, **OpenAI**, **OpenRouter** veya
OpenAI uyumlu kendi sunucun. Model adı serbest metindir; sağlayıcı yeni sürüm
çıkardığında Ayarlar'a yazman yeterli.

### İnternet araması
Tavily, Serper.dev (Google), Brave Search ya da anahtarsız DuckDuckGo. İşveren
hakkında toplanan bilgi hem karta yazılır hem de istersen mektuba bağlam olur.

---

## Kurulum (kullanıcı)

1. APK'yı yükle (bilinmeyen kaynaklara izin vermen gerekebilir).
2. **Ayarlar → Gmail hesabı**
   - Gmail adresini yaz.
   - Google hesabında **2 adımlı doğrulamayı aç**, sonra
     <https://myaccount.google.com/apppasswords> adresinden **16 haneli uygulama
     şifresi** üret ve uygulamaya gir. *Normal hesap şifresi çalışmaz.*
   - "Bağlantıyı test et" ile doğrula.
3. **Ayarlar → PDF CV** → CV'ni seç.
4. **Ayarlar → Başvuru profilin** → ad soyad, telefon, kısa özgeçmiş.
5. (İsteğe bağlı) **Ayarlar → Yapay zekâ** → sağlayıcı + API anahtarı.
6. **İlanlar** sekmesinde ara, kutucukları işaretle → **Başvuru** sekmesi →
   *Hazırla* → gözden geçir → *Gönder*.

> Gmail günlük gönderim sınırı ücretsiz hesaplarda ~500 iletidir. Uygulama
> iletiler arasına varsayılan 8 saniye koyar; Ayarlar'dan değiştirebilirsin.

---

## Derleme (geliştirici)

```bash
cd android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
```

Gereken: JDK 17, Android SDK 35. `android/local.properties` içine
`sdk.dir=/path/to/android-sdk` yaz veya `ANDROID_HOME` tanımla.

Her push'ta GitHub Actions (`.github/workflows/android-apk.yml`) debug APK
üretip iş akışı çıktısı (artifact) olarak yükler.

---

## Mimari

```
android/app/src/main/java/com/satran/jobapply/
├── core/            Net (OkHttp+Json), AppContainer, metin yardımcıları
├── data/
│   ├── model/       Job, AppSettings, SendRecord
│   ├── remote/      SeasonalJobsApi (Azure Search), AiClient, WebSearchClient
│   ├── filter/      ArchitecturalFilter (SOC + anahtar sözcük)
│   ├── mail/        GmailSender (SMTP), MailIntentSender, CvLoader, MailTemplate
│   └── prefs/       SettingsStore (şifreli), HistoryStore
├── send/            SendQueueStore + BulkSendWorker (ön plan servisi)
└── ui/              MainViewModel + jobs / apply / settings ekranları
```

### İlan kaynağı
`POST https://api.seasonaljobs.dol.gov/datahub/search?api-version=2020-06-30`
— sitenin kendi kullandığı, anahtar istemeyen Azure Cognitive Search uç noktası.
OData süzgeçleri (`active eq true`, `apply_email ne null`, eyalet), `orderby`,
`facets` ve `skip/top` sayfalaması desteklenir.

### Mimarlık süzgeci
1. SOC kodu `17-` ile başlıyorsa (Architecture & Engineering) veya
   17-1011/17-1012/17-1013/17-3011-3013/27-1025 ise elenir.
2. Başlık/meslek adında `architect`, `drafter`, `autocad`, `revit`,
   `urban planner`, `interior design` … geçiyorsa elenir.
   "Landscaping and Groundskeeping" gibi bahçe işleri **elenmez**; yalnızca
   tam ifade olarak `landscape architect` elenir.
3. Açıksa model kalanları bir kez daha denetler.

---

## Gizlilik

Gmail uygulama şifresi ve API anahtarları `EncryptedSharedPreferences` ile
cihazda şifreli tutulur. Uygulama bu bilgileri yalnızca senin seçtiğin
sağlayıcılara (Gmail SMTP, AI sağlayıcın, arama sağlayıcın) gönderir; başka
hiçbir sunucuya veri akmaz. Analitik ya da izleme yoktur.

## Sorumluluk

Toplu e-posta gönderirken karşıdaki işverenlerin gerçek insanlar olduğunu
unutma. Alakasız ilanlara toptan başvurmak hem senin itibarını hem de
gönderdiğin adresin Gmail itibarını düşürür. Seçimini daralt, mektubu oku,
sonra gönder.
