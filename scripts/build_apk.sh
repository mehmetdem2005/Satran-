#!/usr/bin/env bash
# HermesForge APK'sını derler.
#
#   bash scripts/build_apk.sh              # debug APK
#   bash scripts/build_apk.sh --clean      # önce temizle
#
# Android SDK yoksa indirir. SDK varsa (ANDROID_HOME ya da ~/android-sdk)
# yeniden indirmez. Çıktı: dist/hermesforge-debug.apk

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/android-sdk}}"
CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
PLATFORM="platforms;android-35"
BUILD_TOOLS="build-tools;35.0.0"

log() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mHATA:\033[0m %s\n' "$*" >&2; exit 1; }

CLEAN=0
for arg in "$@"; do
  case "$arg" in
    --clean) CLEAN=1 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) die "Bilinmeyen seçenek: $arg" ;;
  esac
done

# --------------------------------------------------------------- 1. JDK
command -v java >/dev/null 2>&1 || die "java bulunamadı. JDK 17+ kurun."
JAVA_MAJOR="$(java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1)"
[ -n "$JAVA_MAJOR" ] && [ "$JAVA_MAJOR" -ge 17 ] || die "JDK 17 veya üstü gerekli (bulunan: ${JAVA_MAJOR:-?})."

# ----------------------------------------------------------- 2. Android SDK
if [ ! -x "$SDK_DIR/cmdline-tools/latest/bin/sdkmanager" ]; then
  log "Android SDK indiriliyor → $SDK_DIR"
  mkdir -p "$SDK_DIR/cmdline-tools"
  TMP="$(mktemp -d)"
  curl -fL --progress-bar "$CMDLINE_TOOLS_URL" -o "$TMP/tools.zip" \
    || die "Komut satırı araçları indirilemedi."
  unzip -q "$TMP/tools.zip" -d "$TMP/x"
  mv "$TMP/x/cmdline-tools" "$SDK_DIR/cmdline-tools/latest"
  rm -rf "$TMP"
fi

export ANDROID_HOME="$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"
SDKMANAGER="$SDK_DIR/cmdline-tools/latest/bin/sdkmanager"

if [ ! -d "$SDK_DIR/platforms/android-35" ] || [ ! -d "$SDK_DIR/build-tools/35.0.0" ]; then
  log "SDK bileşenleri kuruluyor (lisanslar kabul ediliyor)…"
  yes | "$SDKMANAGER" --licenses >/dev/null 2>&1 || true
  "$SDKMANAGER" "platform-tools" "$PLATFORM" "$BUILD_TOOLS" >/dev/null \
    || die "SDK bileşenleri kurulamadı."
fi
log "SDK hazır: $SDK_DIR"

# ------------------------------------------------- 3. Arayüzü asset'e paketle
# Flask şablon/statik dosyaları diskte ister; APK içinde asset olarak taşınıp
# ilk açılışta uygulamanın özel dizinine açılıyorlar.
ASSETS_DIR="$PROJECT_ROOT/android/app/src/main/assets"
mkdir -p "$ASSETS_DIR"
log "Arayüz paketleniyor → assets/frontend.zip"
python3 - "$PROJECT_ROOT" "$ASSETS_DIR/frontend.zip" <<'PYEOF'
import os, sys, zipfile
root, target = sys.argv[1], sys.argv[2]
frontend = os.path.join(root, "frontend")
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
    for folder, _dirs, files in os.walk(frontend):
        for name in files:
            if name.endswith((".pyc", ".map")) or "__pycache__" in folder:
                continue
            full = os.path.join(folder, name)
            archive.write(full, os.path.relpath(full, frontend))
print(f"  {len(zipfile.ZipFile(target).namelist())} dosya paketlendi")
PYEOF

# ----------------------------------------------------------- 4. Gradle derleme
cd "$PROJECT_ROOT/android"
GRADLE_CMD="gradle"
[ -x "./gradlew" ] && GRADLE_CMD="./gradlew"

[ "$CLEAN" -eq 1 ] && { log "Temizleniyor…"; $GRADLE_CMD clean --no-daemon || true; }

log "APK derleniyor (ilk derleme bağımlılıkları indirir, uzun sürebilir)…"
$GRADLE_CMD assembleDebug --no-daemon --console=plain || die "Gradle derlemesi başarısız."

# --------------------------------------------------------------- 5. Çıktı
APK="$(find "$PROJECT_ROOT/android/app/build/outputs/apk/debug" -name "*.apk" | head -1)"
[ -n "$APK" ] || die "APK üretilmedi."

mkdir -p "$PROJECT_ROOT/dist"
OUT="$PROJECT_ROOT/dist/hermesforge-debug.apk"
cp "$APK" "$OUT"

cat <<SUMMARY

  APK hazır: $OUT
  Boyut    : $(du -h "$OUT" | cut -f1)

  Telefona kurmak için:
    - Dosyayı telefona kopyala ve dokun
    - "Bilinmeyen kaynaklardan kuruluma izin ver" sorulursa onayla
    - Ya da USB ile: adb install -r "$OUT"

  İlk açılışta bir model sağlayıcısı anahtarı gir (Ayarlar → Yedek sağlayıcı).
  Hermes'in araçlarını da istiyorsan Termux'ta Hermes'i çalıştırıp
  Ayarlar → Hermes Agent bölümüne adresini yaz.

SUMMARY
