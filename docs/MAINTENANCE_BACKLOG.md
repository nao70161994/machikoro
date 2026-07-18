# Maintenance Backlog

Last updated: 2026-07-19

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
| Socket payload limits | Normal and restore payload size/depth/string checks were embedded in transport wiring. | `server/socketPayload.js` owns unchanged pure limit checks; handlers retain event names and error behavior. |
| Server game settings | CPU/player/card setting normalization and RL model validation were embedded in `server.js`. | `server/gameSettings.js` owns the injected pure policy; the existing allowlists and exported server API remain unchanged. |
| Room input validation | Player-name sanitation, room ID validation, and collision-safe ID generation were embedded beside Socket.IO handlers. | `server/roomValidation.js` owns the unchanged input rules; direct tests fix unsafe IDs, length limits, alphabet, and collision retry behavior. |
| Static asset policy | Root-file allowlisting and build-hash injection were mixed with Express route wiring. | `server/staticAssets.js` owns the unchanged pure allowlist and string transforms; PWA, online, and release tests retain delivery behavior. |
| Static directory routes | Directory route definitions could drift from `index.html` local asset references. | `server/staticAssets.js` owns frozen root/directory allowlists; `tests/static-assets.test.js` verifies every allowlisted root exists and every local index asset resolves through an allowlisted route. |
| Accepted action history | Duplicate-action lookup, bounded ACK memory, and reconnect ACK references were embedded in `server.js`. | `server/actionAcceptance.js` owns player-scoped keys, legacy/action-log fallback, the 100-entry bound, and minimal reconnect refs. |
| Canonical action payloads | Canonical key filtering and client action ID normalization were embedded in `server.js`. | `server/actionPayload.js` owns the frozen per-action key table and unchanged normalization; cross-layer action tests require registry, validator, canonical payload, and replay action sets to match. |
| Reconnect identity | Token generation/hash/restore comparison was coupled to room handlers. | `server/reconnectIdentity.js` owns the injected pure identity policy; token strings, hashes, and reconnect protocol are unchanged. |
| Restore log sanitation | Snapshot sequence filtering, unknown-action rejection, canonical payload shaping, and audit carry-forward were embedded in restore orchestration. | `server/restoreSanitization.js` owns the pure sanitize pipeline; restore ordering, authority, signing policy, and handler timing remain unchanged. |
| Canonical mirror metadata | Stable state hashing and mirror marker construction were embedded in `server.js`. | `server/canonicalMirrorMetadata.js` owns pure metadata generation with direct parity tests; durable storage and canonical transaction remain out of scope. |
| Server dice payloads | Authoritative dice recognition and payload generation were coupled to action handlers. | `server/serverDice.js` owns the injected pure dice payload policy; random source, event names, and action shapes are unchanged. |
| Server lifecycle reporting | Lifecycle notification normalization and text formatting were mixed with HTTP, auth, dedupe, and delivery. | `server/gameLifecycleReporting.js` owns pure formatting while `server.js` retains all side effects. |
| Online storage facade | Room-scoped storage keys, legacy fallback reads, and restore bundle cleanup were hard to audit inside `online.js`. | `js/onlineStorage.js` preserves existing key names/formats and room-scoped fallback contracts; online tests cover facade behavior. |
| UI pure render helpers | Build/pending/detail/select HTML generation lived inside `ui.js`, increasing escape and selector drift risk. | `js/uiBuildMenu.js`, `js/uiPendingMenu.js`, `js/uiCardDetail.js`, and `js/uiCardSelect.js` provide pure HTML helpers with escape/gate/selector contracts. |
| Cross-layer action/selector contracts | Action metadata and UI child selectors could drift silently. | Server tests compare action registry, validators, canonical payload keys, and replay flags; main static tests compare interactability registry selectors with rendered UI sources. |
| Client report formatting | Error normalization, redaction inputs, and report keys were embedded in `appShell.js`. | `js/clientReporting.js` owns pure report formatting; browser capture, fetch, and watchdog side effects stay in `appShell.js`. |
| Lifecycle notification formatting | Opt-out parsing and lifecycle payload shaping were embedded beside browser storage, dedupe, and fetch side effects. | `js/lifecycleNotify.js` owns the unchanged pure opt-out/payload contract; `appShell.js` retains storage, session, dedupe, and network behavior. |
| Server client-error normalization | Notification payload normalization was coupled to server routes and rate limits. | `server/clientErrorReporting.js` owns pure normalization/redaction; auth, dedupe, ntfy, and HTTP wiring stay in `server.js`. |
| CPU evaluation primitives | Pure frequency, score-cap, opponent-dilution, landmark-progress, combo, duplicate-purchase, and economy-balance calculations lived inside the giant CPU class. | `js/cpuEvaluation.js` owns the unchanged calculations; direct contracts, wrapper parity, decision snapshots, and full self-play regression guard behavior. |
| CPU player-count profiles | Pure option fallback and player-count profile selection lived inside the giant CPU class. | `js/cpuProfile.js` owns the unchanged constants and profile-name mapping; a fixed seed/action trace locks winner, turns, and the initial action sequence. |
| CPU legal moves | Affordable landmark/card enumeration was duplicated inside expert and strong build selection. | `js/cpuLegalMoves.js` owns the unchanged pure filters; direct order contracts and decision/self-play baselines guard candidate ordering. |
| CPU lookahead simulation | Deterministic playout RNG, weighted dice-outcome table, loop, and simulation-only phase steps lived beside game cloning and live CPU execution. | `js/cpuSimulation.js` owns the unchanged table, seeded LCG, and injected lookahead loop/step; CPU wrappers retain cloning and live execution ownership. |
| CPU maintenance benchmark | Small traces did not cover all phases, player counts, or difficulty levels before scoring extraction. | 9 representative decision fixtures produce 36 exact snapshots; a second baseline fixes 36 full matches for all difficulties and 2–10 players. Both artifacts record a full source commit. |
| UI player/log/card ordering | Pure display normalization, structured-log parsing, and card ordering were embedded in `ui.js`. | `js/uiPlayerDisplay.js`, `js/uiLogDisplay.js`, and `js/uiCardOrder.js` own exact-output helpers; DOM mutation and event handling stay in `ui.js`. |
| UI watchdog diagnostics | Freeze-state classification and storage-size compaction were mixed with DOM snapshots, timers, recovery, and notifications. | `js/uiWatchdog.js` owns state-key/pending/classification and pure 7KB diagnostic serialization; `appShell.js` retains DOM reads, recovery, storage writes, timing, reporting, and PWA behavior. |
| Online rejoin payload | Rejoin wire fields were assembled inside reconnect orchestration. | `js/onlinePayload.js` builds the existing `rejoinRoom` payload while `online.js` retains timing and socket ownership. |
| Online restore rank | Restore authority ordering was embedded in reconnect orchestration. | `js/onlineRestoreRank.js` owns the unchanged epoch/replay-progress comparison; ACK, retry, queue, and callback timing stay in `online.js`. |
| Reconnect state observation | Reconnect phases had no shared names or testable transition vocabulary. | `js/onlineReconnectState.js` freezes eight states and allowed transitions; `online.js` exposes a read-only projection from existing booleans without changing timers, callbacks, status text, or protocol. |
| Client/server replay parity | Client apply and server mirror could evolve to different final snapshots despite per-action coverage. | An online contract test applies the same representative action trace to both paths and compares complete serialized snapshots. |
| Card-select HTML | Toggle-button HTML and attribute escaping were embedded in modal orchestration. | `js/uiCardSelect.js` owns pure button generation; event handling, modal state, and DOM updates remain in `ui.js`. |
| Card effect registration | Stable IDs, effect descriptions, rule handlers, and CPU references could drift across layers. | `tests/card-contract.test.js` checks definition identity, known/used effects, UI descriptions, income handlers, rule references, and CPU references. |
| Snapshot roundtrip fixtures | Roundtrip coverage did not explicitly name representative pending, undo, landmark, multiplayer, and endgame states. | `tests/snapshot-contract.test.js` and its fixture builder require exact serialize/restore/serialize equality across those states. |
| Runtime module dependency order | Extracted browser-global modules could be omitted from a VM/self-play loader while production still worked. | `tests/runtime-dependencies.test.js` fixes dependency-before-consumer order for production and the principal test/self-play runtimes. |

## Backlog Classification

Severity means maintenance risk, not necessarily user-facing bug severity.

### Critical

No current Critical maintenance item is known from this review. The remaining trust-boundary items below are important, but they are explicitly design-scoped rather than urgent small fixes.

### High

| Item | Classification | Risk | Impact | Suggested action | Deferred reason |
| --- | --- | --- | --- | --- | --- |
| Host-supplied restart restore trust boundary | Design judgment required / future large task | Server restart restore still relies on client-provided bundles unless signed audit or future durable canonical state is available. | Competitive/public trust would be overstated if treated as fully server authoritative. | Keep current casual trust wording. The implemented hostless quorum fallback is explicitly provisional, not durable authority. | Out of scope: real signed restore and durable canonical state. |
| Provisional hostless restore | Implemented; real-device timing verification remains | The fail-closed quorum path can recover an absent-host room only after host grace, exact agreement, and explicit confirmation. | Availability improves without allowing one-client or majority selection, while client-carried state remains lower trust. | Keep restored-room replacement host-only and preserve `HOSTLESS_RESTORE_ENABLED=0` as the immediate rollback. | Full 60s grace + 30s collection + confirmation rotation is not yet verified on mixed real devices. |
| Long-running real online play and reconnect | Partially verified on real devices | A four-player mixed-device match (Android ×2, iPhone ×2) completed through victory with reconnect on 2026-07-18. | Basic mixed-device synchronization and reconnect continuation have direct evidence; specialized recovery paths remain. | Keep automated gates and manually verify host migration, server restart restore, Undo around reconnect, online CPU, background/resume, and PWA update paths separately. | One completed match does not cover every reconnect/PWA/modal failure mode. |

### Medium

| Item | Classification | Risk | Impact | Suggested action | Deferred reason |
| --- | --- | --- | --- | --- | --- |
| `server.js` socket handlers remain large | Design judgment required | Pure validation, restore sanitation, reconnect identity, canonical metadata, dice payload, room lifecycle, reporting, and static policy now have seams, but live Socket.IO handler sequencing remains centralized. | AI edits can still accidentally cross restore/reconnect/action relay boundaries. | Do not move live Socket.IO handlers until a handler-family migration plan and manual online check exist. | Further movement changes callback/timing ownership and risks online compatibility. |
| `js/CPU.js` remains a giant mixed file | Now safer, further movement needs design judgment | Diagnostics, evaluation primitives, base legal-move filters, weighted dice outcomes, lookahead loop/steps, pending resolution, cache, tuning, and player-count profiles now have seams. Large scoring/selection methods and live build execution remain coupled. | Candidate or tie-break order changes can alter CPU strength; live execution movement can affect online send/failure behavior. | Extend pure helpers only when exact decision snapshots and the 2–10 player/all-difficulty self-play baseline stay unchanged. | Moving `_buyCard`/`_buyLandmark` or broad selection orchestration changes side-effect ownership and is deferred. |
| `js/ui.js` still owns modal/stats/render orchestration | Now safer, still medium | Build/pending/detail/select/player/log/order helpers are split, but modal lifecycle, stats entry points, DOM mutation, focus/inert, and event processing remain in `ui.js`. | Selector drift is better guarded, but modal/focus/pointer regressions still need dedicated real-device checks. | Keep modal lifecycle stable until an iPhone/Safari modal matrix is scheduled. | Mixed-device online completion did not exercise modal focus/inert/accessibility; large UI movement needs targeted visual/mobile checks. |
| `js/online.js` reconnect/session orchestration remains complex | Design judgment required | Storage and read-only state observation now have helpers, but socket lifecycle, rejoin retry, pending outbound timing, and visible reconnect status still overlap in `online.js`. | Small timing mistakes can resurrect stale room data or drop pending actions. | Use the facade and state vocabulary for observation/tests. Delay timer/callback state-machine migration until the remaining manual matrix is scheduled. | Full state-machine application could affect save/reconnect compatibility even though one mixed-device reconnect match completed. |
| Action metadata cross-layer duplication | Safe only in narrow tests | `GAME_ACTION_REGISTRY`, server canonical payload table, client `applyAction`, pending specs, and UI registry must stay aligned. | New actions can be added in one layer but not another. | Add contract tests for any new action before implementation; consider generated checklist docs later. | Full dispatch unification is larger than current scope. |
| Test files are also giant | Now acceptable | `tests/server.test.js`, `tests/cpu.test.js`, and `tests/online.test.js` are large. | Future test edits may be hard to localize. | Split only by stable domain boundaries when adding new tests becomes painful. | Mechanical test moves can create noise without behavior value. |
| JSDoc/checkJs/ESLint | Deferred tooling | TypeScript and ESLint are not installed and no scoped config exists. | Introducing them now requires dependencies and would likely surface broad legacy warnings. | Re-evaluate only with an approved dependency/config task and a narrow file allowlist. | This cycle forbids dependency additions and large warning cleanup. |

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

- Durable canonical state / real signed restore / authoritative hostless restore.
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
- Durable/signed restore authority beyond the implemented provisional quorum policy.
- Multi-room resume UI with candidate classification and stale/live/completed retention policy.
- Server handler module split with stable exported test seams.
- CPU/RL architecture split with parity benchmarks and no-strength-change gates.

## Next Best Bets

If work continues, these are the highest value small-to-medium follow-ups:

1. Run a real-device online/PWA reconnect matrix and record results in `docs/OPERATIONS.md` or a manual test note before reconnect state-machine work.
2. Add action contract coverage when the next action/pending path changes, especially canonical payload + client apply + UI registry alignment.
3. Extract another CPU scoring primitive only when it has an exact wrapper-parity contract and both CPU baselines remain behavior-compatible; keep live purchase execution in `CPU.js`.

## 2026-07-15 B分類オンライン耐障害化

- B1: ACK timeout、pending保護、restore queue上限、再接続世代管理、durable非依存の2/4クライアントE2E、短縮soak、Ubuntu WebKit nightly。GitHub Actions `29348807863` と Release `29348809695` は成功。
- APKのsecret不要validation-onlyはActions `29379796044`で成功。署名付きAPKは`ANDROID_KEYSTORE_BASE64`、`KEYSTORE_STORE_PASSWORD`、`KEYSTORE_KEY_PASSWORD`の設定後に`build_signed=true`で実行するため、実APKは引き続き人間待ち。
- manual online deliveryは固定production originへのGETと読み取り専用Socket.IO handshakeだけに限定し、Actions `29379820494`で成功。定期scheduleは追加しない。
- B3: file durable canonical storeは`review/durable-canonical-experimental`だけに隔離。既定storeは`noop`を維持し、canonical transactionとrestart persistenceはmainへ入れない。
- B4: 現行action ID境界とrolling compatibilityを`docs/PROTOCOL_COMPATIBILITY.md`で固定。dotted stream ID、watermark、非host canonical置換の実装は採用しない。
- 2026-07-18にAndroid 2台＋iPhone 2台の4人オンライン戦を、再接続ありで勝利まで完走確認。host移譲、server restart restore、Undo、online CPU、background復帰、PWA更新は未確認で、自動WebKitやこの1試合から完了を推定しない。
