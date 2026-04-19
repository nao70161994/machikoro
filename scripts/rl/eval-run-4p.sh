#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/eval-run-4p.sh RUN_LABEL [GAMES] [RANK]" >&2
    exit 2
fi

RUN_LABEL="$1"
GAMES="${2:-50}"
RANK="${3:-1}"

if [ "$RANK" = "1" ]; then
    MODEL="models/rl_model/runs/${RUN_LABEL}/best_model.browser.json"
else
    MODEL="models/rl_model/runs/${RUN_LABEL}/best_model.top${RANK}.browser.json"
fi

LINEUPS="rl,weak,normal,strong;rl,normal,normal,strong;rl,weak,weak,normal"

exec npm run eval-rl-vs-js -- --model "$MODEL" --games "$GAMES" --lineups "$LINEUPS"
