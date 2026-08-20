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
        return {
            "model": self.config.fallback_model,
            "messages": messages,
            "max_tokens": max_tokens or self.config.fallback_max_tokens,
            "stream": stream,
        }

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
                json=self._payload(messages, True, max_tokens),
                stream=True,
                timeout=(10, self.config.hermes_timeout),
            )
        except requests.exceptions.RequestException as exc:
            raise DirectProviderError(f"Sağlayıcıya ulaşılamadı: {exc}") from exc

        if response.status_code >= 400:
            raise DirectProviderError(f"Sağlayıcı hatası {response.status_code}: {response.text[:300]}")

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
