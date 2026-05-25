# Implementation Decisions

Date: 2026-05-26

Status: Accepted design index. This document records the current cross-cutting decisions for deferred design items. It is intentionally documentation-only; do not treat it as evidence that the listed features are implemented.

## Summary

| Area | Decision | When to implement | Depends on |
| --- | --- | --- | --- |
| Modal stack / deny-nesting | Implemented deny-by-default with no nested blocking modal exceptions. Future exceptions require registry/tests/manual mobile verification. | Extend only when a concrete UX cannot use inline detail or non-blocking notice. | UI interactability contract, modal tests, mobile manual checks. |
| Server-persisted canonical state | Minimal no-op/memory adapter footing exists; durable restart restore is not implemented. | Choose durable storage before enabling authoritative restart recovery. | Durable store choice, retention policy, atomic snapshot/log persistence. |
| Signed restore snapshot / action log | Do not implement as a partial security patch. Use only as a fallback/audit layer after schema and key policy are designed. | After or alongside server-persisted canonical state, or as an explicitly temporary compatibility bridge. | Canonical serialization, key rotation, legacy-bundle policy. |
| Hostless restore | Defer. Non-host bundles must not become canonical under the current trust model. | Re-evaluate after server-persisted canonical state, or behind an explicit provisional-quorum design. | Candidate hash/rank fixtures, grace window, replacement policy, multi-device manual tests. |
| Multiple room resume UI | Defer until restore storage has a per-room index. | After scoped restore reads, room index, and stale-bundle policy are stable. | Restore bundle store helper, stale-key pruning, UX for room selection. |
| Production client-error origin/token | Same-origin browser reporting stays tokenless; scripted/no-origin diagnostics require token when configured. | Revisit only if a deliberate browser token delivery model is added. | Render env configuration, same-origin browser reporting, documented curl/test flow. |
| Restore bundle per-room namespace / pruning | Scoped-first reads and a per-room restore index exist; visible resume UI and destructive legacy/global pruning remain deferred. | Add UI only after stale-bundle UX and retention policy are explicit. | Old-key compatibility, storage tests, stale-bundle retention policy. |
| Room replacement migration | Keep separate from hostless restore. Existing restored room replacement remains host-only. | Before hostless restore or broad replacement UX changes. | Current-room gates, token/rank tests, stale room diagnostics. |

## Dependency Order

1. **Modal policy track**
   - Keep the current UI interactability recovery as the safety net.
   - Add modal ownership registry and deny nested blocking modals by default.
   - Start with no stack exceptions. Add an exception only when a user flow cannot be redesigned as inline detail or non-blocking notice.
   - Run DOM tests first, then iPhone Safari / Android Chrome manual checks.

2. **Restore trust track**
   - Keep current host-only server restart restore for casual play.
   - Finish per-room restore storage index and scoped read/write cleanup before resume UI.
   - Add durable server-persisted canonical state behind an operational storage decision.
   - Only then reconsider hostless restore. If implemented before server persistence, it must be explicitly provisional and quorum/hash based.
   - Signed snapshots/action logs are not a replacement for server persistence unless the project accepts client-carried signed state as the explicit product model.

3. **Operations/security track**
   - For private diagnostics, current `NTFY_TOPIC` with optional `CLIENT_ERROR_SHARED_TOKEN` is acceptable.
   - For public production, require `CLIENT_ERROR_ALLOWED_ORIGINS`, a hard-to-guess topic, and either same-origin browser reporting or a deliberate token delivery model.
   - Do not set `CLIENT_ERROR_SHARED_TOKEN` for normal browser reporting unless the browser can provide the matching token; otherwise real reports will be rejected.
   - Do not add raw room ids, reconnect tokens, localStorage dumps, or full snapshots to ntfy text.

4. **Resume UX track**
   - Do not build multiple room resume UI on top of global restore keys.
   - First maintain a per-room index of scoped restore bundles.
   - Then expose a resume picker that clearly distinguishes live reconnect, server restart restore candidate, stale expired bundle, and completed game.
   - Prune legacy/global keys only after scoped UI and compatibility behavior are explicit.

## Cross-Design Consistency

### Modal deny-nesting vs UI recovery

These do not conflict if ownership is explicit:

- `recoverUiInteractability()` remains a fallback that clears stale locks and re-renders active game UI.
- Modal deny-nesting is a proactive lifecycle rule that prevents two blocking modals from claiming the same inert/pointer/focus ownership.
- A visible modal may lock the background, but its own content must remain interactive.
- `pendingModal` is game-critical; it must not be opened under another blocking modal and must not be hidden behind informational modals.

Implementation rule: modal recovery may close stale/empty modal state, but it must not choose gameplay actions, resolve pending effects, or bypass `allowedActionsFor()`.

### Hostless restore vs signed restore vs server persistence

The priority is:

1. Server-persisted canonical state.
2. Signed snapshot/action metadata as fallback or audit support.
3. Hostless restore only after the authority model is explicit.

Server persistence reduces the need for signed client restore as the primary recovery path. Signed client bundles may still be useful for diagnostics, offline fallback, or migration, but they should not be described as fully authoritative unless every restored canonical field is covered by the signature and freshness policy.

Hostless restore before server persistence would improve availability but lowers the trust boundary. If it is ever implemented early, it must be labeled provisional, use candidate quorum/hash comparison, prefer host candidates during a grace window, and keep replacement rules explicit.

### Multiple room resume UI vs namespace/pruning

Multiple room resume UI depends on a per-room index and scoped bundle reads. Without that, a picker would expose stale global state and make room replacement bugs harder to debug. Scoped reads can preserve old-key compatibility, but destructive pruning should come after the UI has a clear current-room and stale-room policy.

### Client-error token/origin vs ntfy debug workflow

Token/origin hardening should not break real browser reports:

- Same-origin browser reports should keep working without requiring a client-side secret.
- For `/api/client-error` and `/api/client-error-test`, scripted or no-origin debug reports should use `CLIENT_ERROR_SHARED_TOKEN`, or a temporary `CLIENT_ERROR_ALLOW_NO_ORIGIN` exception only during controlled testing.
- `/api/client-error-test` stays disabled by default outside development/test unless explicitly enabled.
- `/api/game-lifecycle` has a stricter payload and separate privacy contract. Same-origin browser lifecycle reports remain tokenless, while no-origin scripted lifecycle diagnostics require `CLIENT_ERROR_SHARED_TOKEN` when it is configured.

### Stale client detection vs restore/reconnect

Stale client detection is diagnostic only. It must not delete restore bundles, reject reconnect, or auto-reload during an active game. The PWA update banner remains the user-facing path; forced cache clearing is an operations/manual step.

## Implementation Slices

### Now

- Documentation alignment and ADR status cleanup.
- Tests/fixtures for future decisions that do not change runtime authority.
- Per-room restore index design and compatibility tests, if kept separate from UI changes.
- Client-error production environment runbook updates.

### Later

- Modal registry and deny-by-default implementation.
- Per-room restore index and visible multi-room resume UI.
- Legacy/global restore key pruning after compatibility policy is settled.
- Server-persisted canonical state proof of concept behind a feature flag.
- Signed restore schema only with key/version/migration policy.
- Hostless restore only after authority model is settled.

### Do Not Do

- Do not let non-host `recreateRoom` replace canonical state under the current model.
- Do not add partial signatures that leave unsigned fields capable of changing restored gameplay state.
- Do not build multiple room resume UI over global restore keys.
- Do not suppress UI-lock notifications merely because recovery succeeded.
- Do not make stale-client detection mutate live reconnect/restore state.

## Test Plan by Design

Modal policy:

- Opening an unregistered nested blocking modal is denied and leaves the existing modal interactive.
- Denied `showConfirm()` must not install callbacks or set `__machikoroConfirmModalOpen`.
- `pendingModal` cannot be hidden behind confirm/rules/card detail.
- Restart/reset closes all blocking modal ownership.
- Focus restore, Escape, inert, aria-hidden, and pointer ownership are covered for every allowlisted exception.

Restore trust:

- Host-only restore remains accepted for valid token/schema/rank bundles.
- Non-host replacement remains rejected until hostless restore is explicitly implemented.
- Stale host bundle loses to newer replay-backed rank.
- Server-persisted state, when added, beats any client bundle.
- Signed bundle tests mutate every signed canonical field and verify rejection.

Storage namespace:

- New per-room keys and index entries are written.
- Old global keys are read only through scoped migration.
- Stale/completed bundles are pruned without deleting the current room pending action.
- Existing `onlinePendingAction.roomId` gates remain enforced.

Operations/security:

- Same-origin browser client-error reports work.
- Cross-origin reports are rejected unless allowlisted.
- Token-protected debug/test requests require the configured header.
- ntfy text remains privacy-light and hashes room labels.

## Documentation Map

- Modal policy: `docs/ADR_MODAL_STACK_POLICY.md`
- Restore trust: `docs/ADR_RESTORE_TRUST_BOUNDARY.md`
- Online authority/current behavior: `docs/ONLINE_SYNC.md`
- Restore schema: `docs/online-restore-schema.md`
- Hostless restore sketch: `docs/HOSTLESS_RESTORE_DESIGN.md`
- Error reporting operations: `docs/NTFY_ERROR_REPORTING.md`, `docs/OPERATIONS.md`
- AI handoff rules: `docs/AI_HANDOFF.md`
