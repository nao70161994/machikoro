#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/eval-run-multiplayer.sh <run-label|model-id|model-path> [GAMES] [RANK]" >&2
    exit 2
fi

TARGET="$1"
GAMES="${2:-50}"
RANK="${3:-1}"
MODEL="$(node scripts/resolve-rl-model-path.js --rank "$RANK" "$TARGET")"

echo "[3p]"
sh scripts/rl/eval-run-3p.sh "$TARGET" "$GAMES" "$RANK"
echo
echo "[4p]"
sh scripts/rl/eval-run-4p.sh "$TARGET" "$GAMES" "$RANK"
echo
echo "[5p/10p]"
npm run eval-rl-vs-js -- \
    --model "$MODEL" \
    --games "$GAMES" \
    --lineups "rl,weak,normal,strong,normal;rl,weak,weak,normal,normal,strong,strong,normal,weak,strong"
