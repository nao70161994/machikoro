#!/bin/sh

set -eu

if [ "$#" -lt 2 ]; then
    echo "usage: sh scripts/rl/bg-finalize-experiment-set-top10-multiplayer.sh <set-name> <job-name>..." >&2
    exit 1
fi

SET_NAME="$1"
shift

REVIEW_INPUTS=""

for job in "$@"; do
    sh scripts/rl/bg-finalize-top10-multiplayer.sh "${job}" 15 50
    review_path="models/rl_model/eval-${job}-top10-multiplayer.review.json"
    if [ -z "${REVIEW_INPUTS}" ]; then
        REVIEW_INPUTS="${review_path}"
    else
        REVIEW_INPUTS="${REVIEW_INPUTS},${review_path}"
    fi
done

base_path="models/rl_model/reports/${SET_NAME}-multiplayer-experiment-set-review"
npm run review-rl-multiplayer-experiment-set -- --inputs "${REVIEW_INPUTS}" --format text --output "${base_path}.txt"
npm run review-rl-multiplayer-experiment-set -- --inputs "${REVIEW_INPUTS}" --format markdown --output "${base_path}.md"
npm run review-rl-multiplayer-experiment-set -- --inputs "${REVIEW_INPUTS}" --format json --output "${base_path}.json"

echo "saved:"
echo "  ${base_path}.txt"
echo "  ${base_path}.md"
echo "  ${base_path}.json"
