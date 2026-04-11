#!/bin/sh

set -eu

exec sh scripts/rl/run-js-oracle-baseline.sh \
    --run-label js-oracle-strong-focus \
    --games 300 \
    --eval-every 100 \
    --js-eval-games 4 \
    --imitation-games 30 \
    --imitation-opponents strong \
    --imitation-max-steps 300 \
    --imitation-refresh-games 5 \
    --imitation-refresh-every 50 \
    --train-opponents strong=0.8,normal=0.2 \
    --restore-best-at-end \
    "$@"
