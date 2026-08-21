"""Doğrudan OpenAI uyumlu sağlayıcı — Hermes yokken uygulamayı ayakta tutar.

Hermes Agent bu uygulamanın birincil motorudur; ama Hermes kurulu değilken
ya da gateway kapalıyken kullanıcı boş ekranla kalmasın diye OpenAI uyumlu
bir uca (DeepSeek, OpenRouter, yerel bir sunucu…) doğrudan bağlanan bu ince
yol var. Bellek ve RAG bu yolda da çalışır; devre dışı kalan tek şey
Hermes'in araçları ve becerileridir.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Iterator, List, Optional

import requests

from . import presets

logger = logging.getLogger(__name__)


class DirectProviderError(RuntimeError):
    pass


class DirectProvider:
    def __init__(self, config) -> None:
        self.config = config
        self._session = requests.Session()

    @property
    def available(self) -> bool:
        return bool(self.config.fallback_enabled and self.config.fallback_api_key)

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.config.fallback_api_key}",
            "Content-Type": "application/json",
        }

    def _payload(self, messages: List[Dict[str, Any]], stream: bool, max_tokens: Optional[int]) -> Dict[str, Any]:
        """İstek gövdesini kurar.

        Model davranış alanları (``reasoning_effort``, ``temperature``,
        ``top_p``) yalnızca kullanıcı varsayılanı değiştirdiyse eklenir: katı
        OpenAI-uyumlu sunucular bilinmeyen alanlara 400 döndürüyor, bu yüzden
        dokunulmamış bir ayar yüzünden isteğin tamamı reddedilmemeli.
        """
        preset_id = getattr(self.config, "fallback_preset", "") or presets.DEFAULT_PRESET
        preset = presets.get_preset(preset_id)

        payload: Dict[str, Any] = {
            "model": self.config.fallback_model,
            "messages": messages,
            "max_tokens": self._clamp_max_tokens(max_tokens or self.config.max_tokens, preset),
            "stream": stream,
        }

        raw_effort = (self.config.reasoning_effort or "").strip().lower()
        thinking_off = raw_effort == presets.NONE
        effort = presets.normalize_for_provider(raw_effort, preset_id)

        if thinking_off:
            # DeepSeek düşünmeyi bu alanla kapatıyor:
            # {"thinking": {"type": "disabled"}}. Bu alanı tanımayan genel
            # uçlara göndermiyoruz, onlarda reasoning_effort da atlanıyor.
            if preset.get("thinking_style") == "deepseek":
                payload["thinking"] = {"type": "disabled"}
        elif effort:
            payload["reasoning_effort"] = effort

        # DeepSeek belgeleri: düşünme açıkken temperature/top_p yok sayılıyor
        # (hata vermiyor ama etkisi de yok). Bu yüzden yalnızca düşünme
        # kapalıyken ve kullanıcı varsayılanı değiştirdiyse gönderiyoruz.
        if thinking_off:
            if self.config.temperature != 1.0:
                payload["temperature"] = self.config.temperature
            if self.config.top_p != 1.0:
                payload["top_p"] = self.config.top_p

        return payload

    @staticmethod
    def _clamp_max_tokens(requested: Optional[int], preset: Dict[str, Any]) -> int:
        """Token sınırını sağlayıcının üst sınırına kırpar.

        DeepSeek V4 ailesi 384K çıktıya kadar çıkıyor; üstünü istemek isteğin
        tamamının reddedilmesine yol açar.
        """
        value = int(requested or 0) or 32768
        ceiling = int(preset.get("max_output_tokens") or 0)
        if ceiling:
            value = min(value, ceiling)
        return max(1, value)

    def stream(
        self,
        messages: List[Dict[str, Any]],
        *,
        max_tokens: Optional[int] = None,
    ) -> Iterator[Dict[str, Any]]:
        if not self.available:
            raise DirectProviderError(
                "Yedek sağlayıcı yapılandırılmamış. Ayarlardan bir API anahtarı girin "
                "veya Hermes gateway'i başlatın."
            )
        url = f"{self.config.fallback_base_url}/chat/completions"
        try:
            response = self._session.post(
                url,
                headers=self._headers(),
                json=self._payload(messages, True, max_tokens or self.config.max_tokens),
                stream=True,
                timeout=(10, self.config.hermes_timeout),
            )
        except requests.exceptions.RequestException as exc:
            raise DirectProviderError(f"Sağlayıcıya ulaşılamadı: {exc}") from exc

        if response.status_code >= 400:
            raise DirectProviderError(f"Sağlayıcı hatası {response.status_code}: {response.text[:300]}")

        # SSE UTF-8'dir; charset'siz ``text/event-stream`` başlığında requests
        # ISO-8859-1'e düşer ve Türkçe karakterleri bozar.
        response.encoding = "utf-8"

        try:
            for raw_line in response.iter_lines(decode_unicode=True):
                if not raw_line or not raw_line.startswith("data:"):
                    continue
                payload = raw_line[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    chunk = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                choices = chunk.get("choices") or []
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

    def complete(self, messages: List[Dict[str, Any]], *, max_tokens: Optional[int] = None) -> str:
        if not self.available:
            raise DirectProviderError("Yedek sağlayıcı yapılandırılmamış.")
        url = f"{self.config.fallback_base_url}/chat/completions"
        try:
            response = self._session.post(
                url,
                headers=self._headers(),
                json=self._payload(messages, False, max_tokens or 2048),
                timeout=(10, 180),
            )
        except requests.exceptions.RequestException as exc:
            raise DirectProviderError(f"Sağlayıcıya ulaşılamadı: {exc}") from exc
        if response.status_code >= 400:
            raise DirectProviderError(f"Sağlayıcı hatası {response.status_code}: {response.text[:300]}")
        payload = response.json()
        choices = payload.get("choices") or []
        if not choices:
            return ""
        return (choices[0].get("message") or {}).get("content") or ""
