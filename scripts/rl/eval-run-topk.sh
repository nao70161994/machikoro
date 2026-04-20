#!/bin/sh
set -eu

RUN_LABEL="${1:?run label required}"
GAMES="${2:-100}"
OPPONENTS="${3:-weak,normal,strong}"
OUT_PREFIX="${4:-models/rl_model/eval-${RUN_LABEL}-topk}"

exec npm run eval-rl-models -- \
    --run-labels "$RUN_LABEL" \
    --run-ranks 1,2,3 \
    --games "$GAMES" \
    --opponents "$OPPONENTS" \
    --output "${OUT_PREFIX}.json" \
    --csv "${OUT_PREFIX}.csv" \
    --markdown "${OUT_PREFIX}.md"
