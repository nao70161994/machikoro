#!/bin/sh

set -eu

GAMES="${1:-200}"
MODEL_ID="${2:-self-only-4p-h256-lr1e5-5000-seed103}"
OUT_PREFIX="${3:-models/rl_model/eval-adopted-stability}"

LINEUPS_4P="rl,weak,normal,strong;rl,normal,normal,strong;rl,weak,weak,normal"
LINEUPS_3P="rl,normal,strong;rl,weak,normal;rl,weak,strong"
LINEUPS_5P="rl,weak,normal,strong,expert;rl,normal,normal,strong,expert;rl,weak,weak,normal,strong"
LINEUPS_10P="rl,weak,normal,strong,expert,weak,normal,strong,expert,normal;rl,normal,normal,strong,expert,weak,normal,strong,expert,strong;rl,weak,weak,normal,strong,expert,weak,normal,strong,expert"

npm run eval-rl-models -- \
    --models "$MODEL_ID" \
    --games "$GAMES" \
    --lineups "$LINEUPS_4P" \
    --output "${OUT_PREFIX}-4p.json" \
    --csv "${OUT_PREFIX}-4p.csv"

npm run eval-rl-models -- \
    --models "$MODEL_ID" \
    --games "$GAMES" \
    --lineups "$LINEUPS_3P" \
    --output "${OUT_PREFIX}-3p.json" \
    --csv "${OUT_PREFIX}-3p.csv"

npm run eval-rl-models -- \
    --models "$MODEL_ID" \
    --games "$GAMES" \
    --lineups "$LINEUPS_5P" \
    --output "${OUT_PREFIX}-5p.json" \
    --csv "${OUT_PREFIX}-5p.csv"

npm run eval-rl-models -- \
    --models "$MODEL_ID" \
    --games "$GAMES" \
    --lineups "$LINEUPS_10P" \
    --output "${OUT_PREFIX}-10p.json" \
    --csv "${OUT_PREFIX}-10p.csv"
