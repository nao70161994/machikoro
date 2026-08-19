#!/bin/sh

set -eu

BLOCKS="${1:-100}"
MODEL_ID="${2:-self-only-4p-h256-lr1e5-5000-seed103}"
OUT_PREFIX="${3:-models/rl_model/eval-adopted-paired-seat-10p}"
SEED="${4:-1}"
PLAYER_COUNT=10
GAMES=$((BLOCKS * PLAYER_COUNT))
LINEUPS="rl,weak,normal,strong,expert,weak,normal,strong,expert,normal;rl,normal,normal,strong,expert,weak,normal,strong,expert,strong;rl,weak,weak,normal,strong,expert,weak,normal,strong,expert"

npm run eval-rl-models -- \
    --models "$MODEL_ID" \
    --games "$GAMES" \
    --seed "$SEED" \
    --paired-seats \
    --lineups "$LINEUPS" \
    --output "${OUT_PREFIX}.json" \
    --csv "${OUT_PREFIX}.csv"
