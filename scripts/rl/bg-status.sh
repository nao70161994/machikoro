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

PID=""
if [ -f "${PID_PATH}" ]; then
    PID="$(cat "${PID_PATH}")"
fi

ACTIVE_PID="$(ps -ef | grep "${JOB_NAME}" | grep -v grep | awk 'BEGIN {pid=""} /python3 -m scripts\.rl\.train/ {pid=$2} END {print pid}')"
if [ -z "${ACTIVE_PID}" ]; then
    ACTIVE_PID="$(ps -ef | grep "${JOB_NAME}" | grep -v grep | awk 'BEGIN {pid=""} {pid=$2} END {print pid}')"
fi

STATE="stopped"
if [ -n "${ACTIVE_PID}" ]; then
    STATE="running"
    PID="${ACTIVE_PID}"
elif [ -n "${PID}" ] && kill -0 "${PID}" 2>/dev/null; then
    STATE="running"
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
