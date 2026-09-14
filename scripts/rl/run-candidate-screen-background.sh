#!/bin/sh

set -eu

if [ "$#" -lt 4 ] || [ "$#" -gt 5 ]; then
    echo "usage: sh scripts/rl/run-candidate-screen-background.sh <2p|mp> <candidate.browser.json> <baseline.browser.json> <output-dir> [reuse-results.json]" >&2
    exit 2
fi

SCOPE="$1"
CANDIDATE="$2"
BASELINE="$3"
OUTPUT_DIR="$4"
REUSE_RESULTS="${5:-}"

case "$SCOPE" in
    2p|mp) ;;
    *)
        echo "scope must be 2p or mp" >&2
        exit 2
        ;;
esac

if [ ! -f "$CANDIDATE" ]; then
    echo "candidate model not found: $CANDIDATE" >&2
    exit 2
fi
if [ ! -f "$BASELINE" ]; then
    echo "baseline model not found: $BASELINE" >&2
    exit 2
fi
if [ -n "$REUSE_RESULTS" ] && [ ! -f "$REUSE_RESULTS" ]; then
    echo "reuse results not found: $REUSE_RESULTS" >&2
    exit 2
fi

mkdir -p "$OUTPUT_DIR"
PID_PATH="$OUTPUT_DIR/screen.pid"
STATUS_PATH="$OUTPUT_DIR/screen.status"
LOG_PATH="$OUTPUT_DIR/screen.log"
CMD_PATH="$OUTPUT_DIR/screen.cmd"

if [ -f "$PID_PATH" ]; then
    PREVIOUS_PID="$(cat "$PID_PATH")"
    case "$PREVIOUS_PID" in
        ''|*[!0-9]*) ;;
        *)
            if kill -0 "$PREVIOUS_PID" 2>/dev/null; then
                echo "candidate screen is already running: pid=$PREVIOUS_PID" >&2
                exit 2
            fi
            ;;
    esac
fi

rm -f "$PID_PATH" "$STATUS_PATH"
{
    echo "scope=$SCOPE"
    echo "candidate=$CANDIDATE"
    echo "baseline=$BASELINE"
    echo "output=$OUTPUT_DIR"
    echo "reuseResults=$REUSE_RESULTS"
} > "$CMD_PATH"

PID_PATH="$PID_PATH" STATUS_PATH="$STATUS_PATH" RL_EVAL_REUSE_RESULTS="$REUSE_RESULTS" \
setsid -f sh -c '
    printf "%s\n" "$$" > "$PID_PATH"
    sh scripts/rl/eval-candidate-screen.sh "$@"
    status=$?
    printf "%s\n" "$status" > "$STATUS_PATH"
    exit "$status"
' sh "$SCOPE" "$CANDIDATE" "$BASELINE" "$OUTPUT_DIR" > "$LOG_PATH" 2>&1 < /dev/null

PID=""
for _ in 1 2 3 4 5; do
    if [ -f "$PID_PATH" ]; then
        PID="$(cat "$PID_PATH")"
        break
    fi
    sleep 1
done
if [ -z "$PID" ] || ! kill -0 "$PID" 2>/dev/null; then
    echo "failed to launch candidate screen" >&2
    exit 1
fi

echo "job=candidate-screen-$SCOPE"
echo "pid=$PID"
echo "log=$LOG_PATH"
echo "statusfile=$STATUS_PATH"
echo "cmdfile=$CMD_PATH"
