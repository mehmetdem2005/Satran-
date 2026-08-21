"""Hermes Agent kurulumunu bulur, sağlığını ölçer ve gerekirse başlatır.

Arama sırası:

1. ``config.hermes_repo_dir`` (kullanıcı ayarı)
2. ``HERMES_REPO`` ortam değişkeni
3. Proje içindeki ``vendor/hermes-agent`` (scripts/install_hermes.sh buraya açar)
4. ``~/hermes-agent`` ve ``~/.hermes/repo``
5. PATH üzerindeki ``hermes`` komutu

Bu modül Hermes'i *içeri almaz*; onu bir süreç olarak yönetir. Böylece
Hermes'in kendi bağımlılık ağacı (uv, aiohttp, sqlite FTS5, plugin'ler)
uygulamanın Flask sürecinden ayrı kalır — Termux'ta çalışabilmesinin tek
pratik yolu budur.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
VENDOR_DIR = PROJECT_ROOT / "vendor" / "hermes-agent"

# Kurulumu doğrulayan işaret dosyaları.
_REPO_MARKERS = ("run_agent.py", "hermes_bootstrap.py", "pyproject.toml")


@dataclass
class HermesInstall:
    """Bulunan bir Hermes kurulumunun özeti."""

    repo_dir: Optional[Path] = None
    executable: Optional[str] = None
    python: Optional[str] = None
    source: str = "none"

    @property
    def found(self) -> bool:
        return bool(self.repo_dir or self.executable)

    def to_dict(self) -> Dict[str, Optional[str]]:
        return {
            "repo_dir": str(self.repo_dir) if self.repo_dir else None,
            "executable": self.executable,
            "python": self.python,
            "source": self.source,
            "found": self.found,
        }


def _is_repo(path: Path) -> bool:
    if not path.is_dir():
        return False
    return any((path / marker).exists() for marker in _REPO_MARKERS)


def _venv_binary(repo: Path, name: str) -> Optional[str]:
    for candidate in (repo / "venv" / "bin" / name, repo / ".venv" / "bin" / name):
        if candidate.exists() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


class HermesRuntime:
    """Hermes gateway sürecinin yaşam döngüsünü yönetir."""

    def __init__(self, config) -> None:
        self.config = config
        self._process: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()
        self._last_start_attempt = 0.0
        self._start_error: Optional[str] = None

    # ------------------------------------------------------------------
    # Keşif
    # ------------------------------------------------------------------
    def discover(self) -> HermesInstall:
        candidates: List[tuple[str, Path]] = []

        if self.config.hermes_repo_dir:
            candidates.append(("config", Path(self.config.hermes_repo_dir).expanduser()))
        env_repo = os.environ.get("HERMES_REPO", "").strip()
        if env_repo:
            candidates.append(("env", Path(env_repo).expanduser()))
        candidates.append(("vendor", VENDOR_DIR))
        candidates.append(("home", Path.home() / "hermes-agent"))
        candidates.append(("hermes-home", Path.home() / ".hermes" / "repo"))

        for source, path in candidates:
            if _is_repo(path):
                return HermesInstall(
                    repo_dir=path,
                    executable=_venv_binary(path, "hermes"),
                    python=_venv_binary(path, "python") or _venv_binary(path, "python3"),
                    source=source,
                )

        found = shutil.which("hermes")
        if found:
            return HermesInstall(executable=found, source="path")
        return HermesInstall()

    # ------------------------------------------------------------------
    # Başlatma
    # ------------------------------------------------------------------
    def gateway_command(self, install: HermesInstall) -> Optional[List[str]]:
        if install.executable:
            return [install.executable, "gateway"]
        if install.repo_dir and install.python:
            return [install.python, "-m", "hermes_cli", "gateway"]
        if install.repo_dir:
            return ["python3", "-m", "hermes_cli", "gateway"]
        return None

    def start_gateway(self, force: bool = False) -> Dict[str, object]:
        """Hermes gateway'i (API sunucusu dahil) arka planda başlatır."""
        with self._lock:
            if self._process and self._process.poll() is None and not force:
                return {"started": False, "reason": "already_running", "pid": self._process.pid}

            # Art arda başarısız denemelerde CPU yakmayalım.
            if not force and time.time() - self._last_start_attempt < 20:
                return {"started": False, "reason": "cooldown", "error": self._start_error}
            self._last_start_attempt = time.time()

            install = self.discover()
            command = self.gateway_command(install)
            if not command:
                # Android'de kabuk yok; oradaki kullanıcıya çalıştıramayacağı
                # bir komutu önermek yanlış yönlendirme olur.
                if getattr(self.config, "platform", "desktop") == "android":
                    self._start_error = (
                        "Hermes bu uygulamanın içinde yok. Ayarlar'dan bir API anahtarı girin "
                        "ya da Hermes'i Termux'ta/sunucuda çalıştırıp adresini yazın."
                    )
                else:
                    self._start_error = (
                        "Hermes Agent kurulumu bulunamadı. 'bash scripts/install_hermes.sh' çalıştırın."
                    )
                return {"started": False, "reason": "not_installed", "error": self._start_error}

            env = os.environ.copy()
            env["API_SERVER_ENABLED"] = "true"
            if self.config.hermes_api_key:
                env["API_SERVER_KEY"] = self.config.hermes_api_key
            port = self._port_from_url(self.config.hermes_base_url)
            if port:
                env["API_SERVER_PORT"] = str(port)

            log_path = self.config.data_path / "hermes-gateway.log"
            try:
                log_handle = open(log_path, "ab", buffering=0)
                self._process = subprocess.Popen(  # noqa: S603 - komut yukarıda türetildi
                    command,
                    cwd=str(install.repo_dir) if install.repo_dir else None,
                    env=env,
                    stdout=log_handle,
                    stderr=subprocess.STDOUT,
                    stdin=subprocess.DEVNULL,
                    start_new_session=True,
                )
            except (OSError, ValueError) as exc:
                self._start_error = f"Gateway başlatılamadı: {exc}"
                logger.warning("Hermes gateway başlatılamadı: %s", exc)
                return {"started": False, "reason": "spawn_failed", "error": self._start_error}

            self._start_error = None
            logger.info("Hermes gateway başlatıldı (pid=%s, log=%s)", self._process.pid, log_path)
            return {
                "started": True,
                "pid": self._process.pid,
                "command": " ".join(command),
                "log": str(log_path),
            }

    def stop_gateway(self) -> bool:
        with self._lock:
            if not self._process or self._process.poll() is not None:
                return False
            self._process.terminate()
            try:
                self._process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._process.kill()
            return True

    def managed_pid(self) -> Optional[int]:
        if self._process and self._process.poll() is None:
            return self._process.pid
        return None

    def tail_log(self, lines: int = 40) -> str:
        log_path = self.config.data_path / "hermes-gateway.log"
        if not log_path.exists():
            return ""
        try:
            content = log_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return ""
        return "\n".join(content.splitlines()[-lines:])


    # ------------------------------------------------------------------
    # Hermes'in kendi .env dosyası
    # ------------------------------------------------------------------
    @staticmethod
    def env_path() -> Path:
        raw = os.environ.get("HERMES_HOME", "").strip()
        base = Path(raw).expanduser() if raw else Path.home() / ".hermes"
        return base / ".env"

    @classmethod
    def write_env_var(cls, key: str, value: str) -> bool:
        """``~/.hermes/.env`` içindeki bir anahtarı günceller ya da ekler.

        Hermes bazı ayarları istek başına kabul etmiyor — ``max_tokens``
        bunlardan biri: API sunucusu istek gövdesinden yalnızca
        ``provider`` / ``model`` / ``model_options`` okuyor, token sınırını
        ``HERMES_MAX_TOKENS`` ortam değişkeninden çözüyor. Böyle ayarların
        tek yolu bu dosya; değişiklik gateway yeniden başlayınca geçerli olur.
        """
        if not key or "=" in key or any(ch in value for ch in "\r\n\x00"):
            return False

        path = cls.env_path()
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            lines = (
                path.read_text(encoding="utf-8", errors="ignore").splitlines()
                if path.exists()
                else []
            )
            prefix = f"{key}="
            replaced = False
            for index, line in enumerate(lines):
                if line.strip().startswith(prefix):
                    lines[index] = f"{key}={value}"
                    replaced = True
                    break
            if not replaced:
                lines.append(f"{key}={value}")

            path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            try:
                path.chmod(0o600)
            except OSError:
                pass
        except OSError as exc:
            logger.warning("Hermes .env yazılamadı: %s", exc)
            return False
        return True

    @staticmethod
    def _port_from_url(url: str) -> Optional[int]:
        try:
            from urllib.parse import urlparse

            return urlparse(url).port
        except Exception:
            return None
