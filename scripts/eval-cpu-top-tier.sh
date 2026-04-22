#!/bin/sh
set -eu

GAMES="${1:-50}"
SEED="${2:-1}"

exec node scripts/eval-expert-vs-strong.js \
  --games "${GAMES}" \
  --seed "${SEED}" \
  --format text
