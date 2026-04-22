#!/bin/sh

set -eu

exec sh scripts/rl/run-js-oracle-strong-select.sh \
    --run-label self-only-4p-both-h256-lr2e5-1000 \
    --hidden 256 \
    --lr 0.00002 \
    --games 1000 \
    --eval-every 500 \
    --js-eval-games 1 \
    --player-count 4 \
    --train-opponents self=1 \
    --self-learn-both-sides \
    --js-eval-lineups "rl,weak,normal,strong;rl,normal,normal,strong;rl,weak,weak,normal" \
    --summary-weights "rl+weak+normal+strong=3,rl+normal+normal+strong=4,rl+weak+weak+normal=1" \
    --terminal-landmark-value-diff 0.004 \
    --terminal-asset-diff 0.002 \
    --terminal-coin-diff 0.001 \
    --terminal-diff-clip 20 \
    "$@"
