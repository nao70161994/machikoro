#!/bin/sh

set -eu

if [ "$#" -lt 5 ] || [ "$#" -gt 6 ]; then
    echo "usage: sh scripts/rl/await-candidate-screen.sh <2p|mp> <candidate.browser.json> <baseline.browser.json> <output-dir> <producer-pgid> [poll-seconds]" >&2
    exit 2
fi

SCOPE="$1"
CANDIDATE="$2"
BASELINE="$3"
OUTPUT_DIR="$4"
PRODUCER_PGID="$5"
POLL_SECONDS="${6:-30}"
KNOWN_SHA256="${RL_AWAIT_CANDIDATE_SHA256:-}"

case "$SCOPE" in
    2p|mp) ;;
    *)
        echo "scope must be 2p or mp" >&2
        exit 2
        ;;
esac

case "$POLL_SECONDS" in
    *[!0-9]*|'')
        echo "poll seconds must be an integer" >&2
        exit 2
        ;;
esac
case "$PRODUCER_PGID" in
    *[!0-9]*|'')
        echo "producer PGID must be an integer greater than 1" >&2
        exit 2
        ;;
esac
if [ "$PRODUCER_PGID" -le 1 ]; then
    echo "producer PGID must be an integer greater than 1" >&2
    exit 2
fi
if [ "$POLL_SECONDS" -lt 5 ] || [ "$POLL_SECONDS" -gt 300 ]; then
    echo "poll seconds must be between 5 and 300" >&2
    exit 2
fi
if [ ! -f "$BASELINE" ]; then
    echo "baseline model not found: $BASELINE" >&2
    exit 2
fi
if [ -n "$KNOWN_SHA256" ]; then
    case "$KNOWN_SHA256" in
        *[!0-9a-fA-F]*)
            echo "RL_AWAIT_CANDIDATE_SHA256 must be a 64-character hexadecimal digest" >&2
            exit 2
            ;;
    esac
    if [ "${#KNOWN_SHA256}" -ne 64 ]; then
        echo "RL_AWAIT_CANDIDATE_SHA256 must be a 64-character hexadecimal digest" >&2
        exit 2
    fi
fi

mkdir -p "$OUTPUT_DIR"
STATUS_PATH="$OUTPUT_DIR/await-screen.status"
LOGICAL_CANDIDATE="$OUTPUT_DIR/candidate.snapshot.browser.json"
TEMP_CANDIDATE="$LOGICAL_CANDIDATE.tmp"
CANDIDATE_META="${CANDIDATE%.browser.json}.meta.json"
LOGICAL_META="$OUTPUT_DIR/candidate.snapshot.meta.json"
TEMP_META="$LOGICAL_META.tmp"
PAUSED=0
LAST_OBSERVED_SHA256=""

resumeProducer() {
    rm -f "$TEMP_CANDIDATE"
    rm -f "$TEMP_META"
    if [ "$PAUSED" -eq 1 ]; then
        /bin/kill -CONT -- "-$PRODUCER_PGID" 2>/dev/null || true
        PAUSED=0
    fi
}

trap 'resumeProducer' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

candidateIsReady() {
    if [ ! -f "$CANDIDATE" ]; then
        LAST_OBSERVED_SHA256=""
        return 1
    fi
    CURRENT_SHA256="$(sha256sum "$CANDIDATE" | awk '{print $1}')"
    if [ -n "$KNOWN_SHA256" ] && [ "$CURRENT_SHA256" = "$KNOWN_SHA256" ]; then
        LAST_OBSERVED_SHA256=""
        return 1
    fi
    if [ "$CURRENT_SHA256" = "$LAST_OBSERVED_SHA256" ]; then
        return 0
    fi
    LAST_OBSERVED_SHA256="$CURRENT_SHA256"
    return 1
}

while ! candidateIsReady; do
    if ! /bin/kill -0 -- "-$PRODUCER_PGID" 2>/dev/null; then
        printf '%s\n' "producer-exited-before-checkpoint" > "$STATUS_PATH"
        echo "producer exited before checkpoint: $CANDIDATE" >&2
        exit 1
    fi
    sleep "$POLL_SECONDS"
done

/bin/kill -STOP -- "-$PRODUCER_PGID"
PAUSED=1
cp "$CANDIDATE" "$TEMP_CANDIDATE"
mv "$TEMP_CANDIDATE" "$LOGICAL_CANDIDATE"
if [ -f "$CANDIDATE_META" ]; then
    cp "$CANDIDATE_META" "$TEMP_META"
    mv "$TEMP_META" "$LOGICAL_META"
else
    rm -f "$LOGICAL_META"
fi

if sh scripts/rl/eval-candidate-screen.sh "$SCOPE" "$LOGICAL_CANDIDATE" "$BASELINE" "$OUTPUT_DIR"; then
    printf '%s\n' "screen-complete" > "$STATUS_PATH"
else
    STATUS="$?"
    printf '%s\n' "screen-failed:${STATUS}" > "$STATUS_PATH"
    exit "$STATUS"
fi
