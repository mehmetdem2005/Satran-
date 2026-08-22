"""Hermes Agent'ın OpenAI uyumlu API sunucusuna bağlanan istemci.

Kullanılan uçlar (``gateway/platforms/api_server.py``):

* ``GET  /health`` / ``GET /v1/capabilities`` — canlılık ve yetenek keşfi
* ``GET  /v1/models``                        — model adı
* ``POST /api/sessions``                     — kalıcı oturum aç
* ``GET  /api/sessions/{id}/messages``       — oturum geçmişi (Hermes belleği)
* ``POST /api/sessions/{id}/chat/stream``    — SSE turu (``assistant.delta``,
  ``tool.started``, ``tool.completed``, ``run.completed``)
* ``POST /v1/chat/completions``              — durumsuz yedek akış

Oturum tabanlı yolu tercih ediyoruz: konuşma Hermes'in kendi oturum
veritabanında yaşar, dolayısıyla Hermes'in bellek sağlayıcıları, oturum
araması ve becerileri kendiliğinden devreye girer. ``X-Hermes-Session-Key``
başlığı uzun vadeli belleği tek bir kapsamda tutar.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime
from typing import Any, Dict, Iterator, List, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

# Hermes tarafından yayımlanan olay adları → uygulama içi normalize tipler.
_TOOL_START_EVENTS = {"tool.started"}
_TOOL_END_EVENTS = {"tool.completed", "tool.failed"}


_TITLE_CONFLICT_RE = re.compile(r"title already in use", re.I)


def _is_title_conflict(exc: Exception) -> bool:
    return bool(_TITLE_CONFLICT_RE.search(str(exc)))


def _disambiguate_title(title: str) -> str:
    """Çakışan bir başlığa kısa, okunabilir bir ayırt edici ekler."""
    suffix = f" · {datetime.now():%H:%M:%S}-{uuid.uuid4().hex[:4]}"
    return title[: 200 - len(suffix)] + suffix


def _assistant_text_from_messages(messages: Any) -> str:
    """``run.completed`` transkriptinden asistan metnini toparlar."""
    if not isinstance(messages, list):
        return ""
    parts: List[str] = []
    for message in messages:
        if not isinstance(message, dict) or message.get("role") != "assistant":
            continue
        content = message.get("content")
        if isinstance(content, str):
            parts.append(content)
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and isinstance(block.get("text"), str):
                    parts.append(block["text"])
    return "\n".join(part for part in parts if part.strip())


class HermesError(RuntimeError):
    """Hermes tarafından döndürülen hata."""


class HermesUnavailable(HermesError):
    """Hermes API sunucusuna hiç ulaşılamadı."""


def _sse_events(response: requests.Response) -> Iterator[Tuple[str, Any]]:
    """Bir SSE gövdesini ``(olay_adı, veri)`` çiftlerine ayrıştırır.

    Hermes ``event:`` + ``data:`` çerçeveleri yollar; OpenAI uyumlu uçta ise
    yalnızca ``data:`` gelir ve akış ``[DONE]`` ile biter. İkisini de aynı
    ayrıştırıcı karşılar.
    """
    # SSE her zaman UTF-8'dir (WHATWG: "Event streams are always decoded as
    # UTF-8"). Hermes ``text/event-stream`` başlığını charset olmadan
    # yolluyor; requests bu durumda ISO-8859-1 varsayar ve her Türkçe karakter
    # bozulur ("Sayaç" → "SayaÃ§"). Kodlamayı açıkça sabitliyoruz.
    response.encoding = "utf-8"

    event_name = "message"
    data_lines: List[str] = []

    for raw_line in response.iter_lines(decode_unicode=True):
        if raw_line is None:
            continue
        line = raw_line.rstrip("\r")

        if line == "":  # çerçeve sonu
            if data_lines:
                payload = "\n".join(data_lines)
                data_lines = []
                if payload == "[DONE]":
                    yield "done", None
                else:
                    try:
                        yield event_name, json.loads(payload)
                    except json.JSONDecodeError:
                        yield event_name, {"raw": payload}
            event_name = "message"
            continue

        if line.startswith(":"):  # keepalive yorumu
            continue
        if line.startswith("event:"):
            event_name = line[6:].strip() or "message"
        elif line.startswith("data:"):
            data_lines.append(line[5:].lstrip())

    if data_lines:  # gövde boş satırla bitmediyse
        payload = "\n".join(data_lines)
        if payload != "[DONE]":
            try:
                yield event_name, json.loads(payload)
            except json.JSONDecodeError:
                yield event_name, {"raw": payload}


def probe(base_url: str, api_key: str = "", *, timeout: float = 8.0) -> Dict[str, Any]:
    """Bir Hermes adresini kaydetmeden önce sınar.

    Kullanıcı yanlış adres ya da yanlış anahtar girdiğinde bunu ayarları
    kaydettikten sonra ilk sohbette değil, "Bağlan" düğmesine bastığı anda
    öğrenmeli. Dönen sözlük ``ok`` ve Türkçe bir ``error``/``detail`` taşır.
    """
    base = (base_url or "").strip().rstrip("/")
    if not base:
        return {"ok": False, "error": "Hermes adresi boş olamaz."}
    if not base.startswith(("http://", "https://")):
        base = "http://" + base

    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        health = requests.get(f"{base}/health", headers=headers, timeout=timeout)
    except requests.exceptions.RequestException as exc:
        return {
            "ok": False,
            "error": (
                "Hermes'e ulaşılamadı. Adresi ve Hermes'in çalıştığı makinenin açık "
                "olduğunu kontrol et; aynı Wi-Fi ağında olmanız gerekir."
            ),
            "detail": str(exc)[:300],
            "base_url": base,
        }
    if health.status_code >= 500:
        return {
            "ok": False,
            "error": f"Hermes hata döndürdü ({health.status_code}).",
            "base_url": base,
        }

    # /health kimlik istemez; anahtarı gerçekten sınayan uç /v1/capabilities.
    try:
        caps = requests.get(f"{base}/v1/capabilities", headers=headers, timeout=timeout)
    except requests.exceptions.RequestException as exc:
        return {
            "ok": False,
            "error": "Hermes yanıt verdi ama yetenek listesi alınamadı.",
            "detail": str(exc)[:300],
            "base_url": base,
        }

    if caps.status_code in (401, 403):
        return {
            "ok": False,
            "error": (
                "Anahtar reddedildi. Hermes makinesindeki ~/.hermes/.env dosyasındaki "
                "API_SERVER_KEY değerini birebir kopyala."
            ),
            "base_url": base,
        }
    if caps.status_code >= 400:
        return {
            "ok": False,
            "error": (
                f"Bu adres bir Hermes API sunucusu gibi görünmüyor ({caps.status_code}). "
                "Portun 8642 olduğundan emin ol."
            ),
            "base_url": base,
        }

    try:
        payload = caps.json()
    except ValueError:
        return {
            "ok": False,
            "error": "Adres yanıt verdi ama Hermes değil (geçersiz yanıt).",
            "base_url": base,
        }

    # Gerçek Hermes 0.20.4 tekil ``model`` alanı döndürüyor; liste biçimini de
    # kabul ediyoruz ki ileride değişirse arayüz boş kalmasın.
    models: List[str] = []
    if isinstance(payload, dict):
        single = payload.get("model")
        if isinstance(single, str) and single:
            models.append(single)
        raw = payload.get("models") or payload.get("data") or []
        for row in raw if isinstance(raw, list) else []:
            if isinstance(row, dict) and row.get("id"):
                models.append(str(row["id"]))
            elif isinstance(row, str):
                models.append(row)

    return {"ok": True, "base_url": base, "models": models[:20]}


class HermesClient:
    """Hermes API sunucusuyla konuşan ince istemci."""

    def __init__(self, config) -> None:
        self.config = config
        self._session = requests.Session()
        self._capabilities: Optional[Dict[str, Any]] = None

    # ------------------------------------------------------------------
    # Alt seviye
    # ------------------------------------------------------------------
    @property
    def base_url(self) -> str:
        return self.config.hermes_base_url.rstrip("/")

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def _headers(self, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.config.hermes_api_key:
            headers["Authorization"] = f"Bearer {self.config.hermes_api_key}"
        if extra:
            headers.update({k: v for k, v in extra.items() if v})
        return headers

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        timeout: Optional[float] = None,
        stream: bool = False,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> requests.Response:
        url = self._url(path)
        connect_timeout = self.config.hermes_connect_timeout
        read_timeout = timeout if timeout is not None else self.config.hermes_timeout
        try:
            response = self._session.request(
                method,
                url,
                json=json_body,
                params=params,
                headers=self._headers(extra_headers),
                timeout=(connect_timeout, read_timeout),
                stream=stream,
            )
        except requests.exceptions.RequestException as exc:
            raise HermesUnavailable(
                f"Hermes API sunucusuna ulaşılamadı ({url}): {exc}"
            ) from exc

        if response.status_code >= 400:
            detail = self._error_detail(response)
            if response.status_code in (401, 403):
                raise HermesError(
                    "Hermes API anahtarı reddedildi. ~/.hermes/.env içindeki "
                    f"API_SERVER_KEY ile ayarları eşleyin. ({detail})"
                )
            raise HermesError(f"Hermes {response.status_code}: {detail}")
        return response

    @staticmethod
    def _error_detail(response: requests.Response) -> str:
        try:
            payload = response.json()
        except ValueError:
            return (response.text or "")[:300]
        error = payload.get("error") if isinstance(payload, dict) else None
        if isinstance(error, dict):
            return str(error.get("message") or error)
        return str(error or payload)[:300]

    # ------------------------------------------------------------------
    # Keşif
    # ------------------------------------------------------------------
    def health(self) -> Dict[str, Any]:
        """Sunucu ayakta mı? Hata fırlatmaz, durum sözlüğü döndürür."""
        try:
            response = self._request("GET", "/health", timeout=5)
        except HermesUnavailable as exc:
            return {"reachable": False, "reason": "unreachable", "error": str(exc)}
        except HermesError as exc:
            # /health kimlik doğrulaması istemez; 4xx gelirse yine de ayakta.
            return {"reachable": True, "authorized": False, "error": str(exc)}
        try:
            body = response.json()
        except ValueError:
            body = {"status": "ok"}
        return {"reachable": True, "authorized": True, "status": body.get("status", "ok")}

    def capabilities(self, refresh: bool = False) -> Dict[str, Any]:
        if self._capabilities is not None and not refresh:
            return self._capabilities
        response = self._request("GET", "/v1/capabilities", timeout=10)
        self._capabilities = response.json()
        return self._capabilities

    def models(self) -> List[str]:
        response = self._request("GET", "/v1/models", timeout=10)
        payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else None
        return [row.get("id") for row in (data or []) if isinstance(row, dict) and row.get("id")]

    def skills(self) -> List[Dict[str, Any]]:
        response = self._request("GET", "/v1/skills", timeout=15)
        payload = response.json()
        return payload if isinstance(payload, list) else payload.get("data", [])

    # ------------------------------------------------------------------
    # Oturumlar
    # ------------------------------------------------------------------
    def create_session(
        self,
        *,
        session_id: Optional[str] = None,
        title: Optional[str] = None,
        system_prompt: Optional[str] = None,
    ) -> str:
        body: Dict[str, Any] = {"source": "api_server"}
        if session_id:
            body["id"] = session_id
        if title:
            body["title"] = title[:200]
        if system_prompt:
            body["system_prompt"] = system_prompt

        try:
            response = self._request("POST", "/api/sessions", json_body=body, timeout=30)
        except HermesError as exc:
            # Hermes oturum başlıklarını benzersiz tutar. Yönlendiricinin
            # ürettiği başlık ("Not alma uygulaması") ikinci kez kullanılırsa
            # 400 döner; bunu yutup oturumsuz moda düşmek Hermes belleğini
            # sessizce kaybettirir. Başlığı ayrıştırıp bir kez daha deniyoruz.
            if not _is_title_conflict(exc) or not title:
                raise
            body["title"] = _disambiguate_title(title)
            logger.info("Oturum başlığı çakıştı, benzersizleştirildi: %s", body["title"])
            response = self._request("POST", "/api/sessions", json_body=body, timeout=30)

        resolved = self._session_id_from(response.json()) or session_id
        if not resolved:
            raise HermesError("Hermes oturum kimliği döndürmedi.")
        return str(resolved)

    @staticmethod
    def _session_id_from(payload: Any) -> Optional[str]:
        """Oturum kimliğini yanıttan çıkarır.

        Hermes oturum uçları gövdeyi bir zarfa sarar
        (``{"object": "hermes.session", "session": {"id": …}}``); eski
        sürümler kimliği doğrudan üst düzeyde döndürüyordu. İkisini de
        kabul ediyoruz ki sunucu sürümü değişince istemci kırılmasın.
        """
        if not isinstance(payload, dict):
            return None
        session = payload.get("session")
        if isinstance(session, dict) and session.get("id"):
            return str(session["id"])
        for key in ("id", "session_id"):
            if payload.get(key):
                return str(payload[key])
        return None

    def get_session(self, session_id: str) -> Dict[str, Any]:
        """Oturum üstverisini döndürür (zarf açılmış olarak)."""
        payload = self._request("GET", f"/api/sessions/{session_id}", timeout=20).json()
        session = payload.get("session") if isinstance(payload, dict) else None
        return session if isinstance(session, dict) else (payload or {})

    def list_sessions(self, limit: int = 20) -> List[Dict[str, Any]]:
        payload = self._request(
            "GET", "/api/sessions", params={"limit": limit}, timeout=20
        ).json()
        data = payload.get("data") if isinstance(payload, dict) else payload
        return data if isinstance(data, list) else []

    def session_messages(self, session_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        response = self._request(
            "GET",
            f"/api/sessions/{session_id}/messages",
            params={"limit": limit},
            timeout=30,
        )
        payload = response.json()
        if isinstance(payload, list):
            return payload
        for key in ("messages", "data", "items"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
        return []

    def delete_session(self, session_id: str) -> None:
        self._request("DELETE", f"/api/sessions/{session_id}", timeout=30)

    def update_session_title(self, session_id: str, title: str) -> None:
        self._request(
            "PATCH",
            f"/api/sessions/{session_id}",
            json_body={"title": title[:200]},
            timeout=30,
        )

    # ------------------------------------------------------------------
    # Akışlı tur
    # ------------------------------------------------------------------
    def stream_session_turn(
        self,
        session_id: str,
        message: str,
        *,
        system_message: Optional[str] = None,
        session_key: Optional[str] = None,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        model_options: Optional[Dict[str, Any]] = None,
    ) -> Iterator[Dict[str, Any]]:
        """Kalıcı bir oturumda tek bir turu akıtır (normalize olaylar)."""
        body: Dict[str, Any] = {"input": message}
        if system_message:
            body["system_message"] = system_message
        if model or self.config.hermes_model:
            body["model"] = model or self.config.hermes_model
        if provider or self.config.hermes_provider:
            body["provider"] = provider or self.config.hermes_provider
        if model_options:
            body["model_options"] = model_options

        response = self._request(
            "POST",
            f"/api/sessions/{session_id}/chat/stream",
            json_body=body,
            stream=True,
            extra_headers={"Accept": "text/event-stream", "X-Hermes-Session-Key": session_key or ""},
        )
        try:
            yield from self._normalize_session_stream(response)
        finally:
            response.close()

    def _normalize_session_stream(self, response: requests.Response) -> Iterator[Dict[str, Any]]:
        # Her sağlayıcı token akıtmaz. Akıtmayanlarda Hermes tüm metni tek
        # seferde ``assistant.completed`` içinde verir; sadece
        # ``assistant.delta`` dinleyen bir istemci o turda boş ekran gösterir.
        # Delta gördüysek tamamlanma olayını yok sayıyoruz, yoksa metni oradan
        # alıyoruz — iki yol da aynı metni iki kez yazdırmıyor.
        streamed_any = False

        for name, data in _sse_events(response):
            if name == "done" or (isinstance(data, dict) and name == "done"):
                yield {"type": "done"}
                continue
            if not isinstance(data, dict):
                continue

            if name == "assistant.delta":
                delta = data.get("delta") or ""
                if delta:
                    streamed_any = True
                    yield {"type": "delta", "text": delta}
            elif name == "assistant.completed":
                content = data.get("content") or ""
                if content and not streamed_any:
                    yield {"type": "delta", "text": content}
                if data.get("interrupted") or data.get("partial"):
                    yield {"type": "status", "text": "Tur yarıda kesildi."}
            elif name == "tool.progress":
                tool = data.get("tool_name") or ""
                delta = data.get("delta") or ""
                if tool == "_thinking" and delta:
                    yield {"type": "reasoning", "text": delta}
                elif delta:
                    yield {"type": "status", "text": delta, "tool": tool}
            elif name in _TOOL_START_EVENTS:
                yield {
                    "type": "tool_start",
                    "tool": data.get("tool_name") or "araç",
                    "preview": data.get("preview") or "",
                }
            elif name in _TOOL_END_EVENTS:
                yield {
                    "type": "tool_end",
                    "tool": data.get("tool_name") or "araç",
                    "ok": name != "tool.failed",
                    "preview": data.get("preview") or "",
                }
            elif name == "run.completed":
                # Ne delta ne de assistant.completed metin verdiyse son çare:
                # turun kalıcılaştırılmış transkripti.
                if not streamed_any:
                    recovered = _assistant_text_from_messages(data.get("messages"))
                    if recovered:
                        streamed_any = True
                        yield {"type": "delta", "text": recovered}
                yield {
                    "type": "final",
                    "session_id": data.get("session_id"),
                    "messages": data.get("messages") or [],
                    "usage": data.get("usage") or {},
                }
            elif name in {"error", "run.failed"}:
                yield {"type": "error", "text": data.get("message") or "Hermes hatası"}

    def stream_chat_completion(
        self,
        messages: List[Dict[str, Any]],
        *,
        session_id: Optional[str] = None,
        session_key: Optional[str] = None,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        model_options: Optional[Dict[str, Any]] = None,
    ) -> Iterator[Dict[str, Any]]:
        """Durumsuz OpenAI uyumlu akış (oturum açılamadığında yedek yol)."""
        body: Dict[str, Any] = {
            "model": model or self.config.hermes_model,
            "messages": messages,
            "stream": True,
        }
        if provider or self.config.hermes_provider:
            body["provider"] = provider or self.config.hermes_provider
        if model_options:
            body["model_options"] = model_options

        response = self._request(
            "POST",
            "/v1/chat/completions",
            json_body=body,
            stream=True,
            extra_headers={
                "Accept": "text/event-stream",
                "X-Hermes-Session-Id": session_id or "",
                "X-Hermes-Session-Key": session_key or "",
            },
        )
        try:
            for name, data in _sse_events(response):
                if name == "done":
                    yield {"type": "done"}
                    continue
                if not isinstance(data, dict):
                    continue
                if name == "hermes.tool.progress":
                    yield {
                        "type": "tool_start",
                        "tool": data.get("tool_name") or "araç",
                        "preview": data.get("preview") or "",
                    }
                    continue
                choices = data.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                reasoning = delta.get("reasoning_content") or delta.get("reasoning")
                if reasoning:
                    yield {"type": "reasoning", "text": reasoning}
                content = delta.get("content")
                if content:
                    yield {"type": "delta", "text": content}
        finally:
            response.close()

    def complete(
        self,
        messages: List[Dict[str, Any]],
        *,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> str:
        """Akışsız tek atış — yönlendirici gibi kısa çağrılar için."""
        body: Dict[str, Any] = {
            "model": model or self.config.hermes_model,
            "messages": messages,
            "stream": False,
        }
        if provider or self.config.hermes_provider:
            body["provider"] = provider or self.config.hermes_provider
        response = self._request("POST", "/v1/chat/completions", json_body=body, timeout=timeout or 180)
        payload = response.json()
        choices = payload.get("choices") or []
        if not choices:
            return ""
        return (choices[0].get("message") or {}).get("content") or ""
