# Architecture Refactor Plan

Last updated: 2026-08-03

This document is a design plan, not an implementation request. The current codebase has already gained many guardrails around payload limits, canonical action data, restore audit, UI escaping, client-version checks, and privacy redaction. The next large maintenance gains require clearer ownership boundaries rather than more one-off fixes.

Do not use this plan to justify a broad rewrite. Each step below should be implemented only when it can be protected by contract tests, rolled back independently, and verified without changing game rules, CPU strength, save compatibility, online compatibility, PWA basics, ad placement, or public URLs.

## Current Responsibility Map

| Area | Current owner | Current responsibility |
| --- | --- | --- |
| Server entrypoint | `server.js` plus `server/*` helpers | Express/API/Socket.IO route and catch wiring plus room/action/restore sequencing remain in `server.js`; validation, identity, game-start/rejoin payload, reporting policy, request gateways, ntfy delivery options, lifecycle, sanitation, and VM game-runtime loading have focused helpers. |
| Online client | `js/online.js` plus online helpers | Socket lifecycle, retry/queue/session orchestration and action application remain in `online.js`; storage, payload normalization/ACK comparison, restore rank, and state vocabulary have focused helpers. |
| UI | `js/ui.js` plus UI helpers | Top-level rendering, modal hide/focus/inert effects, DOM mutation, stats rendering, and event processing remain in `ui.js`; build/pending/detail/select/player/log/order/tutorial transforms, active-game status controls, tab/availability projection, pure modal keydown commands, and default-OFF modal-open plus post-hide modal-close plan/effect boundaries have focused helpers. |
| Rules/actions | `js/GameManager.js`, `js/Card.js`, `js/actionContract.js`, `js/gameEngine.js` | `GameManager` remains the mutable rules owner; the action manifest and 15-action execution dispatch are shared. `GameEngine.transitionSnapshot()` is a pure boundary; shared fail-closed authority policy supports default-OFF, parity-gated server-mirror adoption and production-uninjected online-client adoption while broader live owners remain mutable. |
| Restore/replay/canonical payload | `js/gameSnapshot.js`, `server.js`, `js/online.js`, restore helpers | Exact snapshot construction and hydrate mechanics are shared; live validation, authority, caller-specific legacy normalization, replay ordering, and snapshot-plus-log recovery remain explicit adapters. |
| Tests | `tests/server.test.js`, `tests/online.test.js`, `tests/ui.test.js`, `tests/main.test.js`, others | Contract coverage exists, but high-traffic files are large and often test several boundaries in one file. |

## Where Small Fixes Become Symptomatic

- `server.js` owns both the Socket.IO event surface and the pure policy decisions behind room lifecycle. A small reconnect or restore fix can accidentally affect payload validation, host selection, restored-room replacement, or action log audit.
- `js/online.js` mixes storage keys, retry timing, room mismatch handling, restore bundles, and action application. Adding another guard can preserve the immediate bug while making future stale-state paths harder to reason about.
- `js/ui.js` has safer HTML helpers now, but modal lifecycle, render output, selector registries, and interactability recovery still live close together. A UI fix can mask a missing normal-render contract.
- Action metadata, 15-action execution dispatch, and snapshot hydrate mechanics now have shared owners. The remaining risk is live lifecycle ownership: client/server validation policy, authority, inventory/undo adapters, callback timing, and version negotiation still belong to different runtimes.
- Restore trust boundaries are deliberately casual today. More patches cannot turn host/client restore bundles into durable server authority without a separate design for signing, persistence, retention, conflict resolution, and hostless policy.
- Test files cover many contracts but are themselves large. Mechanical splitting is not valuable; future module extraction should create smaller domain test files naturally.

## Classification Summary

### Root Fix Needed

| Area | Why root fix is needed | Priority |
| --- | --- | --- |
| `server.js` room lifecycle and socket handler boundary | Lifecycle decisions and event transport are coupled in one large file. Pure policy needs a stable seam before handler moves are safe. | P1 |
| `js/online.js` reconnect state and storage facade | Reconnect behavior depends on scattered localStorage keys, retry state, restore bundles, and pending outbound actions. | P1 |
| Shared Game Engine live adoption | Metadata, dispatch, hydrate/serialize adapters, and determinism policy are shared. Pure transition adoption is staged behind independent default-OFF server, online replay, and local action gates; production authority and timing remain legacy. | P2 |
| Restore trust boundary | Current restart restore is useful but client-supplied. Trust claims cannot be improved by small validation patches alone. | P3, design-only |

### Can Be Incremental

| Area | Incremental path | Priority |
| --- | --- | --- |
| UI surface extraction | Extract pure render helpers for build menu, card detail, card select, and modal content before moving lifecycle state. | P2 |
| Server pure helper extraction | Move room lifecycle policy helpers before moving Socket.IO event handlers. | P1 |
| Test architecture | Add new domain tests beside new modules. Avoid moving old assertions until the corresponding module boundary exists. | P2 |
| Game Engine parity contracts | Keep representative detached traces green and add fixtures for newly touched rule paths while preserving explicit client/server hydrate policies. | P2 |

### Needs Manual / Real Device

| Area | Required verification |
| --- | --- |
| iPhone Safari modal/focus/inert/touch behavior | Real iPhone Safari check for blocking modals, invisible overlays, tap targets, and focus recovery. |
| Android Chrome/TWA PWA update flow | Real Android/TWA check for service worker update banner, reload, background/resume, and stale-client handling. |
| Long-running online reconnect | Real network/device matrix for room create/join, reconnect, server restart restore, host migration, CPU turn, undo sync, and background resume. |
| Provisional hostless timing | Mixed Android/iPhone host disappearance through grace, candidate collection, confirmation rotation, and former-host return. |

### Do Not Touch Yet

- Durable canonical server state.
- Real signed restore.
- Authoritative or single-candidate hostless restore beyond the accepted provisional quorum contract.
- Multi-room resume UI.
- CPU strength changes or RL portfolio adoption decisions.
- PWA cache strategy rewrite.
- Save format migrations from card names to card ids.
- Ad placement, URL, or domain policy changes.

### Already Good Enough

- Shared Socket.IO payload size/depth/string guards.
- Canonical restore audit coverage for live action vs restore payload shape.
- `rejoinRoom` `clientVersion` helper and coverage.
- Stats reset custom confirm and stats number normalization.
- UI card/detail/build escaping coverage.
- Client-error ntfy redaction coverage.
- Unknown restore action rejection after snapshot skip gating.
- Current PWA basic static/release guardrails.
- Room-name/ID validation and collision retry live in `server/roomValidation.js`.
- Static root allowlisting and build-hash injection live in `server/staticAssets.js`.
- Accepted client-action lookup, bounded memory, and reconnect refs live in `server/actionAcceptance.js`.

## Design A: Server Room Lifecycle And Socket Event Split

**Current problem:** `server.js` is the transport entrypoint, validation layer, room lifecycle policy, restore coordinator, and audit helper container. The file is testable, but the same edits often touch unrelated online concepts.

**Why small fixes are limited:** Adding another guard inside a Socket.IO handler reduces one failure mode but does not make it clear whether the policy belongs to live room creation, restored-room replacement, reconnect, disconnect, or action relay.

**Target structure:**

| Future file | Responsibility |
| --- | --- |
| `server/roomLifecycle.js` | Pure helpers for create-room defaults, joinable checks, room capacity, host assignment, disconnect outcomes, room cleanup, and replacement eligibility. |
| `server/actionGateway.js` | Pure/live action validation orchestration, canonical payload construction, replay/live differences, audit payload helpers. |
| `server/restoreGateway.js` | Canonical-vs-client restore source selection and existing-room replace/reject/rejoin decisions. Validation, signing, sanitation, replay preparation, Socket effects, mirror, and persistence sequencing remain explicit caller responsibilities. |
| `server/restorePreparation.js` | Coordinates game-start, identity, replay, restored metadata, room construction, and mirror preparation after admission and before activation. Socket, persistence, and activation effects remain caller-owned. |
| `server/restoredRoom.js` | Input-nonmutating host/sequence/hostless metadata, exact-order application to the existing game-start payload, new/replace/reject activation, ordered accepted-action reconstruction and mirror preparation, canonical mirror-result planning, exact-order application to the restored room, and redacted completion-result planning and injected log/result execution, opt-in/default-OFF ordered activation- and delivery-effect executors with inline legacy fallbacks, plus deterministic mutable room-shell assembly from already-validated restore inputs with injected Snapshot sanitation/serialization; authority, replay, Socket, mirror, and persistence remain caller responsibilities. |
| `server/socketHandlers.js` | Thin Socket.IO event wiring after helper contracts are stable. This should be last, not first. |
| `server.js` | App bootstrap, dependency wiring, exports for tests, and top-level operational configuration. |

**Migration steps:**

1. Extract one pure helper group from `server.js` only when its current behavior is covered by tests.
2. Keep Socket.IO handlers in `server.js` at first; call the helper from the existing handler.
3. Add or move tests to assert helper behavior independently from Socket.IO transport.
4. Preserve existing exported test seams until all consumers are migrated.
5. Move one event family at a time into `server/socketHandlers.js` only after helper parity is stable.

**Contract tests to add:**

- Room create/join capacity and duplicate-player behavior.
- Rejoin payload requirements, including `clientVersion`.
- Disconnect outcomes for host, guest, restored room, completed room, and empty room.
- Restored-room replacement host-only policy.
- Live action vs restore audit canonical payload parity.

**Rollback:** Each extraction should leave the old handler shape intact. Roll back by inlining the helper call or reverting the single helper import without changing wire events.

**Real-device verification:** Not needed for pure helper extraction. Required after moving Socket.IO handler wiring or changing reconnect/disconnect timing.

**Priority:** P1. This is the best first root refactor because pure helpers can be introduced without changing online protocol.

## Design B: Online Storage Facade And Reconnect State Machine

**Current problem:** `js/online.js` owns socket setup, storage key reads/writes, room mismatch checks, restore bundle handling, pending outbound actions, retry scheduling, and UI status updates.

**Why small fixes are limited:** More local checks can fix one stale room or timeout path while leaving other key paths with different fallback order or cleanup timing.

**Target structure:**

| Future file | Responsibility |
| --- | --- |
| `js/onlineStorage.js` | Browser-global facade for room-scoped session keys, legacy fallback reads, restore bundle read/write/delete, pending outbound persistence, and namespace constants. |
| `js/onlineReconnectState.js` | Explicit state constants and transition helpers for idle, connecting, rejoining, restoring, replaying, active, failed, and completed flows. Event reads have a default-off gate; compatibility boolean, timer handle/deadline, timeout decision, ACK-timeout ignore/clear-only/rejoin plan, incoming gameAction and pending-matched actionAccepted no-game/duplicate/gap/apply plans, rejoin request plan, terminal app-error cleanup decision, and restore-abort generation/status/queue plan have independent test-only, fail-closed gates that are not injected into production HTML. |
| `js/onlineRuntimeFlags.js` | Frozen source for all 53 schema/reconnect/engine browser rollout flag names and strict boolean reads. Existing `online.js` reader APIs and schema prerequisite composition remain unchanged; authority flags remain absent from production HTML. |
| `js/onlineSchemaTransport.js` | Injected schema negotiation/capability and versioned Action/Snapshot/recreate codec adapter. Production flags remain absent/default-OFF, so legacy wire payloads remain authoritative. |
| `js/onlineReconnectCleanup.js` | Injected terminal cleanup executor with a fixed, directly tested effect order; production keeps the inline legacy fallback. |
| `js/onlineReconnectRequest.js` | Injected rejoin emit executor with fixed clear/count/emit/arm order and one centralized Socket send function; production keeps the inline legacy fallback. |
| `js/onlineActionTimeout.js` | Injected ACK-timeout executor with fixed flight-clear/reconnect/CPU-token/status/rejoin order and clear-only short circuit; it requires authoritative pure-plan parity and an independent effect gate, while production keeps inline legacy. |
| `js/onlineDecodeFailure.js` | Injected malformed-Action recovery executor with optional ACK-flight clear followed by reconnect/rejoin/retry effects; separate default-OFF gameAction/actionAccepted gates require clean reconnect shadow state and otherwise use inline legacy. |
| `js/onlineActionApplyFailure.js` | Injected apply-exception executor with fixed report/reconnect/CPU-token/rejoin/retry order and restore-flush short circuit; separate default-OFF handler gates require authoritative pure apply plans and otherwise use inline legacy. |
| `js/onlineActionGap.js` | Injected sequence-gap executor preserving reconnect/CPU-token/optional-status/rejoin/retry order; separate default-OFF handler gates require authoritative pure gap plans. |
| `js/onlineActionNoGame.js` | Injected no-game executor preserving incoming status+rejoin and accepted status-only behavior; separate default-OFF handler gates require authoritative pure no-game plans. |
| `js/onlineActionCommit.js` | Injected successful-action executor preserving sequence/log/accepted-only pending-clear/render/CPU-schedule order; restore flush omits render/schedule, and separate default-OFF handler gates require authoritative pure APPLY plans. |
| `js/onlineSocketConnect.js` | Pure waiting-status/rejoin eligibility plan and ordered cleanup/reconnect/rejoin executor; separate default-OFF gates require exact legacy parity and a clean CONNECTING history. |
| `js/onlineSocketDisconnect.js` | Pure active/restore-abort plan and ordered lobby-finish/restore-quarantine/reconnect/flight/CPU/event/status executor; separate default-OFF gates require clean shadow parity. |
| `js/onlineHostChanged.js` | Pure host-ownership plan and ordered host-state/log/render/CPU-schedule-or-invalidate/persistence executor after restore queue admission; separate default-OFF gates preserve legacy fallback. |
| `js/onlineRejoinPersistence.js` | Pure pre-replay runtime/session persistence plan and exact ordered executor for action flight, accepted pending cleanup, retry, settings, indices, host state, restore bundle, session, CPU token, and optional UI-lock reset; separate production-uninjected gates preserve inline legacy fallback. |
| `js/onlinePendingResend.js` | Pure post-restore `none`/`clear`/`resend` plan and ordered stale-pending clear or ACK-flight-then-`gameAction` emit executor; exact reference parity and separate production-uninjected gates preserve inline legacy fallback. |
| `js/onlineRestoreReplay.js` | Exact-reference restore replay plan and ordered replay-mode/start-status/init/Snapshot/residual-Action/provisional-log/final-cleanup executor; screen/error/abort orchestration remains in `online.js`. |
| `js/onlineRestoreActivation.js` | Exact-sequence restore activation plan and ordered runtime activation/sequence publication/queue flush/lifecycle executor; separate default-OFF plan/effect gates retain inline legacy fallback. |
| `js/onlineRestoreQueueState.js` | Input-nonmutating enqueue/overflow, rejoin-generation carry, flush-start drain, failed-index suffix retention, and shared clear transitions; a production-uninjected flag selects them only on exact inline-legacy parity, raw queue reads, replacements, and legacy appends are limited to three owner helpers. A detached shadow store can supply reads and perform replacement/append first only behind independent production-uninjected flags and exact legacy parity, while the raw rollback mirror plus production write ownership, abort, handler execution, and callbacks remain in `online.js`. |
| `js/onlineRestoreAbort.js` | Injected restore-abort executor with fixed finish/quarantine/queue/reconnect/status/rejoin/retry order; it requires authoritative pure-plan parity and an independent effect gate, while production keeps the inline legacy fallback. |
| `js/onlineActions.js` | Client action send/apply helpers only after storage and state are stable. |
| `js/online.js` | Socket event orchestration and integration with UI/main. |

**Migration steps:**

1. Create `js/onlineStorage.js` as a facade that wraps the existing key names and fallback behavior exactly.
2. Add contract tests for key namespace, stale room cleanup, restore bundle preservation, and pending outbound persistence.
3. Replace direct storage calls in `js/online.js` gradually with facade calls.
4. Introduce reconnect state constants and transition helpers without changing timeout durations or UI text.
5. Move retry scheduling and failure classification behind the state helper.
6. Delay `onlineActions` extraction until storage and state tests are stable.

**Contract tests to add:**

- Room-scoped keys do not leak between rooms.
- Legacy fallback is read only where compatibility requires it.
- Reconnect timeout produces the same failure classification as today.
- `ROOM_NOT_FOUND`, stale room, hostless restore, and client-version mismatch remain distinguishable.
- Pending outbound actions are not replayed into the wrong room.

**Rollback:** The facade must preserve current key strings and expose small wrapper calls. Revert by replacing facade calls with the previous local helpers; do not migrate storage format during this phase.

**Real-device verification:** Not needed for the storage facade alone. Required after state-machine changes that affect retry timing, mobile background/resume, or visible reconnect UI.

**Priority:** P1 for storage facade, P2 for explicit state machine.

## Design C: UI Surface Extraction Without Lifecycle Rewrite

**Current problem:** `js/ui.js` is safer after helper and escaping work, top-level tab projection and modal keydown commands are pure, and watchdog issue assembly is separated from DOM observation. It still owns modal lifecycle effects, stats rendering, DOM effects, event processing, and interactability recovery.

**Why small fixes are limited:** A targeted UI patch can keep the current screen working while bypassing selector registries, normal-render affordances, or modal visibility contracts. The earlier invisible-confirm issue is a sign that lifecycle and interactability need stable boundaries.

**Target structure:**

| Future file | Responsibility |
| --- | --- |
| `js/uiModalPolicy.js` | Deny-by-default modal policy plus pure visibility, focus-trap, and Escape/Tab command decisions. |
| `js/uiModal.js` | Future custom modal close lifecycle, focus/inert restoration/pointer-state handling, confirm/prompt helpers, modal registry. |
| `js/uiModalOpen.js` | Exact modal-open identity plan and ordered accessibility effects behind an off-by-default parity gate with inline legacy fallback. |
| `js/uiModalClose.js` | Exact post-hide active-owner/unlock/pending-render/focus-restore/trace plan and ordered effects behind an off-by-default parity gate with inline legacy fallback. |
| `js/uiBuildMenu.js` | Pure card-filter state transition, build gate/action-state and Undo visibility/enabled projection, data-to-HTML helpers, safe button attributes, available-card display. |
| `js/uiPendingMenu.js` | Pure pending display-candidate/current-player gate and pending-kind HTML registry. |
| `js/uiCardDetail.js` | Pure card/landmark detail rendering and escape-safe descriptions. |
| `js/uiCardSelect.js` | Card selection reducers plus sorted modal view-model and toggle HTML generation. |
| `js/uiGameStatusView.js` | Pure turn text, roll/skip button state, current dice projection, active-turn transition state, and input-nonmutating coin deltas. |
| `js/uiTurnAnnouncer.js` | Pure human/CPU announcement text, display state, and unchanged 1300ms/400ms timing policy. |
| `js/uiTabView.js` | Pure top-level/online-tab and online/offline availability projection plus the stats-render effect decision. |
| `js/uiStatsView.js` | Pure stats bucket selection, escaped filter/ranking HTML, empty-state copy, and overview projection; `stats.js` keeps storage, recording, events, and DOM insertion. |
| `js/uiInputPolicy.js` | Pure online block-reason priority, human-turn projection, and allowed-action visibility; `ui.js` keeps live game/socket/CPU reads and DOM effects. |
| `js/localResumeView.js` | Pure RL-preload button and local/online resume-section projection; `storage.js` keeps repository/session reads and DOM writes. |
| `js/uiPlayers.js` | Player board/status rendering helpers after smaller surfaces are stable. |
| `js/ui.js` | Top-level render orchestration and global compatibility exports. |

**Migration steps:**

1. Extract pure HTML helpers first, starting with surfaces already covered by escape tests.
2. Keep global function names and call sites compatible with existing `index.html` load order.
3. Add selector-registry tests for any moved surface.
4. Keep the extracted keydown command policy separate from its existing DOM/focus executor.
5. Move modal lifecycle only after build/card/select helpers are stable.
6. Treat focus/inert/pointer behavior as a manual-check gate, not a pure refactor.

**Contract tests to add:**

- Build menu and card detail escape untrusted names/descriptions/colors.
- Every primary action container has a registry entry and a normal-render assertion.
- Modal open/close leaves the app interactive and no invisible blocking overlay remains.
- Card select renders expected buttons without inline handlers.

**Rollback:** Pure helper modules should be import-free browser globals loaded before `ui.js`. Roll back by restoring helper functions inside `ui.js` and removing the script include.

**Real-device verification:** Required for modal lifecycle, focus, inert, pointer-events, and iPhone Safari/touch behavior. Not required for pure HTML helper extraction if tests cover output.

**Priority:** P2. Good incremental value, but modal lifecycle changes must wait for real-device checks.

## Design D: Action Metadata Single Source Of Truth

**Current state:** `js/actionContract.js` is the metadata/canonical-key/UI source, `js/gameSnapshot.js` owns shared serialize/hydrate mechanics with caller-owned compatibility policies, and `js/gameEngine.js` owns the shared 15-action dispatch used by client replay and server mirror. `GameEngine.transitionSnapshot()` provides a detached seam. `js/gameEngineAuthority.js` owns the shared fail-closed selection policy; `server/gameEngineAuthority.js` retains environment parsing and can select a result for the internal canonical mirror only after exact shadow parity and successful snapshot reconstruction. `js/gameEngineClientShadow.js` provides the same detached compare/select boundary for deterministic online replay and adopts only after rebuilding the candidate in a separate runtime. Its shadow and authority flags are not injected into production HTML. `js/gameEngineRuntimeAdapter.js` shares caller-specific hydrate/serialize/Undo compatibility, and `js/gameEngineDeterminism.js` rejects unresolved random inputs before local shadowing. Local human actions, canonical CPU proposals, card/landmark builds, and Undo have their own production-uninjected shadow/authority gates with exact parity and detached reconstruction fallback. Production validation, authorization, scheduling, mutation, and transport remain under their existing owners.

**Remaining limit:** Shared metadata and dispatch remove duplication, but they do not decide which runtime may authorize an action, how legacy snapshots hydrate, when socket callbacks run, or when mixed clients may emit a new schema. Those boundaries must remain explicit adapters rather than being hidden inside the dispatcher.

**Target structure:**

| Boundary | Responsibility |
| --- | --- |
| `js/actionContract.js` | Implemented browser/CommonJS metadata and Action envelope boundary. |
| Client/server adapters | Retain independent validation, authority, inventory/undo, timing, and transport while consuming shared metadata/dispatch. |
| Contract/parity tests | Guard registry coverage, exact snapshots, mutable-dispatch parity, detached transitions, and future migration behavior. |

**Migration steps:**

1. **Complete:** add cross-layer registry tests and make `js/actionContract.js` the read-only metadata source.
2. **Complete:** project phase, canonical payload keys and accepted compatibility variants, replay/apply flags, and UI targets from that source.
3. **Complete:** route client replay and server mirror through the shared mutable `js/gameEngine.js` dispatcher, retaining their adapters and authority.
4. **Shadow only:** compare detached `snapshot -> action -> snapshot` transitions with the mutable server mirror; do not switch live ownership yet.
5. **Current footing:** shared hydrate mechanics keep client/server/local-save legacy policy adapters explicit; detached server parity covers every Action Contract entry for 2/3/5/10-player boundaries and all four independent Action/Snapshot v0/v1 selections, including build/Undo/next-turn, dice/reroll/harbor choices, both accepted mover payload forms, every pending resolver, and victory. `js/gameSchemaCodec.js` enforces independently selected versions, and `transitionEnvelope()` preserves its prior behavior when no selection is supplied. `GAME_SCHEMA_NEGOTIATION_ENABLED`, diagnostic-only `GAME_SCHEMA_SHADOW_ENABLED`, live Action `GAME_SCHEMA_WIRE_ENABLED`, and Snapshot `GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED` are independent off-by-default rollback gates (the latter three require negotiation). Snapshot v1 is wired for rejoin responses and compacted action metadata. `GAME_SCHEMA_RECREATE_WIRE_ENABLED` independently wraps the recreate request and negotiated embedded Snapshot/action-log fields in v1 while accepting unwrapped legacy unchanged; the server reverses the nested wire before existing restore validation. Local saves use `js/localSaveRepository.js`: default-OFF behavior writes only the exact legacy `savedGame`; `LOCAL_SAVE_SCHEMA_WRITE_ENABLED=1` additionally writes `savedGameV1`, adopts it only after schema/content validation while legacy still exists, and falls back without changing the rollback key. Production recreate/local-save flag state and live pure-transition authority remain OFF; restore authority and persisted legacy forms remain unchanged. **Future:** require separate rollout review before production recreate/local-save activation or live authority cutover.

**Contract coverage (implemented; extend before live migration):**

- Every action in `GAME_ACTIONS` has metadata.
- Every server-canonicalized action has canonical payload keys and any accepted compatibility variants in the contract.
- Every client-applied online action is declared replayable or explicitly live-only.
- Phase allowed actions match existing `GameManager.allowedActionsFor()` behavior.
- UI/pending actions that render buttons have a corresponding action contract entry.

**Rollback:** Keep action execution and validation paths operational while metadata is introduced. If drift appears, revert the consumer migration and leave the metadata table as documentation plus tests until fixed.

**Real-device verification:** Not needed for metadata-only work. Needed only if action sending, online replay, or visible UI behavior changes.

**Priority:** P2. High long-term value, but safer after server helper and online storage seams exist.

## Design E: Restore Trust Boundary Roadmap

**Current problem:** Server restart restore can reconstruct casual games from client/host bundles, but the server still does not own durable canonical state. This is acceptable for current product wording and scope.

**Why small fixes are limited:** More payload validation can reject malformed data, but it cannot prove that a client-supplied bundle is authoritative. True authority needs persistence, signatures or audit hashes, retention policy, conflict resolution, and hostless semantics.

**Target structure:**

| Future artifact | Responsibility |
| --- | --- |
| `docs/ADR_RESTORE_TRUST_BOUNDARY.md` | Product/security decision for casual restore vs authoritative restore. |
| Durable state adapter | Optional future server-owned snapshot/action-log storage with retention and locking. |
| Restore authority policy | Ranking of live server state, durable server state, host bundle, non-host bundle, skipped old entries, and completed rooms. |
| Restore audit hash/signature plan | Optional proof mechanism if competitive trust is required later. |

**Migration steps:**

1. Do not implement until the product requirement changes.
2. Write an ADR first that states whether restore remains casual or becomes authoritative.
3. Define storage retention, conflict policy, and operational failure behavior.
4. Add migration tests around old restore bundles before introducing durable state.
5. Implement behind a feature gate or adapter so current host-bundle restore can be restored quickly.

**Contract tests to add:**

- Restore source priority for live state, durable state, host bundle, non-host bundle, stale bundle, and completed room.
- Replay hash/signature acceptance/rejection if signed restore is adopted.
- Backward compatibility for existing restore bundles.
- Room replacement and hostless restore policy.

**Rollback:** Keep current host-bundle restore path intact until durable restore is proven. A feature flag or adapter boundary should allow falling back to current behavior.

**Real-device verification:** Required. This affects server restart, reconnect, stale-client behavior, and multi-device conflict paths.

**Priority:** P3 and Do Not Touch Yet. This is a future product/security design, not a maintenance cleanup.

## Design F: Test Architecture For Future Splits

**Current problem:** `tests/server.test.js`, `tests/online.test.js`, `tests/ui.test.js`, and `tests/main.test.js` cover important contracts but are large. Large tests are acceptable while the implementation is centralized, but they become harder to use as ownership boundaries split.

**Why small fixes are limited:** Moving tests without moving code is churn. Adding more assertions to giant files can also bury the contract being protected.

**Target structure:**

| Future test area | Responsibility |
| --- | --- |
| `tests/server/room-lifecycle.test.js` | Pure room lifecycle helper contracts. |
| `tests/server/action-gateway.test.js` | Server action validation and canonical payload contracts. |
| `tests/online/storage.test.js` | Online storage namespace and restore bundle facade contracts. |
| `tests/online/reconnect-state.test.js` | Reconnect state transition contracts. |
| `tests/ui/*.test.js` | UI helper contracts grouped by modal/build/card-select/card-detail surfaces. |
| `tests/action-contract.test.js` | Cross-layer action metadata alignment. |

**Migration steps:**

1. Add new tests beside new modules.
2. Keep old tests until duplicate coverage is proven.
3. Move old assertions only when the related production function has moved.
4. Keep `tests/run-all.js` as the source of truth for test groups.
5. Avoid renaming large files solely for aesthetics.

**Contract tests to add:** The tests listed in Designs A-D should be placed in these domain files as modules are introduced.

**Rollback:** Test-only splits can be reverted by moving assertions back into the previous file, but avoid needing rollback by keeping old coverage until the new module path is stable.

**Real-device verification:** Not needed for test organization itself.

**Priority:** P2. Let implementation boundaries drive test boundaries.

## Implemented Safe Units

As of 2026-08-02, rollback-friendly units from this plan are implemented without changing existing wire payload meanings, storage format, game rules, CPU tuning, or PWA behavior:

- `server/roomLifecycle.js`, `server/socketPayload.js`, and `server/gameSettings.js` own pure room lifecycle (including active/current socket, connected-host, host index/epoch synchronization, and hostless-capability projection), payload-limit/rejection-gateway, and game-setting normalization policy; Socket.IO handlers remain in `server.js`.
- `server/roomSocketRuntime.js` owns injected `hostChanged` emission, stale-player socket eviction, full-room replacement detach, and host-presence socket-map wiring. Rejoin/disconnect/recreate policy and ordering around these calls remain in their handler owners.
- `server/serverDice.js`, `server/reconnectIdentity.js`, `server/restoreSanitization.js`, and `server/canonicalMirrorMetadata.js` own pure dice payload, reconnect token/verified player activation, restore-log sanitation, and mirror metadata policy; transport order and restore authority remain in `server.js`.
- `server/canonicalStateRepository.js` owns the injected build/save/load/validate/failure-isolation boundary around `server/canonicalStateStore.js`. The configured store remains noop by default; no durable provider or authority priority changed.
- `server/canonicalMirrorRuntime.js` owns marker/hash synchronization, stale rebuild diagnostics, build Undo capture, clear-after-Undo/turn, and accepted-action adoption through injected metadata/replay dependencies; authority selection remains outside the adapter.
- `server/restoreAuditPayload.js` owns injected, pure snapshot/action audit payload shaping. Signing, keyring selection, verification order, Socket effects, and restore authority remain in `server.js`; the signed bytes and protocol are unchanged.
- `server/restoreAuditRuntime.js` owns dynamic keyring-config reads plus active signing and verification option shaping. It does not sign, verify, cache secrets, or select restore authority; existing `restoreAudit.js` bytes/results and environment aliases remain unchanged.
- `server/restoreAuditGateway.js` composes the existing payload builders, dynamic option builders, and cryptographic primitives for snapshot/action signing and verification. It owns call order, the fixed `server-action-log` source, null-snapshot bypass, and boolean result projection only; signature bytes, keyring policy, restore authority, and wire format are unchanged.
- `server/restoreSnapshotAttachment.js` owns the injected post-compaction eligibility and action-entry attachment step. It requires an over-limit pre-compaction length, an empty residual log, and successful audit generation before mutation; compaction, signing, transport, and authority stay outside.
- `server/gameLifecycleReporting.js` owns lifecycle notification payload/text formatting, `server/gameLifecycleGateway.js` owns auth/rate/normalize/dedupe/notify decision order and status, and `server/reportDelivery.js` owns injected ntfy delivery options, and `server/reportingHttpRoutes.js` owns route/JSON-limit/catch-fallback registration; `server.js` retains gateway construction and Express dependency wiring.
- `server/clientErrorReporting.js`, `server/clientErrorAuth.js`, `server/reportingPolicy.js`, and `server/reportThrottle.js` own unchanged report shaping/classification/dedupe-key projection, request authorization, trust-proxy/topic/rate-key/debug-endpoint/dedupe policy, injected rate/dedupe algorithms, and per-report admission binding of limits/maps/dedupe keys. `server/clientErrorGateway.js` owns request decision order/status, `server/reportDelivery.js` owns injected ntfy option binding, and `server/reportingHttpRoutes.js` owns exact route/limit/fallback registration.
- `server/rejoinPayload.js` owns the injected snapshot/log/ACK/audit/provisional-field builder and negotiated Snapshot wire composition. `server/lobbySocketHandlers.js`, `server/rejoinSocketHandler.js`, `server/actionSocketHandler.js`, and `server/disconnectSocketHandler.js` now own those handler families with exact effect-order tests; recreate validation/signing, Socket effects, mirror, and persistence orchestration remain in `server.js`.
- `server/restoreValidation.js` owns game-start validation, undo-state sanitation, and restored human-slot reconstruction. `server/restoreGateway.js` owns canonical-vs-client source selection and the pure existing-room replace/reject/rejoin policy; `server/restoreAdmission.js` owns the injected entrance shape/limit/room/source/audit/snapshot-trust plan plus new-room game-start/RL validation, player-setting normalization, player-index/token/original-host/reconnect-hash/restored-player identity, and existing-room started/host-auth/sanitize/replace-or-rejoin admission; `server/existingRoomRejoin.js` owns a separately flagged, default-OFF detach/identity/optional-host-reselection/persist/touch/emit executor with inline fallback; `server/restoreReplayAdmission.js` owns dynamic-secret/sanitize/empty-state/rank planning; `server/restorePreparation.js` orders game-start/identity/replay/metadata/room-build/mirror preparation before activation, all with exact lazy-order contracts; `server/restoredRoom.js` owns validated restore metadata planning/exact-order payload application/activation/mirror-result planning/exact-order room application/redacted-completion planning/log executor, room-shell assembly, accepted-action reconstruction/mirror preparation executor, and separate default-OFF detach/delete/install and persist/join/identity/rejoinData executors with inline legacy fallbacks. Validation/signing/sanitation, Socket effects, mirror, and persistence stay in their original order in `server.js`.
- `server/staticAssets.js` owns build-hash resolution, injected index/public-root response handlers, root files, and directory routes; injected tests fix environment > Git > time-fallback order, and tests verify allowlisted files exist and every local `index.html` asset is served by an allowlisted route.
- `server/actionPayload.js` owns the frozen canonical payload key table and client action ID normalization while handlers, event names, and payload shapes remain unchanged.
- `server/actionAcceptance.js` owns duplicate acceptance lookup, bounded ACK references, and restore-rank-aware room sequence advancement; server wiring injects the existing rank policy and retains ACK/broadcast/compaction order.
- `server/actionValidationGateway.js` owns live mirror lookup → winner closure → actor authority → allowed-action gate → server dice canonicalization → payload validation through injected dependencies. Direct tests fix early-exit laziness and Undo fallback; `server.js` retains wiring and the existing exported `validateGameAction` API.
- `js/clientStorage.js` is the sole direct `localStorage` owner. `js/onlineStorage.js` owns online session key, room scope, restore bundle, index policy, and pure maximum-action-seq aggregation while obtaining storage through the shared facade; key names and payload formats are unchanged.
- `server/gameStartPayload.js` owns schema-gated game-start payload assembly with injected name/order/version/token/capability readers; `server.js` retains room readiness, mutation, logging, and Socket emit timing.
- `server/gameStartLifecycle.js` owns the injected room-initialization → canonical-mirror reset → timestamp → persistence effect order; `server.js` retains readiness checks, payload construction, Socket emit, and logging.
- `server/gameStartCoordinator.js` owns missing/started/not-ready exits and payload build → room activation → `gameStart` emit → logging order; `server.js` supplies rooms, Socket.IO, and logging adapters.
- `server/gameRuntimeLoader.js` owns the frozen Card/Player/Action Contract/GameManager VM load order and server-mirror export list behind injected path/fs/vm adapters; `server.js` retains the existing loader API and startup wiring.
- `js/onlineRestoreRank.js` owns existing restore-rank calculation. `js/onlineActionSequence.js` owns pure log/current/last-applied/next sequence projection while storage reads, mutable sequence memory, reconnect timing, ACK handling, restore queues, and Socket.IO ownership remain in `online.js`.
- `js/onlineRuntimeFlags.js` owns the 53 schema/reconnect/engine rollout flag names and strict-boolean lookup. `online.js` retains its compatibility reader functions and the existing schema-negotiation prerequisite; production HTML still injects none of the authority flags.
- `js/onlineSchemaTransport.js` owns schema-negotiation prerequisites, advertised capability/selection checks, and Action/Snapshot/recreate codec dispatch through injected dependencies. `online.js` retains public wrappers and live selection state; existing flags, payloads, and error reasons are unchanged.
- `js/onlineReconnectState.js` owns eight state names, allowed transitions, a pure lifecycle-event reducer, event-vs-legacy projection parity, and a bounded event controller. Under the off-by-default `ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED` flag, only clean event history drives UI/send/CPU/human input gates. Independent test-only gates then cover the compatibility reconnecting boolean, rejoin timer handle/deadline, timeout decision, ACK-timeout ignore/clear-only/rejoin plan, rejoin request reject/wait/exhaust/emit plan, terminal app-error cleanup decision, and exact socket-disconnected/restore-lifecycle/normal retry-exhausted status effects, with legacy fallback on any parity defect or unsupported event. `js/onlineRetryPolicy.js` owns unchanged retry calculations, the injected timer controller, and pure ignore/rejoin/exhaust decision. Production HTML injects none of the effect/status/timer/callback/request-plan/request-effect/queue-plan/queue-effect/queue-state/cleanup-effect/restore-abort-plan/action-timeout-plan/action-timeout-effect/game-action-plan/action-accepted-plan/pending-reconciliation-plan/rejoin-action-log-plan/local-host-restore-offer-plan gates. `js/onlinePayload.js` also owns the incoming gameAction and pending-matched actionAccepted no-game/duplicate/gap/apply decisions, plus rejoin pending reconciliation with explicit replay-log/legacy-snapshot/accepted-ID/unaccepted reasons and the unsigned-snapshot full-log preservation choice. Each pure plan is selected only on exact legacy parity behind a production-uninjected test gate while clearing, resend, apply, and rejoin effects remain in `online.js`. `js/onlineDecodeFailure.js` separately fixes malformed Action recovery order, including actionAccepted-only ACK-flight clearing; its two production-uninjected effect gates require clean reconnect shadow state and fall back to the inline legacy sequence. `js/onlineActionApplyFailure.js` fixes post-decision apply-exception order and defers rejoin to the restore queue owner while flushing; its two production-uninjected gates require an authoritative pure apply plan and otherwise run inline legacy. `js/onlineActionGap.js` and `js/onlineActionNoGame.js` likewise own the exact handler-specific gap/no-game effects only behind authoritative pure decisions plus production-uninjected gates, with inline fallback. `js/onlineActionCommit.js` owns successful set-sequence/save-log/accepted-only pending-clear/render/CPU-schedule effects; restore flush omits render/schedule, and its two production-uninjected gates require authoritative pure APPLY plans before selection, otherwise inline legacy runs. `js/onlineSocketConnect.js` owns waiting-status/rejoin planning and cleanup/reconnect/rejoin order, requiring exact legacy parity plus a clean CONNECTING history. `js/onlineSocketDisconnect.js` owns active/restore-abort planning and lobby-finish/optional restore quarantine/reconnect/flight/CPU/event/status order. Both callback families use separate production-uninjected plan/effect gates and inline fallback. `js/onlineHostChanged.js` owns host ownership planning and host-state/log/render/CPU-schedule-or-invalidate/persistence ordering after the existing restore queue gate, again behind separate production-uninjected plan/effect gates. `js/onlineRejoinPersistence.js` owns the pure pre-replay runtime/session plan and fixed action-flight/pending/retry/settings/indices/host/restore-bundle/session/CPU-token/UI-lock effect order; separate production-uninjected plan/effect gates require exact legacy parity and otherwise retain inline fallback. `js/onlinePendingResend.js` owns the post-activation none/clear/resend decision and stale-clear or ACK-flight-before-emit order under the same exact-parity/default-legacy policy. `js/onlineRestoreReplay.js` owns exact-reference replay planning and the replay-mode/event/status/init/Snapshot/residual-Action/provisional-log/final-cleanup body; screen, error, and abort orchestration remain in `online.js`. `js/onlineRestoreActivation.js` owns restored-through sequence planning and the reconnect/game activation→sequence publication→queued-event flush→activated lifecycle order; flush failure stops before lifecycle publication. Its separate production-uninjected plan/effect gates require exact parity and retain inline legacy fallback. `js/onlineActionTimeout.js` executes its fixed effects only after an authoritative ACK-timeout plan plus an independent gate; inline legacy remains default. `js/onlineReconnectRequest.js` executes the fixed clear/count/emit/arm sequence only after pure request-plan authority plus its independent gate and keeps one `rejoinRoom` send function. `js/onlineReconnectCleanup.js` executes the fixed terminal cleanup sequence only behind clean decision parity plus its independent gate; inline legacy remains default. The restore-abort plan requires clean event history and exact legacy parity, and `js/onlineRestoreAbort.js` executes its fixed effects only behind that authoritative plan plus an independent gate; inline legacy remains default. Its queue-overflow path is fixed by automated disconnect/connect/rejoin/restore coverage. `js/onlineRestoreRank.js` additionally selects a newer original-host local bundle only after exact legacy plan and bundle-identity parity behind its own production-uninjected gate. Production Socket emit authority, session read, hostless branches, restore queue variable/abort/flush authority, production restore-abort/rejoin callback authority, context-specific status beyond socket disconnect/restore lifecycle/retry exhaustion, storage, and protocol remain in `online.js`.
- `js/onlinePlayerSettings.js` owns online player-setting normalization, exact option HTML, RL model freezing/readiness messages and load-state selection, and create/join button view decisions. `online.js` retains mutable state, DOM writes, RL preload, lobby timeout, and Socket.IO request ordering.
- `js/uiBuildMenu.js` (including card-filter state transition, build gate/action-state, and Undo projection), `js/uiPendingMenu.js` (including pending display gates and modal/content/inner-style projection), `js/uiCardDetail.js`, `js/uiCardSelect.js`, `js/uiPlayerDisplay.js`, `js/uiLogDisplay.js`, `js/uiCardOrder.js`, `js/uiTutorial.js`, `js/uiWinner.js`, `js/uiDiceChoice.js`, `js/uiDiceDisplay.js`, `js/uiTurnAnnouncer.js`, `js/uiGameStatusView.js`, and `js/uiTabView.js` own pure HTML/display/order/guidance policy. `js/uiModalOpen.js` owns the exact modal-open plan and ordered effect executor, and `js/uiModalClose.js` owns the post-hide close decision/effect sequence; both use production-uninjected parity gates with inline legacy default/fallback and preserve accessibility-sensitive order. `js/uiCardSelect.js` also owns input-nonmutating selection reducers and the sorted set/landmark view model; `js/uiLogDisplay.js` additionally owns the input-nonmutating bounded log-history reducer and collapsed icon/ARIA projection, `js/uiPlayerDisplay.js` owns coin-animation class/text/sound projection, `js/uiTutorial.js` owns tutorial-enabled/level control projection, `js/uiGameStatusView.js` owns active-game status/control projection, active-turn transition state, and input-nonmutating coin deltas, `js/uiDiceDisplay.js` owns exact dice-face/result HTML plus opacity projection, `js/uiTurnAnnouncer.js` owns announcement text/display/timing policy, and `js/uiTabView.js` owns tab plus availability projection; `ui.js`, `main.js`, and `appShell.js` still own DOM mutation, modal/timer effects, stats rendering, event handling, and orchestration. Rolling preserves the prior dice opacity exactly.
- `js/clientRuntimeSnapshot.js` owns the flat watchdog diagnostic schema projection from grouped captured facts; `js/clientCheckpoint.js`, `js/clientReporting.js`, `js/clientReportingTransport.js`, `js/lifecycleNotify.js`, `js/lifecycleTransport.js`, and `js/uiWatchdog.js` own injected checkpoint creation/bounded-memory/persistence recording, pure client URL/runtime-context/report formatting, injected client-error POST/checkpoint transport, lifecycle payload/start/dedupe, notification-setting, runtime player/CPU counts, mode/version, immutable session/start/finish/reset transitions, finish-metadata, and winner CPU-difficulty projection, plus deterministic session-ID formatting from injected clock/RNG values; the injected lifecycle transport owns its unchanged POST/checkpoint sequence; freeze classification, captured-observation-to-freeze-facts projection and freeze-classification eligibility/assembly, trace/root-cause transforms, element usability/lock reason, primary/pending/phase recovery eligibility, stale-modal policy, action-child requirement decisions, the recoverable freeze-kind allowlist/fail-closed handler selection, render-recovery eligibility/target planning plus render-synchronization eligibility/human-lock issue selection from captured observations, and bounded diagnostic serialization. `js/clientStorage.js` is the sole direct browser-storage owner; app shell, main, online, specialized online storage, local save/settings, UI trace/tutorial, and stats consumers delegate through it. `js/appShellStorage.js` preserves its compatibility contract, and `js/pwaShell.js` owns the injected install-prompt/banner controller. `appShell.js` retains browser capture, storage key/value policy, checkpoint DOM-snapshot/clock/root/storage binding, DOM snapshots and modal/focus recovery effects, clock/RNG/global-fetch binding, mutable client-report dedupe state, timers, and public wrappers; Service Worker update wiring remains unchanged.
- `js/uiRuntimeSnapshot.js` owns the input-nonmutating game-flow diagnostic projection and pending-action normalization used by `ui.js`; live game/CPU/clock reads, DOM writes, and the public wrapper stay in `ui.js`.
- `js/clientReporting.js` also owns browser error, unhandled-rejection, and console-error input projection plus duplicate-window admission/next-state projection; `appShell.js` retains browser handler binding, console replacement, report transport, clock, mutable dedupe state, and crash-screen effects.
- `js/crashScreen.js` owns the unchanged 300-character crash message, saved-game resume/reload projection, initial-focus choice, and focus-loop decision. `appShell.js` retains CPU cancellation, storage access, listener registration, DOM/ARIA writes, focus effects, and public wrappers; production/test script order and Service Worker cache inclusion are fixed by contracts.
- `js/actionContract.js` is the 15-action metadata source projected into GameManager, canonical payload keys, and UI targets; `js/actionUiRegistry.js` exposes the UI projection used by watchdog diagnostics. Independent validator/executor/report tests remain required.
- `js/uiWatchdog.js` owns pure freeze-summary JSON formatting, recent-checkpoint trace compaction, and stable sorted issue-dedupe signatures in addition to snapshot/classification policy; `js/appShell.js` still owns DOM reads, recovery effects, timers, storage writes, and reporting transport.
- `js/uiWatchdogMonitor.js` owns freeze progress timing and duplicate-report state as an explicit monitor: classification begins at the unchanged 5-second boundary, identical reports recover without re-reporting for less than 60 seconds, and reset clears all monitor state. DOM snapshots, recovery, persistence, and transport remain in `appShell.js`.
- `js/cpuTuning.js` also owns the input-nonmutating complete CPU constructor runtime-config projection, including the unchanged live `expert` v2simple defaults. `CPU.js` performs typed field assignment and retains mutable strategy state; `main.js` retains CPU/RL construction, and exact decision plus 2–10-player self-play baselines remain the strength contract.
- `js/gameSnapshot.js` owns exact current client/server snapshot and undo serialization plus shared mutable game/Undo hydrate mechanics. Local `saveUndoState()` delegates to the shared undo serializer with an explicit full-log compatibility limit, and local/server mirror Undo restore delegate to the same hydrate core. Client/server adapters deliberately retain their previous validation, coin/index/log/landmark, inventory, and undo policies. Its legacy v0/current v1 envelope API is internal footing; live save and Socket.IO formats are unchanged.
- `js/storageSettings.js` owns pure saved player-count, player-setting, tutorial normalization, and save/load value projection. `storage.js` retains the existing keys and facade-backed I/O, DOM updates, exception boundary, and control synchronization.
- `js/localPlayerSettings.js` owns local player-setting normalization, CPU/RL labels, speed text, snapshots, escaping, exact settings HTML, RL readiness text, and pending-aware start-button view. `js/autoSkipPolicy.js` owns the pure stock/coin/unique-purple/enabled-landmark purchase-availability projection. `js/pageActivationPolicy.js` owns only the pure CPU scheduler outcome and hidden-duration projection used by page-resume diagnostics. `js/delayedHumanActionPolicy.js` owns the pure idle/cancel/run/reschedule decision for delayed human actions after page activation. `js/uiEventDelegation.js` owns delegated-target resolution, dataset-key conversion, role-button keyboard activation checks, immutable family command decoding, and injected command execution. `js/citySkyline.js` owns the title-screen Canvas renderer with injected viewport width and RNG; a direct command-trace contract and source-parity check protect the moved drawing body. `main.js` retains canvas lookup, mutable state, DOM assignment, storage calls, RL preload, game-start effects, the unchanged 1.5-second timer, turn revalidation, `nextTurn`, delayed-action tokens/timers/callbacks and clock reads, UI listener registration, preventDefault timing, lazy command-effect registries, DOM/PWA effects, visibility, CPU rescheduling, and checkpoint effects.
- `js/localActionPolicy.js` owns the pure local-human input authority reason order across missing/won/stale/CPU/not-my-turn/reconnecting/in-flight/disconnected states. `main.js` retains actual winner checks, reconnect/Socket state reads, Action Contract validation, timers, and action effects.
- `js/cpuSchedulerState.js` owns CPU wait normalization, lease deadlines, pending-token identity, scheduler-health projection, scheduling block-reason priority, and phase-step eligibility. `main.js` retains the real clock, lazy winner evaluation, mutable token/deadline state, timers, checkpoints, phase ordering, and CPU action execution.
- `js/cpuTurnStrategy.js` owns canonical action-only decisions for roll, dice-count selection, reroll, Harbor, pending, next-turn, and IT phases while preserving decision/RNG order. `main.js` retains phase eligibility, scheduling, checkpoints, `cpuDo`, pending application, and all mutable effects; CPU build execution remains separately owned.
- `js/cpuEvaluation.js` also owns stable score-descending card ranking with input-order tie preservation and card-effect self-income evaluation behind wrapper-parity contracts. Its injected rule-income callback and constants preserve existing rule ownership, and fixed decision plus 2–10-player self-play baselines prohibit heuristic drift.
- `js/gameEngine.js` owns the shared 15-action mutable dispatch. Client replay, server mirror, and every local rule-based CPU action application delegate to it; client/server adapters still own validation, card creation, stock/undo policy, timing, and online transport. `server/actionValidation.js` owns the pure shuffled-player and CPU-host actor-authority mapping used before payload validation.
- `GameEngine.transitionSnapshot()` is a detached, fail-closed boundary with stable failure reasons. Real server-mirror parity covers all 15 actions for 2/3/5/10-player boundaries under Action/Snapshot selections 0/0, 0/1, 1/0, and 1/1, including richer pending and negative-choice traces. `js/gameEngineAuthority.js` supplies one fail-closed selection policy to server and client adapters. The server may adopt the detached result for the internal canonical mirror only when transition/parity/reconstruction all succeed. The online client may do the same for deterministic replay only through separate production-uninjected shadow/authority flags and a detached rebuild check. Both fall back to the already-applied mutable result. The local adapter applies the same rule to all 15 Action Contract entries across resolved human/CPU actions, dice/Harbor branches, every pending resolver, builds, Undo, and turn transition; unresolved random actions remain outside the boundary, and neither local flag is injected into production.
- `GameEngine.transitionEnvelope()` composes legacy v0/current v1 Action and Snapshot readers, rejects unknown or selection-mismatched schemas before hydration, preserves the legacy no-selection v1 shadow result, and emits the selected Snapshot version when selection is supplied. It remains shadow-only and does not alter live wire/save payloads.
- `js/gameSchemaNegotiation.js`, `js/gameSchemaCodec.js`, and `server/gameSchemaRuntime.js` define the off-by-default additive rollout boundary. With `GAME_SCHEMA_NEGOTIATION_ENABLED=1`, served clients advertise on create/join/rejoin, malformed or non-overlapping explicit capabilities fail closed, missing old clients select v0, and `gameStart.gameSchema` records the room result through normal/rejoin/restore paths. `GAME_SCHEMA_SHADOW_ENABLED=1` compare-runs accepted actions without affecting live results. `GAME_SCHEMA_WIRE_ENABLED=1` independently versions live Action messages, while `GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED=1` independently versions rejoin Snapshot responses and compacted action Snapshot metadata. `GAME_SCHEMA_RECREATE_WIRE_ENABLED=1` independently versions the recreate outer request and negotiated embedded Snapshot/action log while accepting unwrapped legacy input unchanged. `js/gameSchemaRecreateWire.js` preserves transport/audit metadata and decodes nested v1 back to legacy before existing restore validation. Real Socket.IO E2E covers v1, mixed-client fallback, incompatible rejoin rejection, matched shadow, Action/Snapshot wires, valid nested recreate v1, and malformed nested rejection. Local saves and restore authority remain legacy/OFF.
- `js/actionContract.js` also exposes legacy v0/current v1 Action envelope readers. Default live actions remain the legacy `{action, data}` shape; the separate wire flag may envelope negotiated v1 rooms while legacy rooms remain unchanged.
- `js/onlinePayload.js` owns saved reconnect-session normalization, the existing rejoin payload shape, restore action-log/pending normalization, ACK comparison, room ownership, duplicate-free restore append, resend eligibility, rejoin pending reconciliation with evidence precedence, unsigned-snapshot full-log preservation, and the pure restore-event flush plan with original queue indexes. An independent legacy plan remains default; a production-uninjected test-only flag selects the pure plan only after exact identity/index parity and fails closed to legacy. `js/onlineRestoreQueue.js` owns ordered injected-handler execution and reports the failed original queue index without catching handler exceptions. A separate production-uninjected test-only gate selects that executor only when the pure plan is authoritative; otherwise the legacy loop remains active. `js/onlineRestoreQueueState.js` owns input-nonmutating enqueue/overflow, duplicate-rejoin generation carry, flush-start drain, failed-index suffix retention, and shared clear transitions; its separate production-uninjected gate selects pure output only after exact legacy queue identity/order/payload/generation parity. All disconnect/reset/game-start clear calls use the shared boundary and raw queue reads, replacements, and legacy appends are limited to three owner helpers. A detached store shadows every replacement/legacy append. Independent production-uninjected read/write flags select store reads or store-first replacement/append only on exact legacy parity, with same-operation fallback to the raw mirror; production mirror/write ownership, abort, handler execution, callbacks, reconnect timing, and Socket.IO ownership stay in `online.js`.
- `js/cpuEvaluation.js`, `js/cpuLegalMoves.js`, `js/cpuBusinessMoves.js`, `js/cpuProfile.js`, `js/cpuSimulation.js`, `js/cpuActionProposal.js`, `js/cpuBuildExecution.js`, and `js/cpuPendingResolution.js` own unchanged evaluation (including win-distance, opponent-threat, position-score composition, landmark shortfall, TV landmark-denial, base/profile/strong landmark urgency, expert roll-income cap/overflow penalty, strong conditional-red card/landmark pressure, strong color-role pressure, four-player expert card-candidate adjustment, strong dice-tempo/landmark-card synergy, strong purple adjustment/readiness, strong landmark urgency, expert landmark-effect bonus, strong crowd purchase scoring, strong crowd attack scaling/disruption readiness, publisher, IT-startup, conditional-red, loan, card-dependency, generic weighted outcome aggregation, stable purchase-candidate ranking, weighted dice/Harbor expected-score values, and the normal-difficulty safety adjustment), remaining enabled-landmark ordering/endgame threshold, stable disruption target/Cleaning-card candidate ranking and pruning, Business Center exchange enumeration/selection, seeded simulation, 2–10-player lookahead stock construction, canonical detached Action Contract proposals, local/online build execution, and pending fallback/target validation. Live pending decisions now return deeply frozen canonical `{action, data}` proposals without executable closures; the older resolution API remains for simulation compatibility. `main.js` no longer carries a second pending fallback implementation and retains scheduling while effects use the existing shared action boundary (with a canonical-only fallback executor for stripped runtimes). All local rule-based CPU proposals, including builds, apply through the shared mutable Engine. Online proposals keep the existing authority/send path; pending order, dormant filtering, candidate order, and RNG remain unchanged.
- `server/hostlessRestoreCandidate.js`, `server/hostlessRestoreCoordinator.js`,
  `server/hostlessRestoreGateway.js`, `server/hostlessRestoreDiagnostics.js`, and `server/hostlessRestoreRuntime.js`
  own the provisional quorum policy and additive transport boundary. The client
  capability/payload/consent path fails closed for old or mixed clients.
- CPU extraction is guarded by 9 representative fixtures across build/dice/reroll/harbor/pending states, 36 exact decision snapshots for all difficulties, and 36 seeded full matches for all difficulties and 2–10 players. Baseline artifacts record their source commit.
- Contract tests guard action metadata/canonical payload/UI drift, card/effect cross-layer registration, representative snapshot roundtrips, malformed restore, and complete client/server replay snapshot parity. Snapshot roundtrips also assert restored pending-action authority, Cleaning→Renovation queue order with dormant-card indexes and dice state, 10-player current index, Undo retention, and post-victory action closure instead of checking serialization bytes alone. `npm run report:action-contract` emits the current cross-layer manifest and fails on drift.
- `js/savedGameValidation.js` owns injected local-save validation, legacy CPU-setting normalization, pending consistency, and legacy card-ID stock lookup. `js/gameSnapshot.js` owns the dual legacy/v1 local-save read adapter and versioned serializer. `js/localSaveRepository.js` owns the rollback-safe legacy/v1 storage policy; `storage.js` retains legacy state serialization inputs, DOM effects, hydration policy, CPU recreation, and reconnect timing. The default keeps the exact `savedGame` key/value, and the optional `savedGameV1` shadow never replaces the legacy rollback authority.
- `js/localResumePolicy.js` owns pending/no-save/invalid/RL-preload/resume decisions, detached runtime settings, unchanged saved-CPU construction arguments, and the exact resume effect order. `js/localResumeView.js` owns only the preload-button and resume-section view projection. `storage.js` retains repository reads, Promise handling, hydration, actual DOM/scheduler callbacks, keys, and formats.
- `js/storedOnlineReconnect.js` owns validated-session runtime projection and the exact reconnect/retry-clear/runtime/socket/status/tab/rejoin order, including the existing socket-start rollback. `js/localGameStart.js` owns local pending/RL-load decisions, detached player settings, and the exact start effect order. Storage keys, wire payloads, Promise timing, CPU construction, DOM effects, and real initialization remain with `storage.js` and `main.js`.
- Static runtime dependency tests guard extracted module load order across production, integration, release, online, UI, main, and self-play loaders. Scoped ESLint bug rules run from `test:static` over 173 maintenance files, and a test keeps config and npm-script file sets identical. `npm run test:batch` is the non-overlapping batch-end gate: static, complete unit/simulation coverage, three standalone Socket E2Es, and release checks each run once; its exact composition is contract-tested.
- JSDoc contracts for 172 explicitly listed browser/server runtime files, including `CPU.js`, `RLCPU.js`, `server.js`, and every extracted `server/*.js` module, are enforced by TypeScript 5.9.3 in no-emit checkJs mode through `npm run test:types`, which is part of `test:static`. The five remaining side-effect client runtimes (`appShell`, `main`, `online`, `storage`, `ui`) remain excluded pending staged dependency separation; this typed boundary gate does not imply live authority or a TypeScript migration.
- New helper modules have focused domain tests; existing giant test files were not mechanically reorganized.

The remaining steps below still require the same gates described in each design section. In particular, production activation or expansion of the gated server-mirror, online-replay, or local-action pure-engine authorities, production activation of the default-OFF recreate v1 wire and local-save v1 shadow, reconnect callback-side-effect/queue-variable-abort-flush/status authority migration beyond the completed gated boolean/timer/timeout-and-request-plan-and-effect/terminal-cleanup-decision-and-effect/socket-disconnected/restore-lifecycle/retry-exhausted-status and queue-executor steps, remaining recreate validation/signing/Socket/mirror-effect movement, modal hide/focus-trap/inert-handler movement or production activation of the modal-open/modal-close gates, and broad CPU scoring/selection movement need planned verification beyond current automated parity. The completed mixed Android/iPhone reconnect match is evidence for its exact path only; automated WebKit and that one match must not be recorded as completion of host migration, restart restore, provisional hostless timing, Undo, online CPU, background/PWA, or modal gates.

## Recommended Migration Order

1. **Keep the implemented helper boundaries stable:** Prefer extending the existing server, online, and UI pure modules before adding equivalent logic back into giant files.
2. **Further pure render helpers:** Move only exact-output helpers with escape and selector contract tests; do not enable the modal-open/modal-close effect gates or move modal hide/focus-trap/inert handlers yet.
3. **Game Engine shadow maintenance:** Keep all-action, four-selection parity green; the current richer fixtures include Airport no-build income, Airport-to-IT pending, Amusement Park doubles, loan dormancy recovery, winery dormancy, multiplayer Publisher/Tax Office/IT Startup/Park transfers, Shopping Mall red-then-green ordering, Tuna Boat dice retained across the Station → reroll → Harbor chain, and conditional-red thresholds across Station selection → Harbor choice → full transfer → City Hall recovery, queued Mover actions preserving dormant/active card identity, and a Cleaning → two-Renovation mixed queue with automatic no-target consumption for 2/3/5/10 players. The shared `tests/helpers/game-schema-parity.js` harness owns room construction and exact live/shadow/adopted snapshot assertions. Add another fixture whenever a touched action gains a new state-dependent branch before enabling or expanding any gated server, online-replay, or local-action authority.
4. **Reconnect state machine and server recreate/restore split:** Keep the event-state read, compatibility-boolean, timer, and timeout-decision gates independently reversible. The latter three remain absent from production HTML and fall back stage-by-stage on any parity defect. Socket emit/session read, hostless branching, queue variable/abort/flush authority, rejoin/cleanup, and visible effects require another rollback design; current integration parity does not authorize moving them.
5. **Restore authority activation:** The adapter/keyring/priority contracts are ready; activate only after durable provider, retention/locking, secret operations, migration, and rollback decisions.

## Historical First Safe Design Units

1. `server/roomLifecycle.js` pure helper extraction for create/join/rejoin/disconnect outcomes. This gives high maintenance value while preserving wire protocol and handler behavior.
2. `js/onlineStorage.js` facade for restore bundle and room-scoped keys. This reduces stale-state risk without changing storage format.
3. `js/uiBuildMenu.js` and `js/uiCardDetail.js` pure helpers. These are visible but can be guarded by existing escape/selector tests before any modal lifecycle work.

## Why Not Implement The Remaining Work Now

- The safe pure-helper units above are complete; remaining handler/state/lifecycle moves are no longer pure extraction only.
- Remaining handler moves and reconnect callback-side-effect/production-socket-authority/queue/status changes need careful sequencing; visible/socket timing changes still need external evidence even though the read, boolean, timer, and timeout-decision gates are automated and reversible.
- Restore trust improvements are product/security decisions, not maintenance cleanup.
- Broad simultaneous splits would create compatibility risk and make rollback difficult.

Use this plan as a gate: if a future task cannot name the file boundary, contract test, rollback path, and manual verification need from the relevant section above, it is not ready for implementation.
