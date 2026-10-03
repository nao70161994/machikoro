# Directory review goal audit — 2026-10-04

This records the requested implementation and verification scope. Evidence is bounded to the environments and scenarios below; unmeasured hardware and operational conditions remain explicitly unverified.

| Requirement | Inspected evidence | Status and limits |
|---|---|---|
| Fatal exception/rejection shutdown and restart policy | server/processRuntime.js; tests/process-runtime.test.js; OPERATIONS.md | Exit code 1, single fatal handling, real child-process assertions; supervisor restart documented. Included in successful unit run for 20878bab. |
| 10-player/long-game time and memory measurement, log optimization | scripts/benchmark-local-engine-shadow.js; benchmark test; MAINTENANCE_BACKLOG local Engine row | Real 2p turn28/10p turn120 states and 1000-log stress; snapshot/log-replacing transitions optimized. Heap delta is measured, not peak RSS; rendering excluded. |
| Gameplay/log/Undo/restore/parity preservation | game-engine-local-shadow, game-engine-authority, snapshot-contract, ui-log tests; complete unit run | Covered by regression suites; only log-replacing transitions omit prior input log. |
| Authenticated waiting/start delivery disconnect recovery | rejoin-room-lifecycle-e2e, game-start-admission/coordinator tests; server room lifecycle | Same-token reservation/rejoin, explicit leave, live socket admission, start-committed/pre-broadcast recovery and mixed-version paths; previous online/E2E runs green. |
| PWA banner action reachability at 320/390/1440 and safe area | browser-pwa-smoke artifacts; Mobile WebKit; signed Android cutout result | Chromium local build/online creation at required sizes; WebKit CI37143070458 green. Android native cutout tested, CSS safe-area all0. Physical iOS/nonzero CSS inset remains unverified. |
| Safe CSP collection/operations and rollout decision after compatibility checks | bounded gateway tests; Render50 sanitized reports; production HTML; signed TWA37143430643 | Hash mismatch corrected in20878bab. Report-Only maintained because advertising dependencies and real worker-generation replacement remain unverified. No arbitrary inline/HTTPS authorization added. |
| checkJs for stable online/ui/storage boundaries | dedicated root checkJs projects; npm run test:static | All dedicated projects and shared static checks passed for20878bab; coverage306 runtime files recorded. |
| Current/historical documentation consistency | README; MAINTENANCE_BACKLOG; AI_HANDOFF; OPERATIONS; historical TECH_DEBT | Updated signing recovery, production report access/hash correction, trusted vs ephemeral TWA, observed vs unverified device paths. |
| Commit/push and final verification | Git main e29f1ccb; unit/static/PWA success; CI37143070458 success | Final production-signed TWA37158592464 and CI37158589402 both completed successfully for e29f1ccb. Release, CPU smoke and Mobile WebKit are green. |

Rollout decision: keep CSP Report-Only after reviewing real production reports and passing WebKit/TWA compatibility evidence. This fulfills the requested evidence-based decision without claiming ad-host trust or forcing enforcement. Physical iOS/nonzero CSS safe-area, process eviction and signed-TWA worker replacement remain unverified conditions; their coverage is not claimed by this work.

## Final direct rerun evidence

- `node tests/process-runtime.test.js` exited0; both actual child-process fatal paths ended code1.
- `node tests/rejoin-room-lifecycle-e2e.test.js` exited0; namespace seat reservation/explicit leave, started-room same-token recovery and legacy-schema disconnect-before-gameStart-delivery all passed. Logs are local artifacts and are not committed with transient socket/room identifiers.
- `node --expose-gc scripts/benchmark-local-engine-shadow.js --samples 10 --json` exited0 on Android/arm64 Node26.2.0. 2p turn28 production/counterfactual p50 was5.9697/5.6038ms; normal10p turn1209.1019/9.3426ms; long-log10p8.6565/28.7047ms. Long-log input snapshot5050/87032 bytes, median immediate heap delta459864/1068648 bytes. The small sample confirms bounded-log cost savings for stress, not a universal speedup or peak-memory measurement. Raw benchmark JSON is local `artifacts/directory-review-engine-final.json`.
- The inspected Mobile WebKit two-generation test uses real server v1→v2, `registration.update()`, waits for an installed waiting worker/banner, returns to title through production controls, then checks version/controller/cache migration. This is actual WebKit worker update evidence; it does not extend to Android TWA worker replacement.

## Final gate results

- CI [37158589402](https://github.com/nao70161994/machikoro/actions/runs/37158589402): Release, Mobile WebKit and CPU smoke success.
- Signed TWA [37158592464](https://github.com/nao70161994/machikoro/actions/runs/37158592464): success; APK37136395737, DAL bypassfalse, active `/sw.js`, both inline CSP hashes allowed, online room create/exit, paid build, Undo and Home return/next turn. Its screenshot now focuses the waiting panel.
- Earlier CSP correction CI37143070458 and signed TWA37143430643 also passed. Complete local unit/static/type/PWA checks passed for20878bab. The later changes only strengthen emulator instrumentation and update documentation.
- Git tree was clean before this audit document; all implementation changes were pushed through e29f1ccb. No gameplay protocol, signing identity or production enforcing CSP was changed by the final verification steps.

## Scope and limitations

The explicit goal covers fatal handling, measured Engine cost, authenticated disconnect recovery, banner reachability and browser/system safe-area observation, safe CSP reporting/rollout judgment, checkJs boundaries and consistent documentation. These implementation and named verification requirements have direct evidence above. This does not declare every possible browser/device or future production rollout safe. In particular, the measured Android cutout path provides zero CSS insets while positioning the viewport below the native cutout; it cannot establish iPhone/nonzero CSS inset behavior. Such risks retain their unverified status in the maintenance backlog.
