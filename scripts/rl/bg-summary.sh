#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/bg-summary.sh <job-name>" >&2
    exit 1
fi

JOB_NAME="$1"
SUMMARY_PATH="models/rl_model/runs/${JOB_NAME}/summary.json"

if [ ! -f "${SUMMARY_PATH}" ]; then
    echo "summary not found: ${SUMMARY_PATH}" >&2
    exit 1
fi

python3 - "$SUMMARY_PATH" <<'PY'
import json
import sys

summary_path = sys.argv[1]
with open(summary_path, "r", encoding="utf-8") as fh:
    data = json.load(fh)

best_runs = data.get("bestRuns") or []
best_configs = data.get("bestConfigs") or []
combined_top = data.get("combinedTop") or []

print(f"summary={summary_path}")
if best_runs:
    run = best_runs[0]
    print(
        "bestRun="
        f"{run.get('runLabel','')} "
        f"game={run.get('game')} "
        f"score={run.get('score')}"
    )
if best_configs:
    cfg = best_configs[0]
    print(
        "bestConfig="
        f"{cfg.get('configKey','')} "
        f"run={cfg.get('runLabel','')} "
        f"game={cfg.get('game')} "
        f"score={cfg.get('score')}"
    )
if combined_top:
    top = combined_top[0]
    print(
        "combinedTop="
        f"game={top.get('game')} "
        f"score={top.get('score')} "
        f"run={top.get('runLabel','')}"
    )
PY
