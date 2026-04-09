#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$ROOT_DIR"

RUN_LABEL="baseline"
CUSTOM_OUT_DIR=""
EXPECT_VALUE=""

for ARG in "$@"; do
    if [ -n "$EXPECT_VALUE" ]; then
        case "$EXPECT_VALUE" in
            run_label) RUN_LABEL="$ARG" ;;
            out_dir) CUSTOM_OUT_DIR="$ARG" ;;
        esac
        EXPECT_VALUE=""
        continue
    fi
    case "$ARG" in
        --run-label)
            EXPECT_VALUE="run_label"
            ;;
        --run-label=*)
            RUN_LABEL=${ARG#--run-label=}
            ;;
        --out-dir)
            EXPECT_VALUE="out_dir"
            ;;
        --out-dir=*)
            CUSTOM_OUT_DIR=${ARG#--out-dir=}
            ;;
    esac
done

if [ -n "$EXPECT_VALUE" ]; then
    echo "error: --${EXPECT_VALUE} には値が必要です" >&2
    exit 1
fi

if [ -n "$CUSTOM_OUT_DIR" ]; then
    OUT_DIR="$CUSTOM_OUT_DIR"
else
    OUT_DIR="models/rl_model/runs/$RUN_LABEL"
fi

mkdir -p "$OUT_DIR"

echo "出力先: $OUT_DIR"

exec python3 -m scripts.rl.train \
    --games 1000 \
    --eval-every 500 \
    --hidden 128 \
    --js-eval-games 1 \
    --js-eval-opponents strong \
    --initial-eval-games 0 \
    --eval-random-games 10 \
    --eval-heuristic-games 4 \
    --eval-pool-games 4 \
    --final-eval-random-games 20 \
    --final-eval-heuristic-games 8 \
    --final-eval-pool-games 8 \
    --progress-every 50 \
    --max-steps 1200 \
    --eval-max-steps 1200 \
    --metrics-csv "$OUT_DIR/train_metrics.csv" \
    --best-checkpoint "$OUT_DIR/best_model" \
    --summary-output "$OUT_DIR/summary.json" \
    --summary-run-index-csv "$OUT_DIR/run_index.csv" \
    --summary-config-index-csv "$OUT_DIR/config_index.csv" \
    --summary-format json \
    --summary-baseline-run "$RUN_LABEL" \
    --summary-weights strong=1 \
    --run-label "$RUN_LABEL" \
    "$@"
