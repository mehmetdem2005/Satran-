#!/usr/bin/env bash
# Hermes'i bu bilgisayarda başlatır ve telefonun okutacağı QR kodu basar.
#
#   bash scripts/hermes_sunucu.sh
#
# HermesForge APK'sı Hermes olmadan iş üretmez: tüm ajanlar, araçlar ve
# beceriler Hermes tarafında çalışır. Bu betik o tarafı ayağa kaldırır:
#
#   1) Hermes kurulu değilse kurar (scripts/install_hermes.sh)
#   2) API sunucusunu ev ağına açar (API_SERVER_HOST=0.0.0.0)
#   3) Gateway'i başlatır ve hazır olmasını bekler
#   4) hermesforge://connect bağlantısını QR kod olarak basar
#
# Telefon kamerasıyla QR'ı okut; uygulama adresi ve anahtarı kendisi yazar.
# Bu makine açık kaldığı ve telefonla aynı ağda olduğu sürece çalışır.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="${HERMES_REPO:-$PROJECT_ROOT/vendor/hermes-agent}"
HERMES_ENV_DIR="${HERMES_HOME:-$HOME/.hermes}"
ENV_FILE="$HERMES_ENV_DIR/.env"
PORT="${API_SERVER_PORT:-8642}"
LOG_FILE="$HERMES_ENV_DIR/gateway.log"

log()  { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;35m!!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mHATA:\033[0m %s\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------ 1. kurulum

if [ ! -x "$VENDOR_DIR/venv/bin/hermes" ]; then
  log "Hermes kurulu değil, kuruluyor…"
  bash "$PROJECT_ROOT/scripts/install_hermes.sh"
fi
[ -x "$VENDOR_DIR/venv/bin/hermes" ] || die "Hermes kurulamadı: $VENDOR_DIR/venv/bin/hermes yok."

# ------------------------------------------------------- 2. ağ ayarları

mkdir -p "$HERMES_ENV_DIR"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE" 2>/dev/null || true

# Bu iki değer için kullanıcının eski ayarını EZİYORUZ: 127.0.0.1'e bağlı bir
# gateway'i telefon göremez ve hata "bağlanamadı" diye görünür, sebebi
# görünmez. Diğer değerlere dokunmuyoruz.
force_env_var() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    local current
    current="$(grep "^${key}=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"'"'"'')"
    [ "$current" = "$value" ] && return 0
    # Yerinde düzenleme: sed -i taşınabilir değil, geçici dosyayla yapıyoruz.
    grep -v "^${key}=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
    mv "$ENV_FILE.tmp" "$ENV_FILE"
  fi
  printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE" 2>/dev/null || true
}

force_env_var API_SERVER_ENABLED true
force_env_var API_SERVER_HOST 0.0.0.0
force_env_var API_SERVER_PORT "$PORT"

if ! grep -q "^API_SERVER_KEY=" "$ENV_FILE" 2>/dev/null; then
  GENERATED="$(python3 -c 'import secrets; print("hf-" + secrets.token_urlsafe(24))')"
  printf 'API_SERVER_KEY=%s\n' "$GENERATED" >> "$ENV_FILE"
  log "Yeni API_SERVER_KEY üretildi."
fi
API_KEY="$(grep "^API_SERVER_KEY=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"'"'"'')"
[ -n "$API_KEY" ] || die "API_SERVER_KEY okunamadı: $ENV_FILE"

# ------------------------------------------------- 3. model sağlayıcısı

# Model anahtarı artık Hermes tarafında yaşıyor; telefonda hiçbir sağlayıcı
# anahtarı tutulmuyor. Yapılandırılmamışsa ajanlar ilk turda hata verir.
if [ ! -f "$HERMES_ENV_DIR/config.yaml" ]; then
  warn "Hermes'te henüz bir model sağlayıcısı seçilmemiş."
  warn "Şimdi seç:  $VENDOR_DIR/venv/bin/hermes model"
  warn "Sonra bu betiği yeniden çalıştır."
fi

# ------------------------------------------------------- 4. gateway başlat

healthy() { curl -fsS -m 3 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; }

STARTED_HERE=0
if healthy; then
  log "Gateway zaten çalışıyor (port $PORT)."
else
  log "Gateway başlatılıyor… (günlük: $LOG_FILE)"
  "$VENDOR_DIR/venv/bin/hermes" gateway >>"$LOG_FILE" 2>&1 &
  GATEWAY_PID=$!
  STARTED_HERE=1
  for _ in $(seq 1 60); do
    healthy && break
    kill -0 "$GATEWAY_PID" 2>/dev/null || die "Gateway çöktü. Günlük: $LOG_FILE"
    sleep 1
  done
  healthy || die "Gateway 60 saniyede açılmadı. Günlük: $LOG_FILE"
  log "Gateway hazır (pid $GATEWAY_PID)."
fi

cleanup() {
  if [ "$STARTED_HERE" -eq 1 ] && kill -0 "${GATEWAY_PID:-0}" 2>/dev/null; then
    log "Gateway durduruluyor…"
    kill "$GATEWAY_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# --------------------------------------------------------- 5. adres ve QR

lan_ip() {
  # Varsayılan rotanın çıktığı arayüzün adresi: telefonun göreceği adres bu.
  if command -v ip >/dev/null 2>&1; then
    ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}'
  fi
}

IP="$(lan_ip || true)"
if [ -z "${IP:-}" ] && command -v hostname >/dev/null 2>&1; then
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
if [ -z "${IP:-}" ]; then
  IP="$(python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(('1.1.1.1', 80))
    print(s.getsockname()[0])
except OSError:
    print('')
finally:
    s.close()
")"
fi
[ -n "$IP" ] || die "Bu makinenin ev ağı adresi bulunamadı; adresi elle gir."

BASE_URL="http://$IP:$PORT"
LINK="$(python3 -c "
import sys, urllib.parse
print('hermesforge://connect?url=' + urllib.parse.quote(sys.argv[1], safe='') +
      '&key=' + urllib.parse.quote(sys.argv[2], safe=''))
" "$BASE_URL" "$API_KEY")"

echo
python3 "$PROJECT_ROOT/scripts/qr.py" "$LINK" || {
  warn "QR üretilemedi; aşağıdaki değerleri uygulamaya elle gir."
}

cat <<INFO

  Telefonun kamerasıyla yukarıdaki QR kodu okut.
  Çıkan bildirime dokun → HermesForge açılır ve bağlanır.

    Adres          : $BASE_URL
    API_SERVER_KEY : $API_KEY

  Elle girmek istersen: Uygulama → Menü → Ayarlar → Hermes sunucusu

  Notlar:
    · Telefon ve bu bilgisayar aynı Wi-Fi ağında olmalı.
    · Bu makine kapanırsa ya da uykuya geçerse uygulama iş üretemez.
    · Gateway ev ağına açık; anahtarı olmayan bağlanamaz. Anahtarı paylaşma.

INFO

if [ "$STARTED_HERE" -eq 1 ]; then
  echo "  Durdurmak için Ctrl+C."
  echo
  wait "$GATEWAY_PID"
fi
