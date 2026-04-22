#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/eval-run-4p.sh <run-label|model-id|model-path> [GAMES] [RANK]" >&2
    exit 2
fi

TARGET="$1"
GAMES="${2:-50}"
RANK="${3:-1}"

MODEL="$(node scripts/resolve-rl-model-path.js --rank "$RANK" "$TARGET")"

LINEUPS="rl,weak,normal,strong;rl,normal,normal,strong;rl,weak,weak,normal"

exec npm run eval-rl-vs-js -- --model "$MODEL" --games "$GAMES" --lineups "$LINEUPS"
