# Operations

This page is the runbook for keeping real-device manual checks small. The target state is: automated nightly regression catches release/PWA/online drift, browser error reports are classified, and only unknown failures page loudly.

## Nightly Regression

GitHub Actions runs `.github/workflows/nightly-release-test.yml` every day at 03:17 JST and on manual dispatch.

Nightly commands:

```sh
npm run test:release
npm run test:pwa
npm run test:online
```

The workflow installs Node dependencies with `npm ci` and installs `scripts/rl/requirements.txt` so shared test helpers remain compatible with the release workflow. It posts to `NTFY_CI_TOPIC` only when the job fails. Successful nightly runs stay silent.

## CI Failure Notification

Set `NTFY_CI_TOPIC` as a GitHub Actions repository secret. Use a topic that is different from production browser errors (`NTFY_TOPIC`).

Nightly CI failure notifications include:

- workflow name
- branch
- short commit hash
- failed job name
- GitHub Actions run URL

Treat a nightly failure as a release blocker until the failing command is green again. If the failure is flaky, rerun the workflow once and then file the failing command, run URL, and commit in `docs/IMPLEMENTATION_PROGRESS.md` or the relevant issue.

## Client Error Classification

Server-side ntfy client error notifications now include a `classification=` line and use priority by class:

| Classification | Priority | Meaning | First response |
| --- | --- | --- | --- |
| `unknown` | 5 | No known pattern or stale fixed version matched. | Investigate immediately. Capture the ntfy body, app version, `FREEZE_SUMMARY`, and reproduce with targeted tests. |
| `known-pattern` | 3 | A recognized UI lock/freeze or known message pattern matched. | Check whether it is a regression on a current version. If current, add a targeted test before changing recovery logic. |
| `stale-client` | 2 | The report came from a version prefix that already has a known fix. | Ask the device to apply the update banner, unregister SW/clear caches if needed, then verify `/api/version` and `window.MACHIKORO_CLIENT_VERSION`. |

Unknown notifications are the only high-priority browser error class. Known/stale notifications still matter, but they should not interrupt unless they repeat on the current deployed version.

### `human-turn-ui-locked` as a state-machine mismatch

Treat current-version `human-turn-ui-locked` as a mismatch between `GameManager.allowedActionsFor(game)` and the physical UI container state, not as a phase-specific one-off. The app now keeps a primary action container registry in `js/appShell.js`:

| Phase | Allowed action family | Primary container |
| --- | --- | --- |
| `roll` | `rollDice` | `btnRoll` |
| `selectDice` / `rerollConfirm` / `harborChoice` | dice/reroll/harbor actions | `diceChoose` |
| `pending` or `pendingIT` special case | `resolve*` pending actions | `pendingModal` / `pendingMenu` |
| `build` | `buildCard` / `buildLandmark` / `undoBuild` | `buildMenu` |
| `build` | `nextTurn` | `btnSkip` |

If an allowed action exists but its container is hidden, inert, aria-hidden, pointer-blocked, ancestor-blocked, lacks the expected `data-action` child, or has no usable child actions, `validateUiInteractability()` reports a registry-based `allowed-action-container-not-clickable` issue. Missing registry entries are reported as `allowed-action-missing-container-registry` instead of being silently ignored. Normal render runs `syncUiInteractabilityAfterRender()` to make allowed containers physically clickable before the watchdog fires. `recoverUiInteractability()` remains the final fallback and records before/after diagnostics, but a recovery firing on a current version should still be treated as a regression. Add new gameplay action surfaces to the registry first, then add registry coverage, normal-render no-recovery, and fallback recovery tests. Existing entry points are `tests/integration.test.js` and the release DOM-id check in `tests/release-e2e.test.js`.

### `cpu-turn-stalled` during pending CPU turns

Treat current-version `cpu-turn-stalled` with `phase=pending` as a CPU action pipeline issue, not a UI lock. When `allowedActions=["resolveIT"]` and the current player is CPU, the live CPU scheduler must resolve IT through the same pending resolver path used for TV/Business/Mover/Renovation. `pendingIT` remains queue-external and priority-first by design, so it should be resolved before any queued pending action. If this repeats on a current version, inspect `scheduleCPU-pending-resolution` checkpoints before adding watchdog recovery.

## Known Fixed Client Versions

The current stale-client prefixes are maintained in `server.js` as `STALE_CLIENT_ERROR_VERSION_PREFIXES` and should be updated only when a production notification identifies a bug fixed in a later commit.

| Version prefix | Known symptom | Current handling |
| --- | --- | --- |
| `d1eb530` | local build phase `human-turn-ui-locked` / orphan `gameScreen.inert` | stale client if reported again |
| `f6ce626` | `renderPlayers` playerSettings `difficulty` fallback crash | stale client if reported again |
| `86136c7` | post-build `gameScreen.display=none` + inert lock | stale client if reported again |
| `cedbf74` | iPhone Safari pending modal `pointer-events:none` | stale client if reported again |
| `5d058cb` | rerollConfirm parent container hidden while reroll actions are allowed | stale client if reported again |
| `9cd909f` | CPU turn `pendingIT` / `resolveIT` remained in pending long enough to report `cpu-turn-stalled` | stale client if reported again |

When adding a version here, also add or update a regression test that proves the fix. Do not add a prefix just to hide an unknown current-version report.

## Browser Error Triage

For every ntfy browser error:

1. Read `classification`, `pattern`, `phase`, `version`, and user agent.
2. If `classification=stale-client`, verify whether the device has an old Service Worker or cache. Use the PWA update banner first; if needed, run `window.__machikoroCheckVersionMismatch()` and clear `machikoro-*` caches.
3. If `classification=known-pattern`, compare the report version to `/api/version`. A known pattern on the current version is treated as a regression.
4. If `classification=unknown`, create a focused test before broad refactors. Preserve the ntfy body and local `machikoroFreezeSnapshot` when available.
5. Never paste reconnect tokens, raw room codes, full snapshots, or localStorage dumps into public issues.

## Manual Checks Still Required

Nightly automation reduces but does not fully replace:

- real iPhone Safari install/update prompt behavior
- Android Chrome/TWA store packaging behavior
- multi-device long-running online play over real networks
- screen reader announcement quality
- hostless restore or server-persisted canonical state design validation

Keep these as explicit manual/design items rather than treating nightly green as proof of real-device completion.

## Design Decision Index

Deferred design decisions are tracked in `docs/IMPLEMENTATION_DECISIONS.md`. Operationally important outcomes:

- Public production client-error reporting should set `CLIENT_ERROR_ALLOWED_ORIGINS` and keep `NTFY_TOPIC` private. Scripted/no-origin diagnostics should use `CLIENT_ERROR_SHARED_TOKEN` or a temporary `CLIENT_ERROR_ALLOW_NO_ORIGIN` exception.
- Do not set `CLIENT_ERROR_SHARED_TOKEN` for normal browser reporting unless the browser is intentionally configured to send the token; otherwise real-device reports will be rejected.
- Stale-client classification is diagnostic. It must not automatically clear restore bundles, reject reconnect, or reload during an active game.
- Server restart restore remains host-only for casual play. Hostless restore and server-persisted canonical state are design/implementation projects, not operational toggles.
- Multiple room resume UI should not be enabled until restore bundles have a per-room index and stale bundles have a safe pruning policy.
