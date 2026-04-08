#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$ROOT_DIR"

OUT_DIR="models/rl_model"

exec python3 -m scripts.rl.train \
    --games 30000 \
    --eval-every 1000 \
    --js-eval-games 20 \
    --js-eval-opponents strong,expert \
    --metrics-csv "$OUT_DIR/train_metrics.csv" \
    --best-checkpoint "$OUT_DIR/best_model" \
    --summary-output "$OUT_DIR/summary.json" \
    --summary-run-index-csv "$OUT_DIR/run_index.csv" \
    --summary-config-index-csv "$OUT_DIR/config_index.csv" \
    --summary-format json \
    --summary-baseline-run baseline \
    --summary-weights strong=1,expert=2 \
    --run-label baseline \
    "$@"
