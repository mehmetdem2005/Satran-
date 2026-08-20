"""Küçük yardımcılar: dosya çıkarma, SSE paketleme, metin temizleme."""

from __future__ import annotations

import io
import json
import re
import tarfile
import unicodedata
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

# Metin olarak okumayı deneyeceğimiz uzantılar.
TEXT_SUFFIXES = {
    ".txt", ".md", ".markdown", ".rst", ".json", ".jsonl", ".yaml", ".yml", ".toml",
    ".ini", ".cfg", ".conf", ".env", ".csv", ".tsv", ".log", ".sql", ".graphql",
    ".py", ".pyi", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".vue", ".svelte",
    ".html", ".htm", ".css", ".scss", ".sass", ".less", ".java", ".kt", ".kts",
    ".c", ".h", ".cpp", ".hpp", ".cc", ".cs", ".go", ".rs", ".rb", ".php", ".swift",
    ".sh", ".bash", ".zsh", ".fish", ".ps1", ".bat", ".dockerfile", ".gradle",
    ".xml", ".svg", ".gd", ".lua", ".r", ".jl", ".dart", ".ex", ".exs", ".pl",
}

MAX_TEXT_BYTES = 4 * 1024 * 1024  # tek dosya için 4 MB üst sınır


def _decode(raw: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="ignore")


def looks_textual(name: str, raw: bytes) -> bool:
    suffix = Path(name).suffix.lower()
    if suffix in TEXT_SUFFIXES:
        return True
    if not suffix and len(raw) < 512_000:
        return b"\x00" not in raw[:4096]
    return False


def extract_pdf_text(pdf_bytes: bytes) -> str:
    """PDF'ten metin çıkarır. pypdf yoksa anlaşılır bir hata verir."""
    try:
        from pypdf import PdfReader  # type: ignore
    except ImportError as exc:  # pragma: no cover - ortam bağımlı
        raise RuntimeError(
            "PDF okumak için 'pypdf' gerekli: pip install pypdf"
        ) from exc

    reader = PdfReader(io.BytesIO(pdf_bytes))
    parts: List[str] = []
    for index, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:  # bozuk sayfayı atla, kalanını kurtar
            continue
        if text.strip():
            parts.append(f"[sayfa {index}]\n{text}")
    return "\n\n".join(parts)


def extract_upload(filename: str, raw: bytes) -> List[Dict[str, str]]:
    """Yüklenen bir dosyayı ``[{name, content}]`` listesine çevirir.

    Zip arşivleri açılır ve içindeki her metin/PDF dosyası ayrı bir belge olur;
    böylece RAG parça bazında kaynak gösterebilir.
    """
    lower = filename.lower()

    if lower.endswith(".zip"):
        return _extract_zip(filename, raw)
    if lower.endswith((".tar", ".tar.gz", ".tgz", ".tar.bz2")):
        return _extract_tar(filename, raw)
    if lower.endswith(".pdf"):
        return [{"name": filename, "content": extract_pdf_text(raw)}]

    if len(raw) > MAX_TEXT_BYTES:
        raw = raw[:MAX_TEXT_BYTES]
    return [{"name": filename, "content": _decode(raw)}]


def _extract_zip(filename: str, raw: bytes) -> List[Dict[str, str]]:
    docs: List[Dict[str, str]] = []
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for info in archive.infolist():
            if info.is_dir() or info.file_size > MAX_TEXT_BYTES:
                continue
            name = info.filename
            if "__pycache__" in name or name.startswith("__MACOSX/"):
                continue
            data = archive.read(info)
            doc = _archive_member_to_doc(filename, name, data)
            if doc:
                docs.append(doc)
    return docs


def _extract_tar(filename: str, raw: bytes) -> List[Dict[str, str]]:
    docs: List[Dict[str, str]] = []
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:*") as archive:
        for member in archive.getmembers():
            if not member.isfile() or member.size > MAX_TEXT_BYTES:
                continue
            handle = archive.extractfile(member)
            if handle is None:
                continue
            doc = _archive_member_to_doc(filename, member.name, handle.read())
            if doc:
                docs.append(doc)
    return docs


def _archive_member_to_doc(archive_name: str, member: str, data: bytes) -> Optional[Dict[str, str]]:
    label = f"{archive_name}:{member}"
    if member.lower().endswith(".pdf"):
        try:
            return {"name": label, "content": extract_pdf_text(data)}
        except Exception:
            return None
    if looks_textual(member, data):
        text = _decode(data)
        return {"name": label, "content": text} if text.strip() else None
    return None


def sse(event: Dict[str, Any]) -> str:
    """Bir olayı SSE satırına çevirir."""
    return "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"


def slugify(value: str, fallback: str = "proje") -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = value.encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    value = re.sub(r"-{2,}", "-", value)
    return value[:48] or fallback


def timestamp_slug() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def safe_relpath(raw: str) -> Optional[str]:
    """Kullanıcı/model kaynaklı bir yolu güvenli göreli yola indirger.

    Mutlak yollar, ``..`` sıçramaları ve Windows sürücü harfleri reddedilir —
    üretilen dosyalar proje klasörünün dışına yazılamaz.
    """
    if not raw:
        return None
    candidate = raw.strip().replace("\\", "/").strip()
    if not candidate or candidate.startswith("/") or re.match(r"^[A-Za-z]:", candidate):
        return None
    while candidate.startswith("./"):
        candidate = candidate[2:]
    if not candidate:
        return None
    parts: List[str] = []
    for part in candidate.split("/"):
        part = part.strip()
        if not part or part == ".":
            continue
        if part == "..":
            return None
        if part in {"~"} or "\x00" in part:
            return None
        parts.append(part)
    if not parts or len(parts) > 12:
        return None
    result = "/".join(parts)
    return result if len(result) <= 200 else None


def trim(text: str, limit: int) -> str:
    text = text or ""
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + f"\n… (kısaltıldı, toplam {len(text)} karakter)"


def iter_conversation(messages: Iterable[Dict[str, Any]]) -> List[Tuple[str, str]]:
    """Sohbet mesajlarını ``(rol, içerik)`` çiftlerine indirger."""
    out: List[Tuple[str, str]] = []
    for message in messages or []:
        role = str(message.get("role") or "").strip()
        content = message.get("content")
        if role not in {"user", "assistant", "system"} or not isinstance(content, str):
            continue
        if content.strip():
            out.append((role, content))
    return out


def last_user_message(messages: Iterable[Dict[str, Any]]) -> str:
    for role, content in reversed(iter_conversation(messages)):
        if role == "user":
            return content
    return ""
