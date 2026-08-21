#!/usr/bin/env bash
# Hermes Agent'ı (NousResearch/hermes-agent) indirir, kurar ve API sunucusunu
# HermesForge'a bağlar.
#
#   bash scripts/install_hermes.sh            # tam depoyu indir + kur
#   bash scripts/install_hermes.sh --no-deps  # yalnızca kaynağı indir
#   bash scripts/install_hermes.sh --zip      # git yerine zip arşivini kullan
#
# Depo, projenin içindeki vendor/hermes-agent klasörüne açılır. Orası
# .gitignore'da: Hermes ~176 MB'lık bir monorepo, kendi sürüm geçmişiyle
# birlikte bu depoya kopyalanmaz — burada onun bir kurulumunu tutuyoruz.

set -euo pipefail

REPO_URL="https://github.com/NousResearch/hermes-agent.git"
ZIP_URL="https://github.com/NousResearch/hermes-agent/archive/refs/heads/main.zip"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="${HERMES_REPO:-$PROJECT_ROOT/vendor/hermes-agent}"
HERMES_ENV_DIR="${HERMES_HOME:-$HOME/.hermes}"

USE_ZIP=0
INSTALL_DEPS=1
for arg in "$@"; do
  case "$arg" in
    --zip) USE_ZIP=1 ;;
    --no-deps) INSTALL_DEPS=0 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "Bilinmeyen seçenek: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mHATA:\033[0m %s\n' "$*" >&2; exit 1; }

is_termux() { [ -n "${PREFIX:-}" ] && [ -d "/data/data/com.termux/files/usr" ]; }

# ---------------------------------------------------------------- 1. kaynak

fetch_with_git() {
  if [ -d "$VENDOR_DIR/.git" ]; then
    log "Mevcut kurulum güncelleniyor: $VENDOR_DIR"
    git -C "$VENDOR_DIR" fetch --depth 1 origin main
    git -C "$VENDOR_DIR" reset --hard origin/main
  else
    log "Hermes Agent klonlanıyor → $VENDOR_DIR"
    mkdir -p "$(dirname "$VENDOR_DIR")"
    git clone --depth 1 "$REPO_URL" "$VENDOR_DIR"
  fi
}

fetch_with_zip() {
  local tmp
  tmp="$(mktemp -d)"
  log "Hermes Agent zip arşivi indiriliyor…"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --progress-bar "$ZIP_URL" -o "$tmp/hermes.zip"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --show-progress -O "$tmp/hermes.zip" "$ZIP_URL"
  else
    die "curl veya wget gerekli."
  fi

  log "Arşiv açılıyor…"
  if command -v unzip >/dev/null 2>&1; then
    unzip -q "$tmp/hermes.zip" -d "$tmp/extract"
  else
    python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" \
      "$tmp/hermes.zip" "$tmp/extract"
  fi

  rm -rf "$VENDOR_DIR"
  mkdir -p "$(dirname "$VENDOR_DIR")"
  mv "$tmp/extract/hermes-agent-main" "$VENDOR_DIR"
  rm -rf "$tmp"
}

if [ "$USE_ZIP" -eq 1 ] || ! command -v git >/dev/null 2>&1; then
  fetch_with_zip
else
  fetch_with_git
fi

[ -f "$VENDOR_DIR/pyproject.toml" ] || die "Kurulum doğrulanamadı: $VENDOR_DIR/pyproject.toml yok."
log "Kaynak hazır: $VENDOR_DIR"

# ------------------------------------------------------------ 2. bağımlılık

if [ "$INSTALL_DEPS" -eq 1 ]; then
  command -v python3 >/dev/null 2>&1 || die "python3 bulunamadı."

  if [ ! -d "$VENDOR_DIR/venv" ]; then
    log "Sanal ortam oluşturuluyor…"
    python3 -m venv "$VENDOR_DIR/venv"
  fi
  # shellcheck disable=SC1091
  source "$VENDOR_DIR/venv/bin/activate"
  python -m pip install --upgrade pip setuptools wheel >/dev/null

  cd "$VENDOR_DIR"
  if is_termux; then
    # Android'de yalnızca .[termux] paketi test edilmiş durumda; .[all]
    # ctranslate2 üzerinden çöker (Android wheel'i yok).
    export ANDROID_API_LEVEL="$(getprop ro.build.version.sdk 2>/dev/null || echo 34)"
    log "Termux tespit edildi — .[termux] paketi kuruluyor (ANDROID_API_LEVEL=$ANDROID_API_LEVEL)"
    python -m pip install -e '.[termux]' -c constraints-termux.txt \
      || { log ".[termux] başarısız, çekirdek kuruluma düşülüyor"; \
           python -m pip install -e '.' -c constraints-termux.txt; }
  else
    log "Hermes kuruluyor…"
    python -m pip install -e '.' || die "Hermes kurulumu başarısız."
  fi

  # aiohttp, Hermes'in ilan edilen bağımlılıkları arasında DEĞİL; ama OpenAI
  # uyumlu API sunucusu (gateway/platforms/api_server.py) onsuz hiç açılmıyor
  # — HermesForge'un bağlandığı tek yüzey de o. Sessizce geçersek kullanıcı
  # "Hermes'e ulaşılamıyor" hatasını görür ve sebebini asla bulamaz.
  if ! python -c 'import aiohttp' 2>/dev/null; then
    log "API sunucusu için aiohttp kuruluyor…"
    python -m pip install aiohttp \
      || die "aiohttp kurulamadı. Hermes'in API sunucusu onsuz açılmaz; \
elle deneyin: $VENDOR_DIR/venv/bin/pip install aiohttp"
  fi
  python -c 'import aiohttp' 2>/dev/null \
    || die "aiohttp içe aktarılamıyor — API sunucusu çalışmayacak."
  log "API sunucusu gereksinimleri tamam."

  deactivate
  cd "$PROJECT_ROOT"
fi

# --------------------------------------------------- 3. API sunucusu ayarı

mkdir -p "$HERMES_ENV_DIR"
ENV_FILE="$HERMES_ENV_DIR/.env"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE" 2>/dev/null || true

set_env_var() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    return 0  # kullanıcının mevcut değerini ezme
  fi
  printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  log "$ENV_FILE içine $key yazıldı."
}

set_env_var API_SERVER_ENABLED true
if ! grep -q "^API_SERVER_KEY=" "$ENV_FILE" 2>/dev/null; then
  GENERATED_KEY="$(python3 -c 'import secrets; print("hf-" + secrets.token_urlsafe(24))')"
  printf 'API_SERVER_KEY=%s\n' "$GENERATED_KEY" >> "$ENV_FILE"
  log "Yeni API_SERVER_KEY üretildi (HermesForge bunu otomatik okur)."
fi

# ------------------------------------------------------------------ 4. özet

cat <<SUMMARY

  Hermes Agent kuruldu.

    Kaynak      : $VENDOR_DIR
    Ayarlar     : $ENV_FILE
    API sunucusu: http://127.0.0.1:8642

  Sırada:
    1) Bir model sağlayıcısı seç:   $VENDOR_DIR/venv/bin/hermes model
    2) HermesForge'u başlat:        bash scripts/start.sh

  HermesForge açılışta gateway'i kendisi başlatır; elle başlatmak istersen:
    $VENDOR_DIR/venv/bin/hermes gateway

SUMMARY
