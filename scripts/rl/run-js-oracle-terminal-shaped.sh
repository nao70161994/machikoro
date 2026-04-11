#!/bin/sh

set -eu

exec sh scripts/rl/run-js-oracle-baseline.sh \
    --run-label js-oracle-terminal-shaped \
    --games 1000 \
    --eval-every 250 \
    --js-eval-games 4 \
    --train-opponents random=0.3,weak=0.4,normal=0.1,strong=0,self=0.1,pool=0.1 \
    --pool-update-every 250 \
    --pool-max-size 4 \
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
    --terminal-landmark-value-diff 0.008 \
    --terminal-asset-diff 0.005 \
    --terminal-coin-diff 0.002 \
    --terminal-diff-clip 30 \
    --restore-best-at-end \
    "$@"
