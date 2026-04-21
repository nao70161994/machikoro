#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/bg-tail.sh <job-name>" >&2
    exit 1
fi

JOB_NAME="$1"
PID_PATH="models/rl_model/pids/${JOB_NAME}.pid"
LOG_PATH="$(ls -1t models/rl_model/logs/*-"${JOB_NAME}".log 2>/dev/null | head -n 1)"

PID=""
if [ -f "${PID_PATH}" ]; then
    PID="$(cat "${PID_PATH}")"
fi
if [ -z "${PID}" ] || ! kill -0 "${PID}" 2>/dev/null; then
    PID="$(ps -ef | grep "${JOB_NAME}" | grep -v grep | awk 'BEGIN {pid=""} {pid=$2} END {print pid}')"
fi
if [ -z "${PID}" ]; then
    echo "pid not found for ${JOB_NAME}" >&2
    exit 1
fi

echo "pid=${PID}"
if [ -n "${LOG_PATH}" ]; then
    echo "log=${LOG_PATH}"
    tail -n 40 "${LOG_PATH}"
else
    echo "log not found for ${JOB_NAME}" >&2
    exit 1
fi
