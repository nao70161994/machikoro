#!/bin/sh
set -eu

GAMES="${1:-8}"
TOP="${2:-5}"

exec node scripts/search-expert-top-tier.js \
  --games "${GAMES}" \
  --top "${TOP}" \
  --format text
