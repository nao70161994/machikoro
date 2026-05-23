# Phase 1 inventory

この文書は、保守性・拡張性・可読性改善の Phase 1 棚卸しです。
挙動変更や削除判断ではなく、後続 PR で小さく扱うための確認リストとして使います。

## Scope and commands

確認対象は、`.git` と `node_modules` を除いたアプリ本体・tests・docs・scripts です。
今回の棚卸しで使った主なコマンド:

```bash
wc -l index.html style.css server.js js/*.js tests/*.js | sort -n | tail -20
grep -R "TODO\|FIXME\|console\.\|alert(\|confirm(" -n --exclude-dir=.git --exclude-dir=node_modules .
grep -R "onclick=\|onchange=" -n index.html js/ui.js | wc -l
grep -R "innerHTML" -n js index.html | wc -l
grep -R "document.getElementById" -n js index.html | wc -l
grep -R "localStorage\." -n js index.html | wc -l
```

## Large files

大きいファイルは、まず分割対象ではなく「変更時に注意する所有境界」として扱います。

| File | Lines | Phase 1 reading |
| --- | ---: | --- |
| `js/CPU.js` | 4673 | 最大の God Object。strategy preset、評価、探索、診断、購入実行が混在。 |
| `tests/cpu.test.js` | 3156 | CPU 変更時の回帰網。分割時は test helper 化候補。 |
| `tests/server.test.js` | 2310 | online/server 回帰網。room lifecycle ごとの整理候補。 |
| `style.css` | 2194 | UI phase で component/section 単位に整理候補。 |
| `server.js` | 1719 | HTTP serving、room lifecycle、validation、mirror replay、restore が同居。 |
| `tests/rl-train.test.js` | 1521 | RL 周辺の生成/評価系テスト。 |
| `tests/online.test.js` | 1463 | online client flow の主要回帰網。 |
| `js/online.js` | 915 | socket、restore、snapshot、action replay が同居。 |
| `js/main.js` | 902 | bootstrap、input、CPU scheduling、canvas/title flow が同居。 |
| `js/RLCPU.js` | 899 | RL runtime。portfolio/model schema 変更時に注意。 |
| `js/GameManager.js` | 702 | ルール正本。effect 分岐と pending resolver が集中。 |
| `js/ui.js` | 690 | render、modal、card select、tab、confirm が同居。 |

## UI coupling counts

| Item | Count | Risk |
| --- | ---: | --- |
| inline `onclick` / `onchange` in `index.html` + `js/ui.js` | 58 | markup が global function 名に依存する。 |
| `innerHTML` writes in app JS / HTML | 29 | XSS 対策、event wiring、差分確認が難しくなる。 |
| `document.getElementById` refs in app JS / HTML | 122 | DOM id と JS の密結合が広い。 |
| `localStorage.*` refs in app JS / HTML | 70 | storage key と schema が分散する。 |

小さな PR 候補:

1. 新規または触る UI から event delegation を使う。
2. `renderPending` の各 pending box を小関数へ切る。
3. storage key を frozen constants にまとめる。
4. DOM id owner table を `ARCHITECTURE.md` または UI 専用 docs に追記する。

## Console / alert inventory

### App runtime alerts

native `alert` は AGENTS 方針の custom modal とずれます。すぐ削除せず、触る画面から `showConfirm` / app modal へ寄せます。

- `js/main.js:104`: RL model load failure fallback notice.
- `js/storage.js:100`, `js/storage.js:124`: online reconnect load failure.
- `js/storage.js:199`: local save load failure.
- `js/online.js:650`, `js/online.js:669`, `js/online.js:670`: online lobby input validation.

### Server runtime logs

`server.js` の `console.*` は運用ログとして有用ですが、用途が混在しています。
薄い `logServerEvent(type, payload)` へ集約すると、Termux 上でも grep しやすくなります。

- build/startup: `server.js:36`, `server.js:1671`
- connection lifecycle: `server.js:223`, `server.js:420`, `server.js:464`
- room lifecycle: `server.js:214`, `server.js:285`, `server.js:753`, `server.js:1657`
- host lifecycle: `server.js:460`, `server.js:635`
- error paths: `server.js:362`, `server.js:467`, `server.js:1662`, `server.js:1665`

### CLI / tests

`scripts/` と `tests/` の `console.*` は出力仕様または test harness です。Phase 1 の削除対象から除外します。

## Unused / suspicious candidates

削除ではなく、追加確認の候補です。

| Candidate | Location | Why suspicious | Safe next step |
| --- | --- | --- | --- |
| `CPU.takeTurn(game, shopStock)` | `js/CPU.js:554` | 空実装で、CPU execution は `main.js` の phase handler が担っている。 | 参照確認テスト後、deprecated コメントまたは削除 PR。 |
| `handleRemoteAction(action, data)` | removed in Cycle 13 | 現行 socket handler は `applyReplayedAction` を直接呼び、未使用helperは将来の undo-state 誤用を避けるため削除済み。 | 再導入しない。remote/replay 経路は `applyReplayedAction` を使う。 |
| native `alert` paths | `js/main.js`, `js/storage.js`, `js/online.js` | custom modal 方針とずれる。 | `showNotice` helper を作って置換。 |

## Duplicate logic hotspots

### Online action application

同じ action semantics が複数箇所にあります。

- client replay: `js/online.js` `applyAction`
- server mirror replay: `server.js` `applyActionToMirror`
- server validation: `server.js` `validateGameAction`
- allowed action table: `server.js` `getAllowedActions`
- producers: `js/main.js` human / CPU handlers

次の安全な一手は、共通化ではなく comparison test です。
代表 action fixture を client/server 両方で replay して、最終 snapshot が一致することを確認します。

### Snapshot fields

同じ field list が以下に重複します。

- local save: `js/storage.js` `saveGameState`
- local resume: `js/storage.js` `resumeGame`
- undo: `js/storage.js` `saveUndoState` / `restoreUndoSnapshot`
- online client: `js/online.js` `buildOnlineSnapshot` / `restoreOnlineSnapshot`
- server mirror: `server.js` `serializeMirrorState` / `restoreMirrorState` / `validateMirrorSnapshot`

次の安全な一手は、`GAME_STATE_SERIALIZED_FIELDS` の docs/test fixture 化です。実装共通化はその後にします。

## TODO / FIXME

アプリ本体に明示的な `TODO` / `FIXME` は目立ちませんでした。現時点の未整理事項は TODO コメントより、巨大ファイル・重複 schema・global coupling として存在しています。

## Phase 1 next PR candidates

1. `docs: Phase 1 inventory を追加`
   この文書を追加するだけ。挙動変更なし。

2. `chore: storage key constants を追加`
   `localStorage` key の typo と schema 分散を減らす。読み替えだけ。

3. `test: online action replay parity を追加`
   client/server replay のズレを検出する足場。共通化前の安全網。

4. `refactor: server log wrapper を追加`
   出力内容は維持し、server runtime logs を一箇所に集める。

5. `refactor: unused candidate を削除または deprecated 化`
   `handleRemoteAction` は Cycle 13 で削除済み。残る候補は参照確認済みのものだけ小さく扱う。
