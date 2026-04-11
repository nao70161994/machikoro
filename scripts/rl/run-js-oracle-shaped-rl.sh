#!/bin/sh

set -eu

exec sh scripts/rl/run-js-oracle-baseline.sh \
    --run-label js-oracle-shaped-rl \
    --games 500 \
    --eval-every 100 \
    --js-eval-games 4 \
    --train-opponents random=0.2,weak=0.2,normal=0.35,strong=0.25 \
    --imitation-games 0 \
    --imitation-refresh-games 0 \
    --reward-coin 0.01 \
    --reward-opp-coin 0.008 \
    --reward-asset 0.005 \
    --reward-opp-asset 0.004 \
    --reward-landmark 0.20 \
    --reward-opp-landmark 0.15 \
    --reward-clip 0.30 \
    --restore-best-at-end \
    "$@"
