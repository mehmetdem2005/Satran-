# HermesForge ⚒️

**Uygulama üreten uygulama.** Ne istediğini yaz; sistem hangi ajanların
çalışacağına kendi karar verir, kodu dosya dosya üretir ve istediğin biçimde
(zip, tar.gz, markdown, json, tek dosya) teslim eder.

Motor olarak [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
kullanılır — Hermes'in kendi araçları, becerileri, oturum belleği ve arama
altyapısı doğrudan bu uygulamanın arkasında çalışır.

---

## Neden böyle kurgulandı?

| Karar | Gerekçe |
|---|---|
| Ajan seçimi menüden kaldırıldı | Kullanıcı "hangi ajan" değil "ne istediğini" bilir. Yönlendirici isteği okuyup hattı kendisi kurar. |
| Başlık canlı | Üst başlık o an çalışan ajanın adını taşır; ilerlemeyi izlemek için ayrı bir panele gerek yok. |
| Kod her zaman kart içinde | Model kodu düz metin akıtsa bile arayüz onu dosya adı başlıklı, kopyalanabilir ve indirilebilir bir karta çevirir. |
| Hermes kaynağı depoda, süreci ayrı | Kaynak `vendor/hermes-agent/` altında (MIT, sürüm sabit) — klonlayan herkes aynı sürümü alır, çevrimdışı kurulum mümkün. Ama Hermes kendi sanal ortamında ayrı bir süreç olarak çalışır ve HTTP üzerinden konuşuruz; Termux'ta çalışabilmesinin tek pratik yolu bu. |
| RAG ve bellek SQLite FTS5 | Hermes kendi oturum aramasını FTS5 + bm25 üzerine kurar; aynı zemini kullanıyoruz. Ek paket yok, Termux'ta derleme yok. |

---

## Ajan kadrosu

Hangilerinin çalışacağına yönlendirici karar verir:

| Mod | Ne zaman | Roller |
|---|---|---|
| `build` | Sıfırdan yeni bir uygulama | 🧭 Çözümleyici, 🏛️ Mimar, 💻 Kodlayıcı, 🔍 Denetçi, 📦 Paketleyici |
| `patch` | Mevcut projede değişiklik | 💻 Kodlayıcı, 🔍 Denetçi |
| `package` | "zip olarak ver" | 📦 Paketleyici (model çağrısı yapılmaz) |
| `answer` | Soru, sohbet, açıklama | 💬 Danışman |

Paketleme istekleri ve tek satırlık sorular **deterministik** olarak
tanınır — model burada yanılıp hazır projeyi baştan üretemez.

### Ajanlar birbirini doğrusal takip etmez

Sırayı bağımlılık grafiği belirler; bağımlılığı karşılanan her düğüm **aynı
anda** başlar:

```
Çözümleyici → Mimar → ┌── Kodlayıcı 1 ─┐ → ┌── Denetçi ────┐
                      └── Kodlayıcı 2 ─┘   └── Paketleyici ┘
                          (dosya planına       (birbirini
                           göre bölünür)        beklemezler)
```

- **Denetçi ‖ Paketleyici** — ikisi de yalnız Kodlayıcı'ya bağlı, paralel çalışır.
- **Kodlayıcı bölünür** — Mimar'ın `dosya-plani` bloğu ayrık gruplara ayrılır,
  her grubu ayrı bir Kodlayıcı aynı anda yazar. Yollar ayrık olduğu için diske
  yazma çakışmaz; dosyalar arası uyuşmazlıkları Denetçi yakalar.
- Eşzamanlılık `max_parallel_agents` ile sınırlı (varsayılan **2** — telefonda
  bellek ve bağlantı sınırlı).

### Hiçbir ajan konuşmayı yeniden açmaz

Eskiden her ajan tüm sohbet geçmişini, kullanıcının ham mesajını ve kendinden
önceki bütün ajanların çıktısını (ajan başına 14 KB'a kadar) yeniden alıyordu —
üstelik hepsi tek Hermes oturumunu paylaştığı için aynı metin ikinci kez
besleniyordu. Modelin gözünden her ajan turu konuşmanın baştan açılmasıydı.

Şimdi ortak bir **pano** (`backend/forge/board.py`) var: ham transkript yerine
damıtılmış durum taşır (gereksinim, tasarım, dosya planı, dosya listesi,
bulgular) ve her rol yalnızca kendi dilimlerini görür. Sohbet geçmişi yalnızca
Çözümleyici'ye gider. Her düğüm kendi Hermes oturumunda çalışır; uzun vadeli
bellek ortak `X-Hermes-Session-Key` ile korunur.

Gerçek bir turda ölçülen istem boyutları — ajan sayısıyla büyümüyor:

| Ajan | İstem (karakter) |
|---|---|
| Çözümleyici | 213 |
| Mimar | 443 |
| Kodlayıcı | 1230 |
| Denetçi | 621 |
| Paketleyici | 621 |

---

## Kurulum

### Android APK (Termux gerekmez)

Derleme mimariye göre üç APK üretir:

| Dosya | Boyut | Kime |
|---|---|---|
| `hermesforge-arm64-debug.apk` | ~28 MB | 2017 sonrası neredeyse tüm telefonlar |
| `hermesforge-arm32-debug.apk` | ~24 MB | eski 32-bit cihazlar |
| `hermesforge-universal-debug.apk` | ~34 MB | emin değilsen; her cihazda çalışır |

Telefona kopyalayıp dokun; "bilinmeyen kaynaklardan kuruluma izin ver"
sorulursa onayla. USB ile: `adb install -r dist/hermesforge-arm64-debug.apk`.

APK'yı kendin derlemek istersen:

```bash
bash scripts/build_apk.sh
```

Betik Android SDK'yı gerekiyorsa indirir, arayüzü paketler ve `dist/` altına
debug imzalı APK bırakır.

**APK ne içeriyor, ne içermiyor:**

| İçinde | Dışında |
|---|---|
| Python 3.11 + Flask + HermesForge'un tamamı (Chaquopy, MIT) | **Hermes Agent** — 176 MB'lık monorepo, kendi sanal ortamını ve alt süreç açmayı istiyor; APK'ya girmez |
| Ajan hattı, pano, paralel dalgalar, RAG, bellek, kod kartları, zip/tar.gz indirme | |

Yani APK **tek başına çalışır**. İlk açılışta kurulum ekranı karşılar:
sağlayıcıyı seç, modeli seç, anahtarı yapıştır, **Bağlan ve başla**. Menüde
ayar aramana gerek yok.

Anahtar **kaydedilmeden önce sağlayıcıya karşı sınanır** — yanlışsa orada
söyler, ilk sohbetin ortasında patlamaz. Model listesi sağlayıcının kendi
belgelerinden gelir; Android'de çalıştırılamayacak seçenekler (gateway
başlatma gibi) hiç gösterilmez.

Hermes **isteğe bağlıdır** ve ayarlarda öyle işaretlidir. İstemiyorsan hiç
dokunma; uygulama eksiksiz çalışır. İstersen Termux'ta ya da bir sunucuda
çalıştırıp adresini verirsin, motor kendiliğinden Hermes'e geçer.

Sunucu bir **ön plan servisinde** yaşıyor: uzun süren bir yapım turu sırasında
başka uygulamaya geçsen bile Android süreci öldürmüyor.

### Hermes'i telefona bağlamak — tek komut

APK tek başına çalışır; Hermes yalnızca **araç ve beceri** katmanı ekler
(terminal, dosya işlemleri, web arama). İstersen Termux'ta:

```bash
pkg install -y git
git clone https://github.com/mehmetdem2005/Satran-.git
cd Satran- && bash scripts/termux_hermes_baglat.sh
```

Betik sırasıyla: paketleri kurar → Hermes'i kurar → DeepSeek anahtarını bir kez
sorup Hermes'i o modele bağlar → gateway'i başlatır → **uygulamayı açıp adresi
ve anahtarı kendisi girer** (`hermesforge://connect` derin bağlantısıyla).
Sen hiçbir şey kopyalamazsın.

Telefon yeniden başlarsa betiği tekrar çalıştır; kurulu olanı atlar, yalnızca
gateway'i açar.

> Derin bağlantı yalnızca `127.0.0.1` / `localhost` adreslerini kabul eder —
> bu bağlantıyı bir web sayfası da açabilir, uygulamanın Hermes anahtarını
> yabancı bir sunucuya göndermesine izin verilmiyor (13 birim testiyle kilitli).

### Termux (Android, elle kurulum)

```bash
pkg install -y git
git clone https://github.com/mehmetdem2005/Satran-.git
cd Satran-
bash scripts/termux_setup.sh
```

Betik Termux paketlerini, HermesForge bağımlılıklarını ve Hermes Agent'ı
(`.[termux]` paketi + `constraints-termux.txt` ile) kurar.

Sonra:

```bash
vendor/hermes-agent/venv/bin/hermes model   # bir model sağlayıcısı seç
bash scripts/start.sh
```

Tarayıcıda `http://127.0.0.1:5000` adresini aç.

### Linux / macOS / WSL

```bash
git clone https://github.com/mehmetdem2005/Satran-.git
cd Satran-
python3 -m pip install -r requirements.txt
bash scripts/install_hermes.sh    # kaynak depoda; yalnızca bağımlılıkları kurar
bash scripts/start.sh
```

Hermes kaynağı depoda geldiği için kurulum indirme yapmaz. Üst akıştan
güncellemek istersen: `bash scripts/update_hermes.sh`

### Hermes olmadan denemek

Hermes kurmadan da açılır: Ayarlar → **Yedek sağlayıcı** bölümüne OpenAI
uyumlu bir uç ve anahtar gir (DeepSeek, OpenRouter, yerel bir sunucu…).
Bu modda Hermes'in araçları ve becerileri devre dışıdır, gerisi çalışır.

---

## Hermes bağlantısı nasıl kuruluyor?

`scripts/install_hermes.sh` deponun tamamını `vendor/hermes-agent/` altına
indirir ve `~/.hermes/.env` dosyasına şunları yazar:

```bash
API_SERVER_ENABLED=true
API_SERVER_KEY=hf-…        # otomatik üretilir, HermesForge kendisi okur
```

Uygulama açılışta gateway'i başlatır ve Hermes'in OpenAI uyumlu API
sunucusuna (`http://127.0.0.1:8642`) bağlanır:

| Uç | Kullanım |
|---|---|
| `POST /api/sessions` | Kalıcı oturum — Hermes'in belleği bu oturumda yaşar |
| `POST /api/sessions/{id}/chat/stream` | Turun SSE akışı: `assistant.delta`, `tool.started`, `run.completed` |
| `POST /v1/chat/completions` | Oturum açılamadığında durumsuz yedek yol |
| `GET /v1/capabilities` | Sürüm yeteneklerini keşfet |

`X-Hermes-Session-Key` başlığı uzun vadeli belleği tek kapsamda tutar;
böylece transkript değişse bile Hermes aynı kullanıcıyı tanır.

---

## Model ayarları

Model ve düşünme düzeyi listeleri **sağlayıcının kendi belgelerinden** gelir
(`backend/providers/presets.py`), arayüzde sabit liste tutulmaz.

### DeepSeek (varsayılan sağlayıcı)

[Resmi belgelerden](https://api-docs.deepseek.com/) alınan gerçek sözleşme:

| | |
|---|---|
| Modeller | `deepseek-v4-flash`, `deepseek-v4-pro`, `deepseek-v4-flash-vision-exp` |
| Bağlam / çıktı | 1M / 384K token |
| Düşünme açma-kapama | `{"thinking": {"type": "enabled"\|"disabled"}}` |
| Düşünme düzeyi | `reasoning_effort`: **low, high, max** (varsayılan: açık, `high`) |
| Düşünme açıkken | `temperature`, `top_p`, `presence_penalty`, `frequency_penalty` **yok sayılır** |

Bu yüzden sıcaklık ve Top P yalnızca düşünme kapalıyken gönderiliyor, token
sınırı 384K'ya kırpılıyor ve düzey listesinde DeepSeek'in tanımadığı değerler
gösterilmiyor.

### Motora göre değişen kısım

| Ayar | Hermes yolu | Yedek sağlayıcı yolu |
|---|---|---|
| **Düşünme düzeyi** | `model_options.reasoning_effort`; Hermes daha geniş bir küme kabul ediyor (`minimal`, `medium`, `xhigh`, `ultra` dahil) | Sağlayıcının kabul ettiği kümeye indirgenir — örneğin `ultra` → `max`, `xhigh` → `high` |
| **Maksimum token** | Hermes bunu **istek başına kabul etmiyor**; `~/.hermes/.env` içine `HERMES_MAX_TOKENS` yazılır, gateway yeniden başlayınca geçerli olur | gövdeye `max_tokens`, anında |
| **Sıcaklık / Top P** | Hermes istek başına kabul etmiyor | düşünme kapalıyken gövdeye eklenir |

Arayüz hangi motor çalışıyorsa onun düzey listesini gösterir; ikisi aynı liste
değil.

Model davranış alanları yedek sağlayıcıya **yalnızca kullanıcı varsayılanı
değiştirdiyse** gönderilir: katı OpenAI-uyumlu sunucular bilinmeyen alanlara
400 döndürüyor, dokunulmamış bir ayar yüzünden istek reddedilmemeli.

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
  providers/presets.py  sağlayıcı model/düzey listeleri (belgelerden)
  utils.py              dosya çıkarma, SSE, güvenli yol
  hermes/
    client.py           Hermes API sunucusu istemcisi
    runtime.py          kurulumu bul, gateway'i başlat
    memory.py           kalıcı bellek (FTS5)
    rag.py              RAG motoru (FTS5 + bm25)
  forge/
    agents.py           ajan kadrosu, istemler ve bağımlılık grafiği
    board.py            ortak pano (damıtılmış yapım durumu)
    scheduler.py        dalga yürütücüsü, paralel düğümler, fan-out
    router.py           otomatik rol seçimi
    pipeline.py         akış orkestrasyonu
    artifacts.py        kod bloğu → dosya → paket
  providers/direct.py   Hermes kapalıyken yedek sağlayıcı
frontend/
  templates/index.html
  static/css/app.css
  static/js/markdown.js CDN'siz markdown + kod kartı
  static/js/app.js      arayüz mantığı
android/                Chaquopy tabanlı APK projesi (Kotlin + gömülü Python)
vendor/hermes-agent/    Hermes Agent kaynağı (MIT, üst akış — bkz. vendor/README.md)
scripts/
  build_apk.sh          Android SDK'yı kurar ve APK derler
  install_hermes.sh     Hermes bağımlılıklarını kurar (kaynak depoda)
  update_hermes.sh      Hermes kaynağını üst akıştan günceller
  termux_setup.sh       Android tek komut kurulum
  start.sh              uygulamayı başlat
tests/                  289 test (pytest)
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
| `HERMESFORGE_FALLBACK_KEY` | — | Yedek sağlayıcı anahtarı |
| `HERMESFORGE_REASONING_EFFORT` | `default` | Düşünme düzeyi |
| `HERMESFORGE_MAX_TOKENS` | `32768` | Maksimum token |
| `HERMESFORGE_MAX_PARALLEL` | `2` | Aynı anda çalışacak ajan sayısı |

---

## Testler

```bash
python3 -m pip install -r requirements-dev.txt
python3 -m pytest
```

289 test; hepsi yalıtılmış — makinede çalışan bir Hermes varsa bile testler
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
