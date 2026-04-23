#!/bin/sh

set -eu

exec sh scripts/rl/run-baseline.sh \
    --run-label self-only-4p-both-h256-lr2e5-5000 \
    --cpu-opponent-impl js-oracle \
    --hidden 256 \
    --lr 0.00002 \
    --games 5000 \
    --eval-every 250 \
    --player-count 4 \
    --train-opponents self=1 \
    --self-learn-both-sides \
    --js-eval-games 8 \
    --js-eval-opponents weak,normal,strong \
    --js-eval-lineups "rl,weak,normal,strong;rl,normal,normal,strong;rl,weak,weak,normal" \
    --summary-weights "rl+weak+normal+strong=3,rl+normal+normal+strong=4,rl+weak+weak+normal=1" \
    --best-checkpoint-top-k 3 \
    --imitation-games 0 \
    --imitation-refresh-games 0 \
    --reward-coin 0 \
    --reward-opp-coin 0 \
    --reward-asset 0 \
    --reward-opp-asset 0 \
    --reward-landmark 0 \
    --reward-opp-landmark 0 \
    --reward-clip 0 \
    --terminal-win 1.0 \
    --terminal-loss -1.0 \
    --terminal-draw -0.2 \
    --terminal-landmark-diff 0 \
    --terminal-landmark-value-diff 0.004 \
    --terminal-asset-diff 0.002 \
    --terminal-coin-diff 0.001 \
    --terminal-diff-clip 20 \
    --restore-best-at-end \
    "$@"
