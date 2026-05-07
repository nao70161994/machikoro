#!/bin/sh

set -eu

GAMES="${1:-50}"
MODEL_ID="${2:-self-only-4p-h256-lr1e5-5000-seed103}"
OUT_PREFIX="${3:-models/rl_model/eval-bc-adopted}"
LINEUPS="rl,weak,normal,strong;rl,normal,normal,strong;rl,weak,weak,normal"

exec npm run eval-rl-models -- \
    --models "$MODEL_ID" \
    --games "$GAMES" \
    --lineups "$LINEUPS" \
    --output "${OUT_PREFIX}.json" \
    --csv "${OUT_PREFIX}.csv"
