#!/bin/sh
set -eu

GAMES="${1:-8}"
TOP="${2:-5}"
OUT_PREFIX="${3:-models/cpu_top_tier_search/search-g${GAMES}-top${TOP}}"

mkdir -p "$(dirname "${OUT_PREFIX}")"

node scripts/search-expert-top-tier.js \
  --games "${GAMES}" \
  --top "${TOP}" \
  --format text \
  --output "${OUT_PREFIX}.txt"

node scripts/search-expert-top-tier.js \
  --games "${GAMES}" \
  --top "${TOP}" \
  --format markdown \
  --output "${OUT_PREFIX}.md" \
  --quiet

node scripts/search-expert-top-tier.js \
  --games "${GAMES}" \
  --top "${TOP}" \
  --format json \
  --output "${OUT_PREFIX}.json" \
  --quiet

cat "${OUT_PREFIX}.txt"
