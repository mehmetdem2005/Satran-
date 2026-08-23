"""App-Forge hattı: turu yürüt, ürünü paketle.

Ajan kadrosu burada tanımlı DEĞİL. Hermes'e baş yönetici rolü veriliyor
(``orchestration.py``); ekibi kendi ``delegate_task`` aracıyla kuruyor,
gerektiğinde yöneticilerin altına yeni ajanlar alıyor ve her turdan sonra
ekibi büyütmeyi değerlendiriyor. Biz yalnızca akıştaki delegasyon olaylarını
arayüzün anlayacağı biçime çeviriyoruz.

Neden böyle: sabit bir kadro yazdığımızda motorun zaten yaptığı işin zayıf
bir kopyasını üretmiş oluyorduk — Hermes'in alt ajanları kendi bağlamı, kendi
terminali ve kendi araç kümesiyle çalışıyor, ebeveyne yalnızca özet dönüyor.

Arayüzün beklediği olaylar:

``route``        seçilen mod ve sohbet başlığı
``engine``       Hermes bağlantısının durumu
``team``         Hermes ekibe yeni ajan aldı
``agent_start``  bir ajan çalışmaya başladı
``delta``        baş yöneticinin yanıt metni
``reasoning``    düşünme akışı
``tool_start``   Hermes'in çalıştırdığı araç
``agent_end``    ajan bitti
``artifacts``    projenin güncel dosya listesi ve indirme bağlantıları
``error``/``done``
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hf_utils import trim  # noqa: E402

from . import orchestration  # noqa: E402
from .artifacts import EXPORT_FORMATS, detect_requested_format, extract_files  # noqa: E402
from .router import route  # noqa: E402

logger = logging.getLogger(__name__)

_CONTEXT_BUDGET = 8000
_HISTORY_TURNS = 6


class ForgePipeline:
    """Ajan grafiğini yürüten orkestratör."""

    def __init__(self, *, config, client, memory, rag, store) -> None:
        self.config = config
        self.client = client
        self.memory = memory
        self.rag = rag
        self.store = store

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
        """Bir turu yürütür.

        Ajan kadrosu artık burada tanımlı değil: Hermes'e baş yönetici rolü
        veriliyor, ekibi ``delegate_task`` ile kendisi kuruyor ve gerektikçe
        büyütüyor. Biz yalnızca olayları arayüze çeviriyoruz.
        """
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

        yield {"type": "status", "text": "İstek çözümleniyor…"}
        engine = self._select_engine()
        yield {"type": "engine", **engine}

        decision = route(message, has_project=has_project, completer=self._completer(engine))
        requested_format = detect_requested_format(message)
        yield {
            "type": "route",
            "mode": decision["mode"],
            "title": decision["title"],
            "reason": decision["reason"],
            "source": decision["source"],
            "format": requested_format,
        }

        # Yalnızca paketleme isteniyorsa modeli hiç meşgul etme.
        if decision["mode"] == "package" and has_project:
            yield from self._package_only(project_id, existing_files, requested_format)
            self.memory.sync(message, "", scope=scope)
            yield {"type": "done", "ok": True}
            return

        if engine["engine"] != "hermes":
            yield {"type": "error", "text": self._no_engine_message()}
            yield {"type": "done", "ok": False}
            return

        if not project_id:
            project_id = self.store.new_project_id(decision["title"])
            yield {"type": "project", "project_id": project_id}

        context = self._build_context(message, project_id, existing_files, scope)
        system_prompt = (
            orchestration.build_prompt(context, existing_files)
            + "\n\n"
            + self.memory.build_system_prompt()
        )

        session_id = hermes_session_id or self._open_session(decision["title"])

        yield {"type": "status", "text": "Baş yönetici ekibi kuruyor…"}

        collected: List[str] = []
        failed = False
        team: List[Dict[str, str]] = []

        try:
            for event in self._stream_hermes(system_prompt, message, session_id, scope):
                kind = event.get("type")

                if kind == "delta":
                    collected.append(event.get("text") or "")
                    yield event
                elif kind == "tool_start" and event.get("tool") == orchestration.DELEGATE_TOOL:
                    hired = orchestration.hired_agents(event.get("args"))
                    if hired:
                        team.extend(hired)
                        yield {"type": "team", "hired": hired, "size": len(team)}
                        for agent in hired:
                            yield {"type": "agent_start", "agent": self._hired_card(agent)}
                    else:
                        yield {"type": "status", "text": "Ekibe yeni ajan alınıyor…"}
                elif kind == "tool_end" and event.get("tool") == orchestration.DELEGATE_TOOL:
                    for agent in orchestration.hired_agents(event.get("args")) or team[-1:]:
                        yield {
                            "type": "agent_end",
                            "agent": self._hired_card(agent),
                            "files": [],
                            "chars": len(event.get("preview") or ""),
                        }
                elif kind in {"tool_start", "tool_end", "status", "reasoning", "error"}:
                    yield event
                elif kind == "final":
                    yield event
        except Exception as exc:
            logger.warning("Hermes turu başarısız: %s", exc)
            yield {"type": "error", "text": f"Hermes hatası: {exc}"}
            failed = True

        output = "".join(collected)
        if not output.strip() and not failed:
            failed = True
            yield {
                "type": "error",
                "text": "Motor boş yanıt döndürdü. Menü → Tanı bölümünden bağlantıyı sınayabilirsin.",
            }

        produced = self._persist_files(project_id, output) if output.strip() else []

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

        stored = self.memory.sync(message, output, scope=scope)
        if stored:
            yield {"type": "memory", "stored": stored}

        yield {"type": "done", "ok": not failed}

    def _open_session(self, title: str) -> Optional[str]:
        """Tur için Hermes oturumu açar; açılamazsa durumsuz devam edilir."""
        try:
            return self.client.create_session(title=title)
        except Exception as exc:
            logger.info("Hermes oturumu açılamadı, durumsuz yola geçiliyor: %s", exc)
            return None

    @staticmethod
    def _hired_card(agent: Dict[str, str]) -> Dict[str, Any]:
        """Hermes'in işe aldığı ajanı arayüzün beklediği biçime çevirir."""
        orchestrator = str(agent.get("role") or "").lower() == "orchestrator"
        label = agent.get("label") or "Ajan"
        return {
            "id": label,
            "name": label,
            "label": label,
            "title": "Yönetici" if orchestrator else "Uzman",
            "emoji": "🧠" if orchestrator else "⚙️",
            "node": label,
            "role": "orchestrator" if orchestrator else "leaf",
            "instance": 0,
            "total_instances": 1,
            "paths": [],
        }

    # ------------------------------------------------------------------
    # Motor seçimi
    # ------------------------------------------------------------------
    def _select_engine(self) -> Dict[str, Any]:
        """HermesForge yalnızca Hermes ile çalışır; başka motor yok."""
        health = self.client.health()
        if health.get("reachable"):
            return {
                "engine": "hermes",
                "label": "Hermes Agent",
                "detail": self.config.hermes_base_url,
            }
        return {
            "engine": "none",
            "label": "Hermes'e bağlı değil",
            "detail": health.get("error", ""),
            "note": self._no_engine_message(),
        }

    def _no_engine_message(self) -> str:
        """Kullanıcının gerçekten yapabileceği şeyi söyler.

        Telefonda kabuk yok: oradaki kullanıcıya ``install_hermes.sh``
        önermek çalıştıramayacağı bir komutu önermektir. Onun yapabileceği
        şey, Hermes'in çalıştığı makinedeki QR kodu okutmak.
        """
        if getattr(self.config, "platform", "desktop") == "android":
            return (
                "Hermes sunucusuna bağlanılamadı. Hermes'in çalıştığı bilgisayarda "
                "'bash scripts/hermes_sunucu.sh' komutunu çalıştırıp ekrandaki QR kodu "
                "telefonun kamerasıyla okut ya da Ayarlar → Hermes bölümünden adresi "
                "elle gir. Hermes çalışmadan uygulama iş üretemez."
            )
        return (
            "Hermes'e bağlanılamadı. 'bash scripts/hermes_sunucu.sh' ile gateway'i "
            "başlat ya da Ayarlar → Hermes bölümünden doğru adresi ve anahtarı gir."
        )

    def _completer(self, engine: Dict[str, Any]):
        """Yönlendirici için kısa, akışsız bir tamamlama işlevi döndürür."""
        if engine["engine"] == "hermes":
            return lambda messages: self.client.complete(messages, timeout=60)
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
    # Düğüm istemi
    # ------------------------------------------------------------------
    # ------------------------------------------------------------------
    # Akış
    # ------------------------------------------------------------------
    def _model_options(self) -> Optional[Dict[str, Any]]:
        """Hermes'e istek başına gönderilecek model seçenekleri.

        Hermes ``model_options.reasoning_effort`` değerini kabul ediyor
        (``none`` düşünmeyi tamamen kapatır). Kullanıcı varsayılanı
        değiştirmediyse hiçbir şey göndermiyoruz — sunucunun kendi
        yapılandırması geçerli kalsın.
        """
        effort = (self.config.reasoning_effort or "").strip().lower()
        if not effort or effort == "default":
            return None
        return {"reasoning_effort": effort}

    def _stream_hermes(
        self,
        system_prompt: str,
        prompt: str,
        session_id: Optional[str],
        scope: str,
    ) -> Iterator[Dict[str, Any]]:
        session_key = self.memory.scope_key(user=scope)
        model_options = self._model_options()

        if session_id:
            stream = self.client.stream_session_turn(
                session_id,
                prompt,
                system_message=system_prompt,
                session_key=session_key,
                model_options=model_options,
            )
        else:
            stream = self.client.stream_chat_completion(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                session_key=session_key,
                model_options=model_options,
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
            "node": "packager",
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
    def _agent_card(agent_id: str) -> Dict[str, Any]:
        agent = AGENTS.get(agent_id, {})
        return {
            "id": agent_id,
            "name": agent.get("name", agent_id),
            "title": agent.get("title", ""),
            "emoji": agent.get("emoji", "🤖"),
        }

    def _node_card(cls, node: AgentNode) -> Dict[str, Any]:
        card = cls._agent_card(node.agent_id)
        card.update(
            {
                "node": node.key,
                "label": node.label,
                "instance": node.instance,
                "total_instances": node.total_instances,
                "paths": list(node.assigned_paths),
            }
        )
        return card
