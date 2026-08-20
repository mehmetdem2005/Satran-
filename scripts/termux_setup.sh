#!/usr/bin/env bash
# Termux (Android) için tek komutluk kurulum.
#
#   pkg install -y git
#   git clone <bu-depo> && cd Satran-
#   bash scripts/termux_setup.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

log() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }

if [ -z "${PREFIX:-}" ]; then
  log "Bu betik Termux içindir. Masaüstünde: bash scripts/install_hermes.sh"
  exit 1
fi

log "Termux paketleri kuruluyor…"
pkg update -y
pkg install -y git python clang rust make pkg-config libffi openssl ripgrep

log "HermesForge bağımlılıkları…"
python -m pip install --upgrade pip wheel
python -m pip install -r requirements.txt

log "Hermes Agent kuruluyor (bu adım uzun sürebilir)…"
bash scripts/install_hermes.sh

log "Depolama izni (dosya indirmek için, isteğe bağlı)"
termux-setup-storage 2>/dev/null || true

cat <<'SUMMARY'

  Kurulum tamam.

  Başlat:
      bash scripts/start.sh

  Sonra Termux'ta tarayıcıyı aç:
      http://127.0.0.1:5000

  Model seçmediysen önce:
      vendor/hermes-agent/venv/bin/hermes model

SUMMARY
