#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/bg-status.sh <job-name>" >&2
    exit 1
fi

JOB_NAME="$1"
PID_PATH="models/rl_model/pids/${JOB_NAME}.pid"
STATUS_PATH="models/rl_model/pids/${JOB_NAME}.status"
CMD_PATH="models/rl_model/pids/${JOB_NAME}.cmd"
LOG_PATH="$(ls -1t models/rl_model/logs/*-"${JOB_NAME}".log 2>/dev/null | head -n 1)"
SUMMARY_PATH="models/rl_model/runs/${JOB_NAME}/summary.json"

PID=""
if [ -f "${PID_PATH}" ]; then
    PID="$(cat "${PID_PATH}")"
fi

ACTIVE_INFO="$(ps -eo pid=,comm=,etime=,time=,pcpu=,args= | awk -v job="${JOB_NAME}" '
    $2 == "python3" && index($0, "-m scripts.rl.train") {
        for (i = 6; i <= NF; i += 1) {
            if ($i == "--run-label" && (i + 1) <= NF && $(i + 1) == job) {
                print $1, $3, $4, $5
                exit
            }
        }
    }
')"
ACTIVE_PID="$(printf '%s\n' "${ACTIVE_INFO}" | awk '{print $1}')"

STATE="stopped"
if [ -n "${ACTIVE_PID}" ]; then
    STATE="running"
    PID="${ACTIVE_PID}"
elif [ -f "${STATUS_PATH}" ] && [ "$(cat "${STATUS_PATH}")" = "0" ]; then
    STATE="done"
elif [ -f "${STATUS_PATH}" ]; then
    STATE="failed"
elif [ -f "${SUMMARY_PATH}" ]; then
    STATE="done"
fi

echo "job=${JOB_NAME}"
echo "state=${STATE}"
if [ -n "${PID}" ]; then
    echo "pid=${PID}"
fi
if [ -n "${ACTIVE_INFO}" ]; then
    echo "elapsed=$(printf '%s\n' "${ACTIVE_INFO}" | awk '{print $2}')"
    echo "cpu_time=$(printf '%s\n' "${ACTIVE_INFO}" | awk '{print $3}')"
    echo "cpu_percent=$(printf '%s\n' "${ACTIVE_INFO}" | awk '{print $4}')"
fi
if [ -f "${STATUS_PATH}" ]; then
    echo "exit=$(cat "${STATUS_PATH}")"
fi
if [ -f "${CMD_PATH}" ]; then
    echo "cmd=$(cat "${CMD_PATH}")"
fi
if [ -n "${LOG_PATH}" ]; then
    echo "log=${LOG_PATH}"
    LOG_UPDATED_AT="$(stat -c %Y "${LOG_PATH}" 2>/dev/null || true)"
    if [ -n "${LOG_UPDATED_AT}" ]; then
        NOW="$(date +%s)"
        echo "log_age_seconds=$((NOW - LOG_UPDATED_AT))"
    fi
fi
if [ -f "${SUMMARY_PATH}" ]; then
    echo "summary=${SUMMARY_PATH}"
    echo "summary_state=present"
else
    echo "summary_state=missing"
fi
