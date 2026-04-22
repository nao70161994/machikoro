#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/eval-run.sh <run-label|model-id|model-path> [GAMES] [OPPONENTS] [RANK]" >&2
    exit 2
fi

TARGET="$1"
GAMES="${2:-20}"
OPPONENTS="${3:-weak,normal,strong}"
RANK="${4:-1}"

MODEL="$(node scripts/resolve-rl-model-path.js --rank "$RANK" "$TARGET")"

exec npm run eval-rl-vs-js -- --model "$MODEL" --games "$GAMES" --opponents "$OPPONENTS"
