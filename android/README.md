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
| **İlanlar** | Canlı arama, aşağı çekip yenileme, *Yeni / Geçmiş* görünümü, eyalet/sıralama süzgeçleri, "Mimarlık dışı" · "E-postası olan" · "Başvurulanları gizle" anahtarları. Her kartta çeviri tuşu; kart açılınca tam görev tanımı, özel şartlar, ücret, dönem, başvuru e-postası görünür. Kutucukla seçim, "Sonraki sayfa" ile yeni ilanlar. |
| **Başvuru** | Seçilen ilanlar için konu + mesaj hazırlar (şablon veya AI), tek tek düzenletir, PDF CV ekler, toplu gönderir. İlerleme bildirimi ön plan servisiyle akar. |
| **Ayarlar** | Gmail hesabı, PDF CV, başvuru profili, mesaj şablonu, yapay zekâ sağlayıcısı, internet arama sağlayıcısı, gönderim geçmişi. |

### Yapay zekâ (isteğe bağlı)
- **İlana özel başvuru mektubu** — profilin + ilanın görev tanımı + web araması + bellek okunarak yazılır.
- **Türkçeye çevir** — her kartta görünür çeviri tuşu; İngilizce ilan metnini maddeleyip çevirir.
- **Mimarlık süzgeci** — anahtar sözcüklerin kaçırdığı ilanları model eler.
- **Akıllı arama** — "Florida'da otel temizlik işi" yazarsın, model arama sorgusuna çevirir.

Sağlayıcılar: **DeepSeek** (varsayılan), **Claude**, **OpenAI**, **OpenRouter** veya
OpenAI uyumlu kendi sunucun.

**Model listesi canlı çekilir.** Ayarlar → *Modelleri çek* düğmesi sağlayıcının
`GET /models` ucunu çağırır ve yayımlanan **bütün** modelleri listeler. DeepSeek
yeni bir sürüm çıkardığında (V4, V5, …) listede kendiliğinden görünür; uygulamayı
güncellemeye gerek yoktur. Varsayılan `deepseek-v4-pro`.

### İnternet araması — kim ne yapıyor

DeepSeek'in `/chat/completions` ucunda **gömülü web araması yoktur**. Modelin
internete bakabilmesi için arama işini uygulama yapar. Zincir şöyle:

```
1. Sorgu     DeepSeek → "Deer Valley Resort Park City Utah H-2B worker reviews"
2. Arama     Tavily / Serper / Brave → gerçek web sonuçları
3. Brifing   DeepSeek → sonuçları işveren özetine çevirir
4. Bellek    RAG → benzer geçmiş ilanları ve mektupları getirir
5. Mektup    DeepSeek → brifing + bellek + ilan ile mektubu yazar
6. Kayıt     RAG → mektup ve brifing belleğe geri yazılır
```

Kapalı olan adım sessizce atlanır; zincir kırılmaz, en kötü ihtimalle şablona düşer.

Arama sağlayıcıları ve anahtar adresleri (Ayarlar'dan tek dokunuşla açılır):

| Sağlayıcı | Anahtar | Ücretsiz katman |
|---|---|---|
| **Tavily** | <https://app.tavily.com/home> | ayda 1000 arama |
| **Serper.dev** (Google) | <https://serper.dev/api-key> | 2500 arama |
| **Brave Search** | <https://api-dashboard.search.brave.com/app/keys> | ayda 2000 arama |
| DuckDuckGo | gerekmez | yalnızca ansiklopedik özet, zayıf |

### Bellek, arşiv ve tekrar engelleme

- **Arşiv** — görülen her ilan `job_archive.json` içinde saklanır (2000 kayıt).
  Silinmez; *Geçmiş* sekmesinde okunmaya devam eder.
- **Tekrar engelleme** — bir kez listelenen ilan *Yeni* listesinde bir daha çıkmaz.
- **Sonraki sayfa** — düğmeye bastıkça API'de kaldığın yerden devam eder
  (`skip` büyür), eski ilanlar arşive düşer.
- **Arama geçmişi** — hangi sorguyu ne zaman, kaçıncı kayıttan, kaç yeni sonuçla
  çalıştırdığın Ayarlar'da en yeniden eskiye listelenir.
- **RAG belleği** — ilanlar, yazdığın mektuplar, işveren brifingleri ve profil
  notun BM25 ile aranabilir bir bellekte tutulur. Yeni bir mektup yazılırken en
  yakın parçalar bağlam olarak modele verilir. Sunucu ya da embedding servisi
  gerekmez, tamamı telefonda çalışır.

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
│   ├── memory/      JobArchiveStore, SearchHistoryStore, RagStore (BM25)
│   ├── pipeline/    ApplicationPipeline (sorgu→arama→brifing→bellek→mektup)
│   ├── mail/        GmailSender (SMTP), MailIntentSender, CvLoader, MailTemplate
│   └── prefs/       SettingsStore (şifreli), HistoryStore
├── send/            SendQueueStore + BulkSendWorker (ön plan servisi)
└── ui/              MainViewModel + jobs / apply / settings ekranları
```

### İlan kaynağı
`POST https://api.seasonaljobs.dol.gov/datahub/search?api-version=2020-06-30`
— sitenin kendi kullandığı, anahtar istemeyen Azure Cognitive Search uç noktası.
OData süzgeçleri (`active eq true`, `apply_email ne null`, eyalet), `orderby`,
`facets` ve `skip/top` sayfalaması desteklenir. Veri **canlıdır**: DOL kayıtları
gün içinde artar, uygulamadaki eşleşme sayısı da onunla birlikte değişir.
Bir aramada kaç ilan çekileceği Ayarlar'dan seçilir (20–200).

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
