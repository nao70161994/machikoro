#!/bin/sh

set -eu

GAMES="${1:-200}"
MODEL_ID="${2:-self-only-4p-h256-lr1e5-5000-seed103}"
OUT_PREFIX="${3:-models/rl_model/eval-adopted-seat-stability-10p}"
SEEDS="${4:-1,101,201,301,401}"
LINEUPS="rl,weak,normal,strong,expert,weak,normal,strong,expert,normal;rl,normal,normal,strong,expert,weak,normal,strong,expert,strong;rl,weak,weak,normal,strong,expert,weak,normal,strong,expert"

INPUTS=""
OLD_IFS="$IFS"
IFS=','
for SEED in $SEEDS; do
    OUTPUT="${OUT_PREFIX}-seed${SEED}.json"
    npm run eval-rl-models -- \
        --models "$MODEL_ID" \
        --games "$GAMES" \
        --seed "$SEED" \
        --lineups "$LINEUPS" \
        --output "$OUTPUT" \
        --csv "${OUT_PREFIX}-seed${SEED}.csv"
    if [ -n "$INPUTS" ]; then INPUTS="$INPUTS,$OUTPUT"; else INPUTS="$OUTPUT"; fi
done
IFS="$OLD_IFS"

node scripts/review-rl-seat-stability.js \
    --inputs "$INPUTS" \
    --output "${OUT_PREFIX}-summary.json"
