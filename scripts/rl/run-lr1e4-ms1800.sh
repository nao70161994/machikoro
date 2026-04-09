#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$ROOT_DIR"

exec sh scripts/rl/run-baseline.sh \
    --run-label lr1e4-ms1800 \
    --lr 0.0001 \
    --games 500 \
    --max-steps 1800 \
    --eval-max-steps 1800 \
    "$@"
