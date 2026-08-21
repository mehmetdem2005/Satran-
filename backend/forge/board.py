"""BuildBoard — ajanların ortak yazı tahtası.

Eskiden her ajan kendi isteminde tüm sohbet geçmişini, kullanıcının orijinal
mesajını ve kendinden önceki BÜTÜN ajanların ham çıktısını alıyordu. Modelin
gözünden bu, her ajan turunda konuşmanın yeniden açılması demekti — ajanlar
"her seferinde baştan başlıyor" gibi davranıyordu. Üstelik hepsi tek bir
Hermes oturumunu paylaştığı için aynı metin iki kez besleniyordu: bir kez
oturum geçmişinden, bir kez elle enjekte edilerek.

Pano bunun yerine **damıtılmış durum** taşır. Her rol yalnızca işine yarayan
dilimleri görür; ham transkript hiç dolaşmaz.

    goal       kullanıcının hedefi (tek satır, bir kez)
    spec       Çözümleyici'nin gereksinim tanımı
    design     Mimar'ın teknoloji yığını ve modül sorumlulukları
    file_plan  Mimar'ın dosya planı (ayrıştırılmış: yol → sorumluluk)
    files      projede o an var olan dosyalar
    findings   Denetçi'nin bulguları
    context    RAG/bellek bağlamı (yükleme parçaları, mevcut kod)

Pano birden çok iş parçacığından okunur (paralel ajanlar), tek yazıcıdan
yazılır (dalga bitince ana akış). Yine de yazma yolları kilitli: fan-out
Kodlayıcılar aynı anda dosya listesi tazeleyebiliyor.
"""

from __future__ import annotations

import re
import sys
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from utils import safe_relpath  # noqa: E402

# Pano dilimi başına karakter bütçeleri. Eski hattaki 14.000'lik ajan-başına
# devir bütçesinin yerini alıyorlar: toplam istem boyutu ajan sayısıyla değil,
# rolün gerçek ihtiyacıyla ölçekleniyor.
SPEC_BUDGET = 4000
DESIGN_BUDGET = 6000
FINDINGS_BUDGET = 4000
CONTEXT_BUDGET = 6000
FILE_LIST_LIMIT = 80


def _trim(text: str, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "\n… (kısaltıldı)"


@dataclass
class FilePlanEntry:
    """Mimar'ın dosya planındaki tek bir satır."""

    path: str
    responsibility: str = ""

    def render(self) -> str:
        return f"- `{self.path}`" + (f" — {self.responsibility}" if self.responsibility else "")


@dataclass
class BuildBoard:
    """Bir yapım turunun paylaşılan durumu."""

    goal: str = ""
    mode: str = "build"
    project_id: str = ""
    requested_format: Optional[str] = None

    spec: str = ""
    design: str = ""
    findings: str = ""
    context: str = ""

    file_plan: List[FilePlanEntry] = field(default_factory=list)
    files: List[Dict[str, Any]] = field(default_factory=list)

    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    # ------------------------------------------------------------------
    # Yazma
    # ------------------------------------------------------------------
    def record(self, role: str, output: str) -> None:
        """Bir ajanın çıktısını rolüne göre panoya damıtır.

        Ham çıktı saklanmaz; yalnızca sonraki rollerin ihtiyaç duyduğu alan
        güncellenir. Kod blokları zaten diske yazıldığı için panoya girmez.
        """
        output = (output or "").strip()
        if not output:
            return
        with self._lock:
            if role == "analyst":
                self.spec = output
            elif role == "architect":
                self.design = output
            elif role == "reviewer":
                self.findings = output

    def set_files(self, files: Sequence[Dict[str, Any]]) -> None:
        with self._lock:
            self.files = list(files)

    def set_file_plan(self, entries: Sequence[FilePlanEntry]) -> None:
        with self._lock:
            self.file_plan = list(entries)

    # ------------------------------------------------------------------
    # Okuma
    # ------------------------------------------------------------------
    def _file_list_block(self) -> str:
        if not self.files:
            return ""
        lines = [f"- `{item['path']}` ({item.get('bytes', 0)} bayt)" for item in self.files[:FILE_LIST_LIMIT]]
        if len(self.files) > FILE_LIST_LIMIT:
            lines.append(f"- … ve {len(self.files) - FILE_LIST_LIMIT} dosya daha")
        return "\n".join(lines)

    def _file_plan_block(self, only: Optional[Sequence[str]] = None) -> str:
        entries = self.file_plan
        if only is not None:
            wanted = set(only)
            entries = [entry for entry in entries if entry.path in wanted]
        return "\n".join(entry.render() for entry in entries)

    def render_for(self, role: str, *, assigned_paths: Optional[Sequence[str]] = None) -> str:
        """Bir rolün göreceği bağlamı üretir.

        Kullanıcının ham mesajı ve sohbet geçmişi buradan GEÇMEZ — onları
        yalnızca Çözümleyici alır (``pipeline`` ekler). Diğer roller hedefi
        tek satır olarak görür; böylece hiçbir ajan konuşmayı yeniden açmaz.
        """
        with self._lock:
            parts: List[str] = []

            if self.goal:
                parts.append("### Hedef ###\n" + _trim(self.goal, 600))

            if role in {"architect", "builder"} and self.spec:
                parts.append("### Gereksinim tanımı (Çözümleyici) ###\n" + _trim(self.spec, SPEC_BUDGET))

            if role in {"builder", "reviewer", "packager"} and self.design:
                parts.append("### Tasarım (Mimar) ###\n" + _trim(self.design, DESIGN_BUDGET))

            if role == "builder" and self.file_plan:
                if assigned_paths:
                    block = self._file_plan_block(assigned_paths)
                    if block:
                        parts.append(
                            "### SANA DÜŞEN DOSYALAR ###\n"
                            "Yalnızca aşağıdaki dosyaları yaz. Diğerlerini başka bir Kodlayıcı "
                            "aynı anda yazıyor; onlara dokunma, var sayarak kullan.\n" + block
                        )
                        others = self._file_plan_block(
                            [entry.path for entry in self.file_plan if entry.path not in set(assigned_paths)]
                        )
                        if others:
                            parts.append("### Başkasının yazdığı dosyalar (arayüzlerine uy) ###\n" + others)
                else:
                    parts.append("### Dosya planı ###\n" + self._file_plan_block())

            if role in {"reviewer", "packager"}:
                file_list = self._file_list_block()
                if file_list:
                    parts.append("### Projede var olan dosyalar ###\n" + file_list)

            if role == "packager" and self.findings:
                parts.append("### Denetçi bulguları ###\n" + _trim(self.findings, FINDINGS_BUDGET))

            if self.context:
                parts.append(_trim(self.context, CONTEXT_BUDGET))

            if self.mode == "patch" and self.files:
                parts.append(
                    "### Görev tipi ###\nBu bir DEĞİŞİKLİK isteği. Yeni proje kurma; "
                    "yalnızca gereken dosyaları, tam içerikleriyle yeniden yaz."
                )

            if self.requested_format:
                parts.append(
                    f"### Teslim biçimi ###\nKullanıcı çıktıyı '{self.requested_format}' biçiminde "
                    "istiyor; paketlemeyi arayüz yapacak, sen dosyaları üretmeye odaklan."
                )

            return "\n\n".join(parts)

    def snapshot(self) -> Dict[str, Any]:
        """Hata ayıklama ve testler için panonun okunabilir özeti."""
        with self._lock:
            return {
                "goal": self.goal,
                "mode": self.mode,
                "spec_chars": len(self.spec),
                "design_chars": len(self.design),
                "findings_chars": len(self.findings),
                "file_plan": [entry.path for entry in self.file_plan],
                "files": [item.get("path") for item in self.files],
            }


# Mimar'ın ``dosya-plani`` bloğu. Bilgi satırında dil yerine plan adı durur.
_FILE_PLAN_BLOCK_RE = re.compile(
    r"^[ \t]{0,3}(?P<fence>`{3,}|~{3,})[ \t]*dosya[-_]?plani[^\n]*\n(?P<body>.*?)\n[ \t]{0,3}(?P=fence)",
    re.DOTALL | re.MULTILINE | re.IGNORECASE,
)

# "src/app.py — sorumluluk", "src/app.py -- sorumluluk", "- src/app.py: sorumluluk"
_PLAN_LINE_RE = re.compile(
    r"^[\s\-*•]*[`\"']?(?P<path>[\w.\-]+(?:/[\w.\-]+)*\.[A-Za-z0-9]{1,12})[`\"']?"
    r"(?:\s*(?:—|–|--|:|\|)\s*(?P<what>.*))?$"
)

MAX_PLAN_ENTRIES = 40


def parse_file_plan(text: str) -> List[FilePlanEntry]:
    """Mimar çıktısından dosya planını çıkarır.

    Önce ``dosya-plani`` bloğu aranır. Model sözleşmeye uymadıysa (blok yok)
    çıktının tamamında plan satırı gibi görünen satırlar taranır — böylece
    tek bir biçim hatası tüm paylaştırmayı çökertmez. Hiçbir şey bulunamazsa
    boş liste döner ve çağıran tek Kodlayıcı'ya düşer.
    """
    if not text:
        return []

    match = _FILE_PLAN_BLOCK_RE.search(text)
    source = match.group("body") if match else text
    entries: List[FilePlanEntry] = []
    seen: set = set()

    for raw_line in source.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        found = _PLAN_LINE_RE.match(line)
        if not found:
            continue
        path = safe_relpath(found.group("path"))
        if not path or path in seen:
            continue
        seen.add(path)
        entries.append(FilePlanEntry(path=path, responsibility=(found.group("what") or "").strip()[:200]))
        if len(entries) >= MAX_PLAN_ENTRIES:
            break

    return entries


def split_file_plan(entries: Sequence[FilePlanEntry], groups: int) -> List[List[FilePlanEntry]]:
    """Dosya planını paralel Kodlayıcılar için gruplara böler.

    Sıra korunur: Mimar birbirine bağlı dosyaları ardışık yazdığı için
    bitişik dosyalar aynı gruba düşer, gruplar arası arayüz teması azalır.
    """
    entries = [entry for entry in entries if entry.path]
    if not entries:
        return []
    groups = max(1, min(int(groups), len(entries)))
    if groups == 1:
        return [list(entries)]

    per_group, extra = divmod(len(entries), groups)
    chunks: List[List[FilePlanEntry]] = []
    start = 0
    for index in range(groups):
        size = per_group + (1 if index < extra else 0)
        chunks.append(list(entries[start:start + size]))
        start += size
    return [chunk for chunk in chunks if chunk]
