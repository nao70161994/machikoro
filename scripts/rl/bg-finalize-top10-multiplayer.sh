#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/bg-finalize-top10-multiplayer.sh <job-name> [poll-seconds] [games]" >&2
    exit 1
fi

JOB_NAME="$1"
POLL_SECONDS="${2:-10}"
GAMES="${3:-50}"

sh scripts/rl/bg-finalize.sh "${JOB_NAME}" "${POLL_SECONDS}"
echo "---"
sh scripts/rl/eval-run-top10-multiplayer.sh "${JOB_NAME}" "${GAMES}"

