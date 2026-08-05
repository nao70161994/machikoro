# Architecture Refactor Plan

Last updated: 2026-08-05

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
| `js/onlineRestoreQueueState.js` | Sole mutable restore-event queue store plus input-nonmutating enqueue/overflow, rejoin-generation carry, flush-start drain, failed-index suffix retention, shared clear transitions, and diagnostic parity selectors. `online.js` limits queue access to three read/replace/append adapters and retains transition/effect authority flags, diagnostic labels, abort, handler execution, and callbacks; the former raw rollback mirror and dual writes have been removed. |
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

**Current state:** `js/actionContract.js` is the metadata/canonical-key/UI source, `js/gameSnapshot.js` owns shared serialize/hydrate mechanics with caller-owned compatibility policies, and `js/gameEngine.js` owns the shared 15-action dispatch used by client replay and server mirror. `GameEngine.transitionSnapshot()` provides a detached seam. `js/gameEngineAuthority.js` owns the shared fail-closed selection policy; `server/gameEngineAuthority.js` retains environment parsing and can select a result for the internal canonical mirror only after exact shadow parity and successful snapshot reconstruction. `js/gameEngineClientShadow.js` provides the detached selection boundary for deterministic online replay. Behind two production-uninjected flags, `OnlineGameEngineRuntime` rebuilds and adopts a successful transition before mutable replay; failures retain legacy replay. `js/gameEngineRuntimeAdapter.js` shares caller-specific hydrate/serialize/Undo compatibility, and `js/gameEngineDeterminism.js` rejects unresolved random inputs before local shadowing. Local human actions, canonical CPU proposals, card/landmark builds, and Undo have their own production-uninjected shadow/authority gates with exact parity and detached reconstruction fallback. Production validation, authorization, scheduling, mutation, and transport remain under their existing owners.

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
- `js/onlineRuntimeFlags.js` owns the 53 schema/reconnect/engine rollout flag names, strict-boolean lookup, and frozen named-reader projection. `online.js` retains every compatibility reader name through one adapter and preserves the existing schema-negotiation prerequisite; production HTML still injects none of the authority flags.
- `js/onlineSchemaTransport.js` owns schema-negotiation prerequisites, advertised capability/selection checks, and Action/Snapshot/recreate codec dispatch through injected dependencies. `online.js` retains public wrappers and live selection state; existing flags, payloads, and error reasons are unchanged.
- `js/onlineReconnectState.js` owns eight state names, allowed transitions, a pure lifecycle-event reducer, event-vs-legacy projection parity, and a bounded event controller. Through `OnlineReconnectRuntime`, clean event history now drives UI/send/CPU/human input gates by default; explicit-false rollback or any parity defect selects the legacy projection. Independent test-only gates then cover the compatibility reconnecting boolean, rejoin timer handle/deadline, timeout decision, ACK-timeout ignore/clear-only/rejoin plan, rejoin request reject/wait/exhaust/emit plan, terminal app-error cleanup decision, and exact socket-disconnected/restore-lifecycle/normal retry-exhausted status effects, with legacy fallback on any parity defect or unsupported event. `js/onlineRetryPolicy.js` owns unchanged retry calculations, the injected timer controller, and pure ignore/rejoin/exhaust decision. Production HTML injects none of the effect/status/timer/callback/request-plan/request-effect/queue-plan/queue-effect/queue-state/cleanup-effect/restore-abort-plan/action-timeout-plan/action-timeout-effect/game-action-plan/action-accepted-plan/pending-reconciliation-plan/rejoin-action-log-plan/local-host-restore-offer-plan gates. `js/onlinePayload.js` also owns the incoming gameAction and pending-matched actionAccepted no-game/duplicate/gap/apply decisions, plus rejoin pending reconciliation with explicit replay-log/legacy-snapshot/accepted-ID/unaccepted reasons and the unsigned-snapshot full-log preservation choice. Each pure plan is selected only on exact legacy parity behind a production-uninjected test gate while clearing, resend, apply, and rejoin effects remain in `online.js`. `js/onlineDecodeFailure.js` separately fixes malformed Action recovery order, including actionAccepted-only ACK-flight clearing; its two production-uninjected effect gates require clean reconnect shadow state and fall back to the inline legacy sequence. `js/onlineActionApplyFailure.js` fixes post-decision apply-exception order and defers rejoin to the restore queue owner while flushing; its two production-uninjected gates require an authoritative pure apply plan and otherwise run inline legacy. `js/onlineActionGap.js` and `js/onlineActionNoGame.js` likewise own the exact handler-specific gap/no-game effects only behind authoritative pure decisions plus production-uninjected gates, with inline fallback. `js/onlineActionCommit.js` owns successful set-sequence/save-log/accepted-only pending-clear/render/CPU-schedule effects; restore flush omits render/schedule, and its two production-uninjected gates require authoritative pure APPLY plans before selection, otherwise inline legacy runs. `js/onlineSocketConnect.js` owns waiting-status/rejoin planning and cleanup/reconnect/rejoin order, requiring exact legacy parity plus a clean CONNECTING history. `js/onlineSocketDisconnect.js` owns active/restore-abort planning and lobby-finish/optional restore quarantine/reconnect/flight/CPU/event/status order. Both callback families use separate production-uninjected plan/effect gates and inline fallback. `js/onlineHostChanged.js` owns host ownership planning and host-state/log/render/CPU-schedule-or-invalidate/persistence ordering after the existing restore queue gate, again behind separate production-uninjected plan/effect gates. `js/onlineRejoinPersistence.js` owns the pure pre-replay runtime/session plan and fixed action-flight/pending/retry/settings/indices/host/restore-bundle/session/CPU-token/UI-lock effect order; separate production-uninjected plan/effect gates require exact legacy parity and otherwise retain inline fallback. `js/onlinePendingResend.js` owns the post-activation none/clear/resend decision and stale-clear or ACK-flight-before-emit order under the same exact-parity/default-legacy policy. `js/onlineRestoreReplay.js` owns exact-reference replay planning and the replay-mode/event/status/init/Snapshot/residual-Action/provisional-log/final-cleanup body; screen, error, and abort orchestration remain in `online.js`. `js/onlineRestoreActivation.js` owns restored-through sequence planning and the reconnect/game activation→sequence publication→queued-event flush→activated lifecycle order; flush failure stops before lifecycle publication. Its separate production-uninjected plan/effect gates require exact parity and retain inline legacy fallback. `js/onlineActionTimeout.js` executes its fixed effects only after an authoritative ACK-timeout plan plus an independent gate; inline legacy remains default. `js/onlineReconnectRequest.js` executes the fixed clear/count/emit/arm sequence only after pure request-plan authority plus its independent gate and keeps one `rejoinRoom` send function. `js/onlineReconnectCleanup.js` executes the fixed terminal cleanup sequence only behind clean decision parity plus its independent gate; inline legacy remains default. The restore-abort plan requires clean event history and exact legacy parity, and `js/onlineRestoreAbort.js` executes its fixed effects only behind that authoritative plan plus an independent gate; inline legacy remains default. Its queue-overflow path is fixed by automated disconnect/connect/rejoin/restore coverage. `js/onlineRestoreRank.js` additionally selects a newer original-host local bundle only after exact legacy plan and bundle-identity parity behind its own production-uninjected gate. Production Socket emit authority, session read, hostless branches, restore queue variable/abort/flush authority, production restore-abort/rejoin callback authority, context-specific status beyond socket disconnect/restore lifecycle/retry exhaustion, storage, and protocol remain in `online.js`.
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
- `js/onlinePayload.js` owns saved reconnect-session normalization, the existing rejoin payload shape, restore action-log/pending normalization, ACK comparison, room ownership, duplicate-free restore append, resend eligibility, rejoin pending reconciliation with evidence precedence, unsigned-snapshot full-log preservation, and the pure restore-event flush plan with original queue indexes. An independent legacy plan remains default; a production-uninjected test-only flag selects the pure plan only after exact identity/index parity and fails closed to legacy. `js/onlineRestoreQueue.js` owns ordered injected-handler execution and reports the failed original queue index without catching handler exceptions. A separate production-uninjected test-only gate selects that executor only when the pure plan is authoritative; otherwise the legacy loop remains active. `js/onlineRestoreQueueState.js` owns input-nonmutating enqueue/overflow, duplicate-rejoin generation carry, flush-start drain, failed-index suffix retention, and shared clear transitions; its separate production-uninjected gate selects pure output only after exact legacy queue identity/order/payload/generation parity. All disconnect/reset/game-start clear calls use the shared boundary, and the store is the sole mutable queue owner behind three `online.js` read/replace/append adapters. Existing read/write flags retain their diagnostic source labels; abort, handler execution, callbacks, reconnect timing, and Socket.IO ownership stay in `online.js`.
- `js/cpuEvaluation.js`, `js/cpuLegalMoves.js`, `js/cpuBusinessMoves.js`, `js/cpuProfile.js`, `js/cpuSimulation.js`, `js/cpuActionProposal.js`, `js/cpuBuildExecution.js`, and `js/cpuPendingResolution.js` own unchanged evaluation (including win-distance, opponent-threat, position-score composition, landmark shortfall, TV landmark-denial, base/profile/strong landmark urgency, expert roll-income cap/overflow penalty, strong conditional-red card/landmark pressure, strong color-role pressure, four-player expert card-candidate adjustment, strong dice-tempo/landmark-card synergy, strong purple adjustment/readiness, strong landmark urgency, expert landmark-effect bonus, strong crowd purchase scoring, strong crowd attack scaling/disruption readiness, publisher, IT-startup, conditional-red, loan, card-dependency, generic weighted outcome aggregation, stable purchase-candidate ranking, weighted dice/Harbor expected-score values, and the normal-difficulty safety adjustment), remaining enabled-landmark ordering/endgame threshold, expert/strong post-ranking build-candidate assembly, stable disruption target/Cleaning-card candidate ranking and pruning, Business Center exchange enumeration/selection, seeded simulation, 2–10-player lookahead stock construction, canonical detached Action Contract proposals, local/online build execution, and pending fallback/target validation. Live pending decisions now return deeply frozen canonical `{action, data}` proposals without executable closures; the older resolution API remains for simulation compatibility. `main.js` no longer carries a second pending fallback implementation and retains scheduling while effects use the existing shared action boundary (with a canonical-only fallback executor for stripped runtimes). All local rule-based CPU proposals, including builds, apply through the shared mutable Engine. Online proposals keep the existing authority/send path; pending order, dormant filtering, candidate order, and RNG remain unchanged.
- `server/hostlessRestoreCandidate.js`, `server/hostlessRestoreCoordinator.js`,
  `server/hostlessRestoreGateway.js`, `server/hostlessRestoreDiagnostics.js`, and `server/hostlessRestoreRuntime.js`
  own the provisional quorum policy and additive transport boundary. The client
  capability/payload/consent path fails closed for old or mixed clients.
- CPU extraction is guarded by 9 representative fixtures across build/dice/reroll/harbor/pending states, 36 exact decision snapshots for all difficulties, and 36 seeded full matches for all difficulties and 2–10 players. Baseline artifacts record their source commit.
- Contract tests guard action metadata/canonical payload/UI drift, card/effect cross-layer registration, representative snapshot roundtrips, malformed restore, and complete client/server replay snapshot parity. Snapshot roundtrips also assert restored pending-action authority, Cleaning→Renovation queue order with dormant-card indexes and dice state, 10-player current index, Undo retention, and post-victory action closure instead of checking serialization bytes alone. `npm run report:action-contract` emits the current cross-layer manifest and fails on drift.
- `js/savedGameValidation.js` owns injected local-save validation, legacy CPU-setting normalization, pending consistency, and legacy card-ID stock lookup. `js/gameSnapshot.js` owns the dual legacy/v1 local-save read adapter and versioned serializer. `js/localSaveRepository.js` owns the rollback-safe legacy/v1 storage policy; `storage.js` retains legacy state serialization inputs, DOM effects, hydration policy, CPU recreation, and reconnect timing. The default keeps the exact `savedGame` key/value, and the optional `savedGameV1` shadow never replaces the legacy rollback authority.
- `js/localResumePolicy.js` owns pending/no-save/invalid/RL-preload/resume decisions, detached runtime settings, unchanged saved-CPU construction arguments, and the exact resume effect order. `js/localResumeView.js` owns only the preload-button and resume-section view projection. `storage.js` retains repository reads, Promise handling, hydration, actual DOM/scheduler callbacks, keys, and formats.
- `js/storedOnlineReconnect.js` owns validated-session runtime projection and the exact reconnect/retry-clear/runtime/socket/status/tab/rejoin order, including the existing socket-start rollback. `js/localGameStart.js` owns local pending/RL-load decisions, detached player settings, and the exact start effect order. Storage keys, wire payloads, Promise timing, CPU construction, DOM effects, and real initialization remain with `storage.js` and `main.js`.
- Static runtime dependency tests guard extracted module load order across production, integration, release, online, UI, main, and self-play loaders. Scoped ESLint bug rules run from `test:static` over 267 maintenance files, and a test keeps config and npm-script file sets identical. `npm run test:batch` is the non-overlapping batch-end gate: static, complete unit/simulation coverage, three standalone Socket E2Es, and release checks each run once; its exact composition is contract-tested.
- JSDoc contracts for 266 explicitly listed browser/server JavaScript files, including `CPU.js`, `RLCPU.js`, `server.js`, and every extracted `server/*.js` module, are enforced by TypeScript 5.9.3 in no-emit checkJs mode through `npm run test:types`, which is part of `test:static`. The five remaining side-effect client runtimes (`appShell`, `main`, `online`, `storage`, `ui`) remain excluded pending staged dependency separation; this typed boundary gate does not imply live authority or a TypeScript migration.
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

- The historical safe units above are complete, but each batch must re-audit for additional narrow projection, admission, selection, and adapter boundaries before concluding that only authority migration remains.
- Remaining handler moves and reconnect callback-side-effect/production-socket-authority/queue/status changes need careful sequencing; visible/socket timing changes still need external evidence even though the read, boolean, timer, and timeout-decision gates are automated and reversible.
- Restore trust improvements are product/security decisions, not maintenance cleanup.
- Broad simultaneous splits would create compatibility risk and make rollback difficult.

Use this plan as a gate: if a future task cannot name the file boundary, contract test, rollback path, and manual verification need from the relevant section above, it is not ready for implementation.

## 2026-08-03 Batch 18 boundary update

Four additional reversible seams were completed without changing runtime authority:

1. Landmark scoring remains in `CPU.js`, while `CPUEvaluation.bestLandmarkCandidate()` owns only the stable score/cost reduction. Candidate enumeration order, heuristic constants, cache/profiling behavior, and RNG are unchanged.
2. Pending outbound sequence and ID allocation remain in `online.js`, while `OnlinePayload.buildPendingOutboundAction()` owns only the exact six-field entry shape. Storage keys/formats, ACK timing, reconnect queues, and wire events are unchanged.
3. Business Center HTML and selection projection now share `UiPendingMenu`; `js/uiPendingEffects.js` owns the ordered DOM effect while `ui.js` retains lookup and public dispatch; reset-before-select ordering, selectors, ARIA values, and hidden input semantics remain fixed.
4. `registerStaticContentRoutes()` moves only conventional static-content route registration into `server/staticAssets.js`. `registerStaticMetadataRoutes()` now owns asset-links, Service Worker, and version response handlers, while `server.js` retains injected content/hash values and calls it before reporting routes; special cache headers and global Express route order remain fixed.

These units demonstrate the preferred migration pattern: compute or describe a detached result in the focused module, keep side effects and authority with the existing runtime, and fix ordering/tie behavior in direct plus wrapper/integration contracts. They do not authorize broader CPU selection rewrites, online state-machine cutover, PWA policy changes, or Socket handler relocation.

## 2026-08-03 Batch 19 boundary update

1. Online authority configuration now has a frozen, dynamically resolved reader adapter. This advances typed adapter ownership without activating any flag or changing the production HTML flag surface.
2. Lifecycle notification persistence now belongs to its domain module through an injected storage gateway. Current and legacy keys remain byte-for-byte stable, and app-shell orchestration remains the authority.
3. Express static delivery is split into metadata-route and content-route registration under `server/staticAssets.js`; `server.js` supplies dependencies and preserves the reporting boundary between the two registrations.
4. Business Center selection now has explicit state/view/DOM-effect layers: `UiPendingMenu`, `UiPendingEffects`, and the thin `ui.js` wrapper. This is the pattern for future UI extraction where observable effect order can be directly fixed.

No reconnect callback, Socket.IO, save/schema, PWA cache policy, game rule, CPU strategy, or production authority changed in this batch.


## 2026-08-03 Batch 20 boundary update

1. Pending queue normalization is now an explicit Game Engine support boundary. `PendingActionQueue` owns field/action mapping and detached normalization/reconstruction while `GameManager` retains rule mutation and phase authority. This reduces shared Engine/client/server hydrate drift without changing the legacy Snapshot shape.
2. Lobby Socket orchestration now consumes a pure `lobbyAdmission` plan for create/join seat policy. Transport, schema negotiation, mutation, token generation, and emit order remain visible in `lobbySocketHandlers`.
3. CPU candidate reduction has a reusable `CPUSelection` boundary with first-on-tie and RNG-consumption contracts. Only the already-covered v2simple TV candidate reduction moved; scoring inputs, heuristic constants, candidate order, caches, and tuning remain in `CPU.js`.
4. Tab rendering now follows explicit view/effect/orchestrator layers: `UiTabView` computes, `UiTabEffects` mutates in fixed order, and `ui.js`/`appShell.js` obtain live DOM and trigger surrounding behavior.

These are production-active structural delegations with exact legacy behavior, not authority cutovers. Future batches may extend these focused boundaries only with direct wrapper parity and domain-wide regression evidence.


## 2026-08-03 Batch 21 boundary update

1. The mutable `GameManager` now delegates three stable transition decisions to `GameTurnPolicy`: post-income BUILD/PENDING selection, amusement-park same-turn continuation, and circular player advancement. This is an incremental move toward snapshot/action transition ownership; dice, income mutation, reset, and logging remain in the compatibility runtime.
2. Online rollout configuration now has a generated adapter boundary rather than 49 hand-written one-line readers. `OnlineRuntimeFlags` validates selected names, resolves the browser root at invocation time, and returns frozen functions; `online.js` preserves the global compatibility surface and all default-OFF fallbacks.
3. Server lifecycle startup is thinner: `roomGcRuntime` owns timer registration and `unref`, `roomLifecycle` owns expiration/deletion policy, and `server.js` owns dependency wiring. This split does not introduce durable storage or change room authority.
4. Winner rendering now follows explicit state/view/effect/orchestrator ownership. `UiWinner` produces escaped HTML, `UiWinnerEffects` fixes runtime/DOM order, and `ui.js` captures live state and supplies browser effects. Repeated renders skip only the same first-presentation operations as before.

All four changes are production-active structural delegations guarded by exact contracts. They do not enable any shadow authority, schema transport, reconnect state-machine authority, modal authority, or provider-backed persistence. The next batch must re-audit for similarly stable seams rather than expanding a boundary merely to reduce line count.

## 2026-08-04 Batch 22 boundary update

1. Pending state mutation has an explicit transition-plan seam. `PendingActionQueue` computes detached enqueue/consume/clear results; `GameManager` applies them and retains phase/rule ownership. This advances shared deterministic transition structure without changing the legacy Snapshot shape or public APIs.
2. CPU score ranking now uses one stable, score-once primitive for three existing build candidate paths. The extraction makes tie and evaluation-count semantics explicit while leaving candidate order, tuning, RNG, and execution in `CPU.js`.
3. Server startup has a typed runtime adapter: `processRuntime` owns exception-listener and HTTP-listen effects, while `server.js` remains the composition root. Socket handlers, room authority, protocol, canonical storage mode, and restore behavior are untouched.
4. Active-game UI now has explicit view/effect/orchestrator ownership. `UiGameStatusView` computes immutable display data, `UiGameStatusEffects` fixes the observable runtime order, and `ui.js` supplies lazy browser callbacks so absent optional effects preserve the previous safe-step behavior.

All four changes are production-active structural delegations with direct and wrapper/integration contracts. Scoped gates now cover 183 ESLint maintenance files and 182 checkJs runtime files. They do not authorize Engine/schema/reconnect authority cutovers, durable persistence, CPU policy changes, or PWA strategy changes.

## 2026-08-04 Batch 23 boundary update

1. Core build admission is now a deterministic domain boundary. `GameBuildPolicy` returns frozen reason plans in the exact legacy validation order; `GameManager` remains the compatibility executor for mutation and logs. This moves build legality toward the shared Engine without introducing a second rule authority.
2. End-turn control is split into pure admission, airport eligibility, and IT continuation decisions under `GameTurnPolicy`. Observable effects remain in `GameManager` and execute in the same airport → IT lookup → pending/advance order.
3. The online client now has one mechanical inbound-event registry. It fixes all 18 event names and registration order, validates dynamic hostless/app-error names, and detects missing/duplicate handlers without moving callback authority or changing the protocol.
4. App-shell event wiring now passes through `ClientEventRuntime`; the composition root supplies live browser targets and reporting/render callbacks. Error properties/listeners and online/offline initial update order are direct contracts.

These are production-active domain/contract/adapter delegations, not authority cutovers. Scoped gates now cover 186 ESLint maintenance files and 185 checkJs runtime files. Durable canonical persistence, reconnect state-machine effect authority, versioned wire defaults, CPU strategy changes, and PWA strategy remain outside this batch.

## 2026-08-04 Batch 24 boundary update

1. IT resolution is now an explicit domain transition. `GameTurnPolicy` computes the decision and coin/pending deltas; `GameManager` applies them, writes the same structured log, and advances through the same turn path. This moves another deterministic rule branch toward shared transition ownership without duplicating authority.
2. CPU multi-key ranking now has one stable lexicographic primitive. Only candidates with already-computed numeric keys use it; threat/profile-sensitive sorts remain in place to avoid changing evaluation counts. Full decision and self-play baselines fix strength, tie order, and RNG behavior.
3. Server connection composition has an adapter boundary. `socketConnectionRuntime` owns only subscription/log/family order, while `server.js` constructs lobby/action/rejoin/recreate/disconnect dependencies and all callback bodies retain their existing owners.
4. Root UI rendering now has explicit state-plan/execution/orchestrator layers. `UiRenderRuntime` distinguishes no-game, winner, and active branches; `ui.js` captures current player/winner in the original order and supplies the existing winner/active/persistence callbacks.

These are production-active domain/selection/composition/state delegations, not effect-only extraction or authority cutovers. Scoped gates now cover 188 ESLint maintenance files and 187 checkJs runtime files. Durable persistence, protocol/schema defaults, reconnect authority, CPU policy changes, and PWA strategy remain outside this batch.


## 2026-08-04 Batch 25 boundary update

1. Dice control has an explicit deterministic domain-plan boundary. `GameDicePolicy` owns roll routing, station/radio/Harbor admission and outcome plans, and dice-result formatting. `GameManager` remains the compatibility executor for RNG, mutation, income/card effects, logs, and public APIs.
2. CPU one-key ranking now shares the same stable lexicographic ordering primitive in both directions. Only precomputed-value paths were migrated; candidate generation, heuristic values, evaluation count, RNG calls, and profiling-sensitive threat ranking remain unchanged and are fixed by decision/self-play baselines.
3. Server room reads and room lifecycle decisions are separate responsibilities. `roomProjection` owns lobby/game-start wire projections, while `roomLifecycle` owns TTL, create-rate state, room admission, connected-player filtering, and host epoch mutation. `server.js` retains wiring and all public helper names.

These are production-active domain/selection/projection boundaries, not effect-only extraction or authority cutovers. Scoped gates now cover 190 ESLint maintenance files and 189 checkJs runtime files. Durable canonical persistence, protocol/schema defaults, reconnect/hostless authority, CPU policy changes, and PWA strategy remain outside this batch.

## 2026-08-04 Batch 26 boundary update

1. CPU build orchestration now has a canonical action proposal boundary and a separate compatibility executor. The scheduler consumes proposals directly where supported, while `CPU.build()` and unknown/mock CPU implementations retain their legacy paths. Fixed decisions, RNG traces, and 2–10 player self-play baselines remain the strength contract.
2. Online action-log mutation now follows a detached transition plan. The planner owns entry/final-log/compaction decisions, the executor fixes the prior observable storage and sequence-patch order, and `online.js` remains the owner of browser state, snapshots, keys, ACKs, reconnect, and transport.
3. Restored-room installation now has one runtime composition boundary over existing activation, delivery, and completion contracts. `server.js` supplies room, persistence, socket, payload, and logging effects; validation, restore ranking, mirror reconstruction, authority flags, and Socket.IO protocol keep their existing owners.

These are production-active strategy/transition/runtime boundaries, not behavior-only or effect-only changes and not authority cutovers. Scoped gates now cover 192 ESLint maintenance files and 191 checkJs runtime files. Durable canonical persistence, schema/protocol defaults, reconnect/hostless authority, CPU policy changes, and PWA strategy remain deferred.

## 2026-08-04 Batch 27 boundary update

1. Expert tuning composition is now a pure configuration policy. Preset overwrite order, profile overrides, realtime/fast/lite rounding, and mutable CPU compatibility fields remain exactly as before; decision and multiplayer self-play baselines guard strength.
2. Dormant-card dice eligibility is now a deterministic domain policy preceding GameManager effects. The policy preserves reference identity, input order, and predicate read order; revival, logs, color activation sequence, income, and pending mutation remain in the rule authority.
3. Online game completion and full reset now use explicit lifecycle plans with fail-before-effect validation. The plan fixes the prior assignment/effect sequence and carries the pre-reset room ID for scoped pending cleanup; `online.js` remains the live state, storage, Socket, queue, retry, and reconnect-event owner.

These are configuration/domain/state-transition boundaries, not effect-only extraction or authority cutovers. Scoped gates now cover 194 ESLint maintenance files and 193 checkJs runtime files. Theme commits use changed-file syntax/lint/type and focused behavior contracts; the expensive all-file static scan, full self-play set, integration E2E, and release gate run once through `test:batch` at batch end.


## 2026-08-04 Batch 28 boundary update

1. Static JavaScript/JSON syntax inspection now has a single-process repository adapter with direct malformed-input and discovery contracts. This changes execution cost, not the inspected file set or acceptance rules; other static gates still run independently.
2. Server game start now has an explicit admission layer and ordered runtime-effect layer. The coordinator remains the composition owner and payload building stays separate, so the start condition, Socket event/payload, lifecycle mutation, and logging order are independently testable without moving authority.
3. Tutorial preferences now have a state-transition/runtime boundary distinct from tutorial view generation and DOM orchestration. Storage keys and values are part of the transition contract; `ui.js` remains the live UI authority.

These are tooling, domain-admission, runtime-composition, and UI-state boundaries rather than effect-only extraction. Scoped gates now cover 198 ESLint maintenance files and 197 checkJs runtime files. Batch-level full verification, one push, and exact-HEAD CI remain the integration gate.


## 2026-08-04 Batch 29 boundary update

1. The repository test orchestrator now separates scheduling from test processes. `all` uses bounded two-process concurrency while retaining process isolation, deterministic report order, full failure collection, and an environment-controlled sequential fallback. Other named groups preserve their sequential default.
2. Pending-effect admission is a shared deterministic domain policy. It fixes lazy phase/count/queue/target read order and reason codes while `GameManager` remains the mutation and rule-effect authority. This is another step toward a shared transition engine without duplicating live state.
3. Runtime dependency contracts now evaluate complete chains, closing a test blind spot that previously ignored elements after the first edge.
4. Expert lookahead opponent generation is now a legal-move/candidate concern. CPU orchestration still selects flag mode and evaluates threat, while a pure helper preserves candidate order and pruning.

These are test-orchestration, domain-policy, dependency-contract, and CPU-strategy boundaries rather than effect-only extraction. Scoped gates now cover 199 ESLint maintenance files and 198 checkJs runtime files.

## 2026-08-04 Batch 30 boundary update

1. Pending completion is now an explicit domain transition: the policy decides whether all queued effect counters are clear and returns the build-phase target, while `GameManager` remains the live executor. This extends pending admission into lifecycle completion without creating a second mutable authority.
2. Multi-player coin movement now has a detached transaction representation. Collection caps and equal-distribution remainder handling are computed from balance arrays before `GameManager` applies the final balances and emits the existing logs. This moves deterministic rule math toward the shared Engine boundary without changing activation or effect ownership.
3. Online ACK-flight state now has one controller for flag/time/timer lifecycle. Compatibility globals are projections for existing diagnostics; transport, retry decisions, reconnect state-machine effects, and storage remain with `online.js`.

These are domain-transition, transaction, and online-state boundaries rather than effect-only extraction. Scoped gates now cover 200 ESLint maintenance files and 199 checkJs runtime files. Authority defaults, protocol/schema formats, persistence, CPU policy, and PWA behavior remain unchanged.

## 2026-08-04 Batch 31 boundary update

1. Red-card payment order now has a detached sequential transaction plan. Activation eligibility and per-opponent effect/log ordering remain in `GameManager`, while available-balance exhaustion and per-card transfer amounts are deterministic data suitable for the shared Engine.
2. CPU turn-value evaluation now separates live focus/cache adaptation from pure dice-distribution aggregation. The policy preserves the exact one-die and Station two-dice weights and callback order, moving another scoring primitive out of the strategy orchestrator without changing choices.
3. Hostless approval is now an injected server composition boundary over existing restore authority. Room normalization, absence short-circuit, approval metadata, failure reason, and provisional success are directly testable without Socket or global room mutation in the helper.
4. Pending modal rendering now follows view → effect → orchestrator: `UiPendingMenu` computes style state, `UiPendingEffects` applies it, and `ui.js` owns admission/live DOM/content flow.

These are rule-transaction, CPU-evaluation, server-composition, and UI view/effect boundaries rather than effect-only extraction. Scoped gates now cover 201 ESLint maintenance files and 200 checkJs runtime files; production authority and compatibility defaults are unchanged.

## 2026-08-04 Batch 32 boundary update

1. Blue-card income now has a detached activation plan. The plan describes eligibility, amount, result kind, and Tuna dice while the mutable runtime continues to own revival, rule ordering, RNG provision, balance changes, and logs. Lazy facts prevent Harbor/Tuna-only reads from leaking into other card paths.
2. Online restore lifecycle now has one state owner for generation invalidation, active restoration, and quarantine. Compatibility booleans remain read projections for existing diagnostics and reconnect planning, while all production writes pass through semantic controller transitions.
3. Crash recovery now has an explicit view/effect/orchestrator split. Pure error/focus decisions remain in `CrashScreen`, DOM mutations live in `CrashScreenEffects`, and app-shell retains lifecycle cancellation, event wiring, persistence lookup, and resume control.
4. The card effect omission contract now recognizes injected rule-policy references as explicit ownership alongside direct `GameManager` references, without weakening the requirement that every non-normal effect has both rule and CPU coverage.

These are rule-policy, online-state, UI-effect, and contract boundaries selected across distinct architectural layers. Scoped gates now cover 203 ESLint maintenance files and 202 checkJs runtime files; rules, protocol/schema, persistence, reconnect defaults, and PWA behavior remain unchanged.

## 2026-08-04 Batch 33 boundary update

1. Green-card dispatch now uses a detached domain plan for the five existing outcome kinds. The policy selects kind, amount, pending field, dormancy, and target availability; the mutable engine continues to own every state change and log.
2. Restore lifecycle state now includes queue-flush activity. Production writes pass through semantic controller transitions while legacy globals remain read-compatible diagnostic projections.
3. CPU progress-income eligibility and summation are pure evaluation primitives. Live cache lookup/write and injected card valuation remain in `CPU.js`, so strategy, tuning, RNG, and action traces are outside this migration.

These changes deepen rule-policy, online-state, and CPU-evaluation ownership without activating a new authority path. Scoped gates remain 203 ESLint maintenance files and 202 checkJs runtime files; compatibility defaults are unchanged.

## 2026-08-04 Batch 34 boundary update

1. Purple-card activation now has a detached domain dispatch plan. Target-sensitive Business Center and Cleaning reads are lazy; transactions, mutation, pending counters, and logs remain in the mutable rule engine.
2. CPU received/owned card value calculation now separates pure effect dispatch and arithmetic from live rule adapters. Copy ordinal, income, dice frequency, dependency, and cache reads remain explicit callbacks owned by `CPU.js`.
3. Local RL resume preload now has one generation-aware state owner. Stale Promise completion is rejected before UI or resume effects, while existing repository, hydration, and notification behavior remains in `storage.js`.
4. A direct whole-file `storage.js` checkJs trial produced more than 100 ambient-global errors. The migration therefore continues by extracting typed runtime boundaries instead of declaring globals merely to silence the checker.

Scoped gates now cover 204 ESLint maintenance files and 203 checkJs runtime files. Production authority and compatibility defaults are unchanged.

## 2026-08-04 Batch 35 boundary update

1. Red-card activation now has a detached domain plan for conditional admission, activation kind, and requested transfer. Opponent/card traversal and capped sequential mutation remain in the rule engine.
2. Local save now passes through a typed runtime boundary: pure admission preserves no-game → online → winner order, then an explicit executor contains only serializer/repository failures. Wire shape and repository policy remain outside it.
3. Watchdog reporting now has an explicit ordered effect executor. Freeze classification and recovery implementation remain in app-shell/watchdog policy, while report persistence and notification order are directly contract-tested.

Scoped gates now cover 206 ESLint maintenance files and 205 checkJs runtime files. Authority, protocol/schema, persistence format, and PWA defaults are unchanged.

## 2026-08-04 Batch 36 boundary update

1. Pending effect outcomes now have a detached transition representation. Target admission and all live mutations remain in `GameManager`, while transfers, selected indexes, dormancy inheritance, target enumeration, and fixed rewards are deterministic data that can move with the shared Engine.
2. Rejoin attempt count and exhaustion now have one controller owner. Legacy globals are diagnostic projections; timer, callback, event, Socket, and retry-policy boundaries keep their existing owners and defaults.
3. Server operational limits now have one immutable configuration contract. Server composition injects the same values into room lifecycle, payload validation, reporting admission, mirror compaction, and public test exports.

This batch advances the shared rule transition, explicit online state, and thin-server goals without activating schema/reconnect authority or changing any compatibility surface. Scoped gates are 208 ESLint maintenance files and 207 checkJs runtime files.

## 2026-08-04 Batch 37 boundary update

1. CPU simulation cloning is now a runtime-adapter concern rather than strategy orchestration. The clone preserves all mutable game fields and identity relationships while the strategy remains action-only and fixed by exact decision/self-play evidence.
2. Pending outbound action memory now has one room-scoped controller owner. Durable browser storage, session admission, ACK matching, and transport remain separate adapters and retain their legacy-compatible formats.
3. Client-report suppression state now has one controller with an injected clock. Report projection, persistence checkpoints, and HTTP delivery remain independently testable boundaries.

These changes reduce three giant-runtime responsibilities without authority cutovers. Scoped gates are 209 ESLint maintenance files and 208 checkJs runtime files; compatibility and rollout defaults are unchanged.


## 2026-08-04 Batch 38 boundary update

1. Successful card and landmark builds now have detached result plans. Admission and outcome data are pure, while `GameManager` remains the sole live mutation/log/clone executor.
2. Existing-room recreate handling now has a dedicated runtime boundary. It owns admission branching and exact rejoin effect sequencing while `server.js` only injects room, identity, persistence, Socket, and clock adapters.
3. Card-select modal state now has a detached controller with immutable snapshots. Legacy global Sets remain compatibility projections because online and local restore still replace them; each modal interaction synchronizes before applying the controller transition.
4. The extracted server runtime entered ESLint and checkJs in the same batch. Scoped gates are 210 ESLint maintenance files and 209 checkJs runtime files.

No authority flag was enabled and no rule, protocol, persistence, reconnect timing, UI presentation, or PWA behavior changed.


## 2026-08-04 Batch 39 boundary update

1. Turn and pending reset outcomes now have immutable domain plans. The mutable Engine adapter applies them and creates a writable queue, preserving runtime object behavior while moving reset semantics toward the shared Engine.
2. Expert positive-income caps now live in `CPUEvaluation`. All 18 named/default modes are direct contracts and landmark/coin facts remain lazy, so non-landmark modes do not acquire new game-state reads.
3. Lifecycle notification state now lives behind a controller. App-shell no longer writes session/start/finish flags directly; persistence markers, notification admission, payload construction, and transport remain separate boundaries.

Scoped gates remain 210 ESLint maintenance files and 209 checkJs runtime files. No authority activation, rule, CPU tuning, schema/protocol, persistence, notification, or PWA behavior changed.

## 2026-08-04 Batch 40 boundary update

1. Last-applied online action sequence memory now has one controller owner. Snapshot, action-log, game-start metadata, persistence, ACK, replay, and transport remain separate adapters with their existing contracts.
2. New-room recreate handling now has a dedicated runtime boundary for prepare → activate → delivery. `server.js` injects all authority, mutation, persistence, Socket, and clock dependencies and retains the existing-room branch.
3. UI log history now has an immutable-snapshot controller. `ui.js` remains responsible for display strings, DOM effects, scrolling, public APIs, and unrelated filter/player state.

Scoped gates now cover 211 ESLint maintenance files and 210 checkJs runtime files. Production authority, protocol/schema, persistence formats, presentation, and PWA defaults are unchanged.

## 2026-08-04 Batch 41 boundary update

1. Post-income City Hall relief and phase selection now form one immutable Engine transition. The mutable adapter preserves card-effect order, exact-zero admission, lazy ownership reads, log text, and mutation order.
2. Lobby create/join pending state, request generation, and timeout identity now have one controller owner. Socket transport, RL preload, DOM rendering, notices, and the 15-second policy remain adapters.
3. Crash-screen duplicate admission now has explicit state ownership. App-shell still orchestrates CPU cancellation, persistence lookup, DOM/focus/listener effects, and resume.

Scoped gates now cover 212 ESLint maintenance files and 211 checkJs runtime files. Authority, protocol/schema, persistence, timeout, crash presentation, and PWA defaults are unchanged.

## 2026-08-04 Batch 42 boundary update

1. Affordable-purchase scoring composition now belongs to the pure CPU evaluator. The runtime supplies lazy feature callbacks, preserving exact scoring order, difficulty-specific reads, candidate ordering, tuning values, and RNG consumption.
2. Winner traversal now returns a deterministic player index from turn policy. The mutable Engine adapter retains original player identity and all post-win lifecycle behavior.
3. Confirm awaiting/cancel state now has one controller owner. DOM, focus/inert, modal admission, and callback execution remain UI effects in their original order.

Scoped gates remain 212 ESLint maintenance files and 211 checkJs runtime files. CPU decisions, rules, authority, protocol/schema, persistence, UI behavior, and PWA defaults are unchanged.

## 2026-08-04 Batch 43 boundary update

1. Turn-announcer timer identity now has one controller owner. UI keeps presentation effects and the browser-global API while timer replacement and the exact two-stage schedule are directly contract-tested.
2. Hostless-restore request pending state now has one controller owner. Bundle validation, reconnect coordination, terminal reason policy, and Socket transport remain independent adapters with their existing wire contract.
3. The remaining inspected `server.js` room projections are already delegated to `roomProjection`; creating a second forwarding boundary was rejected as non-progress.

Scoped gates now cover 213 ESLint maintenance files and 212 checkJs runtime files. No authority cutover, protocol/schema, persistence, rule, CPU, UI timing, or PWA behavior changed.

## 2026-08-04 Batch 44 boundary update

1. Complete turn advancement now has one detached Engine plan for repeat/next-player state. The mutable adapter applies the plan and retains exact structured log effects.
2. Negotiated online schema selection now has one controller owner inside the transport boundary. Negotiation, codecs, flags, and protocol rollout remain independent and default-compatible.
3. Recreate-room admission routing now has a dedicated server runtime. The composition root no longer expands admission fields or chooses existing/new restore execution inline.

Scoped gates now cover 214 ESLint maintenance files and 213 checkJs runtime files. No authority activation, schema/protocol change, persistence change, rule/CPU change, or PWA behavior change occurred.

## 2026-08-04 Batch 45 boundary update

1. Expert card penalty policy now lives in the pure CPU evaluator; the runtime only supplies player/game features and preserves lazy landmark-count access.
2. Build-menu filter selection now has one immutable-snapshot controller owner; view construction and DOM effects remain separate.
3. App-shell one-time listener/watchdog/resize binding state now has one named controller owner in the client event runtime.
4. Full `nextTurn` airport/IT orchestration remains deferred until a plan can preserve the existing Airport effect/log before IT-card read boundary.

Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. No rule, CPU tuning, protocol/schema, persistence, event ordering, UI, or PWA behavior changed.

## 2026-08-04 Batch 46 boundary update

1. Purple-card target availability now belongs to the pending-resolution policy, with current-player-first and player/card short-circuit order directly fixed by contracts.
2. Expert four-player normal-plan selection now belongs to the pure CPU evaluator; runtime feature lookup remains an adapter and fixed-decision/self-play parity proves unchanged strength.
3. Active-game previous-player display state now has one immutable-snapshot controller owner; view and DOM effects remain separate and preserve their existing order.

Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Rules, CPU tuning/choices, authority, protocol/schema, persistence, UI presentation, and PWA defaults are unchanged.

## 2026-08-04 Batch 47 boundary update

1. Minor-card target reference resolution now belongs to the pending rule policy, leaving Player/category adaptation and all mutation in the shared Engine adapter.
2. Expert disruption scaling now belongs to the pure CPU evaluator with short-circuiting feature callbacks and fixed-decision/self-play parity.
3. Post-build stabilizer batch state now has one controller owner; app-shell remains the scheduler and DOM recovery effect boundary with unchanged delays.

Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Rules, CPU strength, authority, protocol/schema, persistence, UI recovery, and PWA defaults are unchanged.

## 2026-08-04 Batch 48 boundary update

1. Restore-queue shadow/authority diagnostic selections now have one named controller owner while online transport, queue effects, flags, and fallback remain independent.
2. Renovation target availability now belongs to the pending rule policy and is shared by activation and consecutive-pending completion.
3. Expert lookahead terminal scoring now belongs to the pure CPU evaluator with lazy flag-specific facts and deterministic opponent order.

Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Rules, CPU strength, authority rollout, protocol/schema, persistence, reconnect behavior, and PWA defaults are unchanged.

## 2026-08-04 Batch 49 boundary update

1. The legacy reconnect-completed projection now has one controller owner while event authority, scheduling, and effects remain in the online runtime.
2. Active-card-effect lookup now belongs to turn policy at the exact existing post-Airport boundary; full `nextTurn()` staged orchestration remains deferred.
3. Expert choice score composition now belongs to the pure CPU evaluator while profiling, simulation, and tuning adaptation stay in `CPU.js`.

Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Rules, CPU strength, authority, protocol/schema, persistence, reconnect effects, and PWA defaults are unchanged.

## 2026-08-04 Batch 50 boundary update

1. Reconnect attempt count and exhausted state now have one controller owner; online timeout, callback, emit, status, and scheduling effects remain unchanged.
2. Loan repayment admission and amount now belong to card-activation policy while active-card traversal, mutation, and logs remain in the shared Engine adapter.
3. Multiplayer leader and Cleaning bonus aggregation now belongs to the pure CPU evaluator with exact two-pass callback order and fixed-decision/self-play parity.

Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Rules, CPU strength, authority, protocol/schema, persistence, reconnect effects, and PWA defaults are unchanged.

## 2026-08-04 Batch 51 boundary update

1. Restore generation/progress/quarantine/flush now have one lifecycle-controller owner while online queue, Socket, replay, and abort effects remain unchanged.
2. Strong choice score coefficient composition now belongs to the pure CPU evaluator while feature acquisition, profiling, cache, and tuning adaptation stay in `CPU.js`.
3. Pending-modal reentrancy state now belongs to an effect controller; modal admission policy and DOM effects remain in `ui.js` with unchanged order.

Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Rules, CPU strength, authority, protocol/schema, persistence, UI presentation, and PWA defaults are unchanged.

## 2026-08-04 Batch 52 boundary update

1. Online action in-flight state and start time now have one controller owner while ACK admission, timeout/retry, Socket effects, and compatibility projection remain unchanged.
2. Purchase-plan score selection now belongs to the pure CPU evaluator while candidate generation, ranking, cache, profiling, and tuning adaptation stay in `CPU.js`.
3. Active modal, focus restoration, and inert restoration state now belong to the modal runtime controller while admission policy and DOM effects remain in `ui.js` with unchanged order.

Main CPU scheduler ownership remains deferred until cross-runtime token invalidation can be migrated with explicit effect-order contracts. Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Rules, CPU strength, authority, protocol/schema, persistence, reconnect behavior, UI behavior, and PWA defaults are unchanged.

## 2026-08-04 Batch 53 boundary update

1. Local-game preload/start pending state now has one controller owner while readiness UI, Promise effects, initialization, and lifecycle effects remain in `main.js`.
2. Auto-skip pending and timer state now have one controller owner while availability facts, 1500 ms scheduling, revalidation, and dispatch remain unchanged.
3. Delayed roll/select pending, token, immutable action snapshot, and timer state now have one controller owner while visibility effects, RNG, admission, and online/local dispatch stay in `main.js`.

The cross-runtime CPU scheduler token remains deferred for an explicit effect-order migration. Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Rules, CPU strength, RNG, protocol/schema, persistence, reconnect behavior, UI timing, and PWA defaults are unchanged.

## 2026-08-04 Batch 54 boundary update

1. Local-resume pending now has only the existing generation-aware preload controller as mutable owner; storage rendering and Promise effects remain adapters.
2. Static/delegated UI listener binding now has one controller owner while registration effects and success-after-registration ordering remain in `main.js`.
3. Online create/join pending now has only the generation/timer-aware lobby controller as mutable owner; legacy browser names remain read-only projections for unchanged PWA deferral.

Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Rules, CPU strength, protocol/schema, persistence, lobby timing, browser-global read compatibility, and PWA defaults are unchanged.

## 2026-08-04 Batch 55 boundary update

1. Purple-card collection request arrays now belong to pure card-activation policy while the shared Engine remains the mutable transaction/log adapter.
2. Strongest-CPU TV target scoring now belongs to the pure evaluator while target enumeration, facts, tie order, profiling, and tuning stay in `CPU.js`.
3. Socket.IO-unavailable one-shot reporting state now belongs to a socket-registry controller while notice/status/checkpoint/report effects remain in `online.js`.

Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Rules, CPU strength, protocol/schema, persistence, diagnostic behavior, and PWA defaults are unchanged.

## 2026-08-04 Batch 56 boundary update

1. Online plan/effect/shadow diagnostic selections now have one private controller owner while public getters, transport, authority selection, and effects remain in `online.js`.
2. Card-selection modal listener admission now belongs to the card-select controller while DOM registration remains in the UI adapter.
3. Shared card activation candidate admission now belongs to pure card-activation policy while the shared Engine remains the mutation and effect-order authority.

Scoped gates are now 215 ESLint maintenance files and 214 checkJs runtime files. Rules, CPU strength, protocol/schema, persistence, reconnect behavior, UI behavior, and PWA defaults are unchanged.

## 2026-08-04 Batch 57 boundary update

1. Rejoin timer handle/deadline now have one controller owner across legacy and opt-in authority observation; authority labels, decisions, effects, and default flags remain unchanged.
2. Page-activation binding and hidden-time state now belong to lifecycle policy while all resume effects and their order stay in `main.js`.
3. The last local Engine shadow outcome now belongs to the shared client-shadow controller while snapshot adaptation, mutable fallback, and adoption remain in the local runtime adapter.

Scoped gates remain 215 ESLint maintenance files and 214 checkJs runtime files. Rules, CPU strength, authority defaults, protocol/schema, persistence, reconnect behavior, and PWA defaults are unchanged.

## 2026-08-04 Batch 59 boundary update

1. CPU scheduler token, pending token, and lease deadline now have one controller owner across main, online, storage, and app-shell diagnostics; scheduling effects and exact invalidation/cancel behavior remain unchanged.
2. Three existing UI transient controllers are now eager, side-effect-free owners, removing nullable lifecycle branches without changing timers or DOM effects.
3. Complete card/landmark selection writes now use one synchronized UI boundary across local, online, restore, and modal paths. Compatibility reads remain until a neutral runtime owner can replace them safely.

Scoped gates remain 215 ESLint maintenance files and 214 checkJs runtime files. Rules, CPU strength/RNG, protocol/schema, persistence, reconnect and CPU timing, UI behavior, and PWA defaults are unchanged.

## 2026-08-04 Batch 60 boundary update

1. Enabled card/landmark selection now has one neutral runtime owner, and the four consumer runtimes no longer share writable compatibility sets. UI selection state is explicitly a modal draft.
2. CPU landmark-saving selection now belongs to the pure evaluator while live feature adaptation stays in the strategy runtime.
3. Reroll-start state now comes from an immutable dice-policy plan while GameManager remains the RNG, mutation, and log-effect adapter.

Scoped gates now cover 216 ESLint maintenance files and 215 checkJs runtime files. Rules, CPU strength/RNG, protocol/schema, persistence, reconnect behavior, UI behavior, and PWA defaults are unchanged.

## 2026-08-04 Batch 61 boundary update

1. Ten cross-script online session fields now have one controller owner with compatibility projections, preparing explicit named lifecycle transitions without a callback-order cutover.
2. Online room-creation state now has a detached-snapshot controller, separating UI state from DOM, RL preload, and Socket effects.
3. Shared local/game setup state now has one controller owner across main, restore, and online flows instead of three declarations in the composition script.

Scoped gates now cover 219 ESLint maintenance files and 218 checkJs runtime files. Rules, CPU strength/RNG, protocol/schema, persistence, reconnect and Socket ordering, UI behavior, and PWA defaults are unchanged.

## 2026-08-04 Batch 62 boundary update

1. Online session mutation now passes through named controller transitions for connection, identity, role, replay, and reconnect state while existing Socket callbacks and storage effects retain their exact order.
2. Live client game references now have one neutral runtime owner across local, online, restore, UI, and app-shell consumers. This is an adapter-state boundary and does not compete with the deterministic Engine or serialized Snapshot schemas.
3. Tutorial preference state now has one controller owner integrated with the existing transition/effect contract and unchanged storage wire values.

Scoped gates now cover 220 ESLint maintenance files and 219 checkJs runtime files. Rules, CPU strength/RNG, authority defaults, schema/protocol, persistence formats, reconnect behavior, UI behavior, and PWA defaults are unchanged.

## 2026-08-04 Batch 63 boundary update

1. Live client game mutations now pass through named runtime operations across local start/reset, Engine shadow adoption, online replay/restore, save/Undo hydration, and UI coin rendering. Compatibility identifiers are projections rather than production write paths.
2. Turn completion is explicitly staged through admission, an immutable Airport coin transition, and IT continuation without changing mutable/log effect order.
3. Winner streak state is separated from winner view HTML and terminal DOM/effect orchestration while retaining the existing localStorage contract and first-presentation gate.

Scoped gates remain 220 ESLint maintenance files and 219 checkJs runtime files. Rules and amounts, CPU strength/RNG, Engine authority defaults, schema/protocol, persistence formats, reconnect behavior, UI presentation, and PWA defaults are unchanged.

## 2026-08-04 Batch 64 boundary update

1. Shared local-game setup mutations now pass through named controller operations across local start/reset, online start/rejoin, settings load, and save restore.
2. Live-game compatibility globals are read-only in the actual browser, leaving named runtime operations as the production write authority.
3. Online-session compatibility globals are read-only in the actual browser, leaving named lifecycle transitions as the production write authority.

Scoped gates remain 220 ESLint maintenance files and 219 checkJs runtime files. Rules, CPU strength/RNG, authority defaults, schema/protocol, persistence formats, reconnect/Socket ordering, UI behavior, and PWA defaults are unchanged.

## 2026-08-04 Batch 65 boundary update

1. Winner-streak compatibility projections are read-only in the actual browser, leaving named runtime operations as the production mutation authority.
2. RL distribution metadata and server model-ID admission now derive from one frozen client/server catalog without changing the adopted portfolio.
3. Strong landmark urgency feature extraction now belongs to the pure CPU evaluator while `CPU.js` remains the live-game adapter.

Scoped gates now cover 221 ESLint maintenance files and 220 checkJs runtime files. Rules, CPU strength/RNG, RL models/adoption, authority defaults, schema/protocol, persistence formats, reconnect behavior, winner/UI behavior, and PWA defaults are unchanged.

## 2026-08-04 Batch 66 boundary update

1. Shared game-setup and tutorial compatibility properties are read-only in the actual browser, leaving named controller operations as production mutation authority.
2. App-shell DOM observation and detached element snapshot construction now belong to a typed, dependency-injected module; watchdog policy and all DOM effects remain separate.
3. Strong landmark conditional-threshold feature extraction now belongs to the pure CPU evaluator while `CPU.js` remains the live-game adapter.

Scoped gates now cover 222 ESLint maintenance files and 221 checkJs runtime files. Rules, CPU strength/RNG, schema/protocol, persistence formats, reconnect behavior, DOM/focus recovery, UI presentation, and PWA defaults are unchanged.


## 2026-08-04 Batch 67 boundary update

1. Shared player-setting state now has a closed controller boundary: ingress is copied, reads/snapshots are frozen detached projections, and only named operations mutate production state.
2. App-shell recovery policy now invokes a typed, dependency-injected DOM-effect runtime for lock/display/class mutations while keeping admission, focus coordination, diagnostics, and ordering in the shell orchestrator.
3. Expert-v2 Cleaning candidate evaluation now projects board reads into immutable numeric features before the pure score formula, preserving traversal and decision behavior.

Scoped gates now cover 223 ESLint maintenance files and 222 checkJs runtime files. Rules, CPU strength/RNG, schema/protocol, persistence formats, reconnect behavior, UI/focus behavior, and PWA defaults are unchanged.


## 2026-08-04 Batch 68 boundary update

1. Shared setup state has an explicit production read/write boundary: consumers read detached snapshots and mutate only through named operations; classic-script compatibility getters no longer mediate application behavior.
2. Tutorial preference consumers now read the controller snapshot and restore through the controller, leaving compatibility getters as external projections rather than application dependencies.
3. Strong dice-tempo evaluation now separates live admission from immutable feature projection and pure scoring while retaining exact strength and RNG behavior.

Scoped gates remain 223 ESLint maintenance files and 222 checkJs runtime files. Rules, CPU strength/RNG, schema/protocol, persistence formats, reconnect behavior, tutorial/UI behavior, and PWA defaults are unchanged.

## 2026-08-05 Batch 69 boundary update

1. App-shell diagnostics and lifecycle orchestration now consume explicit game/online runtime snapshots rather than compatibility globals, making each captured state envelope and its ownership visible without moving DOM, recovery, reporting, or transport effects.
2. Local save and Undo orchestration now consume explicit game/online runtime snapshots, while hydration reads the named game-install result. The runtime envelope remains a live-reference adapter and does not become a serializable Game Engine or persistence authority.
3. Moving Company evaluation now separates ordered live-board feature acquisition from its pure numeric policy while preserving exact evaluation and RNG behavior.

Scoped gates remain 223 ESLint maintenance files and 222 checkJs runtime files. Rules, CPU strength/RNG, authority defaults, schema/protocol, persistence formats, reconnect behavior, watchdog/lifecycle behavior, UI presentation, and PWA defaults are unchanged.

## 2026-08-05 Batch 70 boundary update

1. UI rendering and input orchestration now consume explicit game and online runtime snapshots; compatibility globals no longer form their production read boundary.
2. Main action and CPU orchestration now consume explicit online snapshots, with asynchronous steps deliberately refreshing the snapshot at execution time.
3. These are read-boundary migrations only: ownership, effects, rules, CPU decisions/RNG, persistence, protocol, reconnect ordering, and PWA behavior are unchanged.

## 2026-08-05 Batch 71 boundary update

1. All five side-effect client runtimes now consume the shared live game through the explicit `GameRuntimeState` read boundary rather than compatibility globals.
2. Online Snapshot/replay/Engine adapters and main CPU/action orchestration take operation-scoped envelopes; delayed work deliberately refreshes them before applying effects.
3. `GameRuntimeState` remains a live-reference runtime owner, not a canonical or persistence schema. No authority, wire, save, rule, CPU, UI, or PWA behavior changed.

## 2026-08-05 Batch 72 boundary update

1. The online orchestrator now consumes all shared session state through `OnlineRuntimeState` snapshots and mutates it only through named transitions. Compatibility globals are no longer its internal state boundary.
2. Reconnect/storage planning and Socket/action/restore effects were migrated as separate rollback units with source contracts and online behavior coverage. Protocol, persistence, callback order, authority flags, and legacy fallbacks remain unchanged.
3. Whole-file lint/type activation is intentionally sequenced after dependency injection; the current audit found 373 classic-script names in `online.js`, so bulk ambient declarations were rejected as a false boundary.

## 2026-08-05 Batch 73 boundary update

1. Online orchestration now reaches main/UI side effects through `OnlineClientEffects`, replacing repeated ambient calls with one late-bound named adapter while preserving optional UI-lock/lifecycle hooks and required render/scheduler/notice contracts.
2. Lifecycle notification orchestration moved from `appShell.js` to `LifecycleRuntime`; policy, storage, game/online/setup snapshots, transport, clock/randomness, and checkpoints are injected. App-shell public globals remain compatibility wrappers.
3. The new boundaries are linted, type-checked, unit-tested, integration-tested, and present in the production/PWA load-order contract. No rule, CPU, wire, save, reconnect, lifecycle-notification, UI, or PWA behavior changed.

## 2026-08-05 Batch 74 boundary update

1. Watchdog recovery policy and DOM effects are now separated more sharply: `appShell.js` chooses the recovery target and order, while `UiRecoveryEffects` performs reusable element querying, Undo insertion, and interaction-lock mutation.
2. `OnlineDomEffects` is the sole direct DOM access boundary for `online.js`, covering status, lobby controls, inputs, settings HTML, and game-screen activation. Online protocol/state/replay code no longer performs element lookup or mutation directly.
3. Both boundaries are exercised by focused contracts plus watchdog integration, online, PWA, release, lint, and checkJs gates. No game, CPU, persistence, protocol, reconnect, presentation, or PWA contract changed.

## 2026-08-05 Batch 75 boundary update

1. `OnlineSocketEffects` centralizes all outbound online transport calls while event selection, payload construction, reconnect/restore ordering, and authority decisions remain in `online.js`.
2. `AppShellRuntimeEffects` gives the shell one late-bound boundary for main/UI/online runtime effects and scheduler observation. Watchdog, crash, lifecycle, and PWA orchestration remain in `appShell.js`.
3. Focused contracts cover event/payload identity, missing-dependency behavior, scheduler precedence and legacy fallback, online-flight fallback, direct-call exclusion, and production load order. No gameplay, CPU, protocol, persistence, UI, or PWA contract changed.

## 2026-08-05 Batch 76 boundary update

1. Asynchronous watchdog recovery is now an injected runtime boundary: app-shell classification selects a handler, while CPU reschedule and online ACK-timeout recovery own their admission, effect, observation, and checkpoint sequence together.
2. Browser event lifecycle ownership moved into `ClientEventRuntime`; app-shell startup now wires one runtime instead of coordinating six independent binding-key branches.
3. Direct and integration contracts preserve scheduler precedence/legacy fallback, recovery checkpoints, error and console capture order, duplicate binding suppression, PWA install registration, online status initialization, resize, and watchdog timing.

## 2026-08-05 Batch 77 boundary update

1. App-shell watchdog observation is now a distinct runtime owner rather than a 350-line block mixed with recovery, reporting, lifecycle, and PWA orchestration.
2. The boundary consumes explicit game/online snapshots, DOM snapshot effects, action registry, watchdog policy, scheduler observation, clock, and a small late-bound compatibility resolver; it emits the unchanged client diagnostic schema and interactability observations.
3. `appShell.js` remains the recovery and browser orchestration composition root. Direct, main, integration, PWA, release, lint, and checkJs contracts preserve all observed values and effect behavior.

## 2026-08-05 Batch 78 boundary update

1. App-shell UI recovery is now an injected orchestration boundary: `UiWatchdogRecoveryRuntime` coordinates pure watchdog policy, captured observations, reusable DOM effects, runtime effects, and asynchronous CPU/online recovery.
2. `appShell.js` remains the browser composition root and compatibility surface, but no longer contains the action-container, post-build, pending, human-turn, modal, stale-modal, or freeze-handler recovery implementations.
3. Focused unit tests plus main/integration/PWA/release, ESLint, and checkJs gates preserve the existing recovery decisions and effect ordering without changing gameplay, CPU, online, storage, UI, or PWA contracts.

## 2026-08-05 Batch 79 boundary update

1. `UiWatchdogRuntime` is the explicit application layer for watchdog classification, monitor decisions, recovery dispatch, diagnostic persistence, and reporting; `UiWatchdog`, `UiWatchdogMonitor`, `UiWatchdogReporting`, and `UiWatchdogRecoveryRuntime` retain their narrower policy/state/effect roles.
2. Runtime dependencies are injected, including a late resolver for online ACK timeout policy, so classic-script load order and isolated online test assembly remain valid.
3. `appShell.js` is reduced to browser composition and compatibility callbacks for this flow. Unit, main, integration, PWA, release, lint, and checkJs gates preserve the existing thresholds, report/recovery order, and externally visible behavior.

## 2026-08-05 Batch 80 boundary update

1. `AppShellUiLockRuntime` is the browser application layer for modal and shell-lock recovery, game-reset cleanup, post-build stabilization, and human-turn unlock synchronization. It composes `UiWatchdog` policy with `UiRecoveryEffects`, render effects, monitor state, and captured snapshots.
2. Cross-script functions `resetUiLocksForGameReset`, `schedulePostBuildUiStabilizer`, and `unlockUiForHumanTurn` remain app-shell compatibility delegates, preserving consumers in main, UI, online, and storage code.
3. Unit, main, integration, PWA, release, lint, and checkJs gates preserve modal/focus state, timer values, effect ordering, and recovery outcomes without changing gameplay or externally visible contracts.

## 2026-08-05 Batch 81 boundary update

1. `AppShellClientReportingRuntime` is the application layer over pure `ClientReporting` policy and `ClientReportingTransport`, owning context capture, duplicate admission, payload construction, dispatch, and debug-report sequencing.
2. Game/online state, browser facts, clock, fetch, checkpoints, and diagnostic snapshots are injected. `appShell.js` retains only dependency composition and its established report compatibility functions.
3. Unit, main, integration, PWA, release, lint, and checkJs gates preserve redaction, endpoint/payload, suppression timing, checkpoint order, and freeze-report behavior.

## 2026-08-05 Batch 82 boundary update

1. `AppShellCrashRuntime` is the application layer over `CrashScreen` policy and `CrashScreenEffects`, owning controller transitions, CPU cancellation, listener lifecycle, view/focus application, and resume dispatch.
2. DOM lookup, saved-game access, CPU cancellation, and resume are injected while `appShell.js` retains only composition and compatibility delegates.
3. Unit, main, integration, PWA, release, lint, and checkJs gates preserve single-show behavior, exact effect order, focus trapping, and saved-game resume presentation.

## 2026-08-05 Batch 83 boundary update

1. `AppShellStartupRuntime` owns online availability, PWA delegation, and main-view startup orchestration through injected view/effect/controllers.
2. `appShell.js` remains the composition and compatibility surface; startup policy/effect order no longer lives inline.
3. Whole-file app-shell checkJs still reports 102 ambient classic-script references, so typed-boundary extraction continues instead of adding suppressing ambient declarations.

## 2026-08-05 Batch 84 parity update

1. Engine shadow parity now includes Stadium's multi-opponent transfer with insufficient payer balances.
2. The same trace is checked for 2/3/5/10 players and every independent action/snapshot schema v0/v1 pairing.
3. Production authority remains unchanged and default-OFF; this batch only expands the rollout safety contract.

## 2026-08-05 Batch 85 boundary update

1. `LocalGameStartRuntime` is the application layer over `LocalPlayerSettings`, `LocalGameStart`, and `GameSetupState`, owning local setup rendering, RL preload state, and start orchestration.
2. `main.js` now composes injected game initialization, settings persistence, online/UI reset, notice, and lifecycle effects while preserving its existing global entry points.
3. Direct contracts preserve the exact start effect order, duplicate-start exclusion, async settings snapshot, browser load order, and PWA asset availability.

## 2026-08-05 Batch 86 boundary update

1. `LocalGameInitializer` owns deterministic local-game construction from setup state through initial render/schedule, with randomness and all effects injected.
2. `main.js` is now composition plus the established `init` entry point; card stock, shuffle, player naming, and CPU construction no longer live inline.
3. Fixed-random contracts preserve RNG call count/order, expert creation options, mutable runtime array semantics, and reset-to-schedule effect order.

## 2026-08-05 Batch 87 boundary update

1. `LocalGameRestartRuntime` owns the local restart use case from confirmation through persistence/session cleanup, runtime reset, view projection, redraw, and final checkpoint.
2. `main.js` only resolves browser-global effects and preserves the established `restartGame` entry point; ordered restart policy no longer lives in the composition root.
3. Contracts preserve facade preference, legacy-key fallback, reset reason labels, modal/UI unlock integration, lifecycle reset, and PWA refresh position.

## 2026-08-05 Batch 88 boundary update

1. `PageActivationRuntime` owns visibility lifecycle and delayed-human schedule state, composing the existing `PageActivationPolicy` and `DelayedHumanActionPolicy`.
2. Page recovery now has one injected application boundary for RL loads, delayed input, online reconnect, CPU lease recovery, and diagnostics; `main.js` keeps only compatibility delegates.
3. Contracts preserve timer/token semantics, Date/deadline boundaries, single listener ownership, hidden behavior, CPU outcome labels, and effect order.

## 2026-08-05 Batch 89 boundary update

1. `MainUiEventRuntime` is the application boundary over pure `UiEventDelegation`, owning listener state, event-to-command dispatch, and UI-only fallback effects.
2. `main.js` now supplies late-resolved named game/UI effects and keeps compatibility handlers; event parsing and registration no longer depend directly on gameplay functions.
3. Contracts preserve all command families, dataset argument conversion, keyboard activation, container bindings, Business Center button context, and PWA fallback behavior.

## 2026-08-05 Batch 90 boundary update

1. `LocalGameEngineRuntime` is the local application boundary over shared Engine, Snapshot, runtime adapter, determinism, and client-shadow policy.
2. Human and CPU actions now share one route for online dispatch versus local mutable execution plus optional shadow/parity/authority adoption; `main.js` keeps compatibility delegates and domain dependency composition.
3. Engine lookup remains late-bound for legacy fallback and test replacement. Default-OFF authority, resolved-random admission, adapter hydration parity, checkpoint order, and mutable identity are contract-covered.

## 2026-08-05 Batch 91 boundary update

1. `CpuTurnSchedulerRuntime` owns scheduling state and orchestration over existing `CpuSchedulerState`; phase handlers and `CpuTurnStrategy` remain separate decision/execution dependencies.
2. The runtime centralizes transport/game gates, health projection, token/lease timers, phase admission, cooldown, stale cancellation, and exception fallback while `main.js` composes effects.
3. Main/integration and full CPU decision/self-play regression gates preserve handler order, delays, online host authority, action traces, RNG, and strength.

## 2026-08-05 Batch 92 boundary update

1. `CpuPhaseHandlers` owns phase-specific proposal-to-effect adapters; `CpuTurnStrategy` remains action-only decision policy and `CpuTurnSchedulerRuntime` remains scheduling orchestration.
2. `main.js` now composes those three CPU layers with Game/online/render effects rather than implementing handlers inline.
3. Contracts and full CPU baselines preserve the eight-step order, proposal payloads, pending diagnostics, build false semantics, action traces, RNG, and strength.

## 2026-08-05 Batch 93 boundary update

1. `MainHumanActionRuntime` is the application boundary for local-human admission, delayed dice payload construction, pending resolution dispatch, confirmed build execution, and turn-end orchestration.
2. `main.js` now composes Game/online/PageActivation/Engine/UI effects and retains the established global action delegates; Action admission and gameplay effect sequencing no longer live inline.
3. Focused, main, integration, online, PWA, release, lint, and checkJs contracts preserve delayed RNG order, ACK/reconnect gates, local shadow versus online send, Undo/stock/render/unlock order, payloads, and confirmation text.

## 2026-08-05 Batch 94 boundary update

1. `OnlineInboundActionRuntime` is the application boundary shared by remote `gameAction` and sender `actionAccepted`, owning decode, restore-queue admission, reconnect-authority selection, sequence decisions, apply/recovery, and commit dispatch.
2. `online.js` retains Socket.IO registration plus injected schema, state-machine, persistence, replay, and effect adapters; the two inbound paths no longer duplicate protocol orchestration inside `initSocket`.
3. Focused and full online contracts preserve event names/order, malformed-wire recovery return values, ACK-flight timing, pending identity checks, duplicate/gap/no-game handling, restore queueing, action-log metadata, Undo, and reconnect behavior.

## 2026-08-05 Batch 95 boundary update

1. `OnlineLobbyStartRuntime` is the pre-game application boundary for room-created/joined/list projection and the schema-checked lobby-to-active-game transaction.
2. The runtime owns restore-generation start, normalized start-bundle persistence, RL preload gating, online/game/UI initialization, version diagnostics, action-sequence activation, and queued-event release through injected adapters; `online.js` retains Socket.IO registration and composition.
3. Focused and full online contracts preserve event order/text, session acceptance, schema rejection, storage best-effort behavior, preload stale/failure handling, host state, enabled selections, version warning timing, and queued Action/host-change activation.

## 2026-08-05 Batch 96 boundary update

1. `OnlineRejoinActivationRuntime` is the post-admission application boundary for canonical rejoin completion, composing the existing restore replay, activation, and pending resend contracts.
2. `online.js` still owns rejoin payload decoding, validation, persistence-plan preparation, and concrete adapters; the runtime owns generation validation and the ordered persist → show → replay → activate/flush → pending reconciliation transaction.
3. Focused and full online contracts preserve executor/legacy parity, replay cleanup and abort text, action-sequence activation, queued-event ordering, pending identity and socket gates, host migration, compression, and reconnect completion.

## 2026-08-05 Batch 97 boundary update

1. `OnlineRejoinPreparationRuntime` is the post-schema-admission application boundary that prepares canonical rejoin activation context and owns its runtime/storage persistence transaction.
2. It composes existing restore-queue, restore-rank, pending-reconciliation, rejoin-persistence, and action-log persistence contracts through explicit adapters; `online.js` retains wire admission and dependency composition, while `OnlineRejoinActivationRuntime` consumes the prepared context.
3. Focused and full online contracts preserve generation carry, local-host authority ordering, pending ACK/compaction rules, signed versus unsigned log retention, executor/legacy fallback, preload generation gates, replay/flush/resend order, and transport compatibility.

## 2026-08-05 Batch 98 boundary update

1. `OnlineRejoinRuntime` is the top-level application boundary that composes `OnlineRejoinPreparationRuntime` and `OnlineRejoinActivationRuntime` around decode, schema admission, and RL preload.
2. `online.js` now constructs the three rejoin layers once and delegates `rejoinData` directly; prepared payload persistence is an activation-call effect, so activation no longer captures one payload at runtime construction.
3. Focused and full online contracts preserve schema/status text, local-host bundle authority, preload generation gates, persistence/replay/flush/resend order, Socket.IO registration, and all compatibility fallbacks.

## 2026-08-05 Batch 99 boundary update

1. `OnlineGameInitializer` is the application boundary for constructing the mutable online Game runtime from the accepted server start/rejoin inputs.
2. It owns reset → selection/stock → ordered names/CPU creation → local-index projection → log/render/schedule sequencing; `online.js` supplies concrete domain/runtime effects through a lazy singleton.
3. Dedicated and full online contracts preserve server player order, CPU options/model identity, stock values, effect order, classic-script load timing, and all protocol/reconnect behavior.

## 2026-08-05 Batch 100 boundary update

1. `OnlineLobbyRequestRuntime` is the application boundary over `OnlineLobbyRequestState` and `OnlinePlayerSettings` for room creation/join and RL model preparation.
2. It owns admission → readiness/preload → pending generation/timer → schema-capability payload → Socket effect sequencing; `online.js` now provides lazy state, DOM, model, schema, and transport adapters.
3. Focused and full online contracts preserve payload shapes, exact status/notice behavior, duplicate prevention, async settings capture, timeout generation, host transitions, and all protocol/reconnect behavior.

## 2026-08-05 Batch 101 boundary update

1. `OnlineGameEngineRuntime` is the online application boundary over shared `GameEngine`, `GameEngineRuntimeAdapter`, and `GameEngineClientShadow`.
2. It owns replay preparation → detached transition → legacy mutable application → live parity finish → optional reconstruction-checked adoption, including the established Undo lifecycle; `online.js` supplies concrete mutable and snapshot adapters.
3. Authority remains default-OFF. Focused and full parity contracts preserve mutable identity, fixed Action traces, adoption failure fallback, diagnostics, schemas, and online restore/replay behavior.

## 2026-08-05 Batch 102 boundary update

1. `UiModalDomEffects` is the concrete DOM adapter beneath pure `UiModalPolicy` and the `UiModalOpen`/`UiModalClose` application plans.
2. Focus discovery, visibility snapshots, visual normalization, inert capture/restore, and orphan cleanup now use injected document/window/state/trace dependencies; `ui.js` keeps modal transaction composition and browser-global delegates.
3. Focus/inert/release and integration contracts preserve exact accessibility-sensitive ordering, absent-native-inert behavior, blocking-modal guards, and existing authority fallback.

## 2026-08-05 Batch 103 boundary update

1. `UiModalRuntime` is the application layer between pure `UiModalPolicy`/open/close plans and `UiModalDomEffects`.
2. It owns admission, diagnostics, ordered open/close effects, active/focus state, pending/trace follow-up, and keyboard commands through injected adapters; `ui.js` is now modal composition plus compatibility delegates.
3. Both default legacy and explicit authority paths remain contract-covered with identical accessibility-sensitive ordering and fallback behavior; production authority flags remain absent/default-OFF.

## 2026-08-05 Batch 104 boundary update

1. `CPURollDecision` is the action-only policy boundary for dice-count, reroll, and Harbor choices; `CPU` remains the compatibility facade and supplies evaluation/tuning/profile dependencies.
2. The extracted methods keep the original branch, comparison, callback, and random-call order. No scoring constants or expert presets moved or changed.
3. Focused order/RNG contracts plus the repository decision baseline and full self-play/simulation gates preserve every difficulty's observable choice and CPU strength.

## 2026-08-05 Batch 105 boundary update

1. `CPUPendingDecision` is the action-only strategy boundary for the six pending-effect choices; `CPUPendingResolution` remains proposal validation/application and `CPU` remains the compatibility facade plus evaluation dependency provider.
2. Candidate enumeration, first-win ties, lookahead callbacks, trace calls, and random selection remain in their original order with no tuning or rule changes.
3. Focused contracts, fixed decision baselines, and full self-play/simulation gates preserve every observable pending choice and CPU strength.

## 2026-08-05 Batch 106 boundary update

1. `CPUBuildStrategy` is the action-selection orchestration boundary for difficulty dispatch and weak/normal/strong/expert build policy; `CPUBuildExecution` remains the effect adapter and `CPU` remains the compatibility/evaluation facade.
2. The existing collection scope still converts `_buyCard`/`_buyLandmark` intents into one canonical proposal, but its ownership is now isolated for a later pure proposal-builder replacement.
3. Focused lifecycle/delegation contracts plus fixed decision and self-play baselines preserve candidate order, tie behavior, random consumption, and CPU strength.

## 2026-08-05 Batch 107 boundary update

1. `CPUBuildStrategy` now contains the large expert-v2-simple and multiplayer expert/strong build branches in addition to top-level difficulty dispatch.
2. `CPU` compatibility wrappers preserve runtime diagnostic monkeypatching while injecting all evaluation, tuning, trace, and proposal dependencies into the strategy boundary.
3. Empty-candidate/order contracts, fixed decision baselines, and full self-play preserve branch order, trace sequencing, candidate ties, RNG, and strength.

## 2026-08-05 Batch 108 boundary update

1. `CPUBuildScoring` is the high-level evaluation boundary between `CPUBuildStrategy` candidate orchestration and `CPUBuildExecution` effects.
2. It evaluates cloned states through injected CPU helpers and owns expert-v2-simple breakdown arithmetic, expert lookahead scoring, endgame focus, and strong option scoring without mutating the live game or stock.
3. Focused arithmetic/rejection contracts plus fixed decision and self-play baselines preserve scores, branch order, lookahead behavior, RNG, and strength.

## 2026-08-05 Batch 109 boundary update

1. `CPULookaheadRuntime` is the deterministic simulation application boundary over `CPUSimulation` and `CPULegalMoves`, used by high-level CPU scoring.
2. Seed construction, lineup policy, playout steps, profiling, and winner/terminal scoring are explicit; CPU construction is injected rather than referenced as a runtime-global dependency.
3. Focused seed/order/adapter contracts plus fixed decision, self-play, and simulation gates preserve deterministic traces, opponent composition, RNG, and strength.

## 2026-08-05 Batch 110 boundary update

1. `CPUBuildProposalCollector` is the explicit first-win output boundary for action-only build strategy; canonical proposal factories remain in `CPUBuildExecution`.
2. `CPUBuildStrategy` owns collector lifetime and returns collector state, while the former CPU private fields are compatibility mirrors/fallbacks rather than the production source of truth.
3. Focused identity/lifecycle contracts plus fixed decision and self-play baselines preserve exact proposal identity, candidate order, exception cleanup, RNG, and strength.

## 2026-08-05 Batch 111 boundary update

- Added `CPUChoiceScoring` as the owner of expert/strong post-choice state scoring, pending-choice clone evaluation, lookahead admission, and purchase-plan cache orchestration.
- `CPU.js` now delegates these nine methods while retaining the compatibility surface used by pending/build strategies and diagnostics.
- This advances the fixed CPU action-only outcome by separating state valuation from the facade without changing policy constants, evaluation order, or random consumption.

## 2026-08-05 Fixed outcome 1 milestone: stateless build strategy

- Build proposal collection moved from mutable CPU instance fields to a call-local adapter owned by `CPUBuildStrategy`.
- All nested build helpers see proposal-only `_buyCard`/`_buyLandmark` methods through the adapter, while the explicit execution path remains in `CPUBuildExecution`.
- The three temporary selection/fallback fields were removed rather than retained as compatibility debt.

## 2026-08-05 Fixed outcome 1 milestone: card evaluation runtime

- Consolidated 61 card/purchase/disruption evaluation adapters under `CPUCardEvaluationRuntime`; `CPU.js` now exposes thin compatibility delegates instead of owning those implementations.
- This is a source-of-truth move, not a shadow path: the old facade bodies were removed and the new runtime is loaded by browser, self-play, integration, and test runtimes.
- `CPUEvaluation` remains the pure formula layer while the runtime boundary owns board-to-feature projection and injected CPU adapter calls.

## 2026-08-05 Fixed outcome 1 milestone: state evaluation runtime

- Consolidated 50 board/profile, roll, income, threat, win-distance, crowd, and build-candidate adapters under `CPUStateEvaluationRuntime`.
- `CPU.js` now delegates these APIs instead of owning their implementations; the new runtime is the production source of truth in browser, self-play, integration, and test loaders.
- Together with `CPUCardEvaluationRuntime`, this leaves the CPU facade focused on configuration, public compatibility APIs, remaining build policy adapters, and explicit execution wiring.

## 2026-08-05 Fixed outcome 1 complete: action-only CPU strategy

- Added `CPUBuildPolicyRuntime` and `CPUBusinessDecisionRuntime`, removing the last substantial decision bodies from `CPU.js`.
- The CPU facade now owns configuration, caches, public compatibility methods, and explicit executors; roll, pending, build, card evaluation, state evaluation, lookahead, and business decisions live behind dedicated strategy/runtime boundaries.
- Canonical build proposals are collected without CPU instance selection state. A structural contract limits long CPU facade bodies to named configuration/cache/executor adapters.
- Fixed-seed decision and 2-to-10-player self-play baselines are the completion evidence for unchanged policy and random-consumption order.


## 2026-08-05 Fixed outcome 2 complete: local Engine cutover

1. Resolved local actions use `snapshot -> GameEngine.transitionSnapshot -> validated adoption` as the default authority path; a successful adoption skips the duplicate live mutable execution.
2. `LocalGameEngineRuntime` is the sole rollback owner. Explicit-false gates, unresolved randomness, transition failure, or adoption failure select legacy mutation. That fallback may be removed only after unresolved random inputs become deterministic and the rollback gate is intentionally retired.
3. Human builds, Undo, and the production CPU build phase now enter the same runtime boundary. Standalone CPU/self-play mutation remains an injected Engine adapter and no longer participates in UI shadowing.
4. Local cutover changes no rule, payload, Snapshot/save schema, CPU decision/RNG, online authority, transport, or PWA behavior. Online/server Engine adoption remains separately gated and default-OFF.


## 2026-08-05 Fixed outcome 3 complete: reconnect lifecycle authority

1. `OnlineReconnectRuntime` owns the state controller, completion marker, retry attempt state, and rejoin timer, and exposes one boundary for observation, reconciliation, input blocking, compatibility projection, and lifecycle diagnostics.
2. Clean event history is the browser default authority for `connecting`, `rejoining`, `restoring`, `replaying`, `active`, `failed`, and `completed`. Explicit-false gates and automatic parity fallback preserve immediate rollback.
3. `online.js` retains Socket.IO callback wiring and domain effect adapters, but no longer constructs or directly reconciles the reconnect controller. Timer callbacks, queues, ACK/watermark, payloads, and protocol remain unchanged.
4. Removal of the legacy projection is deferred until all remaining consumers use lifecycle state and the explicit rollback gate is intentionally retired.


## 2026-08-05 Fixed outcome 4 complete: online Engine migration boundary

1. Online replay is authority-first only when both existing shadow and authority flags are explicitly true; production remains default-OFF.
2. Successful detached reconstruction skips duplicate live mutation. Transition, shadow, reconstruction, or adoption failure selects the unchanged mutable replay and Undo handling.
3. The existing all-action client/server mirror parity across Action/Snapshot v0/v1 and 2–10 players proves the shared transition semantics; online runtime tests prove the authority/fallback selection itself.
4. Protocol, validation, ACK/watermark, action logging, queue ordering, reconnect behavior, and server canonical authority are outside this cutover and unchanged.


## Fixed outcome 5 complete: typed compatibility boundaries (2026-08-05)

- The browser-global compatibility surface for Action, Snapshot, CPU proposal/build strategy, reconnect runtime, and online Engine runtime is linked to concrete CommonJS inference. `unknown` is no longer the adapter contract for these paths.
- JSDoc types now cover the stable data passed between Action/Snapshot/Card/Player, online controller/Engine adapters, and CPU action-only selection. The large side-effect composition roots are still excluded; their extracted dependencies are checked instead of being hidden behind broad ambient declarations.
- ESLint remains limited to bug-detection rules and checkJs remains no-emit JavaScript checking. No TypeScript migration or runtime build step was introduced.
- Fixed outcome 5 is complete. The next and final scope is a requirement-by-requirement migration/parity/E2E/documentation audit.
