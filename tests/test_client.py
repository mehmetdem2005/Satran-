"""HermesClient: SSE ayrıştırma ve gerçek sunucudan öğrenilen sözleşmeler.

Buradaki testlerin çoğu, sahte bir sunucuya karşı yazılmış istemcinin GERÇEK
Hermes 0.20.4'e bağlandığında patladığı noktalardan doğdu. Her biri o
hatanın regresyon kilididir.
"""

import io
import json

import pytest
import requests

from hermes.client import (
    HermesClient,
    HermesError,
    _assistant_text_from_messages,
    _disambiguate_title,
    _is_title_conflict,
    _sse_events,
)


class FakeResponse:
    """``requests.Response`` yerine geçen, satır üreten sahte gövde."""

    def __init__(self, body: str, encoding: str = "ISO-8859-1"):
        self._raw = body.encode("utf-8")
        self.encoding = encoding
        self.headers = {"Content-Type": "text/event-stream"}

    def iter_lines(self, decode_unicode=False):
        for line in io.BytesIO(self._raw):
            text = line.rstrip(b"\n")
            yield text.decode(self.encoding, errors="replace") if decode_unicode else text

    def close(self):
        pass


class TestSseParser:
    def test_event_ve_data_ciftleri(self):
        body = (
            "event: assistant.delta\ndata: {\"delta\": \"merhaba\"}\n\n"
            "event: run.completed\ndata: {\"usage\": {}}\n\n"
        )
        events = list(_sse_events(FakeResponse(body, "utf-8")))
        assert [name for name, _ in events] == ["assistant.delta", "run.completed"]
        assert events[0][1]["delta"] == "merhaba"

    def test_isimsiz_data_ve_done(self):
        body = "data: {\"choices\": []}\n\ndata: [DONE]\n\n"
        events = list(_sse_events(FakeResponse(body, "utf-8")))
        assert events[0][0] == "message"
        assert events[-1] == ("done", None)

    def test_keepalive_yorumu_atlanir(self):
        body = ": keepalive\n\nevent: x\ndata: {\"a\": 1}\n\n"
        events = list(_sse_events(FakeResponse(body, "utf-8")))
        assert events == [("x", {"a": 1})]

    def test_cok_satirli_data_birlestirilir(self):
        body = 'event: x\ndata: {"a":\ndata:  1}\n\n'
        events = list(_sse_events(FakeResponse(body, "utf-8")))
        assert events == [("x", {"a": 1})]

    def test_gecersiz_json_ham_olarak_gelir(self):
        events = list(_sse_events(FakeResponse("event: x\ndata: bu json degil\n\n", "utf-8")))
        assert events == [("x", {"raw": "bu json degil"})]

    def test_bos_satirla_bitmeyen_govde_kaybolmaz(self):
        events = list(_sse_events(FakeResponse('event: x\ndata: {"a": 1}\n', "utf-8")))
        assert events == [("x", {"a": 1})]

    def test_utf8_zorlanir_yoksa_turkce_bozulur(self):
        """Gerçek Hermes ``text/event-stream`` başlığını charset'siz yollar.

        requests bu durumda ISO-8859-1 varsayar; kodlamayı sabitlemezsek
        "Sayaç" → "SayaÃ§" olur. Ayrıştırıcı bunu kendisi düzeltmeli.
        """
        response = FakeResponse(
            'event: assistant.delta\ndata: {"delta": "Sayaç uygulamasını yazdım"}\n\n',
            encoding="ISO-8859-1",  # sunucunun dayattığı yanlış varsayım
        )
        events = list(_sse_events(response))
        assert events[0][1]["delta"] == "Sayaç uygulamasını yazdım"
        assert response.encoding == "utf-8"


class TestSessionEnvelope:
    """Gerçek sunucu oturumu ``{"session": {...}}`` zarfına sarar."""

    @pytest.mark.parametrize(
        "payload,expected",
        [
            ({"object": "hermes.session", "session": {"id": "api_1"}}, "api_1"),
            ({"id": "duz"}, "duz"),
            ({"session_id": "eski"}, "eski"),
            ({"session": {}}, None),
            ({}, None),
            ("liste degil", None),
        ],
    )
    def test_kimlik_cikarma(self, payload, expected):
        assert HermesClient._session_id_from(payload) == expected


class TestTitleConflict:
    """Hermes oturum başlıklarını benzersiz tutar; çakışma 400 döndürür."""

    def test_catisma_tanima(self):
        assert _is_title_conflict(HermesError("Hermes 400: Title already in use by session api_1"))
        assert not _is_title_conflict(HermesError("Hermes 500: kaboom"))

    def test_ayirt_edici_ekleme(self):
        result = _disambiguate_title("Not alma uygulaması")
        assert result.startswith("Not alma uygulaması · ")
        assert len(result) <= 200

    def test_cok_uzun_baslik_sinirda_kalir(self):
        result = _disambiguate_title("x" * 300)
        assert len(result) <= 200


class TestAssistantTextRecovery:
    """Sağlayıcı delta akıtmazsa metin ``run.completed`` transkriptinde gelir."""

    def test_duz_metin_iceriginden(self):
        messages = [
            {"role": "user", "content": "soru"},
            {"role": "assistant", "content": "cevap"},
        ]
        assert _assistant_text_from_messages(messages) == "cevap"

    def test_blok_listesinden(self):
        messages = [{"role": "assistant", "content": [
            {"type": "text", "text": "bir"}, {"type": "text", "text": "iki"}]}]
        assert _assistant_text_from_messages(messages) == "bir\niki"

    @pytest.mark.parametrize("value", [None, "metin", [], [{"role": "user", "content": "x"}]])
    def test_bos_durumlar(self, value):
        assert _assistant_text_from_messages(value) == ""


class TestStreamNormalization:
    """Delta akan ve akmayan sağlayıcılar aynı sonucu vermeli, metin ikilenmemeli."""

    def _client(self):
        import config as config_module

        return HermesClient(config_module.load_config())

    def test_delta_akan_saglayici(self):
        client = self._client()
        body = (
            'event: assistant.delta\ndata: {"delta": "mer"}\n\n'
            'event: assistant.delta\ndata: {"delta": "haba"}\n\n'
            'event: assistant.completed\ndata: {"content": "merhaba"}\n\n'
            'event: run.completed\ndata: {"messages": [{"role":"assistant","content":"merhaba"}]}\n\n'
        )
        events = list(client._normalize_session_stream(FakeResponse(body, "utf-8")))
        text = "".join(e["text"] for e in events if e["type"] == "delta")
        assert text == "merhaba", "akan metin ikiye katlanmamalı"

    def test_delta_akitmayan_saglayici(self):
        client = self._client()
        body = (
            'event: message.started\ndata: {"message": {"id": "m1"}}\n\n'
            'event: assistant.completed\ndata: {"content": "tek seferde gelen metin"}\n\n'
            'event: run.completed\ndata: {"messages": []}\n\n'
        )
        events = list(client._normalize_session_stream(FakeResponse(body, "utf-8")))
        text = "".join(e["text"] for e in events if e["type"] == "delta")
        assert text == "tek seferde gelen metin"

    def test_yalnizca_transkript_kalirsa(self):
        client = self._client()
        body = (
            'event: run.completed\n'
            'data: {"messages": [{"role":"assistant","content":"transkriptten"}]}\n\n'
        )
        events = list(client._normalize_session_stream(FakeResponse(body, "utf-8")))
        assert any(e["type"] == "delta" and e["text"] == "transkriptten" for e in events)

    def test_arac_olaylari_normalize_edilir(self):
        client = self._client()
        body = (
            'event: tool.started\ndata: {"tool_name": "write_file", "preview": "a.py"}\n\n'
            'event: tool.failed\ndata: {"tool_name": "write_file"}\n\n'
            'event: tool.progress\ndata: {"tool_name": "_thinking", "delta": "düşünüyorum"}\n\n'
            'event: error\ndata: {"message": "patladı"}\n\n'
        )
        events = list(client._normalize_session_stream(FakeResponse(body, "utf-8")))
        by_type = {e["type"]: e for e in events}
        assert by_type["tool_start"]["tool"] == "write_file"
        assert by_type["tool_end"]["ok"] is False
        assert by_type["reasoning"]["text"] == "düşünüyorum"
        assert by_type["error"]["text"] == "patladı"


class TestErrorMapping:
    def test_401_anlasilir_mesaj_verir(self, monkeypatch):
        import config as config_module

        client = HermesClient(config_module.load_config())

        class Resp:
            status_code = 401
            text = "unauthorized"

            def json(self):
                return {"error": {"message": "bad key"}}

        monkeypatch.setattr(client._session, "request", lambda *a, **k: Resp())
        with pytest.raises(HermesError, match="API_SERVER_KEY"):
            client._request("GET", "/v1/models")

    def test_ulasilamamak_ayri_hata_tipidir(self, monkeypatch):
        import config as config_module
        from hermes.client import HermesUnavailable

        client = HermesClient(config_module.load_config())

        def boom(*a, **k):
            raise requests.exceptions.ConnectionError("refused")

        monkeypatch.setattr(client._session, "request", boom)
        with pytest.raises(HermesUnavailable):
            client._request("GET", "/health")

    def test_health_cokmeden_durum_dondurur(self, monkeypatch):
        import config as config_module

        client = HermesClient(config_module.load_config())

        def boom(*a, **k):
            raise requests.exceptions.ConnectionError("refused")

        monkeypatch.setattr(client._session, "request", boom)
        assert client.health()["reachable"] is False
