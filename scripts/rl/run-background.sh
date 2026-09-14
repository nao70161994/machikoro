#!/bin/sh

set -eu

if [ "$#" -lt 2 ]; then
    echo "usage: sh scripts/rl/run-background.sh <job-name> <command...>" >&2
    exit 1
fi

JOB_NAME="$1"
shift

STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="models/rl_model/logs"
PID_DIR="models/rl_model/pids"
LOG_PATH="${LOG_DIR}/${STAMP}-${JOB_NAME}.log"
PID_PATH="${PID_DIR}/${JOB_NAME}.pid"
STATUS_PATH="${PID_DIR}/${JOB_NAME}.status"
CMD_PATH="${PID_DIR}/${JOB_NAME}.cmd"

mkdir -p "${LOG_DIR}" "${PID_DIR}"

ROOT_DIR="$(pwd)"
LOG_PATH="${ROOT_DIR}/${LOG_PATH}"
PID_PATH="${ROOT_DIR}/${PID_PATH}"
STATUS_PATH="${ROOT_DIR}/${STATUS_PATH}"
CMD_PATH="${ROOT_DIR}/${CMD_PATH}"

printf '%s\n' "$*" > "${CMD_PATH}"
rm -f "${STATUS_PATH}"

PYTHONUNBUFFERED=1 STATUS_PATH="${STATUS_PATH}" setsid -f sh -lc '
"$@"
STATUS=$?
printf "%s\n" "${STATUS}" > "$STATUS_PATH"
exit "${STATUS}"
' sh "$@" >"${LOG_PATH}" 2>&1 </dev/null

PID=""
for _ in 1 2 3 4 5; do
    PID="$(ps -eo pid=,comm=,args= | awk -v job="${JOB_NAME}" '
        $2 == "python3" && index($0, "-m scripts.rl.train") && index($0, job) {
            print $1
            exit
        }
    ')"
    if [ -n "${PID}" ]; then
        break
    fi
    sleep 1
done

if [ -z "${PID}" ]; then
    echo "failed to detect pid for ${JOB_NAME}" >&2
    exit 1
fi

echo "${PID}" > "${PID_PATH}"

echo "job=${JOB_NAME}"
echo "pid=${PID}"
echo "log=${LOG_PATH}"
echo "pidfile=${PID_PATH}"
echo "statusfile=${STATUS_PATH}"
