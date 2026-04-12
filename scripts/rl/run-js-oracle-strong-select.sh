#!/bin/sh

set -eu

exec sh scripts/rl/run-js-oracle-terminal-shaped.sh \
    --run-label js-oracle-strong-select \
    --hidden 128 \
    --lr 0.0001 \
    --js-eval-games 8 \
    --js-eval-opponents weak,normal,strong \
    --summary-weights weak=1,normal=2,strong=5 \
    "$@"
