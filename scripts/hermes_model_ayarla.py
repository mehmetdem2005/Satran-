#!/usr/bin/env python3
"""Hermes'in ``~/.hermes/config.yaml`` dosyasına model bloğunu yazar.

Neden ayrı bir dosya: ``hermes model`` etkileşimli bir TUI. Kurulumun tek
komut olması için yapılandırmayı doğrudan yazıyoruz. Sağlayıcı kimliği
(``deepseek``) ve anahtar değişkeni (``DEEPSEEK_API_KEY``) Hermes'in kendi
``hermes_cli/auth.py`` dosyasındaki ProviderConfig kaydından alındı.

Bu betik Hermes'in sanal ortamındaki python ile çalıştırılır (yaml oradan
gelir). Kullanıcının başka ayarlarını ezmez; yalnızca ``model`` bloğunu
yerine koyar.

    python hermes_model_ayarla.py --kontrol --config ~/.hermes/config.yaml
    python hermes_model_ayarla.py --config ~/.hermes/config.yaml --model deepseek-v4-pro
"""

from __future__ import annotations

import argparse
import pathlib
import sys

import yaml

PROVIDER = "deepseek"


def read_config(path: pathlib.Path) -> dict:
    if not path.exists():
        return {}
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def is_configured(data: dict) -> bool:
    model = data.get("model")
    if not isinstance(model, dict):
        return False
    return bool(model.get("default") or model.get("model"))


def write_model(path: pathlib.Path, model_name: str) -> None:
    data = read_config(path)
    model = data.get("model")
    if not isinstance(model, dict):
        model = {}
    model["default"] = model_name
    model["provider"] = PROVIDER
    data["model"] = model

    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".yaml.tmp")
    tmp.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")
    tmp.replace(path)
    try:
        path.chmod(0o600)   # anahtar burada değil ama ayarlar da özeldir
    except OSError:
        pass


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--model", default="deepseek-v4-pro")
    parser.add_argument("--kontrol", action="store_true",
                        help="Yalnızca ayarlı mı diye bak (0 = ayarlı)")
    args = parser.parse_args(argv)

    path = pathlib.Path(args.config).expanduser()
    if args.kontrol:
        return 0 if is_configured(read_config(path)) else 1

    write_model(path, args.model)
    print(f"model.default={args.model} provider={PROVIDER}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
