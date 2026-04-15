#!/bin/sh

set -eu

exec sh scripts/rl/run-js-oracle-strong-select.sh \
    --run-label js-oracle-self-both \
    --train-opponents random=0.2,weak=0.3,normal=0.1,strong=0,self=0.25,pool=0.15 \
    --self-learn-both-sides \
    "$@"
