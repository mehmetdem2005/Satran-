"""HermesForge yapılandırması.

Ayarlar üç katmandan okunur (sonraki öncekini ezer):

1. Dahili varsayılanlar
2. ``~/.hermesforge/config.json`` (veya ``HERMESFORGE_HOME``)
3. Ortam değişkenleri (``HERMESFORGE_*`` / ``API_SERVER_*``)

Hermes Agent'ın kendi ayarları ``~/.hermes/`` altında yaşar; burada sadece
o kuruluma nasıl bağlanacağımızı tutuyoruz.
"""

from __future__ import annotations

import json
import os
import secrets
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict


def _home() -> Path:
    raw = os.environ.get("HERMESFORGE_HOME", "").strip()
    if raw:
        return Path(raw).expanduser()
    return Path.home() / ".hermesforge"


def _hermes_home() -> Path:
    raw = os.environ.get("HERMES_HOME", "").strip()
    if raw:
        return Path(raw).expanduser()
    return Path.home() / ".hermes"


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on", "evet"}


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw.strip())
    except ValueError:
        return default


@dataclass
class Config:
    """Uygulamanın tüm çalışma zamanı ayarları."""

    # --- Hermes Agent API sunucusu -------------------------------------
    hermes_base_url: str = "http://127.0.0.1:8642"
    hermes_api_key: str = ""
    hermes_model: str = "hermes-agent"
    hermes_provider: str = ""
    hermes_timeout: int = 900
    hermes_connect_timeout: int = 5
    hermes_autostart: bool = True
    hermes_repo_dir: str = ""

    # --- Yedek (doğrudan sağlayıcı) ------------------------------------
    fallback_enabled: bool = True
    # Sağlayıcı ön ayarı: model listesi, düşünme düzeyleri ve token sınırı
    # buradan gelir (providers/presets.py — sağlayıcının kendi belgelerinden).
    fallback_preset: str = "deepseek"
    fallback_base_url: str = "https://api.deepseek.com"
    fallback_model: str = "deepseek-v4-flash"
    fallback_api_key: str = ""

    # --- Model davranışı ------------------------------------------------
    # Düşünme düzeyi Hermes'e her istekte model_options ile gider; geçerli
    # değerler Hermes'in _REASONING_EFFORTS kümesinden alınmıştır.
    # "default" = hiçbir şey gönderme, sunucunun kendi ayarı geçerli olsun.
    reasoning_effort: str = "default"
    # Hermes max_tokens'ı istek başına KABUL ETMİYOR (istek gövdesinden yalnız
    # provider/model/model_options okunuyor); bu değer yedek sağlayıcıya
    # doğrudan gider ve ~/.hermes/.env içine HERMES_MAX_TOKENS olarak yazılır.
    # DeepSeek V4 ailesi 384K çıktıya kadar çıkıyor.
    max_tokens: int = 32768
    # Yalnızca yedek sağlayıcıya, yalnızca düşünme kapalıyken gönderilir.
    temperature: float = 1.0
    top_p: float = 1.0

    # --- Depolama -------------------------------------------------------
    data_dir: str = ""
    workspace_dir: str = ""

    # --- Çalışma ortamı ---------------------------------------------------
    # "desktop" | "android" — arayüz buna göre kabuk komutu önerip önermeyeceğine
    # karar veriyor. APK'da android_main.py bunu "android" olarak kuruyor.
    platform: str = "desktop"

    # --- Sunucu ---------------------------------------------------------
    host: str = "127.0.0.1"
    port: int = 5000
    debug: bool = False

    # --- Pipeline -------------------------------------------------------
    # Aynı anda kaç ajan düğümü çalışabilir. Telefonda bellek ve eşzamanlı
    # bağlantı sınırlı olduğu için varsayılan düşük tutuldu.
    max_parallel_agents: int = 2
    rag_top_k: int = 6
    memory_top_k: int = 6

    extra: Dict[str, Any] = field(default_factory=dict)

    # -- türetilmiş yollar ----------------------------------------------
    @property
    def data_path(self) -> Path:
        return Path(self.data_dir).expanduser()

    @property
    def workspace_path(self) -> Path:
        return Path(self.workspace_dir).expanduser()

    @property
    def rag_db_path(self) -> Path:
        return self.data_path / "rag.sqlite3"

    @property
    def memory_db_path(self) -> Path:
        return self.data_path / "memory.sqlite3"

    @property
    def projects_path(self) -> Path:
        return self.workspace_path / "projects"

    @property
    def uploads_path(self) -> Path:
        return self.workspace_path / "uploads"

    def ensure_dirs(self) -> None:
        for path in (self.data_path, self.workspace_path, self.projects_path, self.uploads_path):
            path.mkdir(parents=True, exist_ok=True)

    def to_public_dict(self) -> Dict[str, Any]:
        """Tarayıcıya gönderilebilecek (gizli anahtarsız) görünüm."""
        data = asdict(self)
        for secret_key in ("hermes_api_key", "fallback_api_key"):
            data[secret_key] = bool(data.get(secret_key))
        data.pop("extra", None)
        return data


def _read_config_file(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    return raw if isinstance(raw, dict) else {}


def _read_hermes_env(path: Path) -> Dict[str, str]:
    """``~/.hermes/.env`` içinden API sunucusu anahtarlarını okur.

    Hermes'in kendi .env dosyası zaten API_SERVER_KEY'i tutuyor; kullanıcıyı
    aynı sırrı iki yere yazmaya zorlamıyoruz.
    """
    if not path.exists():
        return {}
    found: Dict[str, str] = {}
    try:
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            if key not in {"API_SERVER_KEY", "API_SERVER_ENABLED", "API_SERVER_PORT", "API_SERVER_HOST"}:
                continue
            value = value.strip().strip('"').strip("'")
            found[key] = value
    except OSError:
        return {}
    return found


def load_config() -> Config:
    home = _home()
    home.mkdir(parents=True, exist_ok=True)

    cfg = Config()
    cfg.data_dir = str(home / "data")
    cfg.workspace_dir = str(home / "workspace")

    # 2. katman: config.json
    for key, value in _read_config_file(home / "config.json").items():
        if hasattr(cfg, key) and value is not None:
            setattr(cfg, key, value)

    # 2.5 katman: Hermes'in kendi .env dosyası
    hermes_env = _read_hermes_env(_hermes_home() / ".env")
    if not cfg.hermes_api_key and hermes_env.get("API_SERVER_KEY"):
        cfg.hermes_api_key = hermes_env["API_SERVER_KEY"]
    if hermes_env.get("API_SERVER_PORT"):
        host = hermes_env.get("API_SERVER_HOST") or "127.0.0.1"
        cfg.hermes_base_url = f"http://{host}:{hermes_env['API_SERVER_PORT']}"

    # 3. katman: ortam değişkenleri
    env_map = {
        "hermes_base_url": "HERMESFORGE_HERMES_URL",
        "hermes_api_key": "API_SERVER_KEY",
        "hermes_model": "HERMESFORGE_HERMES_MODEL",
        "hermes_provider": "HERMESFORGE_HERMES_PROVIDER",
        "hermes_repo_dir": "HERMESFORGE_HERMES_REPO",
        "fallback_base_url": "HERMESFORGE_FALLBACK_URL",
        "fallback_model": "HERMESFORGE_FALLBACK_MODEL",
        "fallback_preset": "HERMESFORGE_FALLBACK_PRESET",
        "fallback_api_key": "HERMESFORGE_FALLBACK_KEY",
        "reasoning_effort": "HERMESFORGE_REASONING_EFFORT",
        "data_dir": "HERMESFORGE_DATA_DIR",
        "workspace_dir": "HERMESFORGE_WORKSPACE_DIR",
        "host": "HERMESFORGE_HOST",
    }
    for attr, env_name in env_map.items():
        raw = os.environ.get(env_name)
        if raw and raw.strip():
            setattr(cfg, attr, raw.strip())

    cfg.port = _env_int("HERMESFORGE_PORT", cfg.port)
    cfg.hermes_timeout = _env_int("HERMESFORGE_HERMES_TIMEOUT", cfg.hermes_timeout)
    cfg.max_tokens = _env_int("HERMESFORGE_MAX_TOKENS", cfg.max_tokens)
    cfg.platform = (os.environ.get("HERMESFORGE_PLATFORM") or cfg.platform).strip().lower()
    cfg.max_parallel_agents = max(1, min(_env_int("HERMESFORGE_MAX_PARALLEL", cfg.max_parallel_agents), 6))
    cfg.debug = _env_bool("HERMESFORGE_DEBUG", cfg.debug)
    cfg.hermes_autostart = _env_bool("HERMESFORGE_HERMES_AUTOSTART", cfg.hermes_autostart)
    cfg.fallback_enabled = _env_bool("HERMESFORGE_FALLBACK_ENABLED", cfg.fallback_enabled)

    if not cfg.fallback_api_key:
        cfg.fallback_api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()

    cfg.hermes_base_url = cfg.hermes_base_url.rstrip("/")
    cfg.fallback_base_url = cfg.fallback_base_url.rstrip("/")
    cfg.ensure_dirs()
    return cfg


def save_config(cfg: Config, updates: Dict[str, Any]) -> Config:
    """Kalıcı ayarları günceller ve diske yazar."""
    home = _home()
    home.mkdir(parents=True, exist_ok=True)
    path = home / "config.json"
    stored = _read_config_file(path)

    for key, value in updates.items():
        if not hasattr(cfg, key) or key == "extra":
            continue
        # Boş string gönderilen sır alanları "değiştirme" anlamına gelir.
        if key in {"hermes_api_key", "fallback_api_key"} and value == "":
            continue
        setattr(cfg, key, value)
        stored[key] = value

    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(stored, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)
    try:
        path.chmod(0o600)
    except OSError:
        pass
    cfg.ensure_dirs()
    return cfg


def generate_api_key() -> str:
    return "hf-" + secrets.token_urlsafe(24)
