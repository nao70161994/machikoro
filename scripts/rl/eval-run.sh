#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/eval-run.sh RUN_LABEL [GAMES] [OPPONENTS]" >&2
    exit 2
fi

RUN_LABEL="$1"
GAMES="${2:-20}"
OPPONENTS="${3:-weak,normal,strong}"
MODEL="models/rl_model/runs/${RUN_LABEL}/best_model.browser.json"

exec npm run eval-rl-vs-js -- --model "$MODEL" --games "$GAMES" --opponents "$OPPONENTS"
