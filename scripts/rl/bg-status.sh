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

ACTIVE_PID="$(ps -ef | grep "python3 -m scripts.rl.train" | grep "${JOB_NAME}" | grep -v grep | awk 'BEGIN {pid=""} {pid=$2} END {print pid}')"

STATE="stopped"
if [ -n "${ACTIVE_PID}" ]; then
    STATE="running"
    PID="${ACTIVE_PID}"
elif [ -n "${PID}" ] && kill -0 "${PID}" 2>/dev/null; then
    STATE="running"
elif [ -f "${SUMMARY_PATH}" ]; then
    STATE="done"
fi

echo "job=${JOB_NAME}"
echo "state=${STATE}"
if [ -n "${PID}" ]; then
    echo "pid=${PID}"
fi
if [ -f "${STATUS_PATH}" ]; then
    echo "exit=$(cat "${STATUS_PATH}")"
fi
if [ -f "${CMD_PATH}" ]; then
    echo "cmd=$(cat "${CMD_PATH}")"
fi
if [ -n "${LOG_PATH}" ]; then
    echo "log=${LOG_PATH}"
fi
if [ -f "${SUMMARY_PATH}" ]; then
    echo "summary=${SUMMARY_PATH}"
    echo "summary_state=present"
else
    echo "summary_state=missing"
fi
