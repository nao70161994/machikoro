#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/bg-wait.sh <job-name> [poll-seconds]" >&2
    exit 1
fi

JOB_NAME="$1"
POLL_SECONDS="${2:-10}"

while :; do
    STATUS="$(sh scripts/rl/bg-status.sh "${JOB_NAME}")"
    echo "${STATUS}"
    STATE="$(printf '%s\n' "${STATUS}" | awk -F= '/^state=/{print $2}')"
    if [ "${STATE}" = "done" ]; then
        echo "---"
        sh scripts/rl/bg-summary.sh "${JOB_NAME}"
        exit 0
    fi
    if [ "${STATE}" = "stopped" ]; then
        echo "---"
        echo "job stopped before summary was written" >&2
        exit 1
    fi
    sleep "${POLL_SECONDS}"
done
