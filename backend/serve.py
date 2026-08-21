"""Sunucuyu başlatan ortak giriş — hem masaüstü hem Android buradan geçer.

Android'de (Chaquopy) uygulama kendi sürecinde bir Flask sunucusu çalıştırır ve
WebView ona bağlanır. Masaüstünde ``run.py`` aynı işlevi çağırır. Tek yol
olması önemli: APK'nın içinde çalışacak kodun aynısını burada masaüstünde
test edebiliyoruz.

Port ``0`` verildiğinde işletim sistemi boş bir port seçer ve seçilen port
döndürülür — Android'de 5000 dolu olabilir, sabit porta bağlanmak kırılgan.
"""

from __future__ import annotations

import logging
import socket
import sys
import threading
from pathlib import Path
from typing import Any, Optional, Tuple

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

logger = logging.getLogger("hermesforge.serve")


def find_free_port(host: str = "127.0.0.1") -> int:
    """İşletim sisteminden boş bir port ister."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def build_app() -> Any:
    """Flask uygulamasını kurar (ortam değişkenleri zaten okunmuş olmalı)."""
    from app import create_app

    return create_app()


def start_server(
    host: str = "127.0.0.1",
    port: int = 0,
    *,
    app: Optional[Any] = None,
) -> Tuple[int, threading.Thread]:
    """Sunucuyu arka planda başlatır, ``(port, thread)`` döndürür.

    Sunucu daemon bir iş parçacığında çalışır: Android'de servis kapanınca
    süreçle birlikte gider, masaüstünde Ctrl+C'yi engellemez.
    """
    if port == 0:
        port = find_free_port(host)

    application = app or build_app()

    def run() -> None:
        try:
            # threaded=True zorunlu: SSE akışı ve paralel ajan dalgaları aynı
            # anda birden çok isteği açık tutuyor.
            application.run(
                host=host,
                port=port,
                debug=False,
                threaded=True,
                use_reloader=False,
            )
        except Exception:
            logger.exception("Sunucu beklenmedik şekilde durdu")

    thread = threading.Thread(target=run, name="hermesforge-server", daemon=True)
    thread.start()
    logger.info("HermesForge http://%s:%s adresinde", host, port)
    return port, thread


def wait_until_ready(host: str, port: int, timeout: float = 30.0) -> bool:
    """Sunucu TCP bağlantısı kabul edene kadar bekler.

    Android tarafı WebView'i bundan sonra yüklüyor; erken yüklenirse
    kullanıcı boş sayfa görür.
    """
    import time

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except OSError:
            time.sleep(0.1)
    return False
