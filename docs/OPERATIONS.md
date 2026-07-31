# Operations

This page is the runbook for keeping real-device manual checks small. The target state is: automated nightly regression catches release/PWA/online drift, browser error reports are classified, and only unknown failures page loudly.

## Operator Quick Start

Use this document as the first stop when production behavior looks wrong. Other docs remain source material, but operational decisions should start here:

- Release gate and public preflight: `docs/RELEASE_CHECKLIST.md`
- Browser error / lifecycle notification details: `docs/NTFY_ERROR_REPORTING.md`
- PWA update and RL model loading behavior: `docs/PWA_MODEL_LOADING.md`
- Online restore and trust boundaries: `docs/ONLINE_SYNC.md`, `docs/ADR_RESTORE_TRUST_BOUNDARY.md`
- Provisional hostless restore contract: `docs/HOSTLESS_RESTORE_DESIGN.md`
- AI maintenance handoff: `docs/AI_HANDOFF.md`
- Design decision index: `docs/ADR_INDEX.md`

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
| `NTFY_TOPIC` | Render | Recommended | Browser client-error and lifecycle notifications when `NODE_ENV=production`. | Use a hard-to-guess topic. Rotate if exposed. Local/dev `NTFY_TOPIC` values are ignored by normal reports. |
| `NTFY_CI_TOPIC` | GitHub Actions secret | Optional but recommended | Failure-only CI notifications. | Use a different topic from `NTFY_TOPIC`; success runs stay silent. |
| `CLIENT_ERROR_ALLOWED_ORIGINS` | Render | Recommended for public production | Comma-separated public origins allowed to report browser errors. | Same-origin reports are allowed automatically; use this for explicit public origin hygiene. |
| `HOSTLESS_RESTORE_ENABLED` | Render | Optional; enabled by default | Enables the provisional quorum fallback after normal host restore retries are exhausted. | Set to `0` for immediate host-only rollback. Values `false`, `no`, `off`, and `disabled` also disable it. |
| `CLIENT_ERROR_SHARED_TOKEN` | Render | Optional | Token for scripted/no-origin diagnostics and `/api/client-error-test`. | Do not require normal browser reports to expose it. Use only for controlled tests or non-browser senders. |
| `CLIENT_ERROR_TEST_ENABLED=1` | Render | Temporary only | Enables `/api/client-error-test` in production-like environments. | Remove immediately after test notification. |
| `CLIENT_ERROR_ALLOW_NO_ORIGIN` | Render | Debug only | Allows no-origin/no-token diagnostics. | Avoid in production except a short controlled window. |
| `BUILD_HASH` | Render / CI | Optional | Overrides detected git hash for `/api/version`, SW cache, and reports. | Usually let deployment derive it; set only when build metadata is otherwise unavailable. |
| `TRUST_PROXY=1` | Render | Deployment-specific | Trusts proxy headers for origin/protocol/IP handling. | Set only behind a trusted proxy and with correct public origin allowlist. |
| `ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED=1` | Render | Staged only; off by default | Lets clean event-controller state drive UI/send/CPU/human input blocking reads. | Any mismatch falls back to `isReconnectingOnline`. It does not own timers, callbacks, queues, status text, storage cleanup, or Socket.IO protocol. Unset for immediate rollback. |
| `GAME_ENGINE_TRANSITION_AUTHORITY_ENABLED=1` | Render | Test/staged only; off by default | Adopts a pure transition snapshot for the internal server canonical mirror after exact shadow parity. | Requires schema negotiation and `GAME_SCHEMA_SHADOW_ENABLED=1`. Transition, parity, or reconstruction failure keeps the already-applied mutable mirror. It does not change validation, ACK, broadcast, payloads, or client authority. Unset for immediate rollback. |
| `LOCAL_SAVE_SCHEMA_WRITE_ENABLED=1` | Render | Staged only; off by default | Keeps legacy `savedGame` and additionally writes/reads a validated `savedGameV1` shadow. | Do not remove the legacy key. Unset for immediate read/write rollback; old clients continue using legacy. Production activation requires an explicit staged decision. |

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
5. Do not publish, enable ads after review, or enable PWA production traffic until the target commit is green.

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
4. Remember the trust boundary: host-only restore remains authoritative; `onlineRestoreRoomIndex` is only a locator, and `restoreAudit` is authority only when HMAC-verified for the exact canonical restore payload.
5. Configure `RESTORE_AUDIT_SECRET` (or `MACHIKORO_RESTORE_AUDIT_SECRET`) before relying on compacted client snapshot restore after a server restart. Without it, replay from full action logs is the compatibility path.

## Maintenance Contract Guardrails

When changing online/server/UI safety code, keep these contracts covered by targeted tests before pushing:

- Socket.IO request payloads must pass the shared `SOCKET_PAYLOAD_LIMITS` gate; restore payloads use the separate restore limits.
- Server action logs must store only canonical payload keys, and `undoBuild` restore action audit must sign the same canonical data as live action logging.
- Every `rejoinRoom` emit path must include `clientVersion`; use the shared rejoin payload helper or storage fallback helper.
- Destructive stats reset must use the custom confirm modal contract, not native `confirm()` or direct one-tap deletion.
- Card/landmark detail and build-button HTML must escape names, categories, effects, and attribute-derived class inputs.
- Client-error / ntfy bodies must redact reconnect tokens, session ids, shared client-error tokens, and URL query secrets before notification or logs.
- Saved stats numbers must normalize to finite non-negative integers before rendering percentages or bar widths.
- Restore action logs must reject unknown action names before replay or rank calculation.
- `server/restoreGateway.js` owns only canonical-vs-client source selection and existing-room replace/reject/rejoin policy. Restore validation, audit verification, sanitation, Socket effects, mirror replay, and persistence ordering remain in `server.js`; do not move them as one batch.
- Canonical action keys and client action IDs must go through `server/actionPayload.js`; keep its action set synchronized with `GAME_ACTION_REGISTRY`, validators, and mirror replay.
- New helper scripts loaded by `index.html` must also be present in Service Worker static assets and integration runtime loading tests; update `tests/runtime-dependencies.test.js` when the helper has a browser-global consumer.
- Public root files and directory routes must remain explicit in `server/staticAssets.js`; every local `index.html` asset must resolve through that allowlist, except Socket.IO's own client route.
- UI action child selectors must stay synchronized with the interactability registry and rendered `data-action` attributes.
- `OnlineReconnectState` has a pure event reducer and event-vs-legacy projection comparison. `ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED=1` may drive only UI/send/CPU/human input-gate reads when the complete event history is clean; selection fails back to `isReconnectingOnline` on mismatch. `OnlineRetryPolicy` owns the existing 3s/8-attempt/15s calculations. Test-only rollback gates additionally select the compatibility boolean, rejoin timer/deadline, timeout decision, ACK-timeout ignore/clear-only/rejoin plan, incoming gameAction and pending-matched actionAccepted no-game/duplicate/gap/apply plans, rejoin request reject/wait/exhaust/emit plan and ordered effect executor, terminal app-error cleanup decision/effect executor, restore-abort generation/status/queue plan, and exact socket-disconnected/restore-lifecycle/retry-exhausted status messages only on clean parity; production HTML injects none of them. Incoming gameAction and pending-matched actionAccepted plan authorities require clean event history and exact legacy parity. Malformed Action decode recovery may use `js/onlineDecodeFailure.js` only behind its separate production-uninjected gameAction/actionAccepted gates and clean reconnect shadow state; actionAccepted alone clears ACK flight before reconnect/rejoin/retry, and any authority defect falls back to the inline legacy sequence. `js/onlineActionApplyFailure.js` may execute apply-exception report/reconnect/CPU-token/rejoin/retry effects only after an authoritative pure apply plan and its separate production-uninjected handler gate; restore queue flush suppresses immediate rejoin, and any plan/authority defect uses inline legacy. `js/onlineActionGap.js` and `js/onlineActionNoGame.js` may execute handler-specific gap/no-game effects only after the matching authoritative pure decision and separate production-uninjected gate; incoming gap alone writes gap status, incoming no-game alone requests rejoin, and every defect uses inline legacy. `js/onlineActionCommit.js` may execute successful sequence/log/accepted-only pending-clear/render/CPU-schedule effects only after an authoritative pure APPLY plan and a separate production-uninjected handler gate; restore queue flush omits render/schedule, and every defect uses inline legacy. `js/onlineSocketConnect.js` may execute waiting-status cleanup and reconnect/rejoin only after exact plan parity and a clean CONNECTING history. `js/onlineSocketDisconnect.js` may execute lobby finish, optional restore quarantine, reconnect/flight/CPU invalidation, disconnect observation, and status only after clean active-plan parity. Both callback families have separate production-uninjected plan/effect gates and inline legacy fallback. `js/onlineHostChanged.js` may execute host-state/log/render/CPU-schedule-or-invalidate/persistence only after the existing restore queue gate and exact host-plan parity, behind separate production-uninjected plan/effect gates; inline legacy remains the fallback. Restore queueing, pending ownership outside matched acceptance, status, and other rejoin effects remain in `online.js`. ACK-timeout plan authority additionally requires clean event history and exact legacy parity; `js/onlineActionTimeout.js` runs the fixed flight-clear/reconnect/CPU-token/status/rejoin sequence only when its independent effect gate also agrees. Pending data remains retained and inline legacy remains the production default in `online.js`. Restore-abort plan authority additionally requires clean event history and exact legacy parity; `js/onlineRestoreAbort.js` runs the fixed finish/quarantine/queue/reconnect/status/rejoin/retry sequence only when an independent effect gate also agrees. Automated queue-overflow coverage exercises disconnect/connect/rejoin/restore before selecting it. The request plan gate requires clean event history and exact legacy-plan parity; the independent request-effect gate then selects `js/onlineReconnectRequest.js` only from an authoritative pure plan. The helper fixes clear/count/emit/arm order and centralizes the one `rejoinRoom` send, while production remains on the legacy fallback. The cleanup decision selector additionally requires exact agreement with the legacy boolean; `js/onlineReconnectCleanup.js` owns the fixed six-step effect order, while the inline legacy sequence remains the default fallback. The inline restore-abort state/status/rejoin sequence remains the production default and fallback in `online.js`. These boundaries do not authorize changing queue storage, socket events, storage cleanup effects, other status contexts, or visible outcomes.
- Client/server replay changes must preserve complete serialized snapshot parity for the same canonical action trace, including roll-generated multi-pending order, dormant-card exchange, and Harbor/IT negative choices across 2/3/5/10 players and all v0/v1 Action/Snapshot selections.
- `js/onlinePayload.js` owns fail-closed saved reconnect-session normalization without changing the session key or wire payload. `js/gameSnapshot.js` owns exact snapshot/undo/local-save serialization and shared hydrate mechanics. `js/savedGameValidation.js` owns injected fail-closed validation, pending consistency, legacy CPU-setting normalization, and legacy card-ID stock lookup. Local save generation, local Undo generation, local Undo restore, server mirror Undo restore, and mutable restore delegate to these helpers, while caller adapters retain validation and landmark/inventory policy. `js/storageSettings.js` owns pure saved-setting normalization; `js/clientStorage.js` is the sole direct browser-storage owner. `js/localSaveRepository.js` keeps the unversioned `savedGame` key/value as rollback authority and, only under `LOCAL_SAVE_SCHEMA_WRITE_ENABLED=1`, maintains a validated `savedGameV1` shadow; `storage.js` retains CPU recreation and DOM effects. The local Undo adapter passes an explicit unlimited log limit so the existing full-log behavior is unchanged.
- `js/gameEngine.js` is the shared mutable action dispatcher. Client replay, server mirror, and every local rule-based CPU action application delegate to it. Rule-based CPU build selection returns a canonical proposal through `CPU.chooseBuildAction()`; `CPUBuildExecution` applies it locally through the Engine or preserves the existing online authority/send path. `GameEngine.transitionSnapshot()` remains detached. `GAME_ENGINE_TRANSITION_AUTHORITY_ENABLED=1` may adopt it only for the internal server canonical mirror after exact parity and successful reconstruction; do not replace another live owner until its hydrate policy, authority, timing, mixed-client behavior, and rollback are separately covered.
- Action/Snapshot schema readers, `js/gameSchemaCodec.js`, and `GameEngine.transitionEnvelope()` accept legacy v0/current v1 internally and reject selection mismatch before hydration. Default traffic remains legacy; `js/gameSchemaWire.js` changes live Action and selected Snapshot fields only under their separate flags.
- `js/gameSchemaNegotiation.js` and `server/gameSchemaRuntime.js` own schema rollout policy. Default (`GAME_SCHEMA_NEGOTIATION_ENABLED` unset) preserves exact legacy lobby/rejoin/gameStart shapes. Setting it to `1` negotiates `gameStart.gameSchema` but does not alone change Action encoding. Unset it for full schema rollback.
- `GAME_SCHEMA_SHADOW_ENABLED=1` has effect only while negotiation is enabled. It compare-runs accepted server actions through the negotiated shadow and records internal `matched`/`mismatch`/`transition-error` diagnostics. Shadow results must never gate action acceptance, ACK, broadcast, compaction, or persistence. Unset this flag independently to stop shadow CPU cost while keeping capability transport.
- `GAME_ENGINE_TRANSITION_AUTHORITY_ENABLED=1` additionally requires negotiation and shadow. Only a `matched` transition whose snapshot can rebuild a valid room mirror is adopted; every other case retains the already-applied mutable mirror. Roll this flag back before disabling shadow or negotiation.
- `GAME_SCHEMA_WIRE_ENABLED=1` also requires negotiation. It envelopes live v1 `gameAction` and `actionAccepted`, leaves negotiated v0 rooms unversioned, and fails closed on version mismatch. It does not by itself version Snapshot fields, saves, or restore logs. Roll back this flag before disabling negotiation.
- `GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED=1` also requires negotiation and is independent from Action wire. It envelopes negotiated v1 `rejoinData.stateSnapshot` and compacted Snapshot metadata attached to `gameAction`/`actionAccepted`; negotiated v0 and flag-OFF paths keep exact legacy identity. It does not version local saves; recreate requests use the separate gate below. Roll back this flag before disabling negotiation.
- `GAME_SCHEMA_RECREATE_WIRE_ENABLED=1` also requires negotiation and independently wraps `recreateRoom` as `{schemaVersion:1,recreateRoom}`. For negotiated v1 rooms it also envelopes the embedded Snapshot and each residual action while preserving seq/client/audit metadata. The server accepts unwrapped legacy requests unchanged and decodes wrapped nested fields back to legacy before signature, sanitation, and restore authority. Unknown or malformed outer/nested versions fail before restore effects. The flag remains default OFF and does not change persisted formats or authority; roll it back independently before disabling negotiation.
- `LOCAL_SAVE_SCHEMA_WRITE_ENABLED=1` is independent from online schema negotiation. It always writes legacy `savedGame` first, adds `savedGameV1` only after that succeeds, removes a stale v1 shadow if its update fails, and reads v1 only when the legacy key still exists and both schema/content validation pass. Unset it to return immediately to legacy-only reads/writes; explicit deletion in the new client removes both keys.
- Snapshot changes must preserve exact serialize/restore/serialize equality for initial, build/undo, pending, multiplayer/landmark, and endgame fixtures.
- Card/effect changes must keep stable IDs, descriptions, metadata, rule handlers, and CPU references synchronized through the card contract test.
- Client/lifecycle reporting, shared client storage access, watchdog snapshot/phase/modal classification and diagnostic serialization, server payload/settings/restore sanitation, online payload/restore-rank/state observation, UI display/HTML helpers, card-selection state/view, local/online-player-setting normalization/view, local/online RL readiness-button view, online lobby status view, and the injected PWA install controller are focused boundaries. Keep storage keys/value formats, network, socket, DOM/focus recovery effects, lifecycle timing, reconnect timing, and Service Worker update effects in their existing owners.
- CPU helper/evaluation extraction, including injected card-dependency values and `CPUBusinessMoves` candidate/scoring/random-simple selection, must preserve wrapper results, exact candidate/RNG call order, the exact decision baseline, the 2–10 player/all-difficulty self-play baseline, fixed traces, and existing CPU tests. `CPUActionProposal.create()` owns canonical detached proposal shaping; `CPU.chooseBuildAction()` must not mutate game/stock, and `CPUBuildExecution.executeAction()` must apply at most one selected build through the shared Engine locally while preserving the existing online send path. These boundaries do not authorize changing heuristic constants, difficulty presets, candidate order, RNG use, or online authority.
- Run `npm run test:cpu-regression` after CPU scoring, legal-move, simulation, or execution edits. It compares winner, turns, and completion for 36 seeded full matches.
- Regenerate CPU baselines only for an intentional, reviewed behavior change. Pass `--source-commit <full-40-character-commit>` identifying the accepted pre-generation behavior; never refresh an artifact merely to make a failing test green.
- Adapter boundaries have JSDoc contracts. TypeScript 5.9.3 runs no-emit checkJs over the explicit 114-runtime browser/server allowlist, including `CPU.js`, `RLCPU.js`, `server.js`, and every extracted `server/*.js` module, via `npm run test:types` inside `test:static`; scoped ESLint remains approved for the separate 115-file maintenance allowlist. Keep both allowlists and their config tests synchronized, exclude the five remaining side-effect client runtimes (`appShell`, `main`, `online`, `storage`, `ui`), and do not infer runtime authority or repository-wide cleanup.

These are compatibility guardrails, not design expansion points. Do not weaken them to unblock a broader refactor; add a focused regression test instead.

## PWA Update Operations

Use this when a device appears to run old JS, misses a fix, or reports stale-client:

1. Check server version:

   `curl -fsS <PUBLIC_ORIGIN>/api/version`

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

- Allowed without additional design review: docs cleanup, OGP/image metadata wording, how-to text, CI/test documentation fixes, typo fixes, and static-page test hardening. Unknown notification fixes, CI failure fixes, and minor shared `style.css` changes are emergency exceptions only when needed to preserve review stability. Review-period static page CSS must stay on the shared `style.css`; do not add external CSS hosts.
- Unknown client-error notifications and CI failures are allowed during review, but keep the fix targeted: reproduce, add or update a focused regression test, and do not hide the notification by only reclassifying or suppressing it.
- Do not change during review: large UI redesigns, PWA behavior changes, URL changes, rule changes, and broad refactors. Unknown notification fixes, CI failure fixes, and minor shared `style.css` changes are the only emergency exceptions, and they must not change those prohibited surfaces. Keep `privacy.html` and `rules.html` as static explanation pages without automatic redirects or meta refresh.
- Live ad units, SDK adapters, ad placement changes, and ad expansion are post-review only. Do not treat incident response or CI cleanup as permission to add them during review.
- Public-page invariant additions during review should be tests/docs only; do not change behavior, URLs, PWA update flow, ad placement, or game rules for invariant cleanup alone.
- Treat `canonical`, `og:url`, and `twitter:url` metadata as URL policy changes during review; keep them out unless the URL policy is explicitly reviewed.
- Treat public-page link hints such as `preconnect`, `dns-prefetch`, `preload`, and `modulepreload` as external connection policy changes during review; keep them out unless explicitly reviewed.
- Keep commits small and run at least `git diff --check`, `node tests/main.test.js`, and `npm run test:static` for review-period docs/static-page changes.

## Public Release Preflight

Before public traffic, AdSense review submission/recheck, ads after review, or wider PWA install testing:

- `git status --short` is empty.
- CI is green on the exact commit to deploy.
- `docs/RELEASE_CHECKLIST.md` automated gate has been run; if relying on CI, confirm which commands CI covers and run any missing local commands before release.
- For AdSense review submission/recheck, run the public URL, OGP/PWA icon reachability, local OGP/PWA icon dimension, URL metadata / external stylesheet / public-page link hint, and static explanation page negative checks in `docs/ADSENSE_SETUP.md`; confirm `Public page URL metadata, external stylesheet, and public-page link hint checks passed`, `Local OGP/PWA icon dimension checks passed`, and `Static explanation page negative checks passed`.
- `privacy.html` and `rules.html` are reachable from the title screen and cached by the PWA shell; the title page and rule-page metadata mention 登録不要 / no-registration play, privacy-page metadata mentions error reporting / lifecycle notifications / AdSense review / ad topics, `rules.html` explains the win condition and keeps OGP/Twitter rule-page metadata current, and `privacy.html` also mentions lifecycle notification privacy, contact guidance, public-secret redaction guidance, and the last updated date. If shared `style.css` changes during review, check `privacy.html` and `rules.html` at narrow mobile width and confirm text and related-page links do not overflow or hide behind the viewport edge.
- AdSense placeholders remain outside gameplay controls, still use `pointer-events: none`, and match the allowed-placement policy in `docs/ADS_PLAN.md`.
- PWA install prompt and update banner have been checked on at least one real mobile browser before relying on them publicly.
- `/api/client-error-test` sends to ntfy in a controlled window, then `CLIENT_ERROR_TEST_ENABLED` is removed again.
- Lifecycle `play-start` / `play-finish` notification arrives without player names, room codes, reconnect tokens, card inventories, or snapshots.
- A stale-client drill has been performed: compare browser version, server version, update banner, and cache clearing fallback.

## Codex Incident Prompt Templates

Use these as copy/paste starters when handing work to Codex. Replace bracketed values with the notification or CI details.

### Unknown notification

For AdSense review or any code-free triage window, first preserve the ntfy body privately, compare the report version with the deployed hash, classify current-version versus stale-client, decide whether submission/recheck should pause, and open a focused follow-up. Do not suppress or reclassify the report as the only action.

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

CI failure notifications use the same triage shape for release, APK, and nightly workflows; the nightly workflow is the common example below.

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

## Recorded Real-Device Online Evidence

2026-07-18 manual verification completed one four-player online match through victory with two Android devices and two iPhones. At least one disconnect/reconnect occurred and the match continued to completion with the four clients participating.

This evidence covers mixed Android/iPhone basic play, live synchronization, and reconnect continuation for that match. It does not prove host migration, server-process restart restore, Undo synchronization around reconnect, online CPU turns, background/resume behavior, Service Worker update deferral, install prompts, or modal focus/inert behavior.

Keep those uncovered paths explicit in `TESTPLAN.md`; do not infer them from this completed match or from automated WebKit.

## Manual Checks Still Required

Nightly automation reduces but does not fully replace:

- real iPhone Safari install/update prompt behavior
- Android Chrome/TWA store packaging behavior
- additional multi-device online paths listed above
- screen reader announcement quality
- full provisional hostless timing on mixed devices, and future server-persisted canonical state design

Keep these as explicit manual/design items rather than treating nightly green as proof of real-device completion.

## Design Decision Index

Deferred design decisions are tracked in `docs/IMPLEMENTATION_DECISIONS.md`. Operationally important outcomes:

- Public production client-error reporting should set `CLIENT_ERROR_ALLOWED_ORIGINS` and keep `NTFY_TOPIC` private. Scripted/no-origin diagnostics should use `CLIENT_ERROR_SHARED_TOKEN` or a temporary `CLIENT_ERROR_ALLOW_NO_ORIGIN` exception.
- `CLIENT_ERROR_SHARED_TOKEN` is for scripted/no-origin diagnostics and `/api/client-error-test`; same-origin browser `/api/client-error` and `/api/game-lifecycle` reports remain tokenless so real-device reporting keeps working. Keep the token private and do not expose it to normal browser code unless a deliberate browser token model is added.
- Stale-client classification is diagnostic. It must not automatically clear restore bundles, reject reconnect, or reload during an active game.
- Server restart restore remains host-first for casual play. After the normal path
  is exhausted, compatible clients may use the provisional quorum fallback.
- Hostless recovery requires two distinct human identities, exact agreement from
  every collected candidate, and explicit confirmation. It never uses majority
  voting and never replaces an existing room.
- Raw candidate bodies stay in memory for at most two minutes; diagnostics contain
  only a hashed room identifier, counts, rank/generation, result, and reason.
- Set `HOSTLESS_RESTORE_ENABLED=0` to return immediately to host-only behavior.
- Multiple room resume UI should not be enabled until restore bundles have a per-room index and stale bundles have a safe pruning policy.

## Online Restore Room Index

- Clients keep `onlineRestoreRoomIndex` as a lightweight localStorage index of room-scoped restore bundles. It helps future diagnostics/resume UI find candidate rooms without scanning every key.
- The index is not authoritative and must not override server canonical state, host restore rank, or scoped restore reads. Stale index pruning removes index rows only.
- Do not enable multiple-room resume UI or destructive legacy key pruning until stale/expired/completed room UX and retention policy are explicit.

## Restore Audit Metadata

- `restoreAudit` is HMAC-verified when `RESTORE_AUDIT_SECRET` or `MACHIKORO_RESTORE_AUDIT_SECRET` is configured. A valid signature covers the canonical restore payload and allows the server to trust the compacted client snapshot after restart.
- Unsigned or invalid audit metadata does not increase authority. If no server canonical state exists, the server ignores unsigned snapshots and falls back to replaying a valid action log from the initial state.
- Optional `RESTORE_AUDIT_MAX_AGE_MS` and `RESTORE_AUDIT_CLOCK_SKEW_MS` enforce freshness. Unknown key IDs, expired records, and future timestamps fail closed.
- The authority priority contract is live room > authoritative durable canonical state > valid signed state > host replay > confirmed hostless quorum. It is not yet wired as a production durable dispatcher; the default canonical store remains `noop`. A database-backed provider is currently deferred because recurring cost is not approved.
- Legacy single-secret configuration remains compatible. For rotation, set `RESTORE_AUDIT_KEYRING_JSON` (or the MACHIKORO alias) with active and old keys, select `RESTORE_AUDIT_ACTIVE_KEY_ID`, retain old verification keys through the configured maximum age, then remove them only after the overlap window.

## Multiple Room Resume UI

- Visible multiple-room resume UI is not enabled. Operators should still expect the existing single online resume affordance.
- Future UI must classify indexed bundles before offering actions. See `docs/MULTI_ROOM_RESUME_DESIGN.md` for candidate states and test requirements.
