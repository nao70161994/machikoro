#!/bin/sh
# Private diagnostic: compare the same original assertion three times per style.
# This does not replace Release, Nightly or the full operation/visual gates.
set -eu
review_temp=$(mktemp -d)
cp style.css "$review_temp/candidate.css"
restore_candidate() {
    cp "$review_temp/candidate.css" style.css
    rm -rf "$review_temp"
}
trap restore_candidate EXIT HUP INT TERM
git fetch --depth=1 origin d2255b33b10a263bc61f8b01e671990dee8847a5
git show d2255b33b10a263bc61f8b01e671990dee8847a5:style.css > "$review_temp/baseline.css"
mkdir -p test-results/bounded-paint
candidate_status=1
for mode in baseline candidate; do
    cp "$review_temp/$mode.css" style.css
    run_status=0
    node scripts/diagnostics/run-browser-with-resources.js --output="test-results/bounded-paint/$mode-resources.jsonl" -- npx playwright test cardboard-view.spec.js --grep '実ロール後の新規建設通知.*1440px' --project=mobile-webkit --workers=1 --retries=0 --repeat-each=3 --output="test-results/bounded-paint/$mode" || run_status=$?
    printf '{"variant":"%s","exitStatus":%s}\n' "$mode" "$run_status" > "test-results/bounded-paint/$mode-status.json"
    if [ "$mode" = candidate ]; then candidate_status=$run_status; fi
done
# Baseline failures are retained for comparison; candidate failures fail the job.
exit "$candidate_status"
