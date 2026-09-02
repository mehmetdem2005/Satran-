#!/usr/bin/env bash
# Market_BP + Market_RP klasorlerini ice aktarilabilir bir .mcaddon yapar.
# Kullanim: bash paketle.sh  ->  Market_v<surum>.mcaddon
set -euo pipefail
cd "$(dirname "$0")"

SURUM=$(grep -o 'surum: "[^"]*"' Market_BP/scripts/main.js | head -1 | cut -d'"' -f2)
CIKTI="Market_v${SURUM}.mcaddon"

rm -f "$CIKTI"
zip -r -q -X "$CIKTI" Market_BP Market_RP \
  -x '*.DS_Store' -x '__MACOSX/*' -x '*/.gitkeep'

echo "Hazir: $CIKTI  ($(du -h "$CIKTI" | cut -f1))"
echo "Dosyaya cift tiklayarak ya da Minecraft'a aktararak kurabilirsin."
