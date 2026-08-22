"""Test ortak altyapısı."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "backend"))


# Testler makinede ne çalıştığına bağlı olmamalı. Geliştirici makinesinde
# gerçek bir Hermes gateway 8642'de duruyor olabilir; testler ona bağlanırsa
# "motor yok" senaryoları sessizce yeşile döner ve hiçbir şey doğrulamaz.
UNUSED_PORT_URL = "http://127.0.0.1:9"


@pytest.fixture(autouse=True)
def izole_ortam(tmp_path, monkeypatch):
    """Her test kendi yapılandırmasıyla ve erişilemez bir Hermes ile başlar."""
    monkeypatch.setenv("HERMESFORGE_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("HERMESFORGE_HERMES_AUTOSTART", "false")
    monkeypatch.setenv("HERMESFORGE_HERMES_URL", UNUSED_PORT_URL)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes-home"))
    # android_main.start() HERMESFORGE_PLATFORM'u süreç genelinde "android"
    # yapıyor; temizlenmezse sonraki testler kendilerini Android sanıyor.
    for leaked in ("API_SERVER_KEY", "HERMESFORGE_HERMES_REPO", "HERMES_REPO",
                   "HERMESFORGE_PLATFORM"):
        monkeypatch.delenv(leaked, raising=False)


@pytest.fixture()
def tmp_config():
    """Yalıtılmış ortamdan yüklenmiş yapılandırma."""
    import config as config_module

    return config_module.load_config()


@pytest.fixture()
def store(tmp_path):
    from forge.artifacts import ArtifactStore

    return ArtifactStore(tmp_path / "projects")


@pytest.fixture()
def rag(tmp_path):
    from hermes.rag import HermesRag

    return HermesRag(tmp_path / "rag.sqlite3", workspace_dir=tmp_path / "ws")


@pytest.fixture()
def memory(tmp_path):
    from hermes.memory import HermesMemory

    return HermesMemory(tmp_path / "memory.sqlite3")


@pytest.fixture()
def http_sunucu():
    """Hermes olmayan, ama HTTP konuşan bir sunucu (yanlış port senaryosu)."""
    import threading
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            body = b"<html>baska bir servis</html>"
            self.send_response(404)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()


@pytest.fixture()
def sahte_hermes():
    """Kimlik doğrulaması yapan minik bir sahte Hermes API sunucusu.

    Bağlantı sınama yolunu gerçek HTTP üzerinden deniyoruz; sunucuyu taklit
    eden bir mock, istemcinin gerçekten doğru uçlara gittiğini göstermez.
    Gerçek Hermes gibi: ``/health`` kimlik istemez, ``/v1/capabilities`` ister.
    """
    import json
    import threading
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _send(self, obj, status=200):
            body = json.dumps(obj).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _authorized(self):
            return self.headers.get("Authorization") == "Bearer sk-dogru"

        def do_GET(self):
            path = self.path.rstrip("/")
            if path.endswith("/health"):
                return self._send({"status": "ok"})
            if not self._authorized():
                return self._send({"error": {"message": "invalid api key"}}, 401)
            if path.endswith("/v1/capabilities"):
                return self._send({"model": "hermes-agent", "auth": {"required": True}})
            return self._send({"error": "not found"}, 404)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()
