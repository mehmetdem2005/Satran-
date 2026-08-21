"""Dalga yürütücüsü — ajanları bağımlılık grafiğine göre paralel çalıştırır.

Eski hat ``for agent_id in agents:`` ile doğrusaldı; her ajan bir öncekini
beklerdi. Burada bağımlılığı karşılanan tüm düğümler **aynı dalgada** başlar.

Akış modeli: her düğüm kendi iş parçacığında çalışır ve ürettiği olayları
ortak bir ``queue.Queue``'ya iter. ``run_waves`` kuyruğu boşaltıp olayları
tek bir üreteç olarak dışarı verir — Flask tarafındaki SSE gövdesi tek
parçacıklı kalır, ajanlar paralel akar. Her olay ``agent_id`` taşıdığı için
ön yüz metinleri doğru balonlara ayırır.

Kodlayıcı ayrıca dosya gruplarına bölünebilir (fan-out): Mimar'ın dosya planı
ayrık gruplara ayrılır, her grup için ayrı bir düğüm açılır. Yollar ayrık
olduğu için diske yazma çakışmaz.
"""

from __future__ import annotations

import logging
import queue
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterator, List, Optional, Sequence

logger = logging.getLogger(__name__)

# İşçiler bittiğinde kuyruğa konan nöbetçi.
_DONE = object()

# Kuyruk boşalmadığında ana üretecin ne kadar bekleyeceği. Kısa tutuyoruz ki
# iptal isteği (bir düğüm patladığında) hızla görülsün.
_POLL_TIMEOUT = 0.25


@dataclass
class AgentNode:
    """Grafikte çalıştırılacak tek bir düğüm.

    ``agent_id`` rolü, ``key`` ise düğümü benzersiz kılar: fan-out'ta aynı
    rolden birden çok düğüm olur (``builder#1``, ``builder#2``).
    """

    agent_id: str
    key: str
    label: str
    instance: int = 0
    total_instances: int = 1
    assigned_paths: List[str] = field(default_factory=list)

    @property
    def is_fanout(self) -> bool:
        return self.total_instances > 1


class NodeResult:
    """Bir düğümün çalışma sonucu."""

    def __init__(self, node: AgentNode) -> None:
        self.node = node
        self.text: str = ""
        self.failed: bool = False
        self.error: Optional[str] = None


def run_wave(
    nodes: Sequence[AgentNode],
    runner: Callable[[AgentNode], Iterator[Dict[str, Any]]],
    *,
    max_parallel: int = 2,
    cancel: Optional[threading.Event] = None,
) -> Iterator[Any]:
    """Bir dalgadaki düğümleri paralel çalıştırır, olayları akıtır.

    ``runner`` bir düğüm alıp normalize olay sözlükleri üreten bir üreteçtir.
    Üretilen her olaya düğümün kimliği eklenir.

    Dalga bitince, son öğe olarak ``{"__results__": [NodeResult, ...]}``
    döndürülür; çağıran metinleri ve hataları oradan alır.
    """
    if not nodes:
        return

    events: "queue.Queue[Any]" = queue.Queue()
    results: Dict[str, NodeResult] = {node.key: NodeResult(node) for node in nodes}
    cancel = cancel or threading.Event()

    def work(node: AgentNode) -> None:
        result = results[node.key]
        collected: List[str] = []
        try:
            for event in runner(node):
                if cancel.is_set():
                    break
                kind = event.get("type")
                if kind == "delta":
                    collected.append(event.get("text", ""))
                elif kind == "error":
                    result.failed = True
                    result.error = event.get("text")
                events.put({**event, "agent_id": node.agent_id, "node": node.key})
        except Exception as exc:  # işçi çökerse dalga sessizce kaybolmasın
            logger.exception("Ajan düğümü çöktü: %s", node.key)
            result.failed = True
            result.error = str(exc)
            events.put(
                {
                    "type": "error",
                    "text": f"{node.label} çalışırken hata: {exc}",
                    "agent_id": node.agent_id,
                    "node": node.key,
                }
            )
        finally:
            result.text = "".join(collected)
            events.put(_DONE)

    workers = max(1, min(int(max_parallel), len(nodes)))
    executor = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="forge")
    try:
        for node in nodes:
            executor.submit(work, node)

        finished = 0
        while finished < len(nodes):
            try:
                item = events.get(timeout=_POLL_TIMEOUT)
            except queue.Empty:
                continue
            if item is _DONE:
                finished += 1
                continue
            yield item
    finally:
        # İşçiler nöbetçilerini koymuş olsa da havuzu düzgün kapat.
        executor.shutdown(wait=True)

    # Kuyrukta kalmış olayları da ver (işçi nöbetçiden sonra bir şey koymaz,
    # ama kapanış yarışlarına karşı güvenli).
    while True:
        try:
            item = events.get_nowait()
        except queue.Empty:
            break
        if item is not _DONE:
            yield item

    yield {"__results__": [results[node.key] for node in nodes]}


def build_nodes(
    agent_id: str,
    label: str,
    *,
    file_groups: Optional[Sequence[Sequence[Any]]] = None,
) -> List[AgentNode]:
    """Bir rol için çalıştırılacak düğümleri üretir.

    ``file_groups`` verilirse rol fan-out edilir: her grup için ayrı düğüm,
    ayrı etiket (``Kodlayıcı 1``, ``Kodlayıcı 2``).
    """
    if not file_groups or len(file_groups) <= 1:
        paths = [entry.path for entry in (file_groups[0] if file_groups else [])]
        return [
            AgentNode(
                agent_id=agent_id,
                key=agent_id,
                label=label,
                instance=0,
                total_instances=1,
                assigned_paths=paths,
            )
        ]

    total = len(file_groups)
    return [
        AgentNode(
            agent_id=agent_id,
            key=f"{agent_id}#{index + 1}",
            label=f"{label} {index + 1}",
            instance=index + 1,
            total_instances=total,
            assigned_paths=[entry.path for entry in group],
        )
        for index, group in enumerate(file_groups)
    ]
