# Operations

This page is the runbook for keeping real-device manual checks small. The target state is: automated nightly regression catches release/PWA/online drift, browser error reports are classified, and only unknown failures page loudly.

## Operator Quick Start

Use this document as the first stop when production behavior looks wrong. Other docs remain source material, but operational decisions should start here:

- Release gate and public preflight: `docs/RELEASE_CHECKLIST.md`
- Browser error / lifecycle notification details: `docs/NTFY_ERROR_REPORTING.md`
- PWA update and RL model loading behavior: `docs/PWA_MODEL_LOADING.md`
- Online restore and trust boundaries: `docs/ONLINE_SYNC.md`, `docs/ADR_RESTORE_TRUST_BOUNDARY.md`
- AI maintenance handoff: `docs/AI_HANDOFF.md`

Normal operations should answer four questions in order:

1. Is this an `unknown` browser/runtime problem, a CI failure, a stale client, or normal lifecycle traffic?
2. Which deployed commit produced it? Compare ntfy `version=`, `/api/version`, and the latest GitHub Actions commit.
3. Is the issue already covered by a known pattern or stale-client prefix?
4. If code changes are needed, add or update a targeted regression test before changing behavior.

## Notification Categories and Priority

| Category | Source | ntfy topic | Priority | Meaning | First response |
| --- | --- | --- | --- | --- | --- |
| `play-start` / `play-finish` | Browser `/api/game-lifecycle` | `NTFY_TOPIC` | Low | Normal usage heartbeat. | Use for uptime/activity confirmation only. Investigate only if volume changes unexpectedly or payloads contain private data. |
| `unknown` | Browser `/api/client-error` | `NTFY_TOPIC` | Highest | New crash/freeze/UI-lock pattern not classified as fixed or known. | Stop and triage immediately. Preserve notification body, version, user agent, phase, and local freeze snapshot if available. |
| `known-pattern` | Browser `/api/client-error` | `NTFY_TOPIC` | Medium | Recognized issue family such as UI lock, pending lock, or CPU stall. | Check version. Current-version repeats are regressions; stale versions go through update guidance. |
| `stale-client` | Browser `/api/client-error` | `NTFY_TOPIC` | Low | Device is running a version prefix with a known fixed bug. | Ask user/device to apply update banner or clear PWA cache; verify version after reload. |
| CI failed | GitHub Actions failure hook | `NTFY_CI_TOPIC` | High | Release/static/PWA/online/nightly workflow failed. | Open the Actions URL immediately. Treat as release blocker until rerun or fix is green. |

Priority order: `unknown` first, CI failed second, current-version `known-pattern` third, `stale-client` fourth, lifecycle traffic last.

## Production Environment Variables

Set these in the service that runs `server.js` unless noted otherwise:

| Name | Where | Required | Purpose | Operations note |
| --- | --- | --- | --- | --- |
| `NODE_ENV=production` | Render | Recommended | Enables production defaults such as no-origin client-error blocking when `NTFY_TOPIC` is set. | Keep explicit in production so debug defaults do not leak. |
| `NTFY_TOPIC` | Render | Recommended | Browser client-error and lifecycle notifications. | Use a hard-to-guess topic. Rotate if exposed. |
| `NTFY_CI_TOPIC` | GitHub Actions secret | Optional but recommended | Failure-only CI notifications. | Use a different topic from `NTFY_TOPIC`; success runs stay silent. |
| `CLIENT_ERROR_ALLOWED_ORIGINS` | Render | Recommended for public production | Comma-separated public origins allowed to report browser errors. | Same-origin reports are allowed automatically; use this for explicit public origin hygiene. |
| `CLIENT_ERROR_SHARED_TOKEN` | Render | Optional | Token for scripted/no-origin diagnostics and `/api/client-error-test`. | Do not require normal browser reports to expose it. Use only for controlled tests or non-browser senders. |
| `CLIENT_ERROR_TEST_ENABLED=1` | Render | Temporary only | Enables `/api/client-error-test` in production-like environments. | Remove immediately after test notification. |
| `CLIENT_ERROR_ALLOW_NO_ORIGIN` | Render | Debug only | Allows no-origin/no-token diagnostics. | Avoid in production except a short controlled window. |
| `BUILD_HASH` | Render / CI | Optional | Overrides detected git hash for `/api/version`, SW cache, and reports. | Usually let deployment derive it; set only when build metadata is otherwise unavailable. |
| `TRUST_PROXY=1` | Render | Deployment-specific | Trusts proxy headers for origin/protocol/IP handling. | Set only behind a trusted proxy and with correct public origin allowlist. |

## Incident Response Runbooks

### Unknown browser notification

1. Copy the full ntfy body into the private issue or working notes.
2. Record `classification`, `pattern`, `phase`, `version`, browser/OS, and whether it is local or online.
3. Compare `version=` with `/api/version` and the latest deployed commit.
4. Check `machikoroFreezeSnapshot`, `machikoroFreezeSummary`, and recent flow checkpoints if you can access the device.
5. Add a targeted regression test that reproduces the failing state before changing shared recovery or gameplay logic.
6. After fixing, add the old version prefix to stale-client handling only when a production notification proves the old client still reports the fixed bug.

### CI failed notification

1. Open the Actions run URL from ntfy.
2. Identify the failed command and whether it is release, PWA, online, RL, CPU, or static.
3. Rerun once only if the failure looks infrastructure/flaky.
4. If it reproduces, fix on the smallest relevant surface and run the failed command locally.
5. Do not publish or enable ads/PWA production traffic until the target commit is green.

### Stale client notification

1. Confirm `classification=stale-client` and note the version prefix.
2. Ask the user/device to use the PWA update banner first.
3. If the banner is missing or stale JS remains, run `window.__machikoroCheckVersionMismatch()` in console.
4. Compare `window.MACHIKORO_CLIENT_VERSION` with `/api/version`.
5. If still stale, unregister the Service Worker and clear `machikoro-*` caches, then reload.
6. Do not delete restore bundles automatically during this flow.

### UI lock / known-pattern notification

1. Treat current-version `human-turn-ui-locked`, `post-build-ui-blocked`, `pending-ui-locked`, or `cpu-turn-stalled` as a regression, even if recovery eventually finished the game.
2. Inspect `allowedActions`, phase, visible modals, primary container, `ancestorBlocked`, `pointer-events`, and `gameScreen.inert/display`.
3. Confirm whether normal render should have made the primary action container clickable before watchdog recovery.
4. Add a no-recovery regression test for the phase/action/container pair, then keep recovery as the final fallback.

### Online restore / reconnect notification

1. Identify whether the report is live reconnect, server restart restore, host migration, or stale bundle handling.
2. Preserve room id only privately; do not paste reconnect tokens or raw localStorage in public notes.
3. Compare host/non-host role, `hostEpoch`, replay-backed rank, snapshot `actionSeq`, residual action log, and accepted client action refs.
4. Remember the trust boundary: host-only restore remains authoritative; `onlineRestoreRoomIndex` and `restoreAudit` do not increase authority.
5. Escalate to design work before changing hostless restore, signed restore, durable canonical store, or room replacement rules.

## PWA Update Operations

Use this when a device appears to run old JS, misses a fix, or reports stale-client:

1. Check server version:

   `curl -s <PUBLIC_ORIGIN>/api/version`

2. Check browser version:

   `window.MACHIKORO_CLIENT_VERSION`

3. Force the app-side check:

   `window.__machikoroCheckVersionMismatch()`

4. Prefer the in-app update banner. It is designed to avoid auto-reloading during active games.
5. If the banner fails, manually unregister the Service Worker and delete `machikoro-*` caches.
6. Reload once and re-check both versions.
7. If online restore/reconnect is involved, verify the session still reconnects before deleting any saved state.

The Service Worker must not precache RL model JSON; those models are lazy-loaded and runtime cached. PWA update fixes should keep game-in-progress reloads manual.

## AdSense Review Change Policy

While AdSense review is in progress, keep changes small and stability-focused:

- Allowed: docs cleanup, OGP/image metadata improvements, how-to text, unknown notification fixes, CI failure fixes, typo fixes, and minor CSS for static pages.
- Avoid until review completes: large UI redesigns, ad placement changes, PWA behavior changes, URL changes, rule changes, and broad refactors.
- Keep commits small and run at least `git diff --check`, `node tests/main.test.js`, and `npm run test:static` for review-period docs/static-page changes.

## Public Release Preflight

Before public traffic, ads, or wider PWA install testing:

- `git status --short` is empty.
- CI is green on the exact commit to deploy.
- `docs/RELEASE_CHECKLIST.md` automated gate has been run or CI covers it.
- `privacy.html` and `rules.html` are reachable from the title screen and cached by the PWA shell; the title page metadata mentions 登録不要 / no-registration play, `rules.html` explains the win condition and keeps OGP/Twitter rule-page metadata current, and `privacy.html` also mentions contact guidance and the last updated date.
- AdSense placeholders remain outside gameplay controls and still use `pointer-events: none`.
- PWA install prompt and update banner have been checked on at least one real mobile browser before relying on them publicly.
- `/api/client-error-test` sends to ntfy in a controlled window, then `CLIENT_ERROR_TEST_ENABLED` is removed again.
- Lifecycle `play-start` / `play-finish` notification arrives without player names, room codes, reconnect tokens, card inventories, or snapshots.
- A stale-client drill has been performed: compare browser version, server version, update banner, and cache clearing fallback.

## Codex Incident Prompt Templates

Use these as copy/paste starters when handing work to Codex. Replace bracketed values with the notification or CI details.

### Unknown notification

`/goal Investigate and fix current-version unknown ダイスシティ client notification. Notification: [paste private ntfy body]. Version=[hash], phase=[phase], UA=[browser]. Preserve privacy, add targeted regression test first, update docs/OPERATIONS.md if this becomes a known pattern, run relevant tests, commit/push.`

### CI failure

`/goal Fix GitHub Actions CI failure. Workflow=[name], job=[job], commit=[hash], run URL=[url], failed command=[command]. Reproduce locally, make the smallest fix, run the failed command plus related tests, commit/push.`

### Stale client

`/goal Review stale-client notification and update operations guidance if needed. Version=[old hash], current deploy=[hash], symptom=[pattern]. Do not suppress current-version reports. Confirm stale prefix is documented only if fixed by a later commit; update tests/docs if necessary, commit/push.`

### UI lock

`/goal Fix current-version UI lock regression without relying on watchdog recovery. Notification: phase=[phase], allowedActions=[actions], issue=[ancestor/display/inert/pointer], container=[id]. Add normal-render no-recovery regression test, keep recovery as fallback, run UI/integration/release tests, commit/push.`

### PWA update problem

`/goal Investigate PWA stale JS/update banner issue. Server /api/version=[hash], window.MACHIKORO_CLIENT_VERSION=[hash], browser=[browser], standalone=[yes/no]. Do not delete restore data automatically. Add or update PWA/release tests and operations docs, commit/push.`

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

Modal-close note: if a rules/card-selection close report shows no visible modals but `gameScreen` or `body.modal-open` remains locked, treat it as a modal lifecycle cleanup regression. Start with `modal-close-ui-state` / `modal-close-orphan-lock-cleared` flow checkpoints before adding new watchdog recovery.

Build-phase note: `allowedActionsFor(game)` can include `buildCard` / `buildLandmark` even when no affordable candidate exists, and may still include them after construction while `nextTurn` / `undoBuild` are the relevant controls. Current-version `action-child-not-clickable` for `buildLandmark` should be investigated as a selector/candidate contract mismatch: if the turn has already built or no enabled landmark is affordable, it is not a clickable-child regression; if an unbuilt affordable enabled landmark exists, at least one `data-action=buildLandmark` child must be physically usable after normal render.

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
- `CLIENT_ERROR_SHARED_TOKEN` is for scripted/no-origin diagnostics and `/api/client-error-test`; same-origin browser `/api/client-error` and `/api/game-lifecycle` reports remain tokenless so real-device reporting keeps working. Keep the token private and do not expose it to normal browser code unless a deliberate browser token model is added.
- Stale-client classification is diagnostic. It must not automatically clear restore bundles, reject reconnect, or reload during an active game.
- Server restart restore remains host-only for casual play. Hostless restore and server-persisted canonical state are design/implementation projects, not operational toggles.
- Multiple room resume UI should not be enabled until restore bundles have a per-room index and stale bundles have a safe pruning policy.

## Online Restore Room Index

- Clients keep `onlineRestoreRoomIndex` as a lightweight localStorage index of room-scoped restore bundles. It helps future diagnostics/resume UI find candidate rooms without scanning every key.
- The index is not authoritative and must not override server canonical state, host restore rank, or scoped restore reads. Stale index pruning removes index rows only.
- Do not enable multiple-room resume UI or destructive legacy key pruning until stale/expired/completed room UX and retention policy are explicit.

## Restore Audit Metadata

- `restoreAudit` is optional metadata for future signed restore diagnostics. Current deployments do not verify signatures and must not describe restore bundles as trusted because this field exists.
- Invalid audit metadata is rejected to prevent silently accepting poisoned or room-mismatched audit claims. Missing metadata remains compatible with existing clients.
- Real signed restore requires a canonical serialization format, key rotation procedure, freshness limits, and explicit behavior for legacy unsigned bundles.

## Multiple Room Resume UI

- Visible multiple-room resume UI is not enabled. Operators should still expect the existing single online resume affordance.
- Future UI must classify indexed bundles before offering actions. See `docs/MULTI_ROOM_RESUME_DESIGN.md` for candidate states and test requirements.
