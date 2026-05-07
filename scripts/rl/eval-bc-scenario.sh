#!/bin/sh

set -eu

MODEL_ID="${1:-self-only-4p-h256-lr1e5-5000-seed103}"
PLAYER_COUNT="${2:-4}"

exec npm run eval-rl-business-scenario -- \
    --models "$MODEL_ID" \
    --player-count "$PLAYER_COUNT"
