#!/bin/sh

set -eu

exec sh scripts/rl/run-js-oracle-baseline.sh \
    --run-label js-oracle-bc500 \
    --games 500 \
    --eval-every 100 \
    --js-eval-games 4 \
    --imitation-games 100 \
    --imitation-opponents normal,strong \
    --imitation-max-steps 1200 \
    --imitation-refresh-games 10 \
    --imitation-refresh-every 100 \
    --restore-best-at-end \
    "$@"
