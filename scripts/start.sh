#!/usr/bin/env bash
# HermesForge'u başlatır. Hermes gateway kapalıysa uygulama onu kendisi
# başlatmayı dener (HERMESFORGE_HERMES_AUTOSTART=false ile kapatılabilir).

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

PORT="${HERMESFORGE_PORT:-5000}"
HOST="${HERMESFORGE_HOST:-127.0.0.1}"

if [ -d "$PROJECT_ROOT/.venv" ]; then
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.venv/bin/activate"
fi

python3 -c 'import flask' 2>/dev/null || {
  echo "==> Bağımlılıklar kuruluyor…"
  python3 -m pip install -r requirements.txt
}

echo "==> HermesForge:  http://$HOST:$PORT"
echo "    (telefonda tarayıcıda aç; durdurmak için Ctrl+C)"
exec python3 run.py
