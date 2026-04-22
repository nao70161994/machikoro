#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
    echo "usage: sh scripts/rl/bg-watch-summary.sh <job-name>" >&2
    exit 1
fi

JOB_NAME="$1"
LOG_PATH="$(sh scripts/rl/bg-status.sh "${JOB_NAME}" | awk -F= '/^log=/{print $2}')"

if [ -z "${LOG_PATH}" ] || [ ! -f "${LOG_PATH}" ]; then
    echo "log not found for ${JOB_NAME}" >&2
    exit 1
fi

echo "job=${JOB_NAME}"
echo "log=${LOG_PATH}"
echo "---"
grep -E '^(\[進捗|\[[[:space:]]*[0-9]+|\[pool\]|best checkpoint|best checkpointを最終モデルへ復元|学習完了。モデル保存先:|最終勝率:|JS評価:|metrics集計を書き出しました:|         js=|         tgt=)' "${LOG_PATH}" | tail -n 40

