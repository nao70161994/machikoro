#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/bg-stop.sh <job-name>" >&2
    exit 1
fi

JOB_NAME="$1"
PID_PATH="models/rl_model/pids/${JOB_NAME}.pid"

PID=""
if [ -f "${PID_PATH}" ]; then
    PID="$(cat "${PID_PATH}")"
fi
if [ -z "${PID}" ]; then
    PID="$(ps -ef | grep "python3 -m scripts.rl.train" | grep "${JOB_NAME}" | grep -v grep | awk 'BEGIN {pid=""} {pid=$2} END {print pid}')"
fi

if [ -z "${PID}" ]; then
    echo "pid not found for ${JOB_NAME}" >&2
    exit 1
fi

kill "${PID}"
echo "stopped ${JOB_NAME} pid=${PID}"
