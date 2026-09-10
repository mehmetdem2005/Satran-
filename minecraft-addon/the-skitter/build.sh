#!/usr/bin/env bash
# Builds dist/TheSkitter.mcaddon (and the two loose .mcpack files) from the
# behaviour and resource pack folders.
set -euo pipefail

cd "$(dirname "$0")"

BP=the_skitter_BP
RP=the_skitter_RP
OUT=dist
NAME=TheSkitter

echo "==> generating behaviour pack entity"
python3 tools/generate_entity.py

echo "==> generating resource pack assets"
python3 tools/generate_assets.py

echo "==> validating"
python3 tools/validate.py

echo "==> refreshing the Java-side parity table"
python3 tools/testbed/make_expected.py

if command -v node >/dev/null 2>&1; then
  echo "==> checking numeric parity with the Java mod"
  node tools/testbed/parity.mjs

  echo "==> running the behaviour pack in the test harness"
  node tools/testbed/run.mjs
else
  echo "==> node not found, skipping the script harness"
fi

echo "==> packaging"
rm -rf "$OUT"
mkdir -p "$OUT"

zip -qr "$OUT/${NAME}_BP.mcpack" "$BP" -x '*.DS_Store'
zip -qr "$OUT/${NAME}_RP.mcpack" "$RP" -x '*.DS_Store'
zip -qr "$OUT/${NAME}.mcaddon" "$BP" "$RP" -x '*.DS_Store'

echo
echo "Built:"
ls -lh "$OUT"
