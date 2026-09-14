#!/bin/sh

set -eu

if [ "$#" -ne 4 ]; then
    echo "usage: sh scripts/rl/eval-candidate-screen.sh <2p|mp> <candidate.browser.json> <baseline.browser.json> <output-dir>" >&2
    exit 2
fi

SCOPE="$1"
CANDIDATE="$2"
BASELINE="$3"
OUTPUT_DIR="$4"
REQUESTED_GAMES="${RL_SCREEN_GAMES:-50}"
PARALLEL_MODELS="${RL_EVAL_PARALLEL_MODELS:-1}"
REUSE_RESULTS="${RL_EVAL_REUSE_RESULTS:-}"

case "$REQUESTED_GAMES" in
    ''|*[!0-9]*)
        echo "RL_SCREEN_GAMES must be a positive integer" >&2
        exit 2
        ;;
    *)
        if [ "$REQUESTED_GAMES" -lt 50 ]; then
            echo "RL_SCREEN_GAMES must be at least 50" >&2
            exit 2
        fi
        ;;
esac

case "$PARALLEL_MODELS" in
    ''|*[!0-9]*|0)
        echo "RL_EVAL_PARALLEL_MODELS must be a positive integer" >&2
        exit 2
        ;;
esac

roundUpToSeatCycle() {
    VALUE="$1"
    PLAYER_COUNT="$2"
    REMAINDER=$((VALUE % PLAYER_COUNT))
    if [ "$REMAINDER" -eq 0 ]; then
        printf '%s\n' "$VALUE"
    else
        printf '%s\n' "$((VALUE + PLAYER_COUNT - REMAINDER))"
    fi
}

if [ ! -f "$CANDIDATE" ]; then
    echo "candidate model not found: $CANDIDATE" >&2
    exit 2
fi
if [ ! -f "$BASELINE" ]; then
    echo "baseline model not found: $BASELINE" >&2
    exit 2
fi

mkdir -p "$OUTPUT_DIR"

runModelEvaluation() {
    if [ -n "$REUSE_RESULTS" ]; then
        if [ ! -f "$REUSE_RESULTS" ]; then
            echo "reuse results not found: $REUSE_RESULTS" >&2
            exit 2
        fi
        node scripts/eval-rl-models.js "$@" --reuse-results "$REUSE_RESULTS"
    else
        node scripts/eval-rl-models.js "$@"
    fi
}

case "$SCOPE" in
    2p)
        GAMES="$(roundUpToSeatCycle "$REQUESTED_GAMES" 2)"
        runModelEvaluation \
            --model-paths "$CANDIDATE,$BASELINE" \
            --games "$GAMES" \
            --seed 2101 \
            --max-steps 1200 \
            --opponents weak,normal,strong,expert \
            --paired-seats \
            --parallel-models "$PARALLEL_MODELS" \
            --abort-on-exhaustion \
            --progress-every 10 \
            --allow-smoke \
            --format json \
            --output "$OUTPUT_DIR/js-lineups-2p.json"
        node scripts/eval-rl-head-to-head.js \
            --candidate "$CANDIDATE" \
            --baseline "$BASELINE" \
            --games "$GAMES" \
            --seed 2201 \
            --max-steps 1200 \
            --progress-every 10 \
            --abort-on-exhaustion \
            --output "$OUTPUT_DIR/head-to-head-2p.json" \
            --format json
        node scripts/eval-rl-special-scenarios.js \
            --model-paths "$CANDIDATE,$BASELINE" \
            --player-count 2 \
            --format json \
            --output "$OUTPUT_DIR/special-pending-2p.json"
        ;;
    mp)
        GAMES="$(roundUpToSeatCycle "$REQUESTED_GAMES" 4)"
        runModelEvaluation \
            --model-paths "$CANDIDATE,$BASELINE" \
            --games "$GAMES" \
            --seed 4101 \
            --max-steps 1200 \
            --lineups 'rl,normal,normal,strong;rl,strong,strong,strong' \
            --paired-seats \
            --parallel-models "$PARALLEL_MODELS" \
            --abort-on-exhaustion \
            --progress-every 10 \
            --allow-smoke \
            --format json \
            --output "$OUTPUT_DIR/js-lineups-4p.json"
        node scripts/eval-rl-head-to-head.js \
            --candidate "$CANDIDATE" \
            --baseline "$BASELINE" \
            --games "$GAMES" \
            --seed 4201 \
            --max-steps 1200 \
            --lineups 'candidate,baseline,normal,strong' \
            --progress-every 10 \
            --abort-on-exhaustion \
            --output "$OUTPUT_DIR/head-to-head-4p.json" \
            --format json
        node scripts/eval-rl-special-scenarios.js \
            --model-paths "$CANDIDATE,$BASELINE" \
            --player-count 4 \
            --format json \
            --output "$OUTPUT_DIR/special-pending-4p.json"
        ;;
    *)
        echo "scope must be 2p or mp" >&2
        exit 2
        ;;
esac

node scripts/review-rl-candidate-screen.js \
    --scope "$SCOPE" \
    --input-dir "$OUTPUT_DIR" \
    --format json \
    --output "$OUTPUT_DIR/review.json"
node scripts/review-rl-candidate-screen.js \
    --scope "$SCOPE" \
    --input-dir "$OUTPUT_DIR"

echo "candidate screen complete: scope=$SCOPE requestedGames=$REQUESTED_GAMES pairedGames=$GAMES output=$OUTPUT_DIR"
