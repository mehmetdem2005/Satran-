# HermesForge ⚒️

**Uygulama üreten uygulama.** Ne istediğini yaz; sistem hangi ajanların
çalışacağına kendi karar verir, kodu dosya dosya üretir ve istediğin biçimde
(zip, tar.gz, markdown, json, tek dosya) teslim eder.

Motor olarak **yalnızca** [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
kullanılır ve **APK'nın içinde çalışır** — Hermes'in kendi araçları,
becerileri, oturum belleği ve arama altyapısı doğrudan bu uygulamanın
arkasında. Hermes'siz çalışan bir yedek yol yoktur.

---

## Neden böyle kurgulandı?

| Karar | Gerekçe |
|---|---|
| Ajan kadrosu kaldırıldı | Kadroyu biz sabitlediğimizde motorun zaten yaptığı işin zayıf bir kopyasını yazmış oluyorduk. Ekibi Hermes kuruyor, gerektikçe büyütüyor. |
| Başlık canlı | Üst başlık o an çalışan ajanın adını taşır — adı Hermes koymuştur. |
| Kod her zaman kart içinde | Model kodu düz metin akıtsa bile arayüz onu dosya adı başlıklı, kopyalanabilir ve indirilebilir bir karta çevirir. |
| Hermes olmadan çalışan yol yok | Doğrudan sağlayıcıya giden yedek yol kaldırıldı. Modeli, anahtarı, araçları ve becerileri Hermes yönetir; telefonda hiçbir sağlayıcı anahtarı durmaz. |
| Hermes kaynağı depoda | Kaynak `vendor/hermes-agent/` altında (MIT, sürüm sabit) — klonlayan herkes aynı sürümü alır, çevrimdışı kurulum mümkün. APK'ya kırpılmış hâli gömülür (bkz. "Nasıl çalışır"). |
| Bağlanma QR ile | Ev ağı adresini ve 35 karakterlik anahtarı telefonda elle yazmak, "beni uğraştırma" isteğinin tam tersi. Kamera QR'ı okur, uygulama kendi kaydeder. |
| RAG ve bellek SQLite FTS5 | Hermes kendi oturum aramasını FTS5 + bm25 üzerine kurar; aynı zemini kullanıyoruz. Ek paket yok, Termux'ta derleme yok. |

---

## Ajanları Hermes kurar

Sabit bir kadro yok. Hermes'e **baş yönetici** rolü veriliyor; işe göre kendi
ekibini kuruyor ve her turdan sonra "başka kime ihtiyacım var?" diye sorup
yeni ajan alıyor.

Bu bizim taklit ettiğimiz bir şey değil, Hermes'in kendi `delegate_task`
aracı: her çocuk ajan kendi bağlamı, kendi terminali ve kendi araç kümesiyle
çalışıyor; ebeveyne yalnızca özeti dönüyor.

```
         Baş yönetici (Hermes)
        ┌────────┴────────┐
    Yönetici           Uzman
   ┌────┴────┐
Uzman     Uzman        ← katman derinliği ayarlanabilir
```

- `role="orchestrator"` verilen bir ajan **kendi altına ajan alabilir**;
  sıradan uzmanlar (`leaf`) alamaz.
- Kaç katman derine inilebileceği `delegation.max_spawn_depth`, aynı anda kaç
  ajan çalışabileceği `delegation.max_concurrent_children` ile sınırlı.
  İkisi de Ayarlar → **Ekip** bölümünden değiştiriliyor (varsayılan: 4 katman,
  aynı anda 6 ajan).
- Arayüzdeki şerit, Hermes ekibi kurdukça doluyor: adları Hermes veriyor,
  biz sabit bir liste göstermiyoruz.

Kod hep baş yöneticinin yanıtından çıkarılıyor. Alt ajanların "yazdım"
özetleri kendi beyanlarıdır; yanıtta görünmeyen dosya yazılmamış sayılır.

Paketleme istekleri ("zip olarak ver") hâlâ **deterministik** olarak tanınıyor
ve model hiç çağrılmıyor.

## Nasıl çalışır

Hermes Agent **APK'nın içinde** çalışıyor. Telefonda başka bir uygulama,
bilgisayarda bir sunucu, terminalde bir komut gerekmiyor:

```
 ┌─────────────────────────────────────────┐
 │ HermesForge APK                         │
 │  ┌───────────────┐   ┌────────────────┐ │
 │  │ Arayüz + ajan │◀─▶│ Hermes gateway │ │──▶ DeepSeek API
 │  │ hattı (Flask) │   │ (aynı süreçte) │ │
 │  └───────────────┘   └────────────────┘ │
 └─────────────────────────────────────────┘
```

Kur, aç, DeepSeek anahtarını yapıştır, yazmaya başla.

### Bu nasıl mümkün oldu

Hermes'in Android'de çalışmasının önündeki engel bağımlılıklardı; her biri
tek tek ölçülüp çözüldü:

| Engel | Çözüm |
|---|---|
| `pydantic-core` — Chaquopy deposunda yalnızca 0.0.1 yer tutucusu var, pip `pydantic 1.10`'a düşüyordu | Android NDK ile **çapraz derlendi** (arm64 + arm32), `android/wheels/` altında |
| `jiter` — Rust, Android yapısı yok | openai SDK'sı onu tek bir satırda kullanıyor; **saf Python gölge paket** yazıldı |
| `uvloop`, `httptools`, `watchfiles`, `nemo_relay` | Ölçüldü: gateway bunlar olmadan da açılıyor (saf Python yedekleri var ya da tembel yükleniyorlar) |
| `aiohttp`, `cryptography`, `pillow`, `psutil`, `pyyaml` | Chaquopy'nin kendi deposunda hazır Android wheel'leri var |
| Hermes'in `utils` modülü bizimkiyle çakışıyordu | Bizimki `hf_utils` olarak yeniden adlandırıldı; derlemede çakışma denetimi var |

**Doğrulandı:** yalnızca bu paket kümesiyle (gerçek jiter yok, uvloop yok)
Hermes 0.20.4'ün gateway'i açıldı ve HermesForge'un tam ajan hattı bir tur
tamamlayıp dosya üretti.

**Doğrulanamadı:** bu ortamda `/dev/kvm` yok, Android emülatörü
çalıştırılamıyor. APK'nın derlendiği, doğru kodu taşıdığı ve içindeki Python
yolunun masaüstünde çalıştığı kanıtlandı; **telefonda açıldığı kanıtlanamadı**.
Gömülü motor açılmazsa uygulama kapanmıyor: sebebi arayüzde yazıyor ve
ağdaki bir Hermes'e bağlanma yolu açık kalıyor.

---

## Kurulum

### Telefon (tek yol)

1. APK'yı indir ve kur ("bilinmeyen kaynaklardan kuruluma izin ver" sorulursa onayla)
2. Aç, **DeepSeek API anahtarını** yapıştır ([nereden alınır](https://platform.deepseek.com/api_keys))
3. Yaz

| Dosya | Boyut | Kime |
|---|---|---|
| `hermesforge-arm64-debug.apk` | ~93 MB | 2017 sonrası neredeyse tüm telefonlar |
| `hermesforge-arm32-debug.apk` | ~89 MB | eski 32-bit cihazlar |

APK'yı kendin derlemek istersen `bash scripts/build_apk.sh` — betik Android
SDK'yı ve NDK'yı gerekiyorsa indirir, arayüzü paketler, Hermes kaynağını
kırpıp gömer ve `dist/` altına debug imzalı APK bırakır.

Anahtar yalnızca telefonda, Hermes'in kendi `config.yaml`/`.env` dosyalarında
saklanır. Uygulama arayüzü `/api/settings` üzerinden hiçbir sırrı düz metin
döndürmez.

Sunucu bir **ön plan servisinde** yaşıyor: uzun süren bir yapım turu sırasında
başka uygulamaya geçsen bile Android süreci öldürmüyor.

### Bilgisayarda Hermes çalıştırmak (isteğe bağlı)

Telefonun pilini yormak istemiyorsan ya da gömülü motor açılmazsa, Hermes'i
bilgisayarda çalıştırıp uygulamayı ona bağlayabilirsin:

```bash
git clone https://github.com/mehmetdem2005/Satran-.git
cd Satran- && bash scripts/hermes_sunucu.sh
```

Betik Hermes'i kurar, model anahtarını bir kez sorar, sunucuyu ev ağına açar
ve terminale bir **QR kod** basar. Telefonun kamerasıyla okut — uygulama
adresi ve anahtarı kendisi kaydeder. Hiç soru sorulmasını istemiyorsan:
`bash scripts/hermes_sunucu.sh --model-anahtari sk-...`

Uygulama ayrıca ev ağını kendisi tarayıp Hermes'i bulabiliyor (Ayarlar →
**Ağda Hermes ara**); bilgisayarın IP'si değişse bile adresi yeniden yazman
gerekmiyor. Gerçek kurulumda tam `/24` taraması 1,5 saniye sürdü.

### Derin bağlantı güvenliği

`hermesforge://connect` bağlantısını kötü niyetli bir web sayfası da açabilir.
Kural (17 birim testi, `ConnectLinkTest`): yalnızca `http`/`https`; adreste
kullanıcı adı/parola varsa reddedilir; anahtarda kontrol karakteri varsa
reddedilir; **aynı cihazda değilse kullanıcıya onay penceresi gösterilir**
(ev ağı ile internetteki sunucu ayrı sertlikte uyarılır).

### Masaüstünde tarayıcıyla

```bash
python3 -m pip install -r requirements.txt
bash scripts/install_hermes.sh
bash scripts/start.sh
```

Tarayıcıda `http://127.0.0.1:5000`.

---

## Model ayarları

Telefonda modeli ve anahtarı **uygulamanın içinden** ayarlıyorsun (Ayarlar →
Model); uygulama bunları Hermes'in kendi `config.yaml` ve `.env` dosyalarına
yazıyor. Sağlayıcı kimliği (`deepseek`) ve anahtar değişkeni
(`DEEPSEEK_API_KEY`) Hermes'in `hermes_cli/auth.py` dosyasındaki kayıttan
alındı — uydurulmadı.

İstek başına gönderilebilen tek model ayarı düşünme düzeyi:

| Ayar | Nasıl gider |
|---|---|
| **Düşünme düzeyi** | `model_options.reasoning_effort`. Geçerli değerler Hermes'in kendi `_REASONING_EFFORTS` kümesinden: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra`. "Varsayılan" seçiliyken **hiçbir şey gönderilmez**. |
| **Maksimum token** | Hermes bunu istek başına kabul etmiyor; `~/.hermes/.env` içine `HERMES_MAX_TOKENS` yazılır, gateway yeniden başlayınca geçerli olur. |
| **Sıcaklık / Top P** | Hermes istek başına kabul etmiyor; arayüzde de yok. |

---

## Bellek ve RAG

Eski JSON tabanlı bellek ve saf-Python TF-IDF motoru kaldırıldı; yerlerine
Hermes'in yaklaşımını izleyen SQLite katmanları geldi:

- **RAG** (`backend/hermes/rag.py`) — FTS5 sanal tablosu, `bm25()` sıralaması,
  Hermes'inkiyle aynı sorgu temizleyicisi. Yüklenen dosyalar ayrıca Hermes
  çalışma alanına yazılır; ajan kendi `read_file`/`grep` araçlarıyla da erişir.
- **Bellek** (`backend/hermes/memory.py`) — kategorili (kimlik, tercih, proje,
  karar, olgu), önem puanlı, tekrarı elenen kalıcı anılar. Hermes'in bellek
  sağlayıcı sözleşmesini izler: `build_system_prompt` / `prefetch` / `sync`.

FTS5 bulunmayan bir SQLite derlemesinde ikisi de otomatik olarak basit
aramaya düşer; uygulama çalışmaya devam eder.

---

## Yapı

```
backend/
  app.py                Flask uçları ve SSE akışı
  config.py             ~/.hermesforge/config.json + ortam değişkenleri
  serve.py              ortak sunucu girişi (masaüstü + APK aynı yol)
  presets.py            Hermes'in kabul ettiği düşünme düzeyleri (kaynağından)
  hf_utils.py           dosya çıkarma, SSE, güvenli yol (Hermes'in utils'iyle çakışmasın)
  hermes/
    client.py           Hermes API sunucusu istemcisi
    runtime.py          kurulumu bul, gateway'i başlat
    memory.py           kalıcı bellek (FTS5)
    rag.py              RAG motoru (FTS5 + bm25)
    discovery.py        ev ağında Hermes arar (/24 tarama + /health imzası)
    embedded.py         APK'nın içindeki gateway'i başlatır ve ayarlar
  forge/
    orchestration.py    Hermes'e verilen "ekibini kur" yönergesi
    router.py           mod seçimi (yapım / yama / paketleme / soru)
    pipeline.py         akış orkestrasyonu
    artifacts.py        kod bloğu → dosya → paket
frontend/
  templates/index.html
  static/css/app.css
  static/js/markdown.js CDN'siz markdown + kod kartı
  static/js/app.js      arayüz mantığı
android/                Chaquopy tabanlı APK projesi (Kotlin + gömülü Python + Hermes)
android/wheels/         Android için elde üretilen wheel'ler (bkz. wheels/README.md)
vendor/hermes-agent/    Hermes Agent kaynağı (MIT, üst akış — bkz. vendor/README.md)
scripts/
  hermes_sunucu.sh      Hermes'i kurar, modeli ayarlar, başlatır, QR kodu basar
  hermes_model_ayarla.py  config.yaml'a model bloğunu yazar (TUI'siz)
  qr.py                 bağımlılıksız QR üreteci (byte modu, ECC M, sürüm 1-10)
  build_apk.sh          Android SDK'yı kurar ve APK derler
  install_hermes.sh     Hermes bağımlılıklarını kurar (kaynak depoda)
  update_hermes.sh      Hermes kaynağını üst akıştan günceller
  termux_setup.sh       Android tek komut kurulum
  start.sh              uygulamayı başlat
tests/                  348 test (pytest)
```

---

## Ortam değişkenleri

Hepsi isteğe bağlıdır; `.env.example` dosyasına bakın.

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `HERMESFORGE_PORT` | `5000` | Web sunucusu portu |
| `HERMESFORGE_HOST` | `127.0.0.1` | LAN erişimi için `0.0.0.0` |
| `API_SERVER_KEY` | `~/.hermes/.env` | Hermes API anahtarı |
| `HERMESFORGE_HERMES_URL` | `http://127.0.0.1:8642` | Hermes API adresi |
| `HERMESFORGE_HERMES_AUTOSTART` | `true` | Açılışta gateway'i başlat |
| `HERMESFORGE_REASONING_EFFORT` | `default` | Düşünme düzeyi |
| `HERMESFORGE_MAX_TOKENS` | `32768` | Maksimum token |
| `HERMESFORGE_MAX_PARALLEL` | `2` | Aynı anda çalışacak ajan sayısı |

---

## Testler

```bash
python3 -m pip install -r requirements-dev.txt
python3 -m pytest
```

348 test; hepsi yalıtılmış — makinede çalışan bir Hermes varsa bile testler
ona bağlanmaz (`tests/conftest.py` erişilemez bir porta yönlendirir), yoksa
"motor yok" senaryoları sessizce yeşile döner ve hiçbir şey doğrulamazdı.

### Gerçek Hermes'e karşı doğrulama

Entegrasyon, çalışan bir **Hermes Agent 0.20.4** kurulumuna karşı denendi ve
sahte sunucunun yakalayamadığı dört gerçek hata çıktı. Her biri artık bir
regresyon testiyle kilitli:

| Bulgu | Belirti | Test |
|---|---|---|
| Oturum yanıtı `{"session": {...}}` zarfına sarılı | Oturum hiç açılamıyordu | `TestSessionEnvelope` |
| Hermes oturum başlıklarını benzersiz tutuyor | Aynı konuda ikinci sohbet Hermes belleğini sessizce kaybediyordu | `TestTitleConflict` |
| Sağlayıcı delta akıtmazsa metin `assistant.completed` içinde geliyor | Yanıt tamamen boş görünüyordu | `TestStreamNormalization` |
| `text/event-stream` başlığında charset yok | `requests` ISO-8859-1 varsayıp her Türkçe karakteri bozuyordu (`Sayaç` → `SayaÃ§`) | `test_utf8_zorlanir_yoksa_turkce_bozulur` |

---

## Lisans

Bu depo kişisel bir projedir. Hermes Agent MIT lisanslıdır ve ayrı bir
projedir — bkz. [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent).
