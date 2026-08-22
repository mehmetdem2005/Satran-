"""Ev ağında Hermes bulma.

Neden testli: kullanıcının 192.168.x.x adresini bulmasını istemiyoruz, ama
yanlış bir sunucuyu "Hermes bu" diye göstermek de bağlantı kurulduktan sonra
anlaşılan, açıklaması zor bir hataya dönüşürdü.
"""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from hermes import discovery


def _serve(handler_cls):
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler_cls)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def _handler(body, status=200, content_type="application/json"):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            payload = body if isinstance(body, bytes) else json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    return Handler


class TestImza:
    """``/health`` gerçekten Hermes'in mi?"""

    def test_hermes_taninir(self):
        server = _serve(_handler({"status": "ok", "platform": "hermes-agent", "version": "0.20.4"}))
        try:
            hit = discovery.looks_like_hermes(f"http://127.0.0.1:{server.server_address[1]}")
            assert hit and hit["version"] == "0.20.4"
        finally:
            server.shutdown()
            server.server_close()

    def test_baska_servis_hermes_sanilmaz(self):
        """Aynı portta başka bir şey olabilir; 'port açık' yetmez."""
        server = _serve(_handler({"status": "ok"}))
        try:
            assert discovery.looks_like_hermes(f"http://127.0.0.1:{server.server_address[1]}") is None
        finally:
            server.shutdown()
            server.server_close()

    def test_html_donen_sunucu_elenir(self):
        server = _serve(_handler(b"<html>router arayuzu</html>", content_type="text/html"))
        try:
            assert discovery.looks_like_hermes(f"http://127.0.0.1:{server.server_address[1]}") is None
        finally:
            server.shutdown()
            server.server_close()

    def test_kapali_port_hata_firlatmaz(self):
        assert discovery.looks_like_hermes("http://127.0.0.1:9", timeout=0.5) is None


class TestAgHesaplari:
    def test_kendi_adresi_taranmaz(self):
        hosts = discovery.candidate_hosts("192.168.1.20")
        assert "192.168.1.20" not in hosts
        assert "192.168.1.1" in hosts and "192.168.1.254" in hosts
        assert len(hosts) == 253

    def test_gecersiz_adres_bos_liste(self):
        assert discovery.candidate_hosts("bu-bir-ip-degil") == []

    def test_yerel_adres_bulunur(self):
        ip = discovery.local_ipv4()
        assert ip is None or ip.count(".") == 3


class TestTarama:
    def test_kayitli_adres_calisiyorsa_taranmaz(self, monkeypatch):
        """254 adresi boşuna taramak telefonda saniyeler ve pil demek."""
        server = _serve(_handler({"status": "ok", "platform": "hermes-agent", "version": "0.20.4"}))
        url = f"http://127.0.0.1:{server.server_address[1]}"

        taranan = []
        monkeypatch.setattr(discovery, "_port_open", lambda h, p: taranan.append(h) or False)
        try:
            found = discovery.discover(extra_urls=[url])
            assert [hit["base_url"] for hit in found] == [url]
            assert taranan == [], "kayıtlı adres çalışırken ağ taranmamalı"
        finally:
            server.shutdown()
            server.server_close()

    def test_kayitli_adres_olmeyince_ag_taranir(self, monkeypatch):
        monkeypatch.setattr(discovery, "local_ipv4", lambda: "192.168.5.10")
        monkeypatch.setattr(discovery, "_port_open", lambda h, p: h == "192.168.5.42")
        monkeypatch.setattr(
            discovery, "looks_like_hermes",
            lambda url, timeout=1.5: (
                {"base_url": url, "version": "0.20.4", "status": "ok"}
                if url == "http://192.168.5.42:8642" else None
            ),
        )
        found = discovery.discover(extra_urls=["http://192.168.5.99:8642"])
        assert [hit["base_url"] for hit in found] == ["http://192.168.5.42:8642"]

    def test_ag_yoksa_sessizce_bos_doner(self, monkeypatch):
        monkeypatch.setattr(discovery, "local_ipv4", lambda: None)
        monkeypatch.setattr(discovery, "looks_like_hermes", lambda url, timeout=1.5: None)
        assert discovery.discover() == []


class TestUc:
    def test_discover_ucu_bulunani_dondurur(self, client, monkeypatch):
        monkeypatch.setattr(
            discovery, "discover",
            lambda **kwargs: [{"base_url": "http://192.168.1.20:8642", "version": "0.20.4", "status": "ok"}],
        )
        payload = client.post("/api/hermes/discover", json={}).get_json()
        assert payload["found"][0]["base_url"] == "http://192.168.1.20:8642"
        assert "current" in payload

    def test_rescan_kayitli_adresi_atlar(self, client, monkeypatch):
        gorulen = {}
        monkeypatch.setattr(
            discovery, "discover",
            lambda **kwargs: gorulen.update(kwargs) or [],
        )
        client.post("/api/hermes/discover", json={"rescan": True})
        assert gorulen["extra_urls"] == [], "yeniden tara denince kayıtlı adres denenmemeli"

        client.post("/api/hermes/discover", json={})
        assert gorulen["extra_urls"], "normal aramada kayıtlı adres önce denenmeli"
