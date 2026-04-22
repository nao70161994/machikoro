#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/bg-experiment-set.sh <job-name>..." >&2
    exit 1
fi

for job in "$@"; do
    sh scripts/rl/bg-status.sh "${job}"
    if [ -f "models/rl_model/runs/${job}/summary.json" ]; then
        echo "---"
        sh scripts/rl/bg-summary.sh "${job}"
    fi
    echo "==="
done
