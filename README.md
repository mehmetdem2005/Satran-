# HermesForge ⚒️

**Uygulama üreten uygulama.** Ne istediğini yaz; sistem hangi ajanların
çalışacağına kendi karar verir, kodu dosya dosya üretir ve istediğin biçimde
(zip, tar.gz, markdown, json, tek dosya) teslim eder.

Motor olarak **yalnızca** [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
kullanılır — Hermes'in kendi araçları, becerileri, oturum belleği ve arama
altyapısı doğrudan bu uygulamanın arkasında çalışır. Hermes'siz çalışan bir
yedek yol yoktur.

---

## Neden böyle kurgulandı?

| Karar | Gerekçe |
|---|---|
| Ajan seçimi menüden kaldırıldı | Kullanıcı "hangi ajan" değil "ne istediğini" bilir. Yönlendirici isteği okuyup hattı kendisi kurar. |
| Başlık canlı | Üst başlık o an çalışan ajanın adını taşır; ilerlemeyi izlemek için ayrı bir panele gerek yok. |
| Kod her zaman kart içinde | Model kodu düz metin akıtsa bile arayüz onu dosya adı başlıklı, kopyalanabilir ve indirilebilir bir karta çevirir. |
| Hermes olmadan çalışan yol yok | Doğrudan sağlayıcıya giden yedek yol kaldırıldı. Modeli, anahtarı, araçları ve becerileri Hermes yönetir; telefonda hiçbir sağlayıcı anahtarı durmaz. |
| Hermes kaynağı depoda, süreci ayrı | Kaynak `vendor/hermes-agent/` altında (MIT, sürüm sabit) — klonlayan herkes aynı sürümü alır, çevrimdışı kurulum mümkün. Ama Hermes kendi sanal ortamında ayrı bir süreç olarak çalışır ve HTTP üzerinden konuşuruz; APK'ya girmemesinin sebebi de bu (bkz. "Nasıl çalışır"). |
| Bağlanma QR ile | Ev ağı adresini ve 35 karakterlik anahtarı telefonda elle yazmak, "beni uğraştırma" isteğinin tam tersi. Kamera QR'ı okur, uygulama kendi kaydeder. |
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

## Nasıl çalışır: iki parça

```
   TELEFON                                 BİLGİSAYAR (ya da VPS)
 ┌────────────────────┐   ev ağı        ┌──────────────────────────┐
 │ HermesForge APK    │  ───────────▶   │ Hermes Agent gateway     │
 │ arayüz + ajan hattı│   HTTP :8642    │ model, araçlar, beceriler│
 └────────────────────┘                 └──────────────────────────┘
```

Uygulama **yalnızca Hermes ile çalışır.** Doğrudan sağlayıcıya giden bir yedek
yol yoktur: modeli, API anahtarını ve araçları Hermes'in kendisi yönetir.
Telefonda hiçbir sağlayıcı anahtarı durmaz.

Karşılığı açık: **Hermes'in çalıştığı makine açık olmalı** ve telefonla aynı
ağda bulunmalı (ya da erişilebilir bir sunucuda olmalı).

> Neden Hermes APK'nın içine gömülmedi: denendi ve ölçüldü. Chaquopy `jiter`
> için saf-Python bir gölge paketle ikna edilebiliyor (denendi, gerçek bir ajan
> turu tamamlandı) ama `pydantic-core` Android için hiç derlenmemiş — depoda
> yalnızca 0.0.1 yer tutucusu var, bu yüzden `pip` pydantic 1.10'a düşüyor.
> Hermes, openai SDK'sı ve FastAPI'nin üçü de pydantic 2 istiyor. `jiter`'in
> aksine `pydantic-core` bir Rust doğrulama motoru; gölgelenemez.

---

## Kurulum

### 1) Bilgisayarda: tek komut

```bash
git clone https://github.com/mehmetdem2005/Satran-.git
cd Satran- && bash scripts/hermes_sunucu.sh
```

Betik sırasıyla: Hermes kurulu değilse **kurar** → model sağlayıcısı
ayarlanmamışsa DeepSeek anahtarını **bir kez sorar** ve `~/.hermes/config.yaml`
ile `.env` dosyasına yazar → API sunucusunu ev ağına açar
(`API_SERVER_HOST=0.0.0.0`) → gateway anahtarı yoksa **üretir** → gateway'i
başlatır → terminale bir **QR kod** basar.

Hiç soru sorulmasını istemiyorsan anahtarı komutta ver:

```bash
bash scripts/hermes_sunucu.sh --model-anahtari sk-... --model deepseek-v4-flash
```

Sağlayıcı kimliği (`deepseek`) ve anahtar değişkeni (`DEEPSEEK_API_KEY`)
Hermes'in kendi `hermes_cli/auth.py` dosyasındaki kayıttan alındı; uydurma
değil. Üretilen yapılandırmayla gerçek bir Hermes turu çalıştırılarak
doğrulandı.

QR kodun içinde `hermesforge://connect?url=…&key=…` bağlantısı var; ekstra
paket gerekmez, QR'ı `scripts/qr.py` (bağımlılıksız, saf Python) üretir.

### 2) Telefonda: APK'yı kur ve QR'ı okut

Derleme mimariye göre üç APK üretir:

| Dosya | Boyut | Kime |
|---|---|---|
| `hermesforge-arm64-debug.apk` | ~30 MB | 2017 sonrası neredeyse tüm telefonlar |
| `hermesforge-arm32-debug.apk` | ~26 MB | eski 32-bit cihazlar |
| `hermesforge-universal-debug.apk` | ~37 MB | emin değilsen; her cihazda çalışır |

Telefona kopyalayıp dokun; "bilinmeyen kaynaklardan kuruluma izin ver"
sorulursa onayla. USB ile: `adb install -r dist/hermesforge-arm64-debug.apk`.

Kurulduktan sonra **telefonun kamerasını QR koda tut** → çıkan bildirime dokun
→ uygulama açılır, adresi ve anahtarı kendisi kaydeder.

Kamera özel bağlantıyı açmıyorsa uygulamayı aç: **açılış ekranı ev ağını
kendisi tarar** ve Hermes'i bulunca "Hermes bulundu: 192.168.1.20:8642" diye
gösterir; dokun, yalnızca anahtarı yapıştır.

### Adresi bir daha yazmazsın

Bilgisayarın IP'si değişince (DHCP kirası, yeniden başlatma) uygulama eskiden
"bağlanamadı" derdi ve nedenini kimse bilmezdi. Artık:

- kayıtlı adres çalışıyorsa hiçbir şey taranmaz (boşuna pil harcanmaz),
- çalışmıyorsa cihazın kendi `/24` ağı taranır, `GET /health` ile
  **gerçekten Hermes mi** diye bakılır (aynı portta başka servis olabilir),
- bulunan sunucu ekranda tek dokunuşluk bir düğme olarak çıkar.

Ayarlar → Hermes sunucusu → **Ağda Hermes ara** ile elle de tetiklenebilir.
Gerçek Hermes 0.20.4 kurulumunda tam `/24` taraması **1,5 saniye** sürdü.

APK'yı kendin derlemek istersen:

```bash
bash scripts/build_apk.sh
```

Betik Android SDK'yı gerekiyorsa indirir, arayüzü paketler ve `dist/` altına
debug imzalı APK bırakır.

**APK ne içeriyor:** Python 3.11 + Flask + HermesForge'un tamamı (Chaquopy,
MIT) — ajan hattı, pano, paralel dalgalar, RAG, bellek, kod kartları,
zip/tar.gz indirme. Sunucu bir **ön plan servisinde** yaşıyor: uzun süren bir
yapım turu sırasında başka uygulamaya geçsen bile Android süreci öldürmüyor.

### Derin bağlantı güvenliği

`hermesforge://connect` bağlantısını kötü niyetli bir web sayfası da açabilir.
Kural şöyle kilitlendi (17 birim testi, `ConnectLinkTest`):

- yalnızca `http`/`https`; `file:` ve diğer şemalar reddedilir
- adreste kullanıcı adı/parola varsa (`http://guvenli@saldirgan`) reddedilir —
  onay penceresinde yanlış makine adı gösterilirdi
- anahtarda kontrol karakteri varsa reddedilir (HTTP başlığı enjeksiyonu)
- **aynı cihazda değilse kullanıcıya onay penceresi gösterilir**; ev ağı
  (RFC1918) adresi ile internetteki bir sunucu ayrı ayrı, farklı sertlikte
  uyarılır. Onay gelmeden anahtar hiçbir yere yazılmaz.

### Telefonda Termux ile (isteğe bağlı)

Hermes'i telefonun kendisinde çalıştırmak istersen — bilgisayara ihtiyaç
kalmaz ama telefon ısınır ve pil biter:

```bash
pkg install -y git
git clone https://github.com/mehmetdem2005/Satran-.git
cd Satran- && bash scripts/termux_hermes_baglat.sh
```

Adres `127.0.0.1` olduğu için onay penceresi çıkmaz, doğrudan bağlanır.

### Masaüstünde tarayıcıyla kullanmak

```bash
python3 -m pip install -r requirements.txt
bash scripts/install_hermes.sh    # kaynak depoda; yalnızca bağımlılıkları kurar
bash scripts/start.sh
```

Tarayıcıda `http://127.0.0.1:5000`. Hermes kaynağı depoda geldiği için kurulum
indirme yapmaz. Üst akıştan güncellemek istersen: `bash scripts/update_hermes.sh`

---

## Hermes bağlantısı nasıl kuruluyor?

`scripts/install_hermes.sh` deponun tamamını `vendor/hermes-agent/` altına
indirir ve `~/.hermes/.env` dosyasına şunları yazar:

```bash
API_SERVER_ENABLED=true
API_SERVER_KEY=hf-…        # otomatik üretilir, HermesForge kendisi okur
```

`scripts/hermes_sunucu.sh` buna ek olarak `API_SERVER_HOST=0.0.0.0` yazar —
telefonun görebilmesi için. Bu bir *dinleme* adresi; uygulama ona bağlanırken
`127.0.0.1`e çevirir (0.0.0.0'a bağlanmak Linux'ta tesadüfen çalışır, macOS ve
Windows'ta çalışmaz).

Bağlanılan uçlar:

| Uç | Kullanım |
|---|---|
| `GET /health` | Ayakta mı? Kimlik istemez — ağ taraması bunu kullanır, `platform: hermes-agent` imzasına bakar |
| `GET /v1/capabilities` | Anahtarı doğrular; "Bağlantıyı sına" bunu kullanır |
| `POST /api/sessions` | Kalıcı oturum — Hermes'in belleği bu oturumda yaşar |
| `POST /api/sessions/{id}/chat/stream` | Turun SSE akışı: `assistant.delta`, `tool.started`, `run.completed` |
| `POST /v1/chat/completions` | Oturum açılamadığında durumsuz yedek yol |

`X-Hermes-Session-Key` başlığı uzun vadeli belleği tek kapsamda tutar;
böylece transkript değişse bile Hermes aynı kullanıcıyı tanır.

---

## Model ayarları

Modeli ve sağlayıcıyı **Hermes tarafında** seçersin:

```bash
vendor/hermes-agent/venv/bin/hermes model
```

Uygulamadan istek başına gönderilebilen tek model ayarı düşünme düzeyidir.

| Ayar | Nasıl gider |
|---|---|
| **Düşünme düzeyi** | `model_options.reasoning_effort`. Geçerli değerler Hermes'in kendi `_REASONING_EFFORTS` kümesinden okundu: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra`. "Varsayılan" seçiliyken **hiçbir şey gönderilmez** — Hermes kendi ayarını kullanır. |
| **Maksimum token** | Hermes bunu **istek başına kabul etmiyor** (istek gövdesinden yalnız `provider`, `model`, `model_options` okunuyor). `~/.hermes/.env` içine `HERMES_MAX_TOKENS` yazılır ve gateway yeniden başlayınca geçerli olur — yani yalnızca uygulama Hermes ile aynı makinedeyse işe yarar. |
| **Sıcaklık / Top P** | Hermes istek başına kabul etmiyor; arayüzde de yok. Hermes'in kendi yapılandırmasından ayarlanır. |

Liste arayüzde sabit tutulmuyor; `backend/presets.py` üzerinden sunucudan
geliyor ve kaydedilmeden önce doğrulanıyor — listede olmayan bir değeri Hermes
sessizce yok sayardı ve kullanıcı ayarın çalıştığını sanırdı.

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
  utils.py              dosya çıkarma, SSE, güvenli yol
  hermes/
    client.py           Hermes API sunucusu istemcisi
    runtime.py          kurulumu bul, gateway'i başlat
    memory.py           kalıcı bellek (FTS5)
    rag.py              RAG motoru (FTS5 + bm25)
    discovery.py        ev ağında Hermes arar (/24 tarama + /health imzası)
  forge/
    agents.py           ajan kadrosu, istemler ve bağımlılık grafiği
    board.py            ortak pano (damıtılmış yapım durumu)
    scheduler.py        dalga yürütücüsü, paralel düğümler, fan-out
    router.py           otomatik rol seçimi
    pipeline.py         akış orkestrasyonu
    artifacts.py        kod bloğu → dosya → paket
frontend/
  templates/index.html
  static/css/app.css
  static/js/markdown.js CDN'siz markdown + kod kartı
  static/js/app.js      arayüz mantığı
android/                Chaquopy tabanlı APK projesi (Kotlin + gömülü Python)
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
tests/                  334 test (pytest)
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

334 test; hepsi yalıtılmış — makinede çalışan bir Hermes varsa bile testler
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
