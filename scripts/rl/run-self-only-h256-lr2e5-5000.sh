#!/bin/sh

set -eu

exec sh scripts/rl/run-js-oracle-strong-select.sh \
    --run-label self-only-both-h256-lr2e5-5000 \
    --hidden 256 \
    --lr 0.00002 \
    --games 5000 \
    --train-opponents self=1 \
    --self-learn-both-sides \
    --terminal-landmark-value-diff 0.004 \
    --terminal-asset-diff 0.002 \
    --terminal-coin-diff 0.001 \
    --terminal-diff-clip 20 \
    "$@"
