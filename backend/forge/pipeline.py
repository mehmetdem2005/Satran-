"""App-Forge hattı: yönlendir, ajanları dalgalar hâlinde çalıştır, ürünü paketle.

Ajanlar birbirini doğrusal takip etmez. ``agents.plan_waves`` bağımlılık
grafiğinden dalgaları çıkarır, ``scheduler.run_wave`` aynı dalgadaki düğümleri
paralel çalıştırır. Kodlayıcı ayrıca Mimar'ın dosya planına göre bölünüp
birden çok düğüm olarak aynı anda çalışabilir.

Hiçbir ajan bir öncekinin ham çıktısını almaz: ortak panodan (``board.py``)
yalnızca kendi rolüne düşen damıtılmış dilimleri okur. Sohbet geçmişi de
yalnızca Çözümleyici'ye gider. Bu ikisi, ajanların "her turda konuşmayı
yeniden açması" davranışını bitirir.

Arayüzün beklediği olaylar:

``route``        seçilen mod, roller ve sohbet başlığı
``engine``       Hermes bağlantısının durumu
``wave``         yeni dalga başladı, içindeki ajanlar
``agent_start``  bir düğüm çalışmaya başladı (aynı anda birden çok olabilir)
``delta``        yanıt metni parçası (``agent_id`` + ``node`` ile etiketli)
``reasoning``    düşünme akışı
``tool_start``   Hermes'in çalıştırdığı araç
``agent_end``    düğüm bitti, yazdığı dosyalar
``artifacts``    projenin güncel dosya listesi ve indirme bağlantıları
``error``/``done``
"""

from __future__ import annotations

import logging
import sys
import threading
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hf_utils import trim  # noqa: E402

from .agents import AGENTS, plan_waves, supports_fanout  # noqa: E402
from .artifacts import EXPORT_FORMATS, detect_requested_format, extract_files  # noqa: E402
from .board import BuildBoard, parse_file_plan, split_file_plan  # noqa: E402
from .router import route  # noqa: E402
from .scheduler import AgentNode, build_nodes, run_wave  # noqa: E402

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
            yield {"type": "done", "ok": True}
            return

        if not project_id:
            project_id = self.store.new_project_id(decision["title"])
            yield {"type": "project", "project_id": project_id}

        # 3) Pano ---------------------------------------------------------
        board = BuildBoard(
            goal=message,
            mode=decision["mode"],
            project_id=project_id,
            requested_format=requested_format,
        )
        board.context = self._build_context(message, project_id, existing_files, scope)
        board.set_files(existing_files)

        # Ajan başına ayrı Hermes oturumu: paralel turlar tek oturumda
        # güvenli değil, ayrıca tek oturumda ajanlar birbirinin çıktısını
        # ikinci kez okurdu. Uzun vadeli bellek aynı session_key ile korunur.
        sessions: Dict[str, Optional[str]] = {}
        session_lock = threading.Lock()

        # 4) Dalgalar ------------------------------------------------------
        produced: List[Dict[str, Any]] = []
        failed = False
        last_text = ""

        for wave_index, wave_agents in enumerate(plan_waves(decision["agents"]), start=1):
            nodes = self._nodes_for_wave(wave_agents, board)
            if not nodes:
                continue

            yield {
                "type": "wave",
                "index": wave_index,
                "agents": [self._node_card(node) for node in nodes],
                "parallel": len(nodes) > 1,
            }
            for node in nodes:
                yield {"type": "agent_start", "agent": self._node_card(node)}

            runner = self._make_runner(
                engine=engine,
                board=board,
                history=history,
                scope=scope,
                title=decision["title"],
                sessions=sessions,
                session_lock=session_lock,
                hermes_session_id=hermes_session_id,
            )

            results: List[Any] = []
            for item in run_wave(
                nodes,
                runner,
                max_parallel=self.config.max_parallel_agents,
            ):
                if isinstance(item, dict) and "__results__" in item:
                    results = item["__results__"]
                    continue
                yield item

            # 5) Dalga sonrası: panoyu güncelle, dosyaları yaz -------------
            for result in results:
                node = result.node
                agent = AGENTS[node.agent_id]
                text = result.text

                if text.strip():
                    last_text = text
                    board.record(node.agent_id, text)
                elif not result.failed:
                    # Sessiz başarısızlık en kötüsüdür.
                    result.failed = True
                    yield {
                        "type": "error",
                        "agent_id": node.agent_id,
                        "node": node.key,
                        "text": f"{node.label} boş yanıt döndürdü. Modeli veya bağlantıyı kontrol edin.",
                    }

                written: List[Dict[str, Any]] = []
                if agent["produces_files"] and text.strip():
                    written = self._persist_files(project_id, text)
                    produced.extend(written)

                yield {
                    "type": "agent_end",
                    "agent_id": node.agent_id,
                    "node": node.key,
                    "agent": self._node_card(node),
                    "files": written,
                    "chars": len(text),
                }

                if result.failed:
                    failed = True

            board.set_files(self.store.list_files(project_id))

            # Mimar bittiyse dosya planını çıkar — sonraki dalgada Kodlayıcı
            # buna göre bölünecek.
            if "architect" in wave_agents and board.design:
                entries = parse_file_plan(board.design)
                board.set_file_plan(entries)
                if entries:
                    yield {
                        "type": "status",
                        "text": f"Dosya planı çıkarıldı: {len(entries)} dosya.",
                    }
                else:
                    yield {
                        "type": "status",
                        "text": "Dosya planı okunamadı; kodlama tek ajanla sürdürülecek.",
                    }

            if failed:
                break

        # 6) Ürün ------------------------------------------------------------
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

        # 7) Bellek ----------------------------------------------------------
        stored = self.memory.sync(message, last_text, scope=scope)
        if stored:
            yield {"type": "memory", "stored": stored}

        yield {"type": "done", "ok": not failed}

    # ------------------------------------------------------------------
    # Dalga kurulumu
    # ------------------------------------------------------------------
    def _nodes_for_wave(self, wave_agents: List[str], board: BuildBoard) -> List[AgentNode]:
        """Bir dalgadaki rolleri çalıştırılabilir düğümlere açar."""
        nodes: List[AgentNode] = []
        for agent_id in wave_agents:
            agent = AGENTS.get(agent_id)
            if not agent:
                continue
            if supports_fanout(agent_id) and board.file_plan:
                groups = split_file_plan(board.file_plan, self.config.max_parallel_agents)
                nodes.extend(build_nodes(agent_id, agent["name"], file_groups=groups))
            else:
                nodes.extend(build_nodes(agent_id, agent["name"]))
        return nodes

    def _make_runner(
        self,
        *,
        engine: Dict[str, Any],
        board: BuildBoard,
        history: List[Dict[str, Any]],
        scope: str,
        title: str,
        sessions: Dict[str, Optional[str]],
        session_lock: threading.Lock,
        hermes_session_id: Optional[str],
    ):
        """Bir düğümü çalıştırıp olaylarını akıtan işlevi döndürür."""

        def runner(node: AgentNode) -> Iterator[Dict[str, Any]]:
            agent = AGENTS[node.agent_id]
            prompt = self._node_prompt(node, board, history)
            session_id = None
            if engine["engine"] == "hermes":
                session_id = self._session_for(
                    node, sessions, session_lock, title, hermes_session_id
                )
            yield from self._stream_agent(engine, agent, prompt, session_id, scope)

        return runner

    def _session_for(
        self,
        node: AgentNode,
        sessions: Dict[str, Optional[str]],
        lock: threading.Lock,
        title: str,
        hermes_session_id: Optional[str],
    ) -> Optional[str]:
        """Düğüm için Hermes oturumu döndürür (düğüm başına bir tane)."""
        with lock:
            if node.key in sessions:
                return sessions[node.key]
            # İstemciden gelen oturum ilk düğüme verilir; sohbetin devamlılığı
            # o oturumda görünür kalsın.
            if hermes_session_id and not sessions:
                sessions[node.key] = hermes_session_id
                return hermes_session_id
            sessions[node.key] = None  # yer tut, ikinci kez denenmesin

        try:
            session_id = self.client.create_session(title=f"{title} · {node.label}")
        except Exception as exc:
            logger.info("Hermes oturumu açılamadı (%s), durumsuz yola geçiliyor: %s", node.key, exc)
            return None

        with lock:
            sessions[node.key] = session_id
        return session_id

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
    def _node_prompt(
        self,
        node: AgentNode,
        board: BuildBoard,
        history: List[Dict[str, Any]],
    ) -> str:
        """Bir düğümün göreceği istemi kurar.

        Kritik nokta: sohbet geçmişi ve kullanıcının ham mesajı YALNIZCA
        Çözümleyici'ye gider. Diğer roller panodan gelen damıtılmış durumu ve
        tek satırlık hedefi görür — böylece hiçbir ajan konuşmayı yeniden
        açmaz, hiçbir metin iki kez beslenmez.
        """
        parts: List[str] = []

        if node.agent_id == "analyst":
            recent = [
                f"{'Kullanıcı' if item.get('role') == 'user' else 'Asistan'}: "
                f"{trim(str(item.get('content') or ''), 1200)}"
                for item in history[-_HISTORY_TURNS:]
                if item.get("role") in {"user", "assistant"} and item.get("content")
            ]
            if recent:
                parts.append("### Önceki konuşma ###\n" + "\n".join(recent))

        board_context = board.render_for(node.agent_id, assigned_paths=node.assigned_paths or None)
        if board_context:
            parts.append(board_context)

        if node.is_fanout:
            parts.append(
                f"### Paralel çalışma ###\nBu işte {node.total_instances} Kodlayıcı aynı anda "
                f"çalışıyor; sen {node.instance}. sırasın. Yalnızca sana düşen dosyaları üret, "
                "diğerlerinin dosyalarını yeniden yazma."
            )

        parts.append("### Şimdi senden istenen ###\n" + AGENTS[node.agent_id]["description"])
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

        if engine["engine"] != "hermes":
            yield {"type": "error", "text": self._no_engine_message()}
            return

        emitted = 0
        try:
            for event in self._stream_hermes(system_prompt, prompt, session_id, scope):
                if event["type"] == "delta":
                    emitted += 1
                yield event
        except Exception as exc:
            logger.warning("Hermes akışı başarısız (%s): %s", agent["id"], exc)
            if emitted:
                yield {"type": "error", "text": f"Hermes akışı yarıda kesildi: {exc}"}
            else:
                yield {"type": "error", "text": f"Hermes hatası: {exc}"}

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
    @staticmethod
    def _agent_card(agent_id: str) -> Dict[str, Any]:
        agent = AGENTS.get(agent_id, {})
        return {
            "id": agent_id,
            "name": agent.get("name", agent_id),
            "title": agent.get("title", ""),
            "emoji": agent.get("emoji", "🤖"),
        }

    @classmethod
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
