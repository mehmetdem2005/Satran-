"""App-Forge hattı: yönlendir, ajanları sırayla çalıştır, ürünü paketle.

Akış tek bir SSE gövdesi olarak dışarı verilir. Arayüzün ihtiyaç duyduğu
olaylar:

``route``        seçilen mod, ajan sırası ve sohbet başlığı
``engine``       hangi motor çalışıyor (hermes / fallback)
``agent_start``  o an çalışan ajan — başlık bu olayla değişir
``delta``        yanıt metni parçası
``reasoning``    düşünme akışı
``tool_start``   Hermes'in çalıştırdığı araç
``agent_end``    ajan bitti, yazdığı dosyalar
``artifacts``    projenin güncel dosya listesi ve indirme bağlantıları
``error``/``done``
"""

from __future__ import annotations

import logging
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from utils import trim  # noqa: E402

from .agents import AGENTS  # noqa: E402
from .artifacts import EXPORT_FORMATS, detect_requested_format, extract_files  # noqa: E402
from .router import route  # noqa: E402

logger = logging.getLogger(__name__)

# Bir sonraki ajana aktarılan önceki çıktının üst sınırı.
_HANDOFF_BUDGET = 14000
_CONTEXT_BUDGET = 8000
_HISTORY_TURNS = 6


class ForgePipeline:
    """Ajan hattını yürüten orkestratör."""

    def __init__(self, *, config, client, memory, rag, store, fallback) -> None:
        self.config = config
        self.client = client
        self.memory = memory
        self.rag = rag
        self.store = store
        self.fallback = fallback

    # ------------------------------------------------------------------
    # Genel akış
    # ------------------------------------------------------------------
    def run(
        self,
        *,
        message: str,
        history: Optional[List[Dict[str, Any]]] = None,
        project_id: Optional[str] = None,
        scope: str = "default",
        hermes_session_id: Optional[str] = None,
    ) -> Iterator[Dict[str, Any]]:
        history = history or []
        message = (message or "").strip()
        if not message:
            yield {"type": "error", "text": "Boş mesaj gönderilemez."}
            yield {"type": "done"}
            return

        try:
            existing_files = self.store.list_files(project_id) if project_id else []
        except ValueError:
            # İstemci bozuk bir proje kimliği yolladı; yeni proje açarak devam et.
            project_id, existing_files = None, []
        has_project = bool(existing_files)

        # 1) Yönlendirme -------------------------------------------------
        yield {"type": "status", "text": "İstek çözümleniyor…"}
        engine = self._select_engine()
        yield {"type": "engine", **engine}

        decision = route(message, has_project=has_project, completer=self._completer(engine))
        requested_format = detect_requested_format(message)
        yield {
            "type": "route",
            "mode": decision["mode"],
            "agents": [self._agent_card(agent_id) for agent_id in decision["agents"]],
            "title": decision["title"],
            "reason": decision["reason"],
            "source": decision["source"],
            "format": requested_format,
        }

        # 2) Yalnızca paketleme isteniyorsa modeli hiç meşgul etme -------
        if decision["mode"] == "package" and has_project:
            yield from self._package_only(project_id, existing_files, requested_format)
            self.memory.sync(message, "", scope=scope)
            yield {"type": "done"}
            return

        # 3) Bağlam -------------------------------------------------------
        if not project_id:
            project_id = self.store.new_project_id(decision["title"])
            yield {"type": "project", "project_id": project_id}

        context_block = self._build_context(message, project_id, existing_files, scope)
        session_id = None
        if engine["engine"] == "hermes":
            session_id = self._ensure_session(hermes_session_id, decision["title"])
            if session_id:
                yield {"type": "session", "session_id": session_id}

        # 4) Ajanlar -------------------------------------------------------
        transcript: List[Dict[str, str]] = []
        produced: List[Dict[str, Any]] = []
        failed = False

        for agent_id in decision["agents"]:
            agent = AGENTS[agent_id]
            yield {"type": "agent_start", "agent": self._agent_card(agent_id)}

            prompt = self._agent_prompt(
                agent=agent,
                message=message,
                history=history,
                transcript=transcript,
                context_block=context_block,
                existing_files=existing_files,
                mode=decision["mode"],
                requested_format=requested_format,
            )

            collected: List[str] = []
            agent_failed = False
            for event in self._stream_agent(engine, agent, prompt, session_id, scope):
                if event["type"] == "delta":
                    collected.append(event["text"])
                    yield {**event, "agent_id": agent_id}
                elif event["type"] == "error":
                    agent_failed = True
                    yield {**event, "agent_id": agent_id}
                elif event["type"] in {"reasoning", "tool_start", "tool_end", "status"}:
                    yield {**event, "agent_id": agent_id}

            output = "".join(collected)
            transcript.append({"agent_id": agent_id, "name": agent["name"], "output": output})

            # Sessiz başarısızlık en kötüsüdür: ajan hiç metin üretmediyse
            # kullanıcı boş bir balona bakıp beklemesin.
            if not output.strip() and not agent_failed:
                agent_failed = True
                failed = True
                yield {
                    "type": "error",
                    "agent_id": agent_id,
                    "text": f"{agent['name']} boş yanıt döndürdü. Modeli veya bağlantıyı kontrol edin.",
                }

            written: List[Dict[str, Any]] = []
            if agent["produces_files"] and output.strip():
                written = self._persist_files(project_id, output)
                produced.extend(written)

            yield {
                "type": "agent_end",
                "agent_id": agent_id,
                "agent": self._agent_card(agent_id),
                "files": written,
                "chars": len(output),
            }

            if agent_failed:
                failed = True
                break

        # 5) Ürün ------------------------------------------------------------
        files_now = self.store.list_files(project_id)
        if files_now:
            yield {
                "type": "artifacts",
                "project_id": project_id,
                "files": files_now,
                "new_files": [item["path"] for item in produced],
                "formats": list(EXPORT_FORMATS),
                "suggested_format": requested_format or "zip",
            }

        # 6) Bellek ------------------------------------------------------------
        final_text = transcript[-1]["output"] if transcript else ""
        stored = self.memory.sync(message, final_text, scope=scope)
        if stored:
            yield {"type": "memory", "stored": stored}

        yield {"type": "done", "ok": not failed}

    # ------------------------------------------------------------------
    # Motor seçimi
    # ------------------------------------------------------------------
    def _select_engine(self) -> Dict[str, Any]:
        health = self.client.health()
        if health.get("reachable"):
            return {
                "engine": "hermes",
                "label": "Hermes Agent",
                "detail": self.config.hermes_base_url,
            }
        if self.fallback.available:
            return {
                "engine": "fallback",
                "label": "Doğrudan sağlayıcı",
                "detail": self.config.fallback_model,
                "note": "Hermes gateway kapalı; araçlar ve beceriler devre dışı.",
            }
        return {
            "engine": "none",
            "label": "Motor yok",
            "detail": health.get("error", ""),
            "note": "Hermes kurulu değil ve yedek sağlayıcı ayarlanmamış.",
        }

    def _completer(self, engine: Dict[str, Any]):
        """Yönlendirici için kısa, akışsız bir tamamlama işlevi döndürür."""
        if engine["engine"] == "hermes":
            return lambda messages: self.client.complete(messages, timeout=60)
        if engine["engine"] == "fallback":
            return lambda messages: self.fallback.complete(messages, max_tokens=300)
        return None

    def _ensure_session(self, session_id: Optional[str], title: str) -> Optional[str]:
        if session_id:
            return session_id
        try:
            return self.client.create_session(title=title)
        except Exception as exc:
            logger.info("Hermes oturumu açılamadı, durumsuz yola geçiliyor: %s", exc)
            return None

    # ------------------------------------------------------------------
    # Bağlam kurulumu
    # ------------------------------------------------------------------
    def _build_context(
        self,
        message: str,
        project_id: str,
        existing_files: List[Dict[str, Any]],
        scope: str,
    ) -> str:
        parts: List[str] = []

        memories = self.memory.prefetch(message, top_k=self.config.memory_top_k, scope=scope)
        if memories:
            parts.append("### Hatırlananlar ###\n" + memories)

        uploads = self.rag.build_context(
            message, top_k=self.config.rag_top_k, collection="uploads", char_budget=_CONTEXT_BUDGET
        )
        if uploads:
            parts.append("### Yüklenen dosyalardan ilgili parçalar ###\n" + uploads)

        if existing_files:
            tree = "\n".join(f"- {item['path']} ({item['bytes']} bayt)" for item in existing_files[:80])
            parts.append(f"### Mevcut proje dosyaları ###\n{tree}")

            project_context = self.rag.build_context(
                message,
                top_k=4,
                collection=f"project:{project_id}",
                char_budget=_CONTEXT_BUDGET,
            )
            if project_context:
                parts.append("### Mevcut koddan ilgili parçalar ###\n" + project_context)

        return "\n\n".join(parts)

    # ------------------------------------------------------------------
    # Ajan istemi
    # ------------------------------------------------------------------
    def _agent_prompt(
        self,
        *,
        agent: Dict[str, Any],
        message: str,
        history: List[Dict[str, Any]],
        transcript: List[Dict[str, str]],
        context_block: str,
        existing_files: List[Dict[str, Any]],
        mode: str,
        requested_format: Optional[str],
    ) -> str:
        parts: List[str] = []

        recent = [
            f"{'Kullanıcı' if item.get('role') == 'user' else 'Asistan'}: {trim(str(item.get('content') or ''), 1200)}"
            for item in history[-_HISTORY_TURNS:]
            if item.get("role") in {"user", "assistant"} and item.get("content")
        ]
        if recent:
            parts.append("### Önceki konuşma ###\n" + "\n".join(recent))

        if context_block:
            parts.append(context_block)

        if transcript:
            handoff = [
                f"#### {item['name']} çıktısı ####\n{trim(item['output'], _HANDOFF_BUDGET)}"
                for item in transcript
            ]
            parts.append("### Önceki ajanların çıktıları ###\n" + "\n\n".join(handoff))

        if mode == "patch" and existing_files:
            parts.append(
                "### Görev tipi ###\nBu bir DEĞİŞİKLİK isteği. Yeni proje kurma; "
                "yalnızca gereken dosyaları, tam içerikleriyle yeniden yaz."
            )
        if requested_format:
            parts.append(
                f"### Teslim biçimi ###\nKullanıcı çıktıyı '{requested_format}' biçiminde istiyor; "
                "arayüz paketlemeyi kendisi yapacak, sen dosyaları üretmeye odaklan."
            )

        parts.append("### Kullanıcının isteği ###\n" + message)
        return "\n\n".join(parts)

    # ------------------------------------------------------------------
    # Akış
    # ------------------------------------------------------------------
    def _stream_agent(
        self,
        engine: Dict[str, Any],
        agent: Dict[str, Any],
        prompt: str,
        session_id: Optional[str],
        scope: str,
    ) -> Iterator[Dict[str, Any]]:
        system_prompt = agent["system_prompt"] + "\n\n" + self.memory.build_system_prompt()

        if engine["engine"] == "hermes":
            emitted = 0
            try:
                for event in self._stream_hermes(system_prompt, prompt, session_id, scope):
                    if event["type"] == "delta":
                        emitted += 1
                    yield event
                return
            except Exception as exc:
                logger.warning("Hermes akışı başarısız (%s): %s", agent["id"], exc)
                # Metin çoktan akmaya başladıysa yedek sağlayıcıyla baştan
                # başlamak aynı yanıtı ikinci kez yazdırır. Yarım kalan turu
                # hata olarak bildir, kullanıcı yeniden dener.
                if emitted:
                    yield {
                        "type": "error",
                        "text": f"Hermes akışı yarıda kesildi: {exc}",
                    }
                    return
                if not self.fallback.available:
                    yield {"type": "error", "text": f"Hermes hatası: {exc}"}
                    return
                yield {"type": "status", "text": "Hermes yanıt vermedi, yedek sağlayıcıya geçiliyor…"}

        if engine["engine"] == "none" and not self.fallback.available:
            yield {
                "type": "error",
                "text": (
                    "Çalışan bir motor yok. 'bash scripts/install_hermes.sh' ile Hermes'i kurun "
                    "ya da Ayarlar'dan yedek sağlayıcı anahtarı girin."
                ),
            }
            return

        try:
            yield from self.fallback.stream(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ]
            )
        except Exception as exc:
            yield {"type": "error", "text": str(exc)}

    def _stream_hermes(
        self,
        system_prompt: str,
        prompt: str,
        session_id: Optional[str],
        scope: str,
    ) -> Iterator[Dict[str, Any]]:
        session_key = self.memory.scope_key(user=scope)
        if session_id:
            stream = self.client.stream_session_turn(
                session_id,
                prompt,
                system_message=system_prompt,
                session_key=session_key,
            )
        else:
            stream = self.client.stream_chat_completion(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                session_key=session_key,
            )
        for event in stream:
            if event["type"] in {"done", "final"}:
                continue
            yield event

    # ------------------------------------------------------------------
    # Ürün kaydı
    # ------------------------------------------------------------------
    def _persist_files(self, project_id: str, output: str) -> List[Dict[str, Any]]:
        files = extract_files(output)
        if not files:
            return []
        written = self.store.write_files(project_id, files)

        # Yazılan dosyaları proje koleksiyonuna indeksle; sonraki turlarda
        # "şu ekranı düzelt" gibi istekler ilgili kodu geri getirebilsin.
        collection = f"project:{project_id}"
        self.rag.clear(collection=collection)
        for entry in files:
            self.rag.add_document(entry["path"], entry["content"], collection=collection)
        return written

    def _package_only(
        self,
        project_id: str,
        files: List[Dict[str, Any]],
        requested_format: Optional[str],
    ) -> Iterator[Dict[str, Any]]:
        fmt = requested_format or "zip"
        if fmt not in EXPORT_FORMATS:
            fmt = "zip"
        summary = "\n".join(f"- `{item['path']}` ({item['bytes']} bayt)" for item in files[:40])
        total = sum(item["bytes"] for item in files)
        yield {
            "type": "delta",
            "agent_id": "packager",
            "text": (
                f"**{len(files)} dosya** hazır (toplam {total} bayt). "
                f"Aşağıdaki indirme düğmesi `{fmt}` biçiminde paketleyecek.\n\n{summary}\n"
            ),
        }
        yield {
            "type": "artifacts",
            "project_id": project_id,
            "files": files,
            "new_files": [],
            "formats": list(EXPORT_FORMATS),
            "suggested_format": fmt,
        }

    # ------------------------------------------------------------------
    @staticmethod
    def _agent_card(agent_id: str) -> Dict[str, Any]:
        agent = AGENTS.get(agent_id, {})
        return {
            "id": agent_id,
            "name": agent.get("name", agent_id),
            "title": agent.get("title", ""),
            "emoji": agent.get("emoji", "🤖"),
        }
