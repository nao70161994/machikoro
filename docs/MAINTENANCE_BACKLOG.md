# Maintenance Backlog

Last updated: 2026-06-30

This backlog is a maintenance inventory after the June 2026 safety/refactor cycles. It is not a request to continue broad refactoring. Use it to decide whether a future change is a small safe fix, a design task, a real-device verification task, or something that should be left alone.

For larger root-cause refactors, use `docs/ARCHITECTURE_REFACTOR_PLAN.md`. It defines the intended module boundaries, migration order, contract tests, rollback paths, and manual-verification gates before any broad split is attempted.

## Recently Fixed / Guarded

These risks are now covered by code changes, contract tests, or operations guidance. Do not remove these guards without replacing the same contract coverage.

| Area | Resolved risk | Current guard |
| --- | --- | --- |
| Socket payloads | Normal Socket.IO payloads could grow without a shared size/depth/string limit. | `SOCKET_PAYLOAD_LIMITS`, `requirePlainSocketPayload()`, and server tests for normal-vs-restore payload limits. |
| Restore audit | `undoBuild` live action payload and restore audit payload could be signed over different shapes. | `buildRestoreActionAuditPayload()` canonicalizes action data; server tests compare live `undoBuild` and restore canonical data. |
| Reconnect versioning | `rejoinRoom` payloads did not consistently carry `clientVersion`, weakening stale-client diagnosis. | `buildOnlineRejoinPayload()`, storage fallback payload helper, online/integration/storage tests. |
| Stats reset | Stats reset was a one-tap destructive action. | `clearStats()` uses custom `showConfirm()` when available; stats tests cover cancel/accept. |
| UI rendering safety | Card detail/build button text and color-derived classes could regress to raw HTML/attribute insertion. | UI tests cover card and landmark effect/category escaping and unsafe color fallback. |
| Client-error privacy | ntfy client-error bodies could leak reconnect/session/token-like values. | `scrubClientErrorText()` redacts URL query and token/session forms; server tests cover query, key-value, and JSON-like stack values. |
| Stats saved numbers | Corrupt saved stats could render `NaN`, negative, or extreme percentages/bar widths. | stats load normalization and render tests for finite non-negative numbers. |
| Restore action log | Unknown restore actions could pass sanitize and fail later during replay/rank logic. | `sanitizeRestoreActionLogEntry()` rejects unknown actions after snapshot skip gate; server tests cover invalid vs skipped old entries. |
| Guardrail docs | Future AI edits could remove safety contracts because they were scattered. | `docs/OPERATIONS.md` Maintenance Contract Guardrails and `tests/main.test.js` docs assertion. |
| Room lifecycle helpers | Pure room lifecycle policy was embedded in `server.js`, making handler edits too broad. | `server/roomLifecycle.js` owns player-list, start-payload, client-version, reconnect-token, and disconnect-candidate helpers; server tests cover pure behavior. |
| Online storage facade | Room-scoped storage keys, legacy fallback reads, and restore bundle cleanup were hard to audit inside `online.js`. | `js/onlineStorage.js` preserves existing key names/formats and room-scoped fallback contracts; online tests cover facade behavior. |
| UI pure render helpers | Build menu/card detail HTML generation lived inside `ui.js`, increasing escape and selector drift risk. | `js/uiBuildMenu.js` and `js/uiCardDetail.js` provide pure HTML helpers with UI tests for escape/gate contracts. |
| Cross-layer action/selector contracts | Action metadata and UI child selectors could drift silently. | Server tests compare action registry, validators, canonical payload keys, and replay flags; main static tests compare interactability registry selectors with rendered UI sources. |

## Backlog Classification

Severity means maintenance risk, not necessarily user-facing bug severity.

### Critical

No current Critical maintenance item is known from this review. The remaining trust-boundary items below are important, but they are explicitly design-scoped rather than urgent small fixes.

### High

| Item | Classification | Risk | Impact | Suggested action | Deferred reason |
| --- | --- | --- | --- | --- | --- |
| Host-supplied restart restore trust boundary | Design judgment required / future large task | Server restart restore still relies on client-provided bundles unless signed audit or future durable canonical state is available. | Competitive/public trust would be overstated if treated as fully server authoritative. | Keep current casual trust wording. Revisit only with `docs/ADR_RESTORE_TRUST_BOUNDARY.md`, durable persistence, or signed/provisional restore design. | Out of scope: real signed restore, durable canonical state, hostless restore. |
| Hostless restore and restored-room replacement policy | Design judgment required | Some footing exists, but non-host bundles becoming canonical would change trust and replacement semantics. | Could corrupt restored rooms or let stale/non-host data outrank host/server state. | Keep restored-room replacement host-only. Use `docs/HOSTLESS_RESTORE_DESIGN.md` before implementation. | Explicitly excluded; needs multi-device/manual policy. |
| Long-running real online play and reconnect | Real-device verification required | Automated pseudo-E2E cannot fully model network transitions, mobile backgrounding, and real Socket.IO timing. | Online success may still fail on device/network combinations despite unit coverage. | Run manual long-match matrix on iPhone Safari and Android Chrome/TWA after online changes. | Requires real devices and real network conditions. |

### Medium

| Item | Classification | Risk | Impact | Suggested action | Deferred reason |
| --- | --- | --- | --- | --- | --- |
| `server.js` socket handlers remain large | Design judgment required | Socket event wiring, payload validation, restore, reconnect, and canonical mirror code still share one large file, although pure room lifecycle helpers now live in `server/roomLifecycle.js`. | AI edits can still accidentally cross restore/reconnect/action relay boundaries. | Keep adding pure helpers only behind tests; do not move live Socket.IO handlers until a handler-family migration plan and manual online check exist. | Broad split risks online compatibility and test export churn. |
| `js/CPU.js` remains a giant mixed file | Design judgment required / future large task | Evaluation, execution, diagnostics, and self-play helpers are still close together. | CPU behavior changes can leak across live/selfplay/tests. | Prefer helper extraction only around already-tested pure scoring/diagnostics functions. | CPU strength must not change; broad refactor requires benchmark parity. |
| `js/ui.js` still owns modal/player/stats/log orchestration | Now safer, still medium | Build menu and card detail pure rendering are split, but modal lifecycle, card select, player render, stats entry points, and log UI remain in `ui.js`. | Selector drift or rendering-side effects are easier to catch, but modal/focus/pointer regressions still need real devices. | Continue only with narrow pure helper extraction or selector tests; keep modal lifecycle stable until iPhone/Safari checks are planned. | Large UI split needs visual/mobile checks. |
| `js/online.js` reconnect/session orchestration remains complex | Design judgment required | Storage access is now behind `js/onlineStorage.js`, but socket lifecycle, rejoin retry, pending outbound timing, and visible reconnect status still overlap in `online.js`. | Small timing mistakes can resurrect stale room data or drop pending actions. | Use the facade for all storage changes and add targeted tests when changing retry/state paths. Delay reconnect state machine work until manual-device verification is scheduled. | State-machine rewrite could affect save/reconnect compatibility. |
| Action metadata cross-layer duplication | Safe only in narrow tests | `GAME_ACTION_REGISTRY`, server canonical payload table, client `applyAction`, pending specs, and UI registry must stay aligned. | New actions can be added in one layer but not another. | Add contract tests for any new action before implementation; consider generated checklist docs later. | Full dispatch unification is larger than current scope. |
| Test files are also giant | Now acceptable | `tests/server.test.js`, `tests/cpu.test.js`, and `tests/online.test.js` are large. | Future test edits may be hard to localize. | Split only by stable domain boundaries when adding new tests becomes painful. | Mechanical test moves can create noise without behavior value. |

### Low

| Item | Classification | Risk | Impact | Suggested action | Deferred reason |
| --- | --- | --- | --- | --- | --- |
| Docs overlap across `AI_HANDOFF`, `POST_IMPLEMENTATION_AUDIT`, and operations docs | Now acceptable | Some historical notes duplicate current state. | AI may read stale historical notes before current guardrails. | Prefer adding concise current-state pointers, not rewriting old audit history. | Large docs cleanup is low value and can hide useful history. |
| PWA cache strategy is conservative but scattered | Touch carefully | `sw.js`, `appShell`, release tests, and model-loading docs share behavior. | Over-broad cache edits can break update banner or RL model loading. | Keep current tests; update only for concrete PWA bug reports. | PWA cache strategy rewrite is explicitly out of scope. |
| RL docs/artifacts volume | Touch carefully | Registry, portfolio, scripts, and generated artifacts can be confused. | AI may review generated output instead of source/tests. | Continue using registry/tests as source of truth. | RL portfolio decisions are out of scope. |

## Classification By Action

### 1. Safe To Fix Now

No code fix is required immediately from this review. If a future small task is desired, the safest areas are:

- Add a narrow contract test when modifying an existing action or payload path.
- Extract a pure HTML helper from `ui.js` only when the test already exercises the exact output.
- Add docs pointers when an existing current-state doc becomes hard to find.

### 2. Requires Design Judgment

- Durable canonical state / real signed restore / hostless restore.
- Server socket handler decomposition beyond pure helper extraction.
- Reconnect state machine or room gate redesign beyond the existing `js/onlineStorage.js` facade.
- CPU evaluation/execution architecture changes.
- Action metadata unification beyond additional contract tests.

### 3. Requires Real-Device Verification

- iPhone Safari modal/focus/inert/pointer behavior.
- Android Chrome/TWA install/update and background/resume behavior.
- Long online matches with reconnect, host migration, CPU turns, undo, and PWA update prompts.
- Screen reader announcement quality for live regions and modal transitions.

### 4. Better Not To Touch Now

- PWA cache strategy rewrite without a production update bug.
- Ad placement, public URL metadata, or domain policy changes.
- CPU strength / RL portfolio decisions without benchmark intent.
- Save format migrations from card name to card id without a compatibility plan.
- Broad docs-history cleanup that does not change current operational guidance.

### 5. Future Large Tasks

- Durable server canonical state adapter with retention, locking, and explicit priority over client restore bundles.
- Signed/provisional restore authority and hostless restore policy.
- Multi-room resume UI with candidate classification and stale/live/completed retention policy.
- Server handler module split with stable exported test seams.
- CPU/RL architecture split with parity benchmarks and no-strength-change gates.

## Next Best Bets

If work continues, these are the highest value small-to-medium follow-ups:

1. Run a real-device online/PWA reconnect matrix and record results in `docs/OPERATIONS.md` or a manual test note before reconnect state-machine work.
2. Add action contract coverage when the next action/pending path changes, especially canonical payload + client apply + UI registry alignment.
3. Extract the next pure UI/server helper only when an existing test can assert the exact output or policy without moving lifecycle wiring.
