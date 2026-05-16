# Online sync

この文書は、オンライン対戦の同期・再接続・復元を変更するときの入口です。
目的は、`server.js` と `js/online.js` を読む前に、どこが正本で、どの状態を壊してはいけないかを短時間で把握できるようにすることです。

## Scope

主な対象ファイル:

- `server.js`: room lifecycle、Socket.IO event、action validation、mirror replay、snapshot compaction、server restart restore。
- `js/online.js`: socket client、online game start、action replay、local restore bundle、pending action resend。
- `js/storage.js`: online session resume entrypoint、resume button、local save / undo helper。
- `js/main.js`: human action gate、CPU scheduling gate、online action send boundary。
- `tests/online.test.js`: client online flow、rejoin、pending action、snapshot compaction。
- `tests/online-integration.test.js`: browser-global integration style online checks。
- `tests/server.test.js`: server room lifecycle、validation、mirror replay、restore replacement。

## Current authority model

現行実装は「完全な server authoritative state」ではありません。
サーバーは room membership と action order を正本として持ち、ゲーム状態は `GameManager` mirror replay で検証・再構築します。

サーバーが正本として扱うもの:

- room id と room lifecycle。
- player index、player name、reconnect token hash。
- host player index と host epoch。
- accepted action order の `seq`。
- accepted `clientActionId` の重複排除。
- action payload が現在の mirror state で合法かどうか。
- `actionLog` 圧縮後の `stateSnapshot`。

クライアントが保持する復元補助:

- `onlineSession`: 再接続に必要な room id、player index、player name、token、host flag。
- `onlineGameStart`: 開始時 payload と restore schema version。
- `onlineActionLog`: ローカルで再生できる accepted action log。
- `onlineStateSnapshot`: 長期対戦で action log を畳み込む snapshot。
- `onlinePendingAction`: 送信済みだが ack 前に切断した可能性がある action。

注意: client snapshot はサーバー再起動後の復元材料ですが、通常の live room では既存 room の token / host / rank 判定より優先しません。

### Trust boundary and cheating model

現行のオンライン対戦は、知人同士の casual play を前提にした信頼モデルです。サーバーは action の順序、手番、phase、payload 型、有効カード/ランドマーク、mirror replay で検証できる範囲を守りますが、完全な不正耐性を提供していません。

特に次は client 由来です。

- `rollDice`, `selectDice`, `rerollDice` の出目。サーバーは範囲と phase を検証しますが、乱数生成そのものは client 側です。
- server restart 後の `recreateRoom` restore bundle。サーバーは token、host、rank、schema、size、mirror replay を検証しますが、host の local snapshot を復元材料として受け取ります。
- UI 上の player order 表示。検証では server 側の original player index / shuffled order を区別して扱います。

そのため、公開部屋、ランク戦、賞品付き対戦、恒久的な戦績保存、観戦/replay配信のように不正耐性が必要な運用へ進む場合は、現行設計を server authoritative とみなしてはいけません。先に server-side dice、server seed または commit-reveal、room 内 canonical mirror、action/state hash、復元 snapshot の保全チェックを設計してください。

短期変更では、この casual trust model を壊さないことを優先します。つまり、サーバー検証を強化するときも、既存の再接続、host handoff、server restart restore、snapshot compaction が同じ action log を再生できることをテストで確認してください。

## Room lifecycle

通常開始:

1. Host client emits `createRoom`.
2. Server creates room, assigns host human slot, returns `roomCreated`.
3. Guest clients emit `joinRoom`.
4. Server emits `playerList` after create / join.
5. When human slots are full, server emits `gameStart`.
6. Clients initialize `GameManager` using `playerNames`, `playerSettings`, and `playerOrder`.

Live action:

1. Client calls `sendAction(action, data)`.
2. Client stores `onlinePendingAction` and emits `gameAction`.
3. Server rebuilds mirror state from `stateSnapshot + actionLog`.
4. Server validates actor, phase, payload, enabled cards / landmarks, undo state.
5. Server assigns next `seq`, records action, possibly compacts action log.
6. Server emits `gameAction` to other clients and `actionAccepted` to sender.
7. Clients replay action locally and persist canonical log / seq.

Reconnect:

1. Client reads `onlineSession` and emits `rejoinRoom`.
2. Server validates reconnect token hash for the requested player.
3. Server detaches any stale socket for that player.
4. Server emits `rejoinData` with canonical `gameStartPayload`, `stateSnapshot`, `actionLog`, host fields.
5. Client rebuilds game from payload, snapshot, then remaining log.
6. Client clears pending action if canonical log or snapshot includes it; otherwise it may resend only if current state still allows it.

Server restart restore:

1. Rejoining client receives `ROOM_NOT_FOUND`.
2. Host client sends `recreateRoom` from local restore bundle.
3. Non-host client retries `rejoinRoom` while waiting for host restore.
4. Server validates restore schema, token hash, host identity, rank, snapshot, action log.
5. Server creates restored room and returns `rejoinData`.

## Room lifecycle limits

Room作成入口は、正常な待ち合わせを妨げない範囲で緩いDoS対策を持ちます。2026-05時点の値は `server.js` の `ROOM_LIFECYCLE_LIMITS` が正本です。

- 開始済みroom: 最終activityから2時間でGC対象。
- 未開始room: 最終activityから30分でGC対象。作成直後と参加時に `lastTouchedAt` を更新します。
- 最大room数: 500。新規作成時に期限切れroomを先に掃除してから判定します。
- socket単位の `createRoom` rate limit: 5秒。無効なpayloadや設定不備では記録せず、実際にroomを作る直前だけ記録します。

この制限は公開サービス向けの完全なrate limitではありません。reverse proxy、IP単位制限、永続room storeを導入する場合も、既存の再接続・server restart restore・host handoffを壊さないように同じライフサイクル観点でテストしてください。

## Restore payload limits

After server restart の `recreateRoom` payload は client 由来の復元材料なので、room を作る前に `server.js` の `RESTORE_PAYLOAD_LIMITS` で早期拒否します。2026-05時点の上限は以下です。

- JSON概算サイズ: 1 MiB。
- `actionLog`: 最大 1000 entries。live room は通常 200 entries を超えると snapshot へ圧縮されるため、restore 上限は余裕を持たせています。
- 1文字列: 最大 4000 characters。
- payload内の文字列合計: 最大 200000 characters。
- snapshot / undoState 内の player card references: 最大 5000。

上限に当たった payload は `appError` の「復元データが大きすぎます」で拒否します。長時間対戦の復元を広げる場合は、client 側の snapshot compaction と server 側の上限を同じ PR で見直してください。

## Restore rank

Restore freshness is ordered by:

1. `hostEpoch`
2. maximum known `actionSeq`

`actionSeq` is derived from the maximum of:

- `gameStartPayload.actionSeq`
- `stateSnapshot.actionSeq`
- every `actionLog[].seq`

This rank exists on both sides:

- Server: `restorePayloadRank`, `isIncomingRestoreNewer`, `canReplaceRestoredRoom`.
- Client: `_serverOnlineActionSeq`, `_onlineRestoreRank`, `_isOnlineRestoreRankNewer`.

Keep these definitions aligned. A future cleanup should move this comparison into a shared helper or add tests that assert equivalent results from representative fixtures.

## Host ownership rules

Host is special because online CPU turns are host-driven.

Rules:

- `hostPlayerIndex` is an original player index, not shuffled game turn index.
- `myPlayerIndex` is the shuffled game index used by local UI / current turn checks.
- `myOriginalPlayerIndex` is the server-facing identity used for reconnect and host comparison.
- Only the current host may drive CPU actions.
- On `hostChanged`, clients must update both in-memory host state and persisted `onlineGameStart`.
- A stale local host flag must not override server `gameStart` / `rejoinData`.

High-risk flows:

- create room failure followed by join room.
- host disconnect followed by guest promotion.
- server restart where an old host and new host both have restore bundles.
- pending CPU action from old host after host handoff.

## Snapshot and action log fields

Snapshot fields currently needed by online replay:

- players: `name`, `coins`, `cards`, `dormantIndices`, `landmarks`, `itVentureCoins`, `hasYakusho`
- game state: `currentPlayerIndex`, `phase`, `log`
- dice state: `lastDiceResult`, `lastDice1`, `lastDice2`, `pendingTunaDice`
- turn state: `builtThisTurn`, `usedReroll`, `turnCount`, `hadAmusementParkAtRoll`
- pending effects: `pendingTV`, `pendingBusiness`, `pendingCleaning`, `pendingMover`, `pendingRenovation`, `pendingIT`
- shop / undo: `shopStock`, `undoState`
- sync: `actionSeq`

When adding a new `GameManager` state field, check:

- `buildOnlineSnapshot`
- `restoreOnlineSnapshot`
- `serializeMirrorState`
- `restoreMirrorState`
- `validateMirrorSnapshot`
- local save / resume if the state also affects local games
- undo snapshot if the state can change during build / undo windows

## Event schema checklist

Socket events used by the online flow:

- `createRoom`: client -> server, lobby configuration.
- `roomCreated`: server -> host, room id, player index, reconnect token.
- `joinRoom`: client -> server, room id, name, client version.
- `roomJoined`: server -> guest, player index, reconnect token.
- `playerList`: server -> room, lobby display.
- `gameStart`: server -> room, canonical start payload.
- `gameAction`: client -> server for requested action; server -> clients for accepted remote action.
- `actionAccepted`: server -> sender, canonical accepted action.
- `rejoinRoom`: client -> server, reconnect credentials.
- `rejoinData`: server -> client, canonical restore bundle.
- `recreateRoom`: host client -> server, local restore bundle after server restart.
- `playerRejoined`: server -> room, log display.
- `playerDisconnected`: server -> room, log display.
- `hostChanged`: server -> room, new host and host epoch.
- `appError`: server -> client, application-level failure. Do not use Socket.IO transport `error` for these.

## Phase 1 improvement backlog

Small PR candidates, in safe order:

1. Add tests that compare client/server restore rank fixtures.
2. Introduce a client helper for host state persistence used by `gameStart`, `rejoinData`, `hostChanged`, and resume.
3. Introduce an online restore store helper for localStorage key names and bundle read/write/clear.
4. Add a snapshot key consistency test for client snapshot and server mirror snapshot.
5. Document action payload schema per action before changing dispatch logic.
6. Move server mirror replay helpers out of the Socket.IO handler area without changing behavior.
7. Introduce an action registry table after the existing behavior is covered by tests.

## Verification

For online behavior changes, run at minimum:

```bash
node --check server.js
node --check js/online.js
node --check js/storage.js
node --check js/main.js
npm run test:online
npm test
```

Manual checks remain important for:

- create / join with multiple browsers.
- reconnect after browser refresh.
- host disconnect and host handoff.
- server restart restore.
- CPU turn after host handoff.
- Undo sync across clients.

Use `TESTPLAN.md` for high-risk manual coverage.
