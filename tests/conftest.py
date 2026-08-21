"""Test ortak altyapısı."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "backend"))


# Testler makinede ne çalıştığına bağlı olmamalı. Geliştirici makinesinde
# gerçek bir Hermes gateway 8642'de duruyor olabilir; testler ona bağlanırsa
# "motor yok" senaryoları sessizce yeşile döner ve hiçbir şey doğrulamaz.
UNUSED_PORT_URL = "http://127.0.0.1:9"


@pytest.fixture(autouse=True)
def izole_ortam(tmp_path, monkeypatch):
    """Her test kendi yapılandırmasıyla ve erişilemez bir Hermes ile başlar."""
    monkeypatch.setenv("HERMESFORGE_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("HERMESFORGE_HERMES_AUTOSTART", "false")
    monkeypatch.setenv("HERMESFORGE_HERMES_URL", UNUSED_PORT_URL)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes-home"))
    for leaked in ("API_SERVER_KEY", "DEEPSEEK_API_KEY", "HERMESFORGE_FALLBACK_KEY",
                   "HERMESFORGE_HERMES_REPO", "HERMES_REPO"):
        monkeypatch.delenv(leaked, raising=False)


@pytest.fixture()
def tmp_config():
    """Yalıtılmış ortamdan yüklenmiş yapılandırma."""
    import config as config_module

    return config_module.load_config()


@pytest.fixture()
def store(tmp_path):
    from forge.artifacts import ArtifactStore

    return ArtifactStore(tmp_path / "projects")


@pytest.fixture()
def rag(tmp_path):
    from hermes.rag import HermesRag

    return HermesRag(tmp_path / "rag.sqlite3", workspace_dir=tmp_path / "ws")


@pytest.fixture()
def memory(tmp_path):
    from hermes.memory import HermesMemory

    return HermesMemory(tmp_path / "memory.sqlite3")
