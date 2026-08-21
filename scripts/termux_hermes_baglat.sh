#!/usr/bin/env bash
# Termux'ta Hermes'i kurar, DeepSeek'e bağlar, başlatır ve HermesForge
# uygulamasını kendisi ayarlar. Kullanıcının tek yapması gereken:
#
#   bash scripts/termux_hermes_baglat.sh
#
# Betik sonunda uygulamayı açar; adres ve anahtar otomatik girilir.
# Anahtarı elle kopyalaman gerekmez.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

HERMES_ENV="${HERMES_HOME:-$HOME/.hermes}/.env"
HERMES_CONFIG="${HERMES_HOME:-$HOME/.hermes}/config.yaml"
VENDOR_DIR="$PROJECT_ROOT/vendor/hermes-agent"
GATEWAY_LOG="$HOME/.hermes/gateway.log"
APP_ID="com.hermesforge.app"

log()  { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mHATA:\033[0m %s\n' "$*" >&2; exit 1; }

[ -n "${PREFIX:-}" ] || die "Bu betik Termux içindir."

# ------------------------------------------------------------- 1. paketler
log "Termux paketleri kontrol ediliyor…"
need_pkg=""
for pkg in git python clang rust make pkg-config libffi openssl ripgrep; do
  command -v "${pkg%%-*}" >/dev/null 2>&1 || need_pkg="$need_pkg $pkg"
done
if [ -n "$need_pkg" ]; then
  pkg install -y $need_pkg || die "Paketler kurulamadı."
fi
ok "paketler hazır"

# --------------------------------------------------------------- 2. Hermes
if [ ! -x "$VENDOR_DIR/venv/bin/hermes" ]; then
  log "Hermes Agent kuruluyor (bu adım uzun sürer, sabırlı ol)…"
  bash "$PROJECT_ROOT/scripts/install_hermes.sh" || die "Hermes kurulumu başarısız."
else
  ok "Hermes zaten kurulu"
fi
HERMES_BIN="$VENDOR_DIR/venv/bin/hermes"
[ -x "$HERMES_BIN" ] || die "hermes çalıştırılabilir dosyası bulunamadı."

# ------------------------------------------------- 3. model sağlayıcısı
# Hermes'in bir modele ihtiyacı var. DeepSeek OpenAI uyumlu olduğu için
# Hermes'in "custom" sağlayıcısıyla doğrudan bağlanıyoruz — böylece
# etkileşimli 'hermes model' sihirbazına girmeye gerek kalmıyor.
DEEPSEEK_KEY="${DEEPSEEK_API_KEY:-}"
if grep -q '^api_key:' "$HERMES_CONFIG" 2>/dev/null; then
  ok "Hermes'in model sağlayıcısı zaten ayarlı"
else
  if [ -z "$DEEPSEEK_KEY" ]; then
    printf '\n  DeepSeek API anahtarın (platform.deepseek.com → API keys)\n'
    printf '  Not: anahtar yalnızca bu telefonda, %s dosyasında saklanır.\n' "$HERMES_CONFIG"
    printf '  Anahtar: '
    read -r DEEPSEEK_KEY
  fi
  [ -n "$DEEPSEEK_KEY" ] || die "Anahtar girilmedi."

  DEEPSEEK_MODEL="${DEEPSEEK_MODEL:-deepseek-v4-pro}"
  mkdir -p "$(dirname "$HERMES_CONFIG")"
  cat > "$HERMES_CONFIG" <<YAML
model:
  default: "$DEEPSEEK_MODEL"
  provider: "custom"
  base_url: "https://api.deepseek.com"
  api_key: "$DEEPSEEK_KEY"
YAML
  chmod 600 "$HERMES_CONFIG" 2>/dev/null || true
  ok "Hermes $DEEPSEEK_MODEL modeline bağlandı"
fi

# ------------------------------------------------------- 4. API sunucusu
mkdir -p "$(dirname "$HERMES_ENV")"
touch "$HERMES_ENV"; chmod 600 "$HERMES_ENV" 2>/dev/null || true
grep -q '^API_SERVER_ENABLED=' "$HERMES_ENV" || echo 'API_SERVER_ENABLED=true' >> "$HERMES_ENV"
if ! grep -q '^API_SERVER_KEY=' "$HERMES_ENV"; then
  echo "API_SERVER_KEY=hf-$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')" >> "$HERMES_ENV"
fi
API_KEY="$(grep '^API_SERVER_KEY=' "$HERMES_ENV" | head -1 | cut -d= -f2-)"
[ -n "$API_KEY" ] || die "API_SERVER_KEY okunamadı."
ok "API sunucusu anahtarı hazır"

# ---------------------------------------------------------- 5. gateway
if curl -sf -m 3 http://127.0.0.1:8642/health >/dev/null 2>&1; then
  ok "gateway zaten çalışıyor"
else
  log "Hermes gateway başlatılıyor…"
  # Termux'ta oturum kapansa da ayakta kalsın diye nohup + setsid.
  nohup setsid "$HERMES_BIN" gateway > "$GATEWAY_LOG" 2>&1 < /dev/null &
  for _ in $(seq 1 60); do
    sleep 2
    curl -sf -m 3 http://127.0.0.1:8642/health >/dev/null 2>&1 && break
  done
  curl -sf -m 3 http://127.0.0.1:8642/health >/dev/null 2>&1 \
    || die "Gateway açılmadı. Kayıt: $GATEWAY_LOG"
  ok "gateway ayakta (kayıt: $GATEWAY_LOG)"
fi

# ------------------------------------------- 6. uygulamayı kendisi ayarla
# Adresi ve anahtarı kullanıcıya yazdırmak yerine uygulamaya derin
# bağlantıyla devrediyoruz.
LINK="hermesforge://connect?url=http%3A%2F%2F127.0.0.1%3A8642&key=$(
  python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$API_KEY"
)"

log "HermesForge ayarlanıyor…"
if am start -a android.intent.action.VIEW -d "$LINK" -n "$APP_ID/.MainActivity" >/dev/null 2>&1 \
   || am start -a android.intent.action.VIEW -d "$LINK" >/dev/null 2>&1; then
  ok "uygulama açıldı ve kendini ayarladı"
  cat <<'SUMMARY'

  Hazır. Uygulamada motor rozeti "Hermes Agent" yazıyorsa her şey bağlandı.

  Gateway arka planda çalışıyor. Telefon yeniden başlarsa bu betiği tekrar
  çalıştırman yeterli — kurulu olanı atlayıp yalnızca gateway'i açar.

SUMMARY
else
  # am başarısız olursa (nadiren) kullanıcıya bağlantıyı verelim.
  cat <<SUMMARY

  Uygulama otomatik açılamadı. Şu komutu çalıştır:

      am start -a android.intent.action.VIEW -d "$LINK"

  Ya da uygulamada Ayarlar → Hermes Agent:
      Adres  : http://127.0.0.1:8642
      Anahtar: $API_KEY

SUMMARY
fi
