#!/bin/sh
set -eu

RUN_LABEL="${1:?run label required}"
GAMES="${2:-50}"
OUT_PREFIX="${3:-models/rl_model/eval-${RUN_LABEL}-top10-multiplayer}"
RUN_RANKS="${4:-1,2,3,4,5,6,7,8,9,10}"
LINEUPS="rl,normal,strong;rl,weak,normal;rl,weak,strong;rl,weak,normal,strong;rl,normal,normal,strong;rl,weak,weak,normal;rl,weak,normal,strong,normal;rl,weak,weak,normal,normal,strong,strong,normal,weak,strong"

npm run eval-rl-models -- \
    --run-labels "$RUN_LABEL" \
    --run-ranks "$RUN_RANKS" \
    --games "$GAMES" \
    --lineups "$LINEUPS" \
    --output "${OUT_PREFIX}.json" \
    --csv "${OUT_PREFIX}.csv" \
    --markdown "${OUT_PREFIX}.md"

npm run review-rl-multiplayer-topk -- --input "${OUT_PREFIX}.json" --output "${OUT_PREFIX}.review.txt"
npm run review-rl-multiplayer-topk -- --input "${OUT_PREFIX}.json" --format markdown --output "${OUT_PREFIX}.review.md"
npm run review-rl-multiplayer-topk -- --input "${OUT_PREFIX}.json" --format json --output "${OUT_PREFIX}.review.json"
