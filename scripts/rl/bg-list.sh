#!/bin/sh

set -eu

PID_DIR="models/rl_model/pids"

if [ ! -d "${PID_DIR}" ]; then
    echo "no jobs"
    exit 0
fi

FOUND=0
for pidfile in "${PID_DIR}"/*.pid; do
    if [ ! -f "${pidfile}" ]; then
        continue
    fi
    FOUND=1
    job="$(basename "${pidfile}" .pid)"
    sh scripts/rl/bg-status.sh "${job}"
    echo "---"
done

if [ "${FOUND}" -eq 0 ]; then
    echo "no jobs"
fi
