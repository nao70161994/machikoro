# Maintenance Goal Completion Audit

Last updated: 2026-08-05

This is the completion record for the six fixed maintenance outcomes. It records the code owner, executable evidence, rollback boundary, and intentionally deferred scope. It does not authorize production flags, protocol changes, rule changes, CPU tuning, or persistence-provider work.

## Outcome evidence

| Outcome | Completion evidence | Rollback / compatibility boundary | Status |
| --- | --- | --- | --- |
| 1. Action-only CPU strategy | `CPU.js` delegates card/state/build/business policy to focused runtimes; `CPUBuildStrategy.chooseBuildAction()` returns detached canonical data; the three former selection fields are absent. `cpu-action-proposal`, `cpu-build-strategy`, `cpu-decision-baseline`, and `cpu-selfplay-regression` cover literal payloads, no temporary CPU state, all difficulties, fixed seeds, and 2–10 players. | `CPUBuildExecution` owns application. Heuristics, difficulty presets, candidate/tie order, and RNG order remain unchanged. | Complete |
| 2. Local shared Engine authority | `LocalGameEngineRuntime` prepares and adopts successful deterministic transitions before live mutation for human, CPU, build, and Undo paths. `game-engine-local-shadow` covers every Action Contract entry against explicit-OFF legacy mode and proves successful authority skips duplicate mutable execution. | Explicit `false`, unresolved randomness, transition failure, or adoption failure selects the documented legacy fallback. Save/Undo shapes remain unchanged. | Complete |
| 3. Online reconnect runtime | `OnlineReconnectRuntime` owns controller history, completion, retry attempts, and timer state; `online.js` composes it and uses clean event history as the default reconnect/effect authority. State, integration, reconnect Socket E2E, and four-player completion E2E cover start through disconnect/rejoin/restore/replay/active/failure. | Explicit-false flags or parity failure select the legacy projection. Socket event names, ACK, watermark, timeout constants, queue and storage formats remain unchanged. | Complete |
| 4. Online shared Engine migration boundary | `OnlineGameEngineRuntime` can adopt a detached transition before mutable replay only when both existing flags are explicitly true. Runtime tests prove adoption, skipped mutation, reconstruction rejection, and fallback; `game-schema-shadow-parity` proves all actions across 2/3/5/10 players and independent Action/Snapshot v0/v1 selections. | Production remains default-OFF. Any unavailable shadow, transition/adoption/rebuild failure, or disabled flag retains mutable replay and Undo behavior. | Complete within the approved default-OFF scope |
| 5. Typed browser-global and adapter boundaries | Action/Snapshot/Card/Player, CPU proposal/build strategy, reconnect runtime, and online Engine runtime have JSDoc contracts. Their browser globals use concrete `typeof import(...)`; `checkjs-config`, `test:types`, and limited ESLint prevent regression. | No emit/build step or TypeScript migration. The five side-effect composition roots remain excluded as whole files while extracted boundaries are checked. | Complete |
| 6. Migration/parity/E2E final guard | `REQUIRED_TEST_GROUPS` fixes migration, Snapshot, local/online Engine, reconnect, fixed-seed CPU, release, Socket E2E, and soak evidence in their promotion groups. Release contracts verify the push workflow and Nightly simulation, CPU regression, online, soak, and mobile WebKit wiring. | Live schema/save/online Engine gates retain their existing defaults. Real-device and production-provider conclusions are not inferred from automation. | Complete after final gates and exact-HEAD CI |

## Promotion gates

The final promotion sequence is:

1. `npm run test:static` (syntax, Python compile, limited ESLint, no-emit checkJs).
2. `npm run test:batch` (unit + simulation, Socket reconnect/completion/schema E2E, release pseudo E2E).
3. `npm run test:cpu` and `npm run test:rl` for complete CPU/RL isolation evidence.
4. `npm run test:online` and `npm run test:pwa` locally, plus `npm run test:browser-e2e` on supported Linux CI, for focused transport/PWA/mobile-WebKit evidence. Playwright does not support the Android/Termux host platform.
5. Push `main`, then require the exact-HEAD `Release pseudo E2E` workflow and a manually dispatched exact-HEAD Nightly `mobile-webkit-e2e` job to succeed.

`tests/run-all.js` validates that the named evidence cannot silently become unlisted or move out of its required group. `tests/release-e2e.test.js` validates the workflow wiring.

## Intentionally deferred

- Production enablement of online/client or server pure Engine authority and versioned wire/save flags.
- Durable canonical database/provider, restart persistence based on that provider, retention/locking, and production secret operations.
- Broader hostless authority, signed-restore production rollout, and protocol redesign.
- Real-device-only iPhone Safari/TWA/PWA/background matrices. Existing reported four-device reconnect completion remains evidence for that path only.
- Whole-file checkJs for `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`; their extracted adapters are checked instead.
- CPU strength changes, RL portfolio decisions, game rules, save keys/formats, Socket.IO events/payloads, and PWA cache-policy redesign.
