#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/eval-run-multiplayer.sh <run-label|model-id|model-path> [GAMES] [RANK]" >&2
    exit 2
fi

TARGET="$1"
GAMES="${2:-50}"
RANK="${3:-1}"

echo "[3p]"
sh scripts/rl/eval-run-3p.sh "$TARGET" "$GAMES" "$RANK"
echo
echo "[4p]"
sh scripts/rl/eval-run-4p.sh "$TARGET" "$GAMES" "$RANK"
