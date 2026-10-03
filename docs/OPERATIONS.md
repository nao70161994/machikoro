# Operations

This page is the runbook for automated release/PWA/online checks and production operations. Do not delegate routine device verification to the user; track uncovered behavior as an automation task and classify browser error reports so only unknown failures page loudly.

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

If lifecycle traffic disappears while `/api/client-error-health` is healthy, inspect
`game-lifecycle-fetch-complete` checkpoints. HTTP `503` remains in
`machikoroLifecycleOutbox` and retries automatically one entry at a time using
`Retry-After` plus bounded exponential backoff, including after startup/online recovery;
HTTP `202` means
the ntfy transfer succeeded or the server suppressed an identical session/event.

## Production Environment Variables

Set these in the service that runs `server.js` unless noted otherwise:

| Name | Where | Required | Purpose | Operations note |
| --- | --- | --- | --- | --- |
| `NODE_ENV=production` | Render | Recommended | Enables production defaults such as no-origin client-error blocking when `NTFY_TOPIC` is set. | Keep explicit in production so debug defaults do not leak. |
| `NTFY_TOPIC` | Render | Recommended | Browser client-error and lifecycle notifications when `NODE_ENV=production`. | Use a hard-to-guess topic. Rotate if exposed. Local/dev `NTFY_TOPIC` values are ignored by normal reports. |
| `NTFY_ACCESS_TOKEN` | Render secret | Optional | Authenticated publishing to ntfy. | Keep server-side; never place it in client code, logs, or health output. |
| `NTFY_BASE_URL` | Render | Optional | Routes notifications to a trusted alternate/self-hosted ntfy server. | Defaults to `https://ntfy.sh`; use HTTPS in production. |
| `NTFY_CI_TOPIC` | GitHub Actions secret | Optional but recommended | Failure-only CI notifications. | Use a different topic from `NTFY_TOPIC`; success runs stay silent. |
| `CLIENT_ERROR_ALLOWED_ORIGINS` | Render | Recommended for public production | Comma-separated public origins allowed to report browser errors. | Same-origin reports are allowed automatically; use this for explicit public origin hygiene. |
| `SOCKET_ALLOWED_ORIGINS` | Render | Optional | Comma-separated additional browser origins allowed to open Socket.IO connections. | Same-origin and Origin-less native/Node clients remain allowed. Keep this separate from client-error reporting origins. |
| `HOSTLESS_RESTORE_ENABLED` | Render | Optional; enabled by default | Enables the provisional quorum fallback after normal host restore retries are exhausted. | Set to `0` for immediate host-only rollback. Values `false`, `no`, `off`, and `disabled` also disable it. |
| `CANONICAL_STATE_STORE=file` plus `CANONICAL_STATE_STORE_DIR`, `CANONICAL_STATE_STORE_DURABLE=true`, `CANONICAL_STATE_STORE_SINGLE_INSTANCE=true`, and `CANONICAL_STATE_RETENTION_MS` | Render paid single-instance disk only | Off by default | Enables server-side canonical room records across process restarts. | Keep unset under the current free-operation setup. Use a private durable mount and exactly one instance; this adapter rejects missing/corrupt canonical state, and write failures stop the triggering action before ACK/broadcast. Full constraints are in `docs/ADR_RESTORE_TRUST_BOUNDARY.md`. |
| `CLIENT_ERROR_SHARED_TOKEN` | Render | Optional | Token for scripted/no-origin diagnostics and `/api/client-error-test`. | Do not require normal browser reports to expose it. Use only for controlled tests or non-browser senders. |
| `CLIENT_ERROR_TEST_ENABLED=1` | Render | Temporary only | Enables `/api/client-error-test` in production-like environments. | Remove immediately after test notification. |
| `CLIENT_ERROR_ALLOW_NO_ORIGIN` | Render | Debug only | Allows no-origin/no-token diagnostics only for `1`, `true`, `yes`, or `on` (case-insensitive). | Values such as `0`, `false`, `no`, and `off` remain disabled. Avoid enabling it in production except a short controlled window. |
| `BUILD_HASH` | Render / CI | Optional | Overrides detected git hash for `/api/version`, SW cache, and reports. | Usually let deployment derive it; set only when build metadata is otherwise unavailable. |
| `TRUST_PROXY=1` | Render | Deployment-specific | Trusts proxy headers for origin/protocol/IP handling. | Set only behind a trusted proxy and with correct public origin allowlist. |
| `window.MACHIKORO_ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED=false` | Render | Rollback only; event authority is on by default | Forces UI/send/CPU/human input blocking reads back to the legacy `isReconnectingOnline` projection. | Clean event history is normally authoritative; any mismatch also falls back automatically. Timers, callbacks, queues, status text, storage cleanup, and Socket.IO protocol keep their existing owners. |
| `GAME_ENGINE_TRANSITION_AUTHORITY_ENABLED=1` | Render | Test/staged only; off by default | Adopts a pure transition snapshot for the internal server canonical mirror after exact shadow parity. | Requires schema negotiation and `GAME_SCHEMA_SHADOW_ENABLED=1`. Transition, parity, or reconstruction failure keeps the already-applied mutable mirror. It does not change validation, ACK, broadcast, payloads, or client authority. Unset for immediate rollback. |
| `RESTORED_ROOM_ACTIVATION_EFFECT_AUTHORITY_ENABLED=1` | Render | Test/staged only; off by default | Selects the ordered detach/delete/install executor when replacing a restored room. | The inline legacy sequence remains the default and rollback path. Automated online/release tests cover both flag states. It does not move persistence, Socket join/emit, validation, signing, mirror creation, or payload ownership. Unset for immediate rollback. |
| `RESTORED_ROOM_DELIVERY_EFFECT_AUTHORITY_ENABLED=1` | Render | Test/staged only; off by default | Selects the ordered persist/join/socket-identity/rejoinData executor after restored-room activation. | The inline legacy sequence remains the default and rollback path. Automated online/release tests cover this flag alone and together with activation. It does not change event names, payload construction, validation, signing, mirror creation, or logging. Unset for immediate rollback. |
| `EXISTING_ROOM_REJOIN_EFFECT_AUTHORITY_ENABLED=1` | Render | Test/staged only; off by default | Selects the ordered existing-room detach/identity/optional-host-reselection/persist/touch/rejoinData/playerRejoined executor after admission chooses rejoin. | The inline legacy sequence remains the default and rollback path. Real Socket.IO schema E2E covers the enabled path. It does not change admission, tokens, event names, payloads, or reconnect protocol. Unset for immediate rollback. |
| `LOCAL_SAVE_SCHEMA_WRITE_ENABLED=1` | Render | Staged only; off by default | Keeps legacy `savedGame` and additionally writes/reads a validated `savedGameV1` shadow. | Do not remove the legacy key. Unset for immediate read/write rollback; old clients continue using legacy. Production activation requires an explicit staged decision. |

## Server Process Fatal Errors

`uncaughtException` and `unhandledRejection` are both fatal. The process logs the event and exits with code `1`; it does not continue serving rooms after an error that may have left in-memory game or replay state inconsistent. The hosting supervisor is expected to start a fresh process according to its restart policy. Do not add recovery work after either event as a substitute for fixing the underlying error.

When the service restarts unexpectedly:

1. Check the host's process/restart event and capture the last server log entry, deployed commit, and restart time.
2. Triage the recorded exception or rejection before redeploying or repeatedly restarting.
3. Check affected online rooms against the normal reconnect / server-restart restore procedure below; in-memory waiting rooms can be lost when the process exits.
4. Confirm the health endpoint and create/join a disposable room after the fix is deployed.

All unhandled Promise rejections use the same fail-fast policy as uncaught exceptions. Handle expected operational failures at their call sites; only truly unhandled failures should reach this process-level policy.

## Local Game Engine Shadow Cost

Run `npm run benchmark:local-engine-shadow -- --samples 160 --json` to measure the local `nextTurn` shadow plus direct-authority adoption path against the same state with an unbounded input log. The harness captures deterministic two-player turn-28 and ten-player turn-120 self-play states; its stress case keeps the real ten-player card/player state and replaces that turn's log with 1,000 structured entries. Each sample runs GC before timing. The JSON snapshot byte count is serialized-state size, and `medianPostTransitionHeapDeltaBytes` / `maxPostTransitionHeapDeltaBytes` are immediate post-operation heap deltas, not process RSS or peak live heap. Rendering and CPU scheduling are excluded.

On the recorded Termux Node v26.2.0 Android/arm64 run (160 samples), the real ten-player state had 14 log entries: the production cap removed about 1.0 KB from the serialized input and p50 was 5.20 ms capped vs 5.59 ms unbounded. With the 1,000-entry stress log, the cap reduced input snapshot size from 87.0 KB to 5.1 KB, p50 from 18.04 ms to 5.29 ms, and median post-operation heap delta from 1,049 KB to 439 KB. The current `nextTurn` cap is justified for long logs; these measurements do not justify truncating logs on other actions, where the transition may need the current turn history. The reproduction fixture and assertions live in `scripts/benchmark-local-engine-shadow.js` and `tests/benchmark-local-engine-shadow.test.js`.

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

### Canonical restore store failure

The file store is opt-in and is not configured by the current free Render
deployment. If a future single-instance disk deployment reports a canonical
store failure, first confirm the configured path is the mounted disk, has
private directory permissions, and has free space. A lock timeout or malformed
lock fails closed; stop the service before inspecting or removing a lock, then
verify its recorded PID is gone. Do not clear canonical records to get past a
restore error: an absent or unreadable record intentionally rejects client
restore data when the store is authoritative. See
`docs/ADR_RESTORE_TRUST_BOUNDARY.md` before changing retention or storage mode.
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
- `server/restoreGateway.js` owns only canonical-vs-client source selection and existing-room replace/reject/rejoin policy. `server/restoreAdmission.js` owns the ordered existing-room started/host-auth/signed-sanitize/decision/token-recheck admission plan; `server/existingRoomRejoin.js` owns their separately gated exact-order executor; inline Socket detach, rejoin, and emit effects remain the default fallback in `server.js`. `server/restorePreparation.js` owns only the game-start/identity/replay/metadata/room-build/mirror-preparation sequence before activation; it must not acquire Socket or persistence effects. `server/restoredRoom.js` owns only input-nonmutating host/sequence/hostless metadata, exact-order application to the existing game-start payload, new/replace/reject activation, ordered accepted-action reconstruction and mirror preparation, and canonical mirror-result planning and exact-order application to the restored room, and injected redacted-completion logging plus deterministic mutable room-shell assembly after validation, and receives Snapshot sanitation/serialization as injected dependencies. `server/hostlessRestoreDiagnostics.js` owns only the injected room hash and aggregate-only coordinator log projection; raw candidate data and tokens must remain excluded. Restore validation, audit verification, sanitation call order, Socket effects, mirror replay, and persistence ordering remain in `server.js`; do not move them as one batch.
- Canonical action keys and client action IDs must go through `server/actionPayload.js`; keep its action set synchronized with `GAME_ACTION_REGISTRY`, validators, and mirror replay.
- Accepted action sequence advancement belongs to `server/actionAcceptance.js`; preserve lazy restore-rank fallback, `room.actionSeq` increment, and `gameStartPayload.actionSeq` synchronization before changing ACK/broadcast/compaction ordering.
- Live action validation must use `server/actionValidationGateway.js`; preserve mirror lookup → winner closure → actor authority → allowed-action gate → server-authoritative dice canonicalization → payload validation. Early rejection must not consume server dice or run payload validation, and the existing room-first Undo fallback must remain unchanged.
- Restore audit environment policy must use `server/restoreAuditRuntime.js`; keep config lookup dynamic per operation, active key/secret and optional source shaping unchanged, and pass the full keyring/max-age/clock-skew policy to verification. Do not move signing, verification, or restore-authority selection into this adapter.
- Restore audit signing and verification orchestration must use `server/restoreAuditGateway.js`; preserve payload-before-options-before-crypto call order, the exact `server-action-log` source, null-snapshot verification bypass, and boolean result projection. Keep cryptographic bytes, keyring policy, restore authority, and wire format outside this gateway.
- Compacted Snapshot attachment must use `server/restoreSnapshotAttachment.js`; keep the pre-compaction length strictly above the configured limit, require an empty residual action log, and mutate the outgoing action only after audit generation succeeds. Do not move compaction, signing, Socket delivery, or restore authority into this helper.
- Game-start room mutation must use `server/gameStartLifecycle.js`; preserve state reset → canonical mirror reset → `lastTouchedAt` publication → `game-start` persistence order. Readiness checks, payload construction, Socket emit, and logging remain in `server.js`.
- Game-start orchestration must use `server/gameStartCoordinator.js`; preserve missing/started/not-ready exits and payload build → lifecycle activation → `gameStart` emit → log order without changing event or payload identity.
- Canonical mirror mutation must use `server/canonicalMirrorRuntime.js`; preserve marker/hash synchronization, mismatch diagnostics, build-before-apply Undo capture, clear-after-Undo/turn, and failed-action non-adoption. This adapter does not authorize Engine authority or wire changes.
- Room Socket effects must use `server/roomSocketRuntime.js`; preserve the `hostChanged` event/payload, appError-before-leave order, identity clearing only for the matching room, and all-player ID clearing during room replacement. Rejoin, disconnect, recreate, and host-selection decisions stay in their existing handlers.
- Socket payload rejection must continue through the dedicated `appError` event; `server/socketPayload.js` owns the injected validation/rejection gateway and existing invalid-request message.
- New helper scripts loaded by `index.html` must also be present in Service Worker static assets and integration runtime loading tests; update `tests/runtime-dependencies.test.js` when the helper has a browser-global consumer.
- Public root files, directory routes, build-hash resolution, and index/public-root response handlers must remain explicit in `server/staticAssets.js`; Express route registration order stays in `server.js`. preserve BUILD_HASH environment override, Git short-hash, then time fallback order. Every local `index.html` asset must resolve through that allowlist, except Socket.IO's own client route.
- Server mirror runtime loading must go through `server/gameRuntimeLoader.js`; keep its frozen Card → Player → Action Contract → GameManager source order and export-name contract synchronized when a runtime dependency is added. `server.js` retains startup wiring and its existing `loadGameRuntime` export.
- Rejoin player activation must use `server/reconnectIdentity.js` after token verification; preserve mismatch non-mutation, legacy hash completion, restored-player fields, and socket-ID replacement. Socket join/identity/event ordering remains in the handler/runtime.
- Current-player socket identity and connected-host checks belong to `server/roomLifecycle.js`; inject the actual Socket.IO socket map from `server.js` and preserve join, emit, and host-transfer ordering.
- UI action child selectors must stay synchronized with the interactability registry and rendered `data-action` attributes.
- `OnlineReconnectState` has a pure event reducer and event-vs-legacy projection comparison. Clean `OnlineReconnectRuntime` event history drives UI/send/CPU/human input-gate reads by default; explicit `MACHIKORO_ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED=false` or any history mismatch falls back to `isReconnectingOnline`. `OnlineRetryPolicy` owns the existing 3s/8-attempt/15s calculations. Test-only rollback gates additionally select the compatibility boolean, rejoin timer/deadline, timeout decision, ACK-timeout ignore/clear-only/rejoin plan, incoming gameAction and pending-matched actionAccepted no-game/duplicate/gap/apply plans, rejoin request reject/wait/exhaust/emit plan and ordered effect executor, terminal app-error cleanup decision/effect executor, restore-abort generation/status/queue plan, and exact socket-disconnected/restore-lifecycle/retry-exhausted status messages only on clean parity; production HTML injects none of them, including the independent pending-reconciliation, rejoin-action-log, and local-host-restore-offer plan gates. `OnlinePayload` may select replay-log, legacy-snapshot-compacted, accepted-client-action, or unaccepted reconciliation only after exact legacy-plan parity; pending clear/resend has a default-OFF executor and inline legacy fallback. `OnlinePayload` also preserves a longer local action log only for an unsigned snapshot and only after exact array-identity/reason parity; the storage write remains in `online.js`. `OnlineRestoreRank` may offer an original-host local bundle only when the current server host or a newer local host epoch permits it and replay rank is newer; exact legacy reason/bundle identity is required and recreate emission remains in `online.js`. Incoming gameAction and pending-matched actionAccepted plan authorities require clean event history and exact legacy parity. Malformed Action decode recovery may use `js/onlineDecodeFailure.js` only behind its separate production-uninjected gameAction/actionAccepted gates and clean reconnect shadow state; actionAccepted alone clears ACK flight before reconnect/rejoin/retry, and any authority defect falls back to the inline legacy sequence. `js/onlineActionApplyFailure.js` may execute apply-exception report/reconnect/CPU-token/rejoin/retry effects only after an authoritative pure apply plan and its separate production-uninjected handler gate; restore queue flush suppresses immediate rejoin, and any plan/authority defect uses inline legacy. `js/onlineActionGap.js` and `js/onlineActionNoGame.js` may execute handler-specific gap/no-game effects only after the matching authoritative pure decision and separate production-uninjected gate; incoming gap alone writes gap status, incoming no-game alone requests rejoin, and every defect uses inline legacy. `js/onlineActionCommit.js` may execute successful sequence/log/accepted-only pending-clear/render/CPU-schedule effects only after an authoritative pure APPLY plan and a separate production-uninjected handler gate; restore queue flush omits render/schedule, and every defect uses inline legacy. `js/onlineSocketConnect.js` may execute waiting-status cleanup and reconnect/rejoin only after exact plan parity and a clean CONNECTING history. `js/onlineSocketDisconnect.js` may execute lobby finish, optional restore quarantine, reconnect/flight/CPU invalidation, disconnect observation, and status only after clean active-plan parity. Both callback families have separate production-uninjected plan/effect gates and inline legacy fallback. `js/onlineHostChanged.js` may execute host-state/log/render/CPU-schedule-or-invalidate/persistence only after the existing restore queue gate and exact host-plan parity, behind separate production-uninjected plan/effect gates; inline legacy remains the fallback. `js/onlineRejoinPersistence.js` may execute the pre-replay action-flight/pending/retry/settings/indices/host/restore-bundle/session/CPU-token/UI-lock sequence only after exact plan parity and separate production-uninjected plan/effect gates; inline legacy remains the default and fallback. `js/onlinePendingResend.js` may select post-activation none/clear/resend and execute stale clear or ACK-flight-before-`gameAction` emit only after exact pending-reference parity and its own production-uninjected plan/effect gates; inline legacy remains default/fallback. `js/onlineRestoreReplay.js` may execute replay-mode/event/status/init/Snapshot/residual-Action/provisional-log/final-cleanup only after full input-reference parity and separate production-uninjected plan/effect gates; it always exits replay mode on failure, while screen/error/abort remain in `online.js`. `js/onlineRestoreActivation.js` may activate restored runtime state, publish the restored sequence, flush queued events, and publish the activated lifecycle only after exact sequence parity and separate production-uninjected plan/effect gates. Handler validation precedes effects, flush failure suppresses lifecycle publication, and inline legacy remains default/fallback. Restore queueing, pending ownership outside matched acceptance, status, and other rejoin effects remain in `online.js`. ACK-timeout plan authority additionally requires clean event history and exact legacy parity; `js/onlineActionTimeout.js` runs the fixed flight-clear/reconnect/CPU-token/status/rejoin sequence only when its independent effect gate also agrees. Pending data remains retained and inline legacy remains the production default in `online.js`. Restore-abort plan authority additionally requires clean event history and exact legacy parity; `js/onlineRestoreAbort.js` runs the fixed finish/quarantine/queue/reconnect/status/rejoin/retry sequence only when an independent effect gate also agrees. Automated queue-overflow coverage exercises disconnect/connect/rejoin/restore before selecting it. The request plan gate requires clean event history and exact legacy-plan parity; the independent request-effect gate then selects `js/onlineReconnectRequest.js` only from an authoritative pure plan. The helper fixes clear/count/emit/arm order and centralizes the one `rejoinRoom` send, while production remains on the legacy fallback. The cleanup decision selector additionally requires exact agreement with the legacy boolean; `js/onlineReconnectCleanup.js` owns the fixed six-step effect order, while the inline legacy sequence remains the default fallback. The inline restore-abort state/status/rejoin sequence remains the production default and fallback in `online.js`. These boundaries do not authorize changing queue storage, socket events, storage cleanup effects, other status contexts, or visible outcomes.
- Client/server replay changes must preserve complete serialized snapshot parity for the same canonical action trace, including roll-generated multi-pending order, dormant-card exchange, queued Mover actions preserving dormant/active card identity, Cleaning → two-Renovation mixed-queue dormancy/automatic consumption, Harbor/IT negative choices, Tuna Boat dice retained through the Station → reroll → Harbor choice chain, and conditional-red landmark thresholds through Station selection → Harbor choice → full transfer → City Hall recovery across 2/3/5/10 players and all v0/v1 Action/Snapshot selections. Keep room construction and live/shadow/adopted snapshot assertions centralized in `tests/helpers/game-schema-parity.js`.
- `js/onlinePayload.js` owns fail-closed saved reconnect-session normalization without changing the session key or wire payload. `js/gameSnapshot.js` owns exact snapshot/undo/local-save serialization and shared hydrate mechanics. `js/savedGameValidation.js` owns injected fail-closed validation, pending consistency, legacy CPU-setting normalization, and legacy card-ID stock lookup. Local save generation, local Undo generation, local Undo restore, server mirror Undo restore, and mutable restore delegate to these helpers, while caller adapters retain validation and landmark/inventory policy. `js/storageSettings.js` owns pure saved-setting normalization; `js/clientStorage.js` is the sole direct browser-storage owner. `js/localSaveRepository.js` keeps the unversioned `savedGame` key/value as rollback authority and, only under `LOCAL_SAVE_SCHEMA_WRITE_ENABLED=1`, maintains a validated `savedGameV1` shadow; `storage.js` retains CPU recreation and DOM effects. The local Undo adapter passes an explicit unlimited log limit so the existing full-log behavior is unchanged.
- `js/gameEngine.js` is the shared mutable action dispatcher. Client replay, server mirror, and every local rule-based CPU action application delegate to it. Rule-based CPU build selection returns a canonical proposal through `CPU.chooseBuildAction()`; `CPUBuildExecution` applies it locally through the Engine or preserves the existing online authority/send path. `js/gameEngineRuntimeAdapter.js` shares hydrate/serialize/Undo compatibility and `js/gameEngineDeterminism.js` excludes unresolved random local inputs. `GameEngine.transitionSnapshot()` remains detached. Server mirror, deterministic online replay, and resolved local human/CPU/build/Undo paths may adopt only behind their independent default-OFF gates after exact parity and successful reconstruction. Client gates are not injected into production; do not enable or expand a live owner until authority, timing, mixed-client behavior, and rollback are separately covered.
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
- `MACHIKORO_UI_MODAL_OPEN_EFFECT_AUTHORITY_ENABLED=1` may select `js/uiModalOpen.js` only when its modal identity plan exactly matches the independent legacy plan. The executor validates all handlers before capture-focus→active owner→body class→visual normalization→dialog attributes→focus→inert effects. Production HTML does not inject the flag; inline legacy remains default/fallback.
- Client/lifecycle reporting, server reporting admission/request/delivery adapters, shared client storage access, watchdog snapshot/phase/modal classification and diagnostic serialization, server payload/settings/restore sanitation, online payload/restore-rank/state observation, UI display/HTML helpers (including build/Undo action state, pending display gates, pending modal/content/inner-style projection, exact dice-face/result HTML, and the rolling opacity no-op), card-selection state/view, local/online-player-setting normalization/view, local/online RL readiness-button view, online lobby status view, and the injected PWA install controller are focused boundaries. Keep storage keys/value formats, network, socket, DOM/focus recovery effects, lifecycle timing, reconnect timing, and Service Worker update effects in their existing owners.
- Versioned online schema dispatch is isolated in `js/onlineSchemaTransport.js`; local resume selection, detached runtime settings, saved CPU construction arguments, and exact effect order are isolated in `js/localResumePolicy.js`; freeze timing/report suppression state is isolated in `js/uiWatchdogMonitor.js`. Keep production schema flags OFF, preserve save keys/formats, and leave DOM/socket/storage effects in their current owners.
- CPU helper/evaluation extraction and the complete constructor runtime-config projection in `js/cpuTuning.js`, including injected card-dependency, card-effect self-income, per-effect activation dispatch, card-purchase composition, generic weighted outcome aggregation, weighted dice/Harbor expected scoring, the normal-difficulty safety adjustment, strong color-role pressure, duplicate-renovation landmark-exposure risk, four-player expert card-candidate adjustment, expert landmark-effect bonus, remaining enabled-landmark ordering/endgame threshold, stable disruption target/Cleaning-card ranking and pruning, plus `CPUBusinessMoves` candidate/scoring/random-simple selection, must preserve wrapper results, exact candidate/RNG call order, the exact decision baseline, the 2–10 player/all-difficulty self-play baseline, fixed traces, and existing CPU tests. `CPUActionProposal.create()` owns canonical detached proposal shaping; `CPU.chooseBuildAction()` must not mutate game/stock, and `CPUBuildExecution.executeAction()` must apply at most one selected build through the shared Engine locally while preserving the existing online send path. These boundaries do not authorize changing heuristic constants, difficulty presets, candidate order, RNG use, or online authority.
- `js/cpuTurnStrategy.js` owns only canonical non-build CPU action selection. Preserve decision-before-RNG order, exact die-call counts, phase gates, and the existing `main.js` effect callbacks; do not move build execution, timers, checkpoints, or online authority into it.
- Run `npm run test:cpu-regression` after CPU scoring, legal-move, simulation, or execution edits. It compares winner, turns, and completion for 36 seeded full matches.
- Regenerate CPU baselines only for an intentional, reviewed behavior change. Pass `--source-commit <full-40-character-commit>` identifying the accepted pre-generation behavior; never refresh an artifact merely to make a failing test green.
- Browser rollout flags belong in `js/onlineRuntimeFlags.js`. Keep its 53-name contract synchronized with `online.js` readers, accept only strict boolean `true`, and do not inject authority flags into production HTML without a separate rollout decision.
- Batch maintenance uses `npm run test:batch` once at the end: it runs static checks, complete unit/simulation coverage, three standalone Socket E2Es, and release checks without nested group duplication. Run targeted tests per theme; do not append `test:smoke`, `npm test`, `test:online`, `test:cpu`, `test:rl`, or `test:sim` to the same successful final batch unless diagnosing a failure.
- The `all` group keeps one Node process per test and runs two at a time by default, buffering reports back into declared order. Set `MACHIKORO_TEST_CONCURRENCY=1` for sequential diagnosis or constrained environments; values above 8 are rejected. Other named groups default to one process at a time.
- JavaScript and JSON syntax validation inside `test:static` uses `node scripts/check-static-files.js`, which discovers tracked and unignored untracked files and parses them without executing application code in one process. Shell syntax, Python compilation, scoped ESLint, and checkJs remain separate gates.
- Adapter boundaries have JSDoc contracts. TypeScript 5.9.3 runs no-emit checkJs over the explicit browser/server allowlists via `npm run test:types` inside `test:static`: the shared project covers its modules and `appShell.js`, while a second root project checks `main.js` against the same adapters with isolated classic-script globals. Together they cover 296 JavaScript files, including `CPU.js`, `RLCPU.js`, and `server.js`. Scoped ESLint covers 301 JavaScript maintenance files, including all five composition roots and the Node-only Action Contract reporter. `online.js`, `storage.js`, and `ui.js` have explicit cross-script global allowlists for `no-undef`, but remain outside checkJs until their dependencies have typed contracts. The checkJs exclusions are `online`, `storage`, and `ui`. Do not infer runtime authority or repository-wide cleanup.
- `js/uiInputPolicy.js` owns pure online input block priority, human-turn projection, and allowed-action visibility. Keep live game/socket/CPU reads and DOM effects in `ui.js`, and load/cache the policy before it.
- `js/localResumeView.js` owns the RL-preload button and local/online resume-section projection; `js/localResumeEffects.js` owns the injected DOM application. Keep repository/session reads and storage keys/formats in `storage.js`, and load/cache both boundaries before it.
- `js/uiCardSelectEffects.js` owns only injected application of the existing `UiCardSelect` view model to `cardList*`, `btnSet*`, and `landmarkList`. Keep selection state/projection in `UiCardSelect`, and keep modal focus/inert/open/close behavior in the modal runtime.
- `js/uiStatsView.js` owns pure stats bucket selection and escaped HTML/view projection. Keep `stats.js` as the storage/recording/event/DOM-effect owner, preserve the `gameStats` key and output HTML contract, and load/cache the view module before `stats.js`.
- `js/crashScreen.js` owns only crash-message truncation, saved-game resume/reload projection, and focus-loop decisions. Keep CPU cancellation, storage access, listener registration, DOM/ARIA writes, and focus effects in `appShell.js`; keep `crashScreen.js` before `appShell.js` in production/test runtimes and in the Service Worker static asset list.
- `js/cpuSchedulerState.js` owns wait/deadline/token/health projection, scheduler block-reason priority, and phase-step eligibility. Keep the real clock, lazy winner check, mutable scheduler state, timers, checkpoints, phase order, and CPU execution in `main.js`; preserve its production/test/SW load order before `main.js`.
- `js/localActionPolicy.js` owns only the fail-closed local-human input reason order. Keep winner evaluation, reconnect/Socket state reads, Action Contract validation, timers, and all action effects in `main.js`; preserve its production/test/SW load order before `main.js`.
- `js/cpuTuning.js` owns live `expert` option normalization. Keep the exact v2simple preset/mode/tempo/airport defaults and verify decision plus 2–10-player self-play baselines before any value change.
- `server/rejoinPayload.js` owns negotiated Snapshot wire composition. Keep `GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED` default OFF and preserve the raw payload, schema selection, null-on-encode-rejection, event name, and send order.
- `js/uiWatchdog.js` owns sorted freeze-issue dedupe signatures, ordered interactability-issue assembly, action-child requirement decisions, the seven-kind recovery allowlist/fail-closed handler selection, render-recovery eligibility/target planning, and render-synchronization eligibility/human-lock issue selection from captured observations. Reporting dedupe must never suppress recovery; DOM reads, dedupe state, and recovery effects remain in `appShell.js`.
- `js/uiRuntimeSnapshot.js` owns UI flow diagnostic projection, and `js/uiWatchdog.js` owns interactability-issue and freeze-facts assembly from already captured observations. Keep live game/CPU/clock/DOM reads and every recovery/reporting effect in `ui.js`/`appShell.js`; preserve public wrappers and diagnostic field names.
- `js/clientReporting.js` owns browser error/rejection/console input projection, but browser handler binding, console replacement, dedupe, transport, and crash-screen effects remain in `appShell.js`.
- `js/clientRuntimeSnapshot.js` owns only the mapping from captured game, CPU, online, and DOM facts to the existing watchdog diagnostic schema. Keep browser reads, clocks, recovery, storage, and reporting effects in `appShell.js`.
- `js/storedOnlineReconnect.js` owns the validated stored-session application and effect order; do not move the `onlineSession` key, payload format, or Socket callbacks out of their current owners.
- `js/localGameStart.js` owns local start decisions and effect order; RL preload Promise handling, CPU construction, DOM access, and real initialization remain in `main.js`.
- `server/gameSettings.js` owns the CPU difficulty display labels used by room lifecycle. Preserve the hoisted `server.js` adapter because room-lifecycle dependency wiring executes before the settings instance is created.

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
- `GET /api/client-error-health` returns `200` for the deployed build without sending a notification; its response confirms production mode, topic configuration, and fetch transport without exposing secrets. Use an allowed `Origin` header or `CLIENT_ERROR_SHARED_TOKEN` as documented in `docs/NTFY_ERROR_REPORTING.md`.
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

Server-side client-error dedupe keys are projected by `server/clientErrorReporting.js`; preserve the existing field set and 600-character stack prefix. Server-side ntfy client error notifications include a `classification=` line and use priority by class:

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

Focused boundary tests:

- `tests/ui-watchdog-monitor.test.js`: exact 5-second classification and 60-second duplicate-report boundaries, recovery-only selection, and reset.
- `tests/local-resume-policy.test.js`: pending/no-save/invalid/RL preload/resume decisions and saved CPU construction arguments.
- `tests/online-schema-transport.test.js`: default legacy pass-through, negotiated codec arguments, Snapshot selection precedence, and fail-closed missing-codec errors.

`UiWatchdogMonitor` duplicate suppression must suppress reports only, never recovery. Keep `recoverUiInteractability(snapshot)` in the monitor's `RECOVER` branch and preserve the exact `< 60000ms` boundary.

`MACHIKORO_UI_MODAL_CLOSE_EFFECT_AUTHORITY_ENABLED=1` may select `js/uiModalClose.js` only when its post-hide active-owner/unlock/pending-render/focus-restore/trace plan exactly matches the independent legacy plan. The executor validates every selected handler before effects. Production HTML does not inject this flag; inline legacy remains default/fallback. `js/uiModalPolicy.js` decides Escape/Tab commands from captured facts, while modal hide, active-owner policy input, focus execution, and inert/pointer handlers stay in `ui.js`.

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

## Automation Backlog (Do Not Delegate Routine Device Checks)

The following are uncovered automation scenarios, not requests for the user to operate devices. Add browser, Socket E2E, or authorized Android-emulator coverage where feasible. If a runner lacks the capability, record that tooling boundary and keep the behavior unverified:

On 2026-10-03, the current Termux runner reported no attached devices from `adb devices -l`; `emulator`, `sdkmanager`, `ANDROID_HOME`, and `ANDROID_SDK_ROOT` were unavailable. The GitHub Mobile WebKit job does not install or launch the TWA. The new `TWA Android Emulator smoke` workflow passed as run `37124937494` on commit `2a88979f` and uploaded `twa-emulator-smoke`: it built and installed an ephemeral APK, confirmed standalone display mode at a 412×827 CSS-pixel viewport with no horizontal overflow, then completed a local market-card purchase with the displayed coin cost and Undo restoration. The workflow uses Chrome's development-only Digital Asset Links verification bypass for the production origin, so it validates the Android Chrome TWA rendering/gameplay path but does not validate production signing or Digital Asset Links trust. The emulator reported zero safe-area insets; notched/cutout layout, a production-signed TWA, Android background/resume, and trusted startup remain unverified. The current Termux runner still cannot access an emulator or device; do not ask the user for routine device checks.

- iPhone Safari install/update prompt behavior
- production-signed Android Chrome/TWA trust, browser layouts with nonzero CSS safe-area insets, and background process-eviction recovery or visibility-event behavior
- additional multi-client online paths listed above
- screen-reader announcement quality
- full provisional hostless timing; future server-persisted canonical state is a separate design decision

Green browser CI proves only the covered browser scenarios; Mobile WebKit does not prove TWA behavior. The separate passing Android Emulator smoke gives the limited TWA evidence recorded above; neither job proves assistive-technology behavior.

On 2026-10-04 (JST), run `37132532116` on commit `b082ef9e` passed the extended Android Emulator smoke. Its `result.json` recorded a 412×827 standalone viewport without horizontal overflow, a paid facility build (3 → 2 coins, 2 → 3 cards), Undo restoration, native Home launcher focus followed by Chrome Custom Tab focus, unchanged human build-turn state after resume, and successful progression to the next human roll turn. Native window dumps and `background-screen.png`/`resumed.png` are included in the `twa-emulator-smoke` artifact. This proves Home-and-back behavior with CDP attached; it does not prove process eviction, visibility-event delivery, nonzero cutout insets, production signing, or Digital Asset Links trust. The first two extended runs failed in test instrumentation (`document.hidden` waiting and screenshot output buffer), not game assertions; both were corrected before the passing run.

Run `37133085202` on commit `884dc8ae` also passed on 2026-10-04 with `emulate_cutout=true`. Android's display dump reported native cutout insets `[0,168,0,0]` in physical pixels; Chrome supplied a 412×820 CSS-pixel standalone viewport and CSS safe-area insets `[0,0,0,0]`. Paid card construction (4 → 3 coins), Undo, Home-and-back state preservation, and the next human turn passed. This covers the emulated Android tall-cutout path with Chrome sizing its viewport around system chrome; it does not prove a browser path where CSS safe-area insets are nonzero, iPhone cutouts, production signing/DAL trust, or process eviction. The artifact includes the native display dump and final Android screen capture.

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

- For free/casual hosting, set one stable `RESTORE_AUDIT_SECRET` in the hosting provider's private environment settings. Generate a high-entropy value locally with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`; never commit it, put it in browser configuration, or regenerate it on each deploy. The server reads it at process startup, so it must remain identical across restarts and instances that need to verify the same restore bundles.
- `restoreAudit` is HMAC-verified when `RESTORE_AUDIT_SECRET` or `MACHIKORO_RESTORE_AUDIT_SECRET` is configured. A valid signature covers the canonical restore payload and allows the server to trust the compacted client snapshot after restart. This is signed client-carried recovery data, not server-side durable storage: it does not preserve a room if every client loses its bundle, and it does not make current room state durable while the process is running.
- If the secret is absent, invalid, or changed, compacted client snapshots are not trusted. The compatibility path replays a complete action log from the initial state; that path is bounded to 1000 actions. A stable secret improves recovery after log compaction but does not remove the need for durable storage for server-authoritative guarantees.
- Keep the old verification key during rotation for at least the maximum restore-bundle lifetime. If `RESTORE_AUDIT_MAX_AGE_MS` is unset, bundles do not have a configured age limit, so removing an old key can invalidate an arbitrarily old saved bundle. Either retain old keys or explicitly accept that older bundles will need full-log replay; see the keyring guidance below.
- `server/restoreAuditPayload.js` only shapes the canonical snapshot/action payload through injected normalizers. It does not own secrets, key selection, signing, verification order, Socket effects, or restore authority.
- `server/restoreAuditGateway.js` owns only the injected snapshot/action sign/verify orchestration, fixed action-log source, null-snapshot bypass, and boolean verification projection. It does not own cryptographic algorithms, dynamic keyring policy, restore authority, Socket effects, or wire shape.
- Unsigned or invalid audit metadata does not increase authority. If no server canonical state exists, the server ignores unsigned snapshots and falls back to replaying a valid action log from the initial state.
- Optional `RESTORE_AUDIT_MAX_AGE_MS` and `RESTORE_AUDIT_CLOCK_SKEW_MS` enforce freshness. Unknown key IDs, expired records, and future timestamps fail closed.
- `server/canonicalStateRepository.js` owns record construction, save/load delegation, schema/room validation, and store-failure isolation; restore admission applies the priority order live room > authoritative durable canonical state > valid signed state > host replay > confirmed hostless quorum. The opt-in file adapter can provide durable canonical state for one instance on a durable mount, but the current free deployment remains on the default `noop` store. A database-backed multi-instance provider is deferred because recurring cost is not approved.
- Legacy single-secret configuration remains compatible. For rotation, set `RESTORE_AUDIT_KEYRING_JSON` (or the MACHIKORO alias) with active and old keys, select `RESTORE_AUDIT_ACTIVE_KEY_ID`, retain old verification keys through the configured maximum age, then remove them only after the overlap window.

### Unsigned compaction recovery boundary

- After action-log compaction, the server keeps a bounded complete history and exposes it as `fullActionLog` only on unsigned rejoin payloads. The bound is the existing `RESTORE_PAYLOAD_LIMITS.maxActionLogEntries` value of 1000; signed snapshot rooms keep the existing snapshot-plus-residual path.
- Before replacing the four restore-bundle records, the client must prove that the selected unsigned history is continuous from sequence 1 through the server-observed target sequence. A prefix, residual-only log, gap, or mixed-version input that cannot satisfy that proof is incomplete.
- Incomplete history does not stop the currently rejoined game. The client leaves the previous restore bundle untouched, writes the room-scoped `onlineRestoreBundleStatus` quarantine marker, suppresses later restore-bundle writes for that room, and excludes it from automatic recreate/hostless candidates. A later complete or signed rejoin replaces the bundle and clears the marker.
- Unsigned recovery beyond 1000 actions is not guaranteed: recreate admission rejects an oversized full replay, while an unsigned snapshot cannot be trusted after server restart. Do not raise the entry limit alone. Configure `RESTORE_AUDIT_SECRET` or `RESTORE_AUDIT_KEYRING_JSON` for deployments expected to reach this boundary.
- A ceiling-free unsigned alternative requires a separately reviewed bounded chunk/hash-chain protocol or durable canonical authority. Neither is enabled by the quarantine marker.

## Multiple Room Resume UI

- Visible multiple-room resume UI is not enabled. Operators should still expect the existing single online resume affordance.
- Future UI must classify indexed bundles before offering actions. See `docs/MULTI_ROOM_RESUME_DESIGN.md` for candidate states and test requirements.


## Local browser reconnect state authority

`OnlineReconnectRuntime` owns the reconnect state controller, completion marker, retry attempt counter, and rejoin timer. Clean lifecycle events are the default state authority and update the compatibility `isReconnectingOnline` projection. Set either `window.MACHIKORO_ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED=false` or `window.MACHIKORO_ONLINE_RECONNECT_EFFECT_AUTHORITY_ENABLED=false` for immediate rollback of reads or compatibility writes respectively. Timer callbacks, restore queues, ACK handling, Socket.IO event names/payloads, and online Game Engine authority remain on their existing separately gated paths.


## Online shared Engine rollout

Online replay remains default-OFF. Setting both `window.MACHIKORO_ONLINE_GAME_ENGINE_SHADOW_ENABLED=true` and `window.MACHIKORO_ONLINE_GAME_ENGINE_AUTHORITY_ENABLED=true` lets a successful detached transition and reconstruction replace the live replay before mutable application. Either flag unset/false, transition failure, adapter mismatch, or adoption failure uses the existing mutable replay. Keep both flags unset in production until rollout approval; disabling either flag is the rollback. Socket.IO events/payloads, ACK/watermark, and restore queue ordering are unaffected.

## Security headers and CSP rollout

`server/securityHeaders.js` applies `nosniff`, a strict referrer policy, a restrictive Permissions Policy, same-origin framing, and a `Content-Security-Policy-Report-Only` policy to HTTP responses. The `script-src` report policy allows same-origin scripts, the exact Google Ads loader origin referenced by `index.html`, and SHA-256 hashes for the exact inline build/config bootstrap generated by `server/staticAssets.js`. The hash and injected script body share one generator. Build hash text is escaped for HTML script context. The policy does not allow arbitrary inline scripts or every HTTPS host. It sends legacy CSP violation reports to the same-origin `/api/csp-report`; this remains report-only and does not block resources.

The collector accepts at most 8 KB per JSON body and 60 requests per IP per minute. It keeps up to 128 in-memory violation aggregates and emits at most 20 summary log entries per minute. Logs contain only the directive, blocked resource origin (never path/query), disposition, and aggregate count. It does not store document URLs, source file paths, referrers, samples, or raw report bodies, and it does not forward CSP reports to a third party. The in-memory aggregates reset when the server restarts; deployment logs are the review record. A report can be tested with a synthetic payload, without using a real player URL:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'Content-Type: application/csp-report' \
  --data '{"csp-report":{"effective-directive":"script-src","blocked-uri":"inline","disposition":"report","document-uri":"https://example.invalid/room?private=1"}}' \
  https://<deployment-host>/api/csp-report
```

Expect HTTP `204` and a sanitized `[csp-report]` summary in server logs. Do not enable an enforcing `Content-Security-Policy` header until report data has been reviewed, external ad dependencies are inventoried, and desktop/mobile WebKit plus production-trusted TWA startup and gameplay are verified. The passing Emulator smoke uses a development-only Digital Asset Links bypass, so it does not satisfy the trusted-TWA gate. Report-only violations are diagnostic evidence; they do not by themselves justify broadening the policy.

### TWA device verification (automation first)

Use CI, an Android emulator, or an authorized device automation channel for repeatable launch/gameplay checks. Do not ask the user to perform routine manual verification. Run `TWA Android Emulator smoke` for standalone rendering, local card construction, displayed cost, and Undo coverage. Its development DAL bypass does not establish production trust. If the available runner cannot exercise a required production-signed or system-integration path, record the exact permission/tooling boundary, keep that behavior unverified, and leave CSP in Report-Only; do not treat a user-facing checklist as completed evidence.

1. All three signing Secrets are now configured: `ANDROID_KEYSTORE_BASE64`, `KEYSTORE_STORE_PASSWORD`, and `KEYSTORE_KEY_PASSWORD`. The missing passwords were recovered from the initial workflow history on 2026-10-04 and validated against the existing keystore. Never paste signing material into chat, issues, or logs. Preserve the existing signing identity; key replacement requires an explicit app-update and Digital Asset Links migration plan.
2. Dispatch `TWA APK ビルド` on the target commit with `build_signed=true`. The workflow checks that the keystore SHA-256 fingerprint matches the production Digital Asset Links entry, runs the release gates, and uploads `machikoro-apk` for 14 days. A validation-only run does not produce an installable APK.
3. The automated smoke now installs and launches an ephemeral debug-signed APK with development DAL verification bypass. For production-trust verification, install the release artifact in an authorized Android automation runner, launch it, and assert trusted full-screen startup; a browser address bar means Digital Asset Links verification failed. Capture the screen and startup diagnostics as CI artifacts.
4. Automate a local game, roll, build a market card, use Undo, and complete several turns. Assert that dialogs, card hit targets, the PWA banner, and Android system bars do not obscure active controls. Record Android/Chrome versions and workflow run/commit.
5. Keep CSP in Report-Only. Review production report summaries during the test, then repeat after an update and an online lobby session before considering enforcement.

On 2026-10-02, signed workflow run `37001500443` passed the release validation job but stopped before signing because `KEYSTORE_STORE_PASSWORD` and `KEYSTORE_KEY_PASSWORD` were not configured. It produced no APK. As of 2026-10-03, the repository owner did not know these values; recovery or an explicit signing-identity migration is required before a signed build. Do not ask the user to send password values through chat.

On 2026-10-02, Chromium 149 delivered a synthetic blocked-inline-script report through the real HTTP endpoint; the server log contained only `script-src-elem`, `inline`, and the disposition/count fields. The run also observed an existing Google Ads host report, recorded only as its origin. The browser PWA smoke passed both local-game market-build and online-lobby room-create flows at 320/390/1440px with the banners visible; it confirmed updates wait through active context and applied after leaving it. The run used a 500 MiB `MemAvailable` abort threshold and observed a minimum of about 1.86 GiB. Mobile WebKit E2E passed in Release runs `36977369638` and `37001998280`. TWA validation-only run `36977390524` passed the manifest, assetlinks, release gates, and Bubblewrap version check. A read-only production GET also confirmed the deployed response remains `Content-Security-Policy-Report-Only` and that the served Digital Asset Links package name and signing fingerprint match the repository configuration. On 2026-10-02, an already-installed TWA was launched on Android 14 and the title screen was confirmed full-screen with no URL bar. On 2026-10-03, read-only production checks returned `/api/version` hash `2254d60`, passed the online-delivery endpoints, confirmed the response still has `Content-Security-Policy-Report-Only` plus `report-uri /api/csp-report`, and confirmed the public Digital Asset Links package/fingerprint still match `server.js`. The automated TWA smoke passed on 2026-10-03 (run `37124937494`), covering Android Chrome standalone display, no horizontal overflow, local human market-card construction, displayed coin cost, and Undo using the documented development DAL bypass. Production-trusted startup, cutout/system-bar safe-area, background/resume, and review of production CSP reports remain outstanding; CSP enforcement stays deferred.

On 2026-10-04, signed APK run `37136395737` succeeded after restoring the missing password Secrets from the original workflow configuration. Keystore fingerprint validation, APK signing, file validation, and `machikoro-apk` artifact upload all passed without replacing the signing key. The Emulator workflow now accepts `signed_apk_run_id`: it downloads that successful same-repository build artifact and omits the Chrome DAL bypass. Dispatch with `signed_apk_run_id=37136395737` and optionally `emulate_cutout=true` to exercise production trust; the pending execution is not completion evidence. The historical workflow also printed keystore base64 into its logs and used a fixed password, so the old signing material has a potential exposure history. Recovering the password does not resolve that exposure; any signing-key migration must preserve or explicitly address installed-app update compatibility. Do not republish the password or keystore.
