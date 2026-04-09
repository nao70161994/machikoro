#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$ROOT_DIR"

OUT_DIR="models/rl_model"

exec python3 -m scripts.rl.train \
    --games 10000 \
    --eval-every 2000 \
    --js-eval-games 2 \
    --js-eval-opponents strong \
    --initial-eval-games 50 \
    --eval-random-games 50 \
    --eval-heuristic-games 12 \
    --eval-pool-games 12 \
    --final-eval-random-games 100 \
    --final-eval-heuristic-games 24 \
    --final-eval-pool-games 24 \
    --progress-every 200 \
    --metrics-csv "$OUT_DIR/train_metrics.csv" \
    --best-checkpoint "$OUT_DIR/best_model" \
    --summary-output "$OUT_DIR/summary.json" \
    --summary-run-index-csv "$OUT_DIR/run_index.csv" \
    --summary-config-index-csv "$OUT_DIR/config_index.csv" \
    --summary-format json \
    --summary-baseline-run baseline \
    --summary-weights strong=1 \
    --run-label baseline \
    "$@"
