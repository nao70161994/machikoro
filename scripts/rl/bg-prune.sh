#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/bg-prune.sh <job-name|--stale-all>" >&2
    exit 1
fi

PID_DIR="models/rl_model/pids"

prune_job() {
    job="$1"
    status_output="$(sh scripts/rl/bg-status.sh "${job}")"
    state="$(printf '%s\n' "${status_output}" | awk -F= '/^state=/{print $2}')"
    summary_state="$(printf '%s\n' "${status_output}" | awk -F= '/^summary_state=/{print $2}')"

    if [ "${state}" = "running" ]; then
        echo "skip running job: ${job}" >&2
        return 1
    fi
    if [ "${summary_state}" = "present" ]; then
        echo "skip completed job: ${job}" >&2
        return 1
    fi

    rm -f \
        "${PID_DIR}/${job}.pid" \
        "${PID_DIR}/${job}.status" \
        "${PID_DIR}/${job}.cmd"

    echo "pruned=${job}"
}

if [ "$1" = "--stale-all" ]; then
    found=0
    for pidfile in "${PID_DIR}"/*.pid; do
        if [ ! -f "${pidfile}" ]; then
            continue
        fi
        found=1
        job="$(basename "${pidfile}" .pid)"
        prune_job "${job}" || true
    done
    if [ "${found}" -eq 0 ]; then
        echo "no jobs"
    fi
    exit 0
fi

prune_job "$1"
