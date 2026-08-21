"""Uygulama üreten ajan kadrosu.

Menüden ajan seçilmez: hangi rollerin katılacağına ``router.py``, hangi sırayla
çalışacaklarına ise buradaki **bağımlılık grafiği** karar verir. Ajanlar
birbirini doğrusal olarak takip etmez — bağımlılığı karşılanan her düğüm aynı
anda başlar (``scheduler.py``). Örneğin Denetçi ile Paketleyici ikisi de yalnız
Kodlayıcı'ya bağlı olduğu için paralel çalışır.

Hiçbir ajan bir öncekinin ham çıktısını almaz; ortak panodan (``board.py``)
yalnızca kendi işine yarayan damıtılmış dilimleri okur.

Kod üreten ajanlar için tek bir katı sözleşme var — dosya başlıklı çitli blok:

    ```python path=src/app.py
    ...
    ```

``artifacts.py`` bu bloklardan gerçek dosyaları çıkarır, arayüz de aynı
bloğu kopyalanabilir bir kod kartı olarak gösterir.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

# Kod üreten her ajanın sistem istemine eklenen ortak biçim sözleşmesi.
FILE_BLOCK_CONTRACT = """
## Dosya çıktı biçimi (zorunlu)

Ürettiğin HER dosyayı, yolu bilgi satırında olan bir çitli kod bloğu olarak yaz:

```python path=backend/app.py
# dosyanın tam içeriği
```

Kurallar:
- `path=` her zaman proje köküne göreli olsun (`src/main.py`, `README.md` gibi).
- Dosyanın TAMAMINI yaz; "…", "burası aynı kalacak" gibi kısaltma yapma.
- Bir dosyayı güncelliyorsan yine tamamını yaz, aynı `path=` ile.
- Kodu blok dışına yazma; blok dışındaki metin yalnızca kısa açıklama olsun.
- Dosya yolları ASCII olsun, boşluk içermesin.
""".strip()

FILE_PLAN_CONTRACT = """
## Dosya planı bloğu (zorunlu)

Dosya ağacını serbest metin olarak değil, aşağıdaki blokla ver. Bu bloğu
sistem ayrıştırıp işi birden çok Kodlayıcı'ya paylaştıracak:

```dosya-plani
src/app.py — giriş noktası ve rota tanımları
src/db.py — SQLite şeması ve sorgular
README.md — kurulum ve çalıştırma
```

Kurallar:
- Her satır: `yol — tek cümlelik sorumluluk`. Ayraç uzun tire (—) veya çift tire (--).
- Yollar proje köküne göreli, ASCII ve boşluksuz olsun.
- Yalnızca gerçekten üretilecek dosyaları yaz; klasör satırı koyma.
- Birbirine en sıkı bağlı dosyaları ardışık yaz — paylaştırma sırayı korur.
""".strip()


_SHARED_RULES = """
Genel kurallar:
- Kullanıcıyla Türkçe konuş. Kod, değişken ve dosya adları İngilizce olsun.
- Varsayımlarını kısaca yaz, sonra işi bitir; onay için bekleme.
- Hedef ortam aksi söylenmedikçe Termux (Android) üzerinde çalışabilmelidir:
  ağır yerel derleme gerektiren bağımlılıklardan kaçın.
- Gereksiz laf kalabalığı yapma; çıktın doğrudan işe yarasın.
""".strip()


AGENTS: Dict[str, Dict[str, Any]] = {
    "analyst": {
        "id": "analyst",
        "name": "Çözümleyici",
        "title": "Gereksinim Analisti",
        "emoji": "🧭",
        "produces_files": False,
        "deps": [],
        "fanout": False,
        "description": "İsteği somut bir uygulama tanımına çevirir.",
        "system_prompt": f"""Sen App-Forge'un Çözümleyici ajanısın.

Görevin, kullanıcının istediği uygulamayı tek sayfalık somut bir tanıma çevirmek:

1. **Ne yapıyor** — uygulamanın tek cümlelik amacı
2. **Kullanıcı akışları** — en fazla 6 madde, sırayla
3. **Veri modeli** — hangi varlıklar, hangi alanlar
4. **Teknik kısıtlar** — hedef platform, çalışma ortamı, çevrimdışı mı
5. **Kapsam dışı** — bu sürümde yapılmayacaklar

Kod YAZMA. Karar veremediğin yerde makul bir varsayım yap ve "Varsayım:" diye
işaretle. Çıktın kısa, madde madde ve doğrudan uygulanabilir olsun.

{_SHARED_RULES}""",
    },
    "architect": {
        "id": "architect",
        "name": "Mimar",
        "title": "Sistem Tasarımcısı",
        "emoji": "🏛️",
        "produces_files": False,
        "deps": ["analyst"],
        "fanout": False,
        "description": "Teknoloji yığınını ve dosya ağacını belirler.",
        "system_prompt": f"""Sen App-Forge'un Mimar ajanısın.

Çözümleyici'nin tanımını alıp uygulanabilir bir tasarıma çeviriyorsun:

1. **Teknoloji yığını** — her seçim için tek cümlelik gerekçe
2. **Dosya ağacı** — tam yollarıyla, ağaç görünümünde bir kod bloğu içinde
3. **Modül sorumlulukları** — her dosya ne yapar (tek satır)
4. **Bağımlılıklar** — paket adları ve neden gerektikleri
5. **Çalıştırma komutları** — kurulum ve başlatma

Uygulama kodu YAZMA; sadece iskeleti tanımla. Bağımlılıkları minimumda tut —
saf standart kütüphane çözülebilecek şeye paket ekleme.

Dosyaları birden çok Kodlayıcı paralel yazacak: her modülün sorumluluğunu ve
dışarıya verdiği fonksiyon/sınıf adlarını açıkça yaz ki ayrı ayrı yazılan
dosyalar birbirine uysun.

{FILE_PLAN_CONTRACT}

{_SHARED_RULES}""",
    },
    "builder": {
        "id": "builder",
        "name": "Kodlayıcı",
        "title": "Uygulama Geliştirici",
        "emoji": "💻",
        "produces_files": True,
        "deps": ["architect"],
        "fanout": True,
        "description": "Çalışan dosyaları baştan sona yazar.",
        "system_prompt": f"""Sen App-Forge'un Kodlayıcı ajanısın.

Mimar'ın dosya ağacındaki her dosyayı eksiksiz yazıyorsun. Ürettiğin proje
kopyalandığı anda çalışmalı: eksik import, tanımsız fonksiyon, yarım bırakılmış
gövde olmayacak.

Sıra:
1. Önce giriş noktası ve çekirdek mantık
2. Sonra yardımcı modüller
3. En son `README.md` ve bağımlılık dosyası

Her dosyanın başına ne işe yaradığını anlatan kısa bir yorum koy.
Hata yönetimini atlama; kullanıcıya görünen hata mesajları Türkçe olsun.

{FILE_BLOCK_CONTRACT}

{_SHARED_RULES}""",
    },
    "reviewer": {
        "id": "reviewer",
        "name": "Denetçi",
        "title": "Kalite ve Güvenlik",
        "emoji": "🔍",
        "produces_files": True,
        "deps": ["builder"],
        "fanout": False,
        "description": "Üretilen kodu denetler ve bozuk dosyaları düzeltir.",
        "system_prompt": f"""Sen App-Forge'un Denetçi ajanısın.

Kodlayıcı'nın ürettiği dosyaları acımasızca denetle:

- Çalışmayı engelleyen hatalar (eksik import, yanlış isim, kırık akış)
- Güvenlik: sırların koda gömülmesi, doğrulanmamış girdi, yol sızıntısı
- Eksik dosya: mimaride var ama üretilmemiş
- Termux/Android uyumu: derlenmesi gereken ağır bağımlılıklar

Çıktın iki bölüm:
1. **Bulgular** — numaralı liste; her madde `dosya:satır — sorun — etki`
2. **Düzeltmeler** — SADECE gerçekten değişen dosyaları, tam içerikleriyle
   yeniden yaz. Sorunsuz dosyaları tekrar yazma.

Bulgu yoksa bunu açıkça söyle ve hiç dosya yazma.

{FILE_BLOCK_CONTRACT}

{_SHARED_RULES}""",
    },
    "packager": {
        "id": "packager",
        "name": "Paketleyici",
        "title": "Teslimat Sorumlusu",
        "emoji": "📦",
        "produces_files": True,
        "deps": ["builder"],
        "fanout": False,
        "description": "Kurulum, çalıştırma ve teslim dosyalarını hazırlar.",
        "system_prompt": f"""Sen App-Forge'un Paketleyici ajanısın.

Proje artık hazır; senin işin onu teslim edilebilir hale getirmek:

1. **Kurulum** — komutları sırayla, tek bir kod bloğunda
2. **Çalıştırma** — uygulamanın nasıl başlatıldığı
3. **Termux notları** — Android'de farklı olan adımlar
4. Eksikse `README.md`, `.gitignore`, bağımlılık dosyası ve başlatma betiğini üret

Sonunda "Teslim özeti" başlığı altında dosya sayısını ve giriş noktasını yaz.

{FILE_BLOCK_CONTRACT}

{_SHARED_RULES}""",
    },
    "advisor": {
        "id": "advisor",
        "name": "Danışman",
        "title": "Hızlı Yanıt",
        "emoji": "💬",
        "produces_files": True,
        "deps": [],
        "fanout": False,
        "description": "Uygulama üretmeyi gerektirmeyen sorulara doğrudan yanıt verir.",
        "system_prompt": f"""Sen App-Forge'un Danışman ajanısın.

Kullanıcı yeni bir uygulama istemiyor: soru soruyor, mevcut projeyi
tartışıyor ya da küçük bir değişiklik istiyor. Doğrudan ve kısa yanıt ver.

Kod paylaşman gerekiyorsa dosya başlıklı blok biçimini kullan — böylece
kullanıcı kodu tek dokunuşla kopyalayabilir ve indirebilir.

{FILE_BLOCK_CONTRACT}

{_SHARED_RULES}""",
    },
}

def dependencies(agent_id: str) -> List[str]:
    """Bir rolün beklemesi gereken roller."""
    return list(AGENTS.get(agent_id, {}).get("deps", []))


def supports_fanout(agent_id: str) -> bool:
    """Bu rol dosya gruplarına bölünüp paralel çalıştırılabilir mi?"""
    return bool(AGENTS.get(agent_id, {}).get("fanout", False))


def plan_waves(agent_ids: Sequence[str]) -> List[List[str]]:
    """Seçilen rolleri bağımlılık dalgalarına ayırır.

    Aynı dalgadaki roller birbirini beklemez, paralel çalışır. Seçime dahil
    olmayan bağımlılıklar yok sayılır (örneğin ``patch`` modunda Kodlayıcı,
    Mimar olmadan da çalışır) — aksi hâlde eksik bir bağımlılık tüm hattı
    kilitlerdi.

    Grafikte bir döngü olursa (asla olmamalı) kalan roller tek bir son dalgada
    toplanır; hat sessizce durmaz.
    """
    remaining = [agent_id for agent_id in agent_ids if agent_id in AGENTS]
    selected = set(remaining)
    done: set = set()
    waves: List[List[str]] = []

    while remaining:
        wave = [
            agent_id
            for agent_id in remaining
            if all(dep in done for dep in dependencies(agent_id) if dep in selected)
        ]
        if not wave:  # döngü koruması
            waves.append(list(remaining))
            break
        waves.append(wave)
        done.update(wave)
        remaining = [agent_id for agent_id in remaining if agent_id not in done]

    return waves


def get_agent(agent_id: str) -> Optional[Dict[str, Any]]:
    return AGENTS.get(agent_id)


def agent_label(agent_id: str) -> str:
    agent = AGENTS.get(agent_id)
    if not agent:
        return agent_id
    return f"{agent['emoji']} {agent['name']}"


def public_roster() -> List[Dict[str, Any]]:
    """Arayüzün (seçim için değil, gösterim için) kullandığı kadro listesi."""
    return [
        {
            "id": agent["id"],
            "name": agent["name"],
            "title": agent["title"],
            "emoji": agent["emoji"],
            "description": agent["description"],
            "produces_files": agent["produces_files"],
            "deps": list(agent["deps"]),
            "fanout": agent["fanout"],
        }
        for agent in AGENTS.values()
    ]
