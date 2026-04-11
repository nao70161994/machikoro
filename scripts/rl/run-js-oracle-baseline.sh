#!/bin/sh

set -eu

exec sh scripts/rl/run-baseline.sh \
    --run-label js-oracle-baseline \
    --cpu-opponent-impl js-oracle \
    "$@"
