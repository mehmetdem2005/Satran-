#!/usr/bin/env bash
# vendor/hermes-agent kaynağını üst akıştan günceller.
#
#   bash scripts/update_hermes.sh            # main'in son hâli
#   bash scripts/update_hermes.sh <commit>   # belirli bir sürüm
#
# Sanal ortam (venv/) korunur; yalnızca kaynak dosyalar değişir.
# Güncelleme sonrası vendor/README.md içindeki commit bilgisini tazeleyin.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$PROJECT_ROOT/vendor/hermes-agent"
ZIP_BASE="https://github.com/NousResearch/hermes-agent/archive"
REF="${1:-main}"

log() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mHATA:\033[0m %s\n' "$*" >&2; exit 1; }

[ -d "$VENDOR_DIR" ] || die "$VENDOR_DIR yok. Önce scripts/install_hermes.sh çalıştırın."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

log "Hermes kaynağı indiriliyor ($REF)…"
curl -fL --progress-bar "$ZIP_BASE/$REF.zip" -o "$TMP/hermes.zip" \
  || die "İndirilemedi: $ZIP_BASE/$REF.zip"

log "Arşiv açılıyor…"
python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" \
  "$TMP/hermes.zip" "$TMP/x"
SRC="$(find "$TMP/x" -maxdepth 1 -type d -name 'hermes-agent-*' | head -1)"
[ -n "$SRC" ] || die "Arşiv beklenen yapıda değil."

# Sanal ortamı koru: yalnızca kaynak dosyaları değiştiriyoruz.
log "Kaynak dosyalar değiştiriliyor (venv korunuyor)…"
find "$VENDOR_DIR" -mindepth 1 -maxdepth 1 \
  -not -name venv -not -name .venv -not -name node_modules \
  -exec rm -rf {} +
find "$SRC" -mindepth 1 -maxdepth 1 -exec mv {} "$VENDOR_DIR/" \;

VERSION="$(grep -m1 '^version' "$VENDOR_DIR/pyproject.toml" | cut -d'"' -f2 || echo '?')"
cat <<SUMMARY

  Hermes kaynağı güncellendi.
    Sürüm : $VERSION
    Referans: $REF

  Sırada:
    1) Bağımlılıkları tazele : bash scripts/install_hermes.sh
    2) vendor/README.md içindeki commit/sürüm bilgisini güncelle
    3) Değişikliği gözden geçir: git status vendor/

SUMMARY
