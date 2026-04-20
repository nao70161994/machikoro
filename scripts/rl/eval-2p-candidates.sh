#!/bin/sh

set -eu

GAMES="${1:-100}"
OUT_PREFIX="${2:-models/rl_model/eval-2p-candidates}"
MODELS="${3:-self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3,self-only-both-h256-lr2e5-5000-seed70-rewardcap,self-only-both-h256-lr2e5-5000-seed69-rewardcap,terminal-shaped-h128-lr1e4}"

exec npm run eval-rl-models -- \
    --models "$MODELS" \
    --games "$GAMES" \
    --opponents weak,normal,strong \
    --output "${OUT_PREFIX}.json" \
    --csv "${OUT_PREFIX}.csv" \
    --markdown "${OUT_PREFIX}.md"
