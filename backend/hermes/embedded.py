"""APK'nın içindeki Hermes gateway'ini başlatır.

Hermes normalde ayrı bir makinede, kendi sanal ortamında çalışıyor. Telefonda
öyle bir makine yok; bu modül Hermes'in gateway'ini **aynı süreçte, ayrı bir
iş parçacığında** ayağa kaldırıyor, böylece uygulama tek başına çalışıyor.

Nasıl mümkün oldu (ölçülen, varsayılan değil):

* ``pydantic-core`` Android için hazır paket olarak yok; NDK ile çapraz
  derlendi (``android/wheels/``).
* ``jiter`` de yok; openai SDK'sı onu tek bir yerde kullanıyor
  (``from jiter import from_json``), yerine saf Python bir gölge paket kondu.
* ``uvloop``, ``httptools``, ``watchfiles`` ve ``nemo_relay`` hiç gerekmiyor —
  gateway bunlar olmadan da açılıyor.

Bu kümeyle Hermes 0.20.4'ün gateway'i masaüstünde tam bir ajan turu
tamamladı. Telefonda çalıştığı **doğrulanamadı** (bu ortamda emülatör yok);
başlatma başarısız olursa uygulama ağdaki bir Hermes'e bağlanma yoluna
düşüyor ve kullanıcıya sebebini söylüyor.
"""

from __future__ import annotations

import logging
import os
import secrets
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

DEFAULT_PORT = 8642
#: Kaç katman derin ajan alınabilir (1 = düz kadro, 2 = yönetici→uzman, 3+ daha derin).
DEFAULT_SPAWN_DEPTH = 4
#: Aynı anda kaç çocuk ajan çalışabilir. Telefonda maliyet sınırı token, CPU değil.
DEFAULT_CONCURRENT_CHILDREN = 6
# Anahtar Hermes'in kendi eşiğini geçmeli: gateway/config.py 16 karakterden
# kısa anahtarla API sunucusunu hiç açmıyor ve sebebini de söylemiyor.
_MIN_KEY_LENGTH = 16

_state: Dict[str, Any] = {
    "started": False,
    "port": 0,
    "key": "",
    "error": "",
    "thread": None,
}


def _write_env(env_path: Path, values: Dict[str, str]) -> None:
    """``~/.hermes/.env`` dosyasını günceller; var olan satırları korur."""
    existing: Dict[str, str] = {}
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            existing[key.strip()] = value.strip()

    existing.update(values)
    env_path.parent.mkdir(parents=True, exist_ok=True)
    env_path.write_text(
        "\n".join(f"{key}={value}" for key, value in existing.items()) + "\n",
        encoding="utf-8",
    )
    try:
        env_path.chmod(0o600)
    except OSError:
        pass


def ensure_key(hermes_home: Path) -> str:
    """Gateway anahtarını okur, yoksa üretir."""
    env_path = hermes_home / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("API_SERVER_KEY="):
                key = line.partition("=")[2].strip().strip('"').strip("'")
                if len(key) >= _MIN_KEY_LENGTH:
                    return key
    key = "hf-" + secrets.token_urlsafe(24)
    _write_env(env_path, {"API_SERVER_KEY": key})
    return key


def configure(hermes_home: Path, port: int = DEFAULT_PORT) -> str:
    """Gateway'i telefonda çalışacak şekilde ayarlar; anahtarı döndürür."""
    hermes_home.mkdir(parents=True, exist_ok=True)
    key = ensure_key(hermes_home)
    _write_env(
        hermes_home / ".env",
        {
            "API_SERVER_ENABLED": "true",
            # Telefondaki gateway'i dışarı açmıyoruz: yalnızca uygulamanın
            # kendisi bağlanacak.
            "API_SERVER_HOST": "127.0.0.1",
            "API_SERVER_PORT": str(port),
        },
    )
    return key


def health(port: int = DEFAULT_PORT, timeout: float = 2.0) -> bool:
    import requests

    try:
        response = requests.get(f"http://127.0.0.1:{port}/health", timeout=timeout)
        return response.status_code < 400
    except requests.exceptions.RequestException:
        return False


def _run_gateway() -> None:
    """Gateway'in kendi giriş noktasını çağırır."""
    try:
        from gateway.run import main as gateway_main
    except Exception as exc:
        _state["error"] = f"Hermes gateway içe aktarılamadı: {type(exc).__name__}: {exc}"
        logger.exception("Hermes gateway içe aktarılamadı")
        return

    try:
        gateway_main()
    except SystemExit:
        pass
    except Exception as exc:
        _state["error"] = f"Hermes gateway çöktü: {type(exc).__name__}: {exc}"
        logger.exception("Hermes gateway çöktü")


def start(hermes_home: Path, port: int = DEFAULT_PORT, timeout: float = 90.0) -> Dict[str, Any]:
    """Gömülü gateway'i başlatır ve hazır olmasını bekler."""
    if _state["started"] and health(port):
        return dict(_state)

    if health(port):
        # Zaten çalışıyor (uygulama yeniden açıldı, süreç yaşıyor).
        _state.update(started=True, port=port, key=ensure_key(hermes_home), error="")
        return dict(_state)

    try:
        key = configure(hermes_home, port)
    except OSError as exc:
        _state["error"] = f"Hermes ayarları yazılamadı: {exc}"
        return dict(_state)

    os.environ["HERMES_HOME"] = str(hermes_home)
    os.environ.setdefault("API_SERVER_KEY", key)
    os.environ.setdefault("API_SERVER_ENABLED", "true")
    os.environ.setdefault("API_SERVER_HOST", "127.0.0.1")
    os.environ.setdefault("API_SERVER_PORT", str(port))

    thread = threading.Thread(target=_run_gateway, name="hermes-gateway", daemon=True)
    thread.start()
    _state["thread"] = thread

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if health(port):
            _state.update(started=True, port=port, key=key, error="")
            logger.info("Gömülü Hermes gateway hazır (port %s)", port)
            return dict(_state)
        if not thread.is_alive():
            break
        time.sleep(1.0)

    if not _state["error"]:
        _state["error"] = (
            f"Gömülü Hermes {int(timeout)} saniyede açılmadı."
        )
    logger.warning("Gömülü Hermes başlatılamadı: %s", _state["error"])
    return dict(_state)


def status() -> Dict[str, Any]:
    data = {key: value for key, value in _state.items() if key != "thread"}
    data["running"] = bool(_state["started"]) and health(_state["port"] or DEFAULT_PORT)
    return data


def available() -> bool:
    """Hermes kaynağı bu yapıda paketlenmiş mi?"""
    try:
        import gateway.run  # noqa: F401
    except Exception:
        return False
    return True


def last_error() -> str:
    return str(_state["error"])


def model_configured(hermes_home: Optional[Path] = None) -> bool:
    """Hermes'te bir model sağlayıcısı seçilmiş mi?"""
    home = hermes_home or Path(os.environ.get("HERMES_HOME", "~/.hermes")).expanduser()
    config_path = home / "config.yaml"
    if not config_path.exists():
        return False
    try:
        import yaml

        data = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    except Exception:
        return False
    model = data.get("model") if isinstance(data, dict) else None
    return bool(isinstance(model, dict) and (model.get("default") or model.get("model")))


def current_model(hermes_home: Optional[Path] = None) -> Dict[str, str]:
    """Hermes'te seçili model ve sağlayıcı.

    Düşünme düzeyi listesi buna göre kuruluyor: Hermes'in iç merdiveni her
    sağlayıcıda geçerli değil, telde kırpılıyor. Kullanıcıya sağlayıcısının
    gerçekten kabul ettiği düzeyleri göstermeliyiz.
    """
    home = hermes_home or Path(os.environ.get("HERMES_HOME", "~/.hermes")).expanduser()
    config_path = home / "config.yaml"
    if not config_path.exists():
        return {"provider": "", "model": ""}
    try:
        import yaml

        data = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    except Exception:
        return {"provider": "", "model": ""}

    model_block = data.get("model") if isinstance(data, dict) else None
    if not isinstance(model_block, dict):
        return {"provider": "", "model": ""}
    return {
        "provider": str(model_block.get("provider") or "").strip().lower(),
        "model": str(model_block.get("default") or model_block.get("model") or "").strip(),
    }


def set_delegation(depth: int, concurrent: int, hermes_home: Optional[Path] = None) -> None:
    """Ekip derinliğini ve aynı anda çalışacak ajan sayısını yazar."""
    home = hermes_home or Path(os.environ.get("HERMES_HOME", "~/.hermes")).expanduser()
    home.mkdir(parents=True, exist_ok=True)

    import yaml

    config_path = home / "config.yaml"
    data: Dict[str, Any] = {}
    if config_path.exists():
        try:
            loaded = yaml.safe_load(config_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data = loaded
        except Exception:
            data = {}

    delegation = data.get("delegation")
    if not isinstance(delegation, dict):
        delegation = {}
    delegation["max_spawn_depth"] = max(1, int(depth))
    delegation["max_concurrent_children"] = max(1, int(concurrent))
    delegation["orchestrator_enabled"] = True
    data["delegation"] = delegation

    config_path.write_text(
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8"
    )
    try:
        config_path.chmod(0o600)
    except OSError:
        pass


def current_delegation(hermes_home: Optional[Path] = None) -> Dict[str, int]:
    """Kayıtlı ekip ayarları (arayüz bunları gösteriyor)."""
    home = hermes_home or Path(os.environ.get("HERMES_HOME", "~/.hermes")).expanduser()
    config_path = home / "config.yaml"
    depth, concurrent = DEFAULT_SPAWN_DEPTH, DEFAULT_CONCURRENT_CHILDREN
    if config_path.exists():
        try:
            import yaml

            data = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
            block = data.get("delegation") if isinstance(data, dict) else None
            if isinstance(block, dict):
                depth = int(block.get("max_spawn_depth") or depth)
                concurrent = int(block.get("max_concurrent_children") or concurrent)
        except Exception:
            pass
    return {"max_spawn_depth": depth, "max_concurrent_children": concurrent}


def set_model(api_key: str, model: str = "deepseek-v4-pro",
              hermes_home: Optional[Path] = None) -> None:
    """Model sağlayıcısını yazar (telefonda ``hermes model`` TUI'si yok).

    Sağlayıcı kimliği ve anahtar değişkeni Hermes'in kendi
    ``hermes_cli/auth.py`` dosyasındaki ProviderConfig kaydından alındı.
    """
    home = hermes_home or Path(os.environ.get("HERMES_HOME", "~/.hermes")).expanduser()
    home.mkdir(parents=True, exist_ok=True)

    import yaml

    config_path = home / "config.yaml"
    data: Dict[str, Any] = {}
    if config_path.exists():
        try:
            loaded = yaml.safe_load(config_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data = loaded
        except Exception:
            data = {}

    model_block = data.get("model")
    if not isinstance(model_block, dict):
        model_block = {}
    model_block["default"] = model
    model_block["provider"] = "deepseek"
    data["model"] = model_block

    # Ekibi Hermes kuruyor; iç içe ajan almasına izin veren ayarlar bunlar.
    # Varsayılan max_spawn_depth=1 DÜZ bir kadro demek — yöneticiler kendi
    # altına ajan alamaz. Anahtar adları Hermes'in kendi
    # hermes_cli/config_defaults.py dosyasından.
    delegation = data.get("delegation")
    if not isinstance(delegation, dict):
        delegation = {}
    delegation.setdefault("max_spawn_depth", DEFAULT_SPAWN_DEPTH)
    delegation.setdefault("max_concurrent_children", DEFAULT_CONCURRENT_CHILDREN)
    delegation["orchestrator_enabled"] = True
    data["delegation"] = delegation

    config_path.write_text(
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8"
    )
    try:
        config_path.chmod(0o600)
    except OSError:
        pass

    _write_env(home / ".env", {"DEEPSEEK_API_KEY": api_key})
