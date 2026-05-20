# Architecture notes

この文書は、現状の構成を短時間で把握するための保守メモです。
全面書き換えの設計図ではなく、小さな PR で安全に改善するための地図として扱います。

## Current shape

街コロ本体は bundler なしの browser-global 構成です。`index.html` の script 読み込み順が依存関係の正本になっています。

1. `js/Card.js`: カード定義、カード効果定数、分類、説明文、カード生成。
2. `js/Player.js`: プレイヤー状態、ランドマーク定義、勝利判定。
3. `js/GameManager.js`: ルール、フェーズ、ダイス、収入処理、pending 効果、建設、ログ。
4. `js/CPU.js`, `js/RLCPU.js`, `js/RLModelPortfolio.js`: CPU 判断と RL CPU ランタイム。
5. `js/online.js`: Socket.IO client、オンライン action replay、snapshot、再接続。
6. `js/ui.js`: 描画、モーダル、カード選択、ログ、タブ。
7. `js/storage.js`: ローカル保存、オンライン再接続 session、Undo、設定保存。
8. `js/stats.js`, `js/appShell.js`, `js/main.js`: 統計、PWA/app shell、起動と入力ハンドラ。

`server.js` は Express / Socket.IO server です。静的配信、SW build hash 注入、room 管理、action 検証、mirror replay、snapshot compaction、再接続、room 再作成を同じファイルで持っています。ファイル内の section marker は将来の抽出単位を示す保守用の目印で、現時点では実行時境界ではありません。

## Ownership map

| Concern | Current owner | Coupled files |
| --- | --- | --- |
| Card data | `js/Card.js` | `js/GameManager.js`, `js/CPU.js`, `js/ui.js`, `server.js`, tests |
| Landmark data | `js/Player.js` | `js/GameManager.js`, `js/ui.js`, `server.js`, storage/online restore |
| Game rules | `js/GameManager.js` | `js/main.js`, `js/online.js`, `server.js`, `js/CPU.js` |
| Local input flow | `js/main.js` | `js/ui.js`, `js/storage.js`, `js/online.js` globals |
| CPU action scheduling | `js/main.js` | `js/CPU.js`, `js/RLCPU.js`, `js/online.js` |
| Online client state | `js/online.js` | `js/main.js`, `js/storage.js`, `js/ui.js` |
| Online server authority | `server.js` | client action names, `GameManager` runtime loaded via `vm` |
| Rendering | `js/ui.js` | global `game`, `cpuPlayers`, `SHOP_STOCK`, online turn ownership |
| Persistence | `js/storage.js`, `js/online.js`, `server.js` | duplicated snapshot fields |

## Important invariants

- `GameManager` is the rule source of truth.
- Online games are deterministic client replays. The server validates action order and actor authority but does not keep a full live `GameManager` instance per room.
- The host drives CPU turns online. Non-host clients must not schedule CPU actions.
- `stateSnapshot` plus remaining `actionLog` must reconstruct the same game after reconnect or server restart.
- `appError` is the app-level Socket.IO error event. Do not mix it with transport-level `error`.
- Script order is observable behavior in the current architecture.

## Phase and action map

The shared action vocabulary starts in `js/GameManager.js` as `GAME_ACTIONS`.
Simple phase-to-action mapping starts in `GAME_PHASE_ACTIONS`, while pending
effect flags are resolved by `GameManager.allowedActionsFor(game)`. `server.js`
wraps that helper with `getAllowedActions(game)` so server validation and rule
state use the same action gate.

| Phase / state | Actions |
| --- | --- |
| `roll` | `rollDice` |
| `selectDice` | `selectDice` |
| `rerollConfirm` | `rerollDice`, `skipReroll` |
| `harborChoice` | `resolveHarbor` |
| `pending` | `resolveTV`, `resolveBusiness`, `resolveCleaning`, `resolveMover`, `resolveRenovation` |
| `pendingIT` flag | `resolveIT` |
| `build` | `buildCard`, `buildLandmark`, `undoBuild`, `nextTurn` |

When adding a rule phase or action, update all three layers together:

- `GAME_ACTIONS`, `GAME_PHASE_ACTIONS`, and pending mapping in `js/GameManager.js`
- client producers in `js/main.js`
- client replay in `js/online.js`
- server validation / mirror replay in `server.js`
- phase/action tests in `tests/gamemanager.test.js` and `tests/server.test.js`

## Main architecture risks

### God objects

- `js/CPU.js` is the largest object and mixes strategy presets, evaluation, search, diagnostics, and build execution.
- `server.js` mixes HTTP serving, room lifecycle, validation, mirror replay, restore, and logging.
- `js/GameManager.js` is the rule source of truth, but it also owns every effect branch and pending resolver.

### Hidden coupling

The code is split into files, but many dependencies are global variables rather than imports. Examples:

- `js/main.js` reads online state such as `isOnlineGame`, `isRoomHost`, `socket`, and `onlineActionInFlight`.
- `js/online.js` mutates `game`, `cpuSpeed`, `enabledCards`, `enabledLandmarks`, `SHOP_STOCK`, and calls `render()` / `scheduleCPU()`.
- `js/storage.js` restores `game`, `cpuPlayers`, `SHOP_STOCK`, UI visibility, and online session state.

This is not a bug by itself, but it makes refactors risky because dependency direction is not visible to tooling.

### Duplicated schemas

Game state serialization is hand-written in several places:

- local save / resume in `js/storage.js`
- undo snapshot in `js/storage.js`
- online client snapshot in `js/online.js`
- server mirror snapshot in `server.js`

Any new field on `GameManager` or `Player` must be checked against all of them.

### Duplicated online action application

The same action semantics are replayed in both:

- `js/online.js` `applyAction`
- `server.js` `applyActionToMirror`

The server also validates the same actions separately. This duplication is currently necessary because browser globals are loaded into the server through `vm`, but it should be protected by tests before adding more actions. Most `server.js` exports are test-only hooks for this protection, not a public application API.

### UI/action coupling

`index.html` and `js/ui.js` still use browser-global UI helpers and `innerHTML` in several render paths. Known `onclick=` / `onchange=` / `oninput=` handlers have been migrated to delegated handlers, so new UI should keep using `data-action` / `addEventListener` instead of reintroducing inline handlers.

## Small PR route

1. Document first.
   Keep `docs/REFACTOR_PLAN.md` and this file current before moving code.

2. Introduce constants before helpers.
   Move action names and storage keys to frozen constants before changing behavior.

3. Extract pure logic first.
   Start with functions that do not touch DOM, sockets, timers, or localStorage.

4. Add comparison tests before de-duplicating replay.
   For online actions, prove client replay and server mirror replay stay aligned.

5. Split UI only around touched surfaces.
   Prefer small helpers such as `renderPendingTV()` or `renderCardButton()` before broader component work.

## Checklist for future changes

Before merging a card, landmark, rule, or online sync change:

- Does `GameManager` own the rule outcome?
- Did CPU evaluation either support the new behavior or explicitly ignore it with a test?
- Did `js/online.js` replay the action/state correctly?
- Did `server.js` validate and mirror replay the same action/state?
- Did save/resume, undo, online snapshot, and server snapshot include any new state fields?
- Did UI render the new option without relying on native `alert` / `confirm`?
- Did the relevant `npm run test:*` group run?
