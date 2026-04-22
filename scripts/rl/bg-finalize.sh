#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/bg-finalize.sh <job-name> [poll-seconds]" >&2
    exit 1
fi

JOB_NAME="$1"
POLL_SECONDS="${2:-10}"

STATE="$(sh scripts/rl/bg-status.sh "${JOB_NAME}" | awk -F= '/^state=/{print $2}')"

if [ "${STATE}" = "running" ]; then
    sh scripts/rl/bg-wait.sh "${JOB_NAME}" "${POLL_SECONDS}"
else
    sh scripts/rl/bg-status.sh "${JOB_NAME}"
    echo "---"
    sh scripts/rl/bg-summary.sh "${JOB_NAME}"
fi

echo "---"
npm run refresh-rl-ops-reports
