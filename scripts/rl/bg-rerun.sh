#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/bg-rerun.sh <job-name> [new-job-name] [-- <command...>]" >&2
    exit 1
fi

JOB_NAME="$1"
shift

NEW_JOB_NAME="${1:-${JOB_NAME}-rerun-$(date +%Y%m%d-%H%M%S)}"
if [ "$#" -gt 0 ]; then
    shift
fi

CMD_PATH="models/rl_model/pids/${JOB_NAME}.cmd"

STATE="$(sh scripts/rl/bg-status.sh "${JOB_NAME}" | awk -F= '/^state=/{print $2}')"
if [ "${STATE}" = "running" ]; then
    echo "job is still running: ${JOB_NAME}" >&2
    exit 1
fi

CMD=""
if [ -f "${CMD_PATH}" ]; then
    CMD="$(cat "${CMD_PATH}")"
elif [ "$#" -gt 0 ] && [ "$1" = "--" ]; then
    shift
    CMD="$*"
fi

if [ -z "${CMD}" ]; then
    echo "command file not found: ${CMD_PATH}" >&2
    echo "pass an explicit command after -- for older jobs" >&2
    exit 1
fi

CMD="$(printf '%s\n' "${CMD}" | sed "s/--run-label ${JOB_NAME}/--run-label ${NEW_JOB_NAME}/g")"
CMD="$(printf '%s\n' "${CMD}" | sed "s/--summary-baseline-run ${JOB_NAME}/--summary-baseline-run ${NEW_JOB_NAME}/g")"

echo "source_job=${JOB_NAME}"
echo "new_job=${NEW_JOB_NAME}"
echo "cmd=${CMD}"

sh scripts/rl/run-background.sh "${NEW_JOB_NAME}" ${CMD}
