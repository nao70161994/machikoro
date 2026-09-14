#!/bin/sh

set -eu

if [ "$#" -ne 5 ]; then
    echo "usage: sh scripts/rl/eval-candidate-promotion.sh <2p|mp> <100|300> <candidate.browser.json> <baseline.browser.json> <output-dir>" >&2
    exit 2
fi

SCOPE="$1"
REQUESTED_GAMES="$2"
CANDIDATE="$3"
BASELINE="$4"
OUTPUT_DIR="$5"
PARALLEL_MODELS="${RL_EVAL_PARALLEL_MODELS:-1}"
REUSE_RESULTS="${RL_EVAL_REUSE_RESULTS:-}"

case "$REQUESTED_GAMES" in
    100|300) ;;
    *)
        echo "promotion games must be 100 or 300" >&2
        exit 2
        ;;
esac

case "$PARALLEL_MODELS" in
    ''|*[!0-9]*|0)
        echo "RL_EVAL_PARALLEL_MODELS must be a positive integer" >&2
        exit 2
        ;;
esac

if [ -n "$REUSE_RESULTS" ] && [ ! -f "$REUSE_RESULTS" ]; then
    echo "reuse results not found: $REUSE_RESULTS" >&2
    exit 2
fi

roundUpToSeatCycle() {
    VALUE="$1"
    CYCLE="$2"
    REMAINDER=$((VALUE % CYCLE))
    if [ "$REMAINDER" -eq 0 ]; then
        printf '%s\n' "$VALUE"
    else
        printf '%s\n' "$((VALUE + CYCLE - REMAINDER))"
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
        node scripts/eval-rl-models.js "$@" --reuse-results "$REUSE_RESULTS"
    else
        node scripts/eval-rl-models.js "$@"
    fi
}

case "$SCOPE" in
    2p)
        GAMES="$(roundUpToSeatCycle "$REQUESTED_GAMES" 2)"
        RL_SCREEN_GAMES="$GAMES" sh scripts/rl/eval-candidate-screen.sh \
            2p "$CANDIDATE" "$BASELINE" "$OUTPUT_DIR"
        ;;
    mp)
        # 3/4/5/10人の全lineupを同じ標本数でpaired-seat評価するため、
        # 最小公倍数60の完全cycleへ切り上げる（100戦段階は実効120戦）。
        GAMES="$(roundUpToSeatCycle "$REQUESTED_GAMES" 60)"
        runModelEvaluation \
            --model-paths "$CANDIDATE,$BASELINE" \
            --games "$GAMES" \
            --seed 5101 \
            --max-steps 1200 \
            --lineups 'rl,normal,strong;rl,normal,normal,strong;rl,normal,normal,strong,expert;rl,normal,normal,strong,expert,weak,normal,strong,expert,normal' \
            --paired-seats \
            --parallel-models "$PARALLEL_MODELS" \
            --abort-on-exhaustion \
            --progress-every 10 \
            --format json \
            --output "$OUTPUT_DIR/js-lineups-3p4p5p10p.json"
        node scripts/eval-rl-head-to-head.js \
            --candidate "$CANDIDATE" \
            --baseline "$BASELINE" \
            --games "$GAMES" \
            --seed 5201 \
            --max-steps 1200 \
            --lineups 'candidate,baseline,strong;candidate,baseline,normal,strong;candidate,baseline,normal,strong,expert;candidate,baseline,weak,normal,strong,expert,normal,strong,expert,normal' \
            --progress-every 10 \
            --abort-on-exhaustion \
            --format json \
            --output "$OUTPUT_DIR/head-to-head-3p4p5p10p.json"
        node scripts/eval-rl-special-scenarios.js \
            --model-paths "$CANDIDATE,$BASELINE" \
            --player-count 4 \
            --format json \
            --output "$OUTPUT_DIR/special-pending-4p.json"
        node scripts/review-rl-candidate-promotion.js \
            --input-dir "$OUTPUT_DIR" \
            --format json \
            --output "$OUTPUT_DIR/review.json"
        node scripts/review-rl-candidate-promotion.js \
            --input-dir "$OUTPUT_DIR"
        ;;
    *)
        echo "scope must be 2p or mp" >&2
        exit 2
        ;;
esac

echo "candidate promotion evaluation complete: scope=$SCOPE requestedGames=$REQUESTED_GAMES pairedGames=$GAMES output=$OUTPUT_DIR"
