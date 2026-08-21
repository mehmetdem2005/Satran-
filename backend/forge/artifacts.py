"""Üretilen kodu gerçek dosyalara ve indirilebilir paketlere çevirir.

İki iş yapar:

1. ``extract_files`` — model çıktısındaki çitli kod bloklarından dosya
   yollarını ve içeriklerini çıkarır. Arayüz aynı blokları kopyalanabilir
   kod kartı olarak gösterir, burada onlar diske yazılır.
2. ``ArtifactStore`` — her proje için bir klasör tutar, dosyaları sürümleyerek
   yazar ve istenen biçimde (zip, tar.gz, tek dosya, markdown, json) paketler.
"""

from __future__ import annotations

import io
import json
import logging
import re
import shutil
import tarfile
import time
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from utils import safe_relpath, slugify, timestamp_slug  # noqa: E402

logger = logging.getLogger(__name__)

# ```lang info
_FENCE_RE = re.compile(
    r"^(?P<indent>[ \t]{0,3})(?P<fence>`{3,}|~{3,})[ \t]*(?P<info>[^\n]*)\n"
    r"(?P<body>.*?)(?:\n(?P=indent)?(?P=fence)[ \t]*(?:\n|$))",
    re.DOTALL | re.MULTILINE,
)

# path=..., file=..., title="...", src=...
_INFO_KV_RE = re.compile(r"""\b(?:path|file|filename|title|src|name)\s*=\s*(?P<value>"[^"]+"|'[^']+'|\S+)""", re.I)

# Bloktan hemen önce gelen "dosya adı" satırları: **src/app.py**, ### src/app.py,
# `src/app.py`, // src/app.py, # dosya: src/app.py
_PRECEDING_PATH_RE = re.compile(
    r"""(?:^|\n)[ \t]*(?:[#>*\-]{0,6}[ \t]*)?(?:dosya|file|path|yol)?\s*:?\s*"""
    r"""[`*_"']{0,2}(?P<path>[\w.\-]+(?:/[\w.\-]+)*\.[A-Za-z0-9]{1,12})[`*_"']{0,2}[ \t]*$""",
    re.IGNORECASE,
)

# Yol gibi görünen ama dil adı olan bilgi satırlarını elemek için.
_KNOWN_LANGS = {
    "python", "py", "javascript", "js", "jsx", "typescript", "ts", "tsx", "json",
    "html", "css", "scss", "bash", "sh", "shell", "zsh", "yaml", "yml", "toml",
    "ini", "sql", "text", "txt", "markdown", "md", "java", "kotlin", "kt", "go",
    "rust", "rs", "c", "cpp", "csharp", "cs", "php", "ruby", "rb", "swift",
    "dart", "xml", "svg", "diff", "dockerfile", "makefile", "gdscript", "gd",
    "vue", "svelte", "lua", "r", "julia", "perl", "console", "plaintext", "tree",
}

_EXT_LANG = {
    ".py": "python", ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".jsx": "jsx", ".ts": "typescript", ".tsx": "tsx", ".json": "json",
    ".html": "html", ".htm": "html", ".css": "css", ".scss": "scss",
    ".sh": "bash", ".bash": "bash", ".yaml": "yaml", ".yml": "yaml",
    ".toml": "toml", ".ini": "ini", ".sql": "sql", ".md": "markdown",
    ".java": "java", ".kt": "kotlin", ".go": "go", ".rs": "rust",
    ".c": "c", ".h": "c", ".cpp": "cpp", ".cs": "csharp", ".php": "php",
    ".rb": "ruby", ".swift": "swift", ".dart": "dart", ".xml": "xml",
    ".gd": "gdscript", ".vue": "vue", ".svelte": "svelte", ".lua": "lua",
    ".txt": "text",
}

# Kullanıcının istediği teslim biçimini yakalayan kalıplar.
_FORMAT_PATTERNS: List[Tuple[str, str]] = [
    (r"\b(zip|zipl[ei]|sıkıştır|arşiv)\b", "zip"),
    (r"\b(tar\.gz|tar|tgz|tarball)\b", "targz"),
    (r"\btek\s+dosya\b|\bsingle\s+file\b", "single"),
    (r"\b(markdown|md olarak|md dosyası)\b", "markdown"),
    (r"\bjson\s+olarak\b|\bjson\s+ver\b", "json"),
]

EXPORT_FORMATS = ("zip", "targz", "markdown", "json", "single")


def _strip_quotes(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def _language_for(path: str, declared: str = "") -> str:
    if declared and declared.lower() in _KNOWN_LANGS:
        return declared.lower()
    return _EXT_LANG.get(Path(path).suffix.lower(), "text")


def _path_from_info(info: str) -> Tuple[Optional[str], str]:
    """Bilgi satırından ``(yol, dil)`` çıkarır."""
    info = (info or "").strip()
    if not info:
        return None, ""

    match = _INFO_KV_RE.search(info)
    if match:
        language = info.split()[0].strip().lower()
        if language not in _KNOWN_LANGS:
            language = ""
        return safe_relpath(_strip_quotes(match.group("value"))), language

    tokens = info.replace(":", " ").split()
    if not tokens:
        return None, ""

    language = tokens[0].lower() if tokens[0].lower() in _KNOWN_LANGS else ""
    for token in tokens:
        token = _strip_quotes(token)
        if token.lower() in _KNOWN_LANGS:
            continue
        if "." in token or "/" in token:
            candidate = safe_relpath(token)
            if candidate:
                return candidate, language or _language_for(candidate)
    return None, language


def _path_from_preamble(text: str, fence_start: int) -> Optional[str]:
    """Bloktan hemen önceki en fazla iki satırda dosya adı arar."""
    head = text[:fence_start].rstrip()
    if not head:
        return None
    tail_lines = head.splitlines()[-2:]
    for line in reversed(tail_lines):
        match = _PRECEDING_PATH_RE.search("\n" + line)
        if match:
            candidate = safe_relpath(match.group("path"))
            if candidate and Path(candidate).suffix:
                return candidate
    return None


def extract_files(text: str) -> List[Dict[str, str]]:
    """Markdown çıktısındaki dosya bloklarını ``[{path, language, content}]`` yapar.

    Yolu belirlenemeyen bloklar (örnek çıktı, kabuk komutu, ağaç görünümü)
    atlanır — onlar arayüzde yine kopyalanabilir kod kartı olarak görünür ama
    projeye dosya olarak yazılmaz.
    """
    files: List[Dict[str, str]] = []
    seen: Dict[str, int] = {}

    for match in _FENCE_RE.finditer(text or ""):
        info = match.group("info")
        body = match.group("body")
        path, language = _path_from_info(info)
        if not path:
            path = _path_from_preamble(text, match.start())
            if path and not language:
                language = _language_for(path)
        if not path:
            continue

        content = body.rstrip() + "\n"
        if not content.strip():
            continue

        entry = {
            "path": path,
            "language": language or _language_for(path),
            "content": content,
        }
        if path in seen:
            files[seen[path]] = entry  # sonraki sürüm öncekini ezer
        else:
            seen[path] = len(files)
            files.append(entry)
    return files


def detect_requested_format(text: str) -> Optional[str]:
    """Kullanıcı metninden istenen teslim biçimini çıkarır."""
    lowered = (text or "").lower()
    for pattern, fmt in _FORMAT_PATTERNS:
        if re.search(pattern, lowered):
            return fmt
    return None


class ArtifactStore:
    """Üretilen projeleri diskte tutar ve paketler."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    _PROJECT_ID_RE = re.compile(r"^[\w-]{1,80}$")

    def project_dir(self, project_id: str) -> Path:
        """Proje klasörünü döndürür; kimliği temizlemek yerine doğrular.

        Eskiden geçersiz karakterler ayıklanıyordu — bu, ``../../kacak``
        gibi bir kimliği sessizce ``kacak`` projesine çeviriyordu. Yol
        sızıntısı yoktu ama çağıran, istemediği bir projeyle çalışıyordu.
        Sessiz yeniden yazma yerine reddediyoruz.
        """
        if not isinstance(project_id, str) or not self._PROJECT_ID_RE.match(project_id):
            raise ValueError(f"Geçersiz proje kimliği: {project_id!r}")
        path = self.root / project_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def new_project_id(self, title: str = "") -> str:
        return f"{slugify(title, 'proje')}-{timestamp_slug()}"

    # ------------------------------------------------------------------
    def write_files(self, project_id: str, files: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        """Dosyaları proje klasörüne yazar; klasör dışına çıkmayı reddeder."""
        base = self.project_dir(project_id).resolve()
        written: List[Dict[str, Any]] = []

        for entry in files:
            relative = safe_relpath(entry.get("path", ""))
            if not relative:
                continue
            target = (base / relative).resolve()
            try:
                target.relative_to(base)
            except ValueError:  # sembolik/normalize sonrası kaçış
                logger.warning("Proje dışına yazma reddedildi: %s", entry.get("path"))
                continue

            target.parent.mkdir(parents=True, exist_ok=True)
            content = entry.get("content", "")
            target.write_text(content, encoding="utf-8")
            written.append(
                {
                    "path": relative,
                    "language": entry.get("language") or _language_for(relative),
                    "bytes": len(content.encode("utf-8")),
                    "lines": content.count("\n"),
                }
            )
        if written:
            self._touch_manifest(project_id, written)
        return written

    def _touch_manifest(self, project_id: str, written: List[Dict[str, Any]]) -> None:
        manifest_path = self.project_dir(project_id) / ".forge.json"
        manifest: Dict[str, Any] = {"project_id": project_id, "history": []}
        if manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        manifest.setdefault("history", []).append(
            {"at": time.time(), "files": [item["path"] for item in written]}
        )
        manifest["history"] = manifest["history"][-50:]
        manifest["updated_at"] = time.time()
        try:
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError as exc:
            logger.debug("Manifest yazılamadı: %s", exc)

    # ------------------------------------------------------------------
    def list_files(self, project_id: str) -> List[Dict[str, Any]]:
        base = self.project_dir(project_id)
        items: List[Dict[str, Any]] = []
        for path in sorted(base.rglob("*")):
            if not path.is_file() or path.name == ".forge.json":
                continue
            relative = path.relative_to(base).as_posix()
            try:
                size = path.stat().st_size
            except OSError:
                continue
            items.append(
                {
                    "path": relative,
                    "language": _language_for(relative),
                    "bytes": size,
                }
            )
        return items

    def read_file(self, project_id: str, relative: str) -> Optional[str]:
        base = self.project_dir(project_id).resolve()
        safe = safe_relpath(relative)
        if not safe:
            return None
        target = (base / safe).resolve()
        try:
            target.relative_to(base)
        except ValueError:
            return None
        if not target.is_file():
            return None
        try:
            return target.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None

    def delete_project(self, project_id: str) -> bool:
        path = self.project_dir(project_id)
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)
            return True
        return False

    def list_projects(self) -> List[Dict[str, Any]]:
        """Projeleri en son güncellenen başta olacak şekilde döndürür.

        Ada göre sıralamak, kullanıcı adı "z" ile başlayan bir proje ürettiği
        anda yanlış cevap verir; listede aranan şey her zaman en son
        çalışılan projedir.
        """
        projects: List[Dict[str, Any]] = []
        for path in self.root.iterdir():
            if not path.is_dir():
                continue
            try:
                updated_at = path.stat().st_mtime
            except OSError:
                continue
            files = self.list_files(path.name)
            projects.append(
                {
                    "project_id": path.name,
                    "files": len(files),
                    "bytes": sum(item["bytes"] for item in files),
                    "updated_at": updated_at,
                }
            )
        projects.sort(key=lambda item: item["updated_at"], reverse=True)
        return projects

    # ------------------------------------------------------------------
    # Paketleme
    # ------------------------------------------------------------------
    def export(self, project_id: str, fmt: str = "zip") -> Tuple[io.BytesIO, str, str]:
        """``(gövde, dosya_adı, mime)`` döndürür."""
        fmt = (fmt or "zip").lower()
        if fmt not in EXPORT_FORMATS:
            fmt = "zip"

        base = self.project_dir(project_id)
        files = self.list_files(project_id)
        if not files:
            raise ValueError("Bu projede henüz dosya yok.")

        if fmt == "zip":
            return self._export_zip(project_id, base, files)
        if fmt == "targz":
            return self._export_targz(project_id, base, files)
        if fmt == "markdown":
            return self._export_markdown(project_id, files)
        if fmt == "json":
            return self._export_json(project_id, files)
        return self._export_single(project_id, files)

    def _export_zip(self, project_id: str, base: Path, files: List[Dict[str, Any]]):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for item in files:
                archive.write(base / item["path"], arcname=f"{project_id}/{item['path']}")
        buffer.seek(0)
        return buffer, f"{project_id}.zip", "application/zip"

    def _export_targz(self, project_id: str, base: Path, files: List[Dict[str, Any]]):
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
            for item in files:
                archive.add(base / item["path"], arcname=f"{project_id}/{item['path']}")
        buffer.seek(0)
        return buffer, f"{project_id}.tar.gz", "application/gzip"

    def _export_markdown(self, project_id: str, files: List[Dict[str, Any]]):
        parts = [f"# {project_id}", "", f"{len(files)} dosya", ""]
        for item in files:
            content = self.read_file(project_id, item["path"]) or ""
            language = item["language"]
            fence = "````" if "```" in content else "```"
            parts.append(f"## `{item['path']}`")
            parts.append("")
            parts.append(f"{fence}{language} path={item['path']}")
            parts.append(content.rstrip())
            parts.append(fence)
            parts.append("")
        buffer = io.BytesIO("\n".join(parts).encode("utf-8"))
        return buffer, f"{project_id}.md", "text/markdown"

    def _export_json(self, project_id: str, files: List[Dict[str, Any]]):
        payload = {
            "project_id": project_id,
            "generated_at": time.time(),
            "files": [
                {
                    "path": item["path"],
                    "language": item["language"],
                    "content": self.read_file(project_id, item["path"]) or "",
                }
                for item in files
            ],
        }
        buffer = io.BytesIO(json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))
        return buffer, f"{project_id}.json", "application/json"

    def _export_single(self, project_id: str, files: List[Dict[str, Any]]):
        """Tüm projeyi, kendini açan tek bir Python betiğine gömer."""
        payload = {
            item["path"]: (self.read_file(project_id, item["path"]) or "") for item in files
        }
        script = (
            '#!/usr/bin/env python3\n'
            '"""Kendini açan proje paketi. Çalıştır: python3 ' + project_id + '.py [hedef_klasör]"""\n'
            "import json, os, sys\n\n"
            "FILES = json.loads(r'''" + json.dumps(payload, ensure_ascii=False) + "''')\n\n"
            "def main():\n"
            "    target = sys.argv[1] if len(sys.argv) > 1 else " + repr(project_id) + "\n"
            "    for path, content in FILES.items():\n"
            "        full = os.path.join(target, path)\n"
            "        os.makedirs(os.path.dirname(full) or '.', exist_ok=True)\n"
            "        with open(full, 'w', encoding='utf-8') as handle:\n"
            "            handle.write(content)\n"
            "    print(f'{len(FILES)} dosya {target}/ altına yazıldı.')\n\n"
            "if __name__ == '__main__':\n"
            "    main()\n"
        )
        buffer = io.BytesIO(script.encode("utf-8"))
        return buffer, f"{project_id}.py", "text/x-python"
