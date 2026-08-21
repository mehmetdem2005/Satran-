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
| Hermes ayrı süreç | Hermes ~176 MB'lık bir monorepo ve kendi bağımlılık ağacı var. Onu bu depoya kopyalamak yerine kurup HTTP üzerinden konuşuyoruz — Termux'ta çalışabilmesinin tek pratik yolu bu. |
| RAG ve bellek SQLite FTS5 | Hermes kendi oturum aramasını FTS5 + bm25 üzerine kurar; aynı zemini kullanıyoruz. Ek paket yok, Termux'ta derleme yok. |

---

## Ajan kadrosu

Hangilerinin çalışacağına yönlendirici karar verir:

| Mod | Ne zaman | Hat |
|---|---|---|
| `build` | Sıfırdan yeni bir uygulama | 🧭 Çözümleyici → 🏛️ Mimar → 💻 Kodlayıcı → 🔍 Denetçi → 📦 Paketleyici |
| `patch` | Mevcut projede değişiklik | 💻 Kodlayıcı → 🔍 Denetçi |
| `package` | "zip olarak ver" | 📦 Paketleyici (model çağrısı yapılmaz) |
| `answer` | Soru, sohbet, açıklama | 💬 Danışman |

Paketleme istekleri ve tek satırlık sorular **deterministik** olarak
tanınır — model burada yanılıp hazır projeyi baştan üretemez.

---

## Kurulum

### Termux (Android)

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
bash scripts/install_hermes.sh
bash scripts/start.sh
```

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
  utils.py              dosya çıkarma, SSE, güvenli yol
  hermes/
    client.py           Hermes API sunucusu istemcisi
    runtime.py          kurulumu bul, gateway'i başlat
    memory.py           kalıcı bellek (FTS5)
    rag.py              RAG motoru (FTS5 + bm25)
  forge/
    agents.py           ajan kadrosu ve istemler
    router.py           otomatik ajan seçimi
    pipeline.py         akış orkestrasyonu
    artifacts.py        kod bloğu → dosya → paket
  providers/direct.py   Hermes kapalıyken yedek sağlayıcı
frontend/
  templates/index.html
  static/css/app.css
  static/js/markdown.js CDN'siz markdown + kod kartı
  static/js/app.js      arayüz mantığı
scripts/
  install_hermes.sh     Hermes Agent'ı indirir ve kurar
  termux_setup.sh       Android tek komut kurulum
  start.sh              uygulamayı başlat
tests/                  212 test (pytest)
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

---

## Testler

```bash
python3 -m pip install -r requirements-dev.txt
python3 -m pytest
```

212 test; hepsi yalıtılmış — makinede çalışan bir Hermes varsa bile testler
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
