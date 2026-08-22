"""APK içindeki Python girişi.

Kotlin tarafı burayı çağırır: ortamı kurar, arayüz dosyalarını uygulamanın
özel dizinine açar, **gömülü Hermes gateway'ini** ve Flask sunucusunu
başlatır, seçilen portu döndürür.

Android'e özgü tek fark yollardır. Uygulama mantığının tamamı ``backend/``
altındaki modüllerden gelir — masaüstünde çalışan kodun aynısı.

Gömülü Hermes başlamazsa uygulama açılmaya devam eder: kullanıcı ağdaki bir
Hermes'e bağlanabilir. Sessizce çökmek yerine sebebini ``/api/status``
üzerinden arayüze bildiriyoruz.
"""

from __future__ import annotations

import logging
import os
import sys
import threading
import zipfile
from pathlib import Path

logger = logging.getLogger("hermesforge.android")

_state = {"port": 0, "error": ""}


def _install_frontend(files_dir: Path, assets_zip: str) -> Path:
    """Arayüz dosyalarını assets'ten uygulamanın özel dizinine açar.

    Flask şablon ve statik dosyaları diskte ister; APK'nın içindeki asset'ler
    doğrudan dosya sistemi yolu değildir. Her açılışta sürüm damgası
    karşılaştırılıp gerekiyorsa yeniden açılır.
    """
    target = files_dir / "frontend"
    stamp = target / ".stamp"
    source_stamp = str(Path(assets_zip).stat().st_mtime_ns) if os.path.exists(assets_zip) else "0"

    if stamp.exists() and stamp.read_text(encoding="utf-8").strip() == source_stamp:
        return target

    if target.exists():
        import shutil

        shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(assets_zip) as archive:
        for member in archive.infolist():
            if member.is_dir():
                continue
            # Zip Slip koruması: arşivdeki yollar hedefin dışına çıkamaz.
            destination = (target / member.filename).resolve()
            if not str(destination).startswith(str(target.resolve())):
                logger.warning("Arşiv dışına yazma reddedildi: %s", member.filename)
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source, open(destination, "wb") as handle:
                handle.write(source.read())

    stamp.write_text(source_stamp, encoding="utf-8")
    return target


def _start_embedded_hermes(hermes_home: Path) -> None:
    """Gömülü Hermes gateway'ini başlatır; başaramazsa uygulamayı durdurmaz.

    Gateway ilk açılışta SQLite şemalarını kuruyor ve bu telefonda saniyeler
    sürebiliyor. Beklemeyi bloklamıyoruz: arayüz açılır, motor hazır olunca
    ``/api/status`` bunu bildirir.
    """
    try:
        from hermes import embedded
    except Exception as exc:
        logger.warning("Gömülü Hermes modülü yüklenemedi: %s", exc)
        return

    if not embedded.available():
        logger.info("Bu yapıda Hermes kaynağı yok; ağdaki Hermes'e bağlanılabilir.")
        return

    os.environ.setdefault("HERMESFORGE_HERMES_URL", f"http://127.0.0.1:{embedded.DEFAULT_PORT}")

    def _boot() -> None:
        try:
            embedded.start(hermes_home, timeout=180)
        except Exception:
            logger.exception("Gömülü Hermes başlatılamadı")

    threading.Thread(target=_boot, name="hermes-boot", daemon=True).start()


def start(files_dir: str, frontend_zip: str) -> int:
    """Sunucuyu başlatır ve dinlenen portu döndürür. Hata olursa 0."""
    try:
        base = Path(files_dir)
        base.mkdir(parents=True, exist_ok=True)

        # HermesForge tüm verisini (ayarlar, SQLite, üretilen projeler) burada
        # tutsun — Android'de ev dizini yazılabilir değil.
        os.environ.setdefault("HERMESFORGE_HOME", str(base / "hermesforge"))
        hermes_home = Path(os.environ.setdefault("HERMES_HOME", str(base / "hermes")))
        # Gömülü gateway'i biz başlatıyoruz; HermesRuntime alt süreç açmasın
        # (Android'de alt süreçle venv çalıştırmak zaten mümkün değil).
        os.environ.setdefault("HERMESFORGE_HERMES_AUTOSTART", "false")
        # Arayüz ve hata mesajları kabuk komutu önermesin.
        os.environ["HERMESFORGE_PLATFORM"] = "android"

        frontend = _install_frontend(base, frontend_zip)
        os.environ["HERMESFORGE_TEMPLATES"] = str(frontend / "templates")
        os.environ["HERMESFORGE_STATIC"] = str(frontend / "static")

        _start_embedded_hermes(hermes_home)

        import serve

        port, _thread = serve.start_server("127.0.0.1", 0)
        if not serve.wait_until_ready("127.0.0.1", port, timeout=45):
            _state["error"] = "Sunucu zamanında yanıt vermedi."
            return 0

        _state["port"] = port
        return port
    except Exception as exc:  # Kotlin tarafına anlaşılır bir hata dönmeli
        logger.exception("Sunucu başlatılamadı")
        _state["error"] = f"{type(exc).__name__}: {exc}"
        return 0


def last_error() -> str:
    return _state["error"]


def port() -> int:
    return _state["port"]
