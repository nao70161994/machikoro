# Implementation progress

作成日: 2026-05-17

`docs/IMPLEMENTATION_ROADMAP.md` の PR 候補を順に処理した記録です。各項目は 1 PR 単位で commit / push します。

## PR-001 Socket.IO payload guard

- 状態: done
- commit: `38cee56`
- 変更ファイル:
  - `server.js`
  - `tests/server.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - Socket.IO entrypoint 用の `requirePlainSocketPayload()` を追加。
  - `createRoom`, `joinRoom`, `gameAction`, `rejoinRoom` の destructuring 前に plain object guard を追加。
  - `handleRecreateRoom()` でも non-plain payload を例外化せず拒否するようにした。
  - 不正 payload guard の server test を追加。
- 実行テスト:
  - `node --check server.js`
  - `node --check tests/server.test.js`
  - `node tests/server.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: なし。

## PR-002 recreateRoom payload size limit

- 状態: done
- commit: `a611393`
- 変更ファイル:
  - `server.js`
  - `tests/server.test.js`
  - `docs/ONLINE_SYNC.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `RESTORE_PAYLOAD_LIMITS` と `validateRestorePayloadLimits()` を追加。
  - `handleRecreateRoom()` の room 作成・復元検証前に、JSON概算サイズ、actionLog件数、文字列長、文字列総量、player card references の上限を確認。
  - 過大な復元 payload は `appError` の「復元データが大きすぎます」で早期拒否。
  - 上限値と見直し方針を `docs/ONLINE_SYNC.md` に記録。
- 実行テスト:
  - `node --check server.js`
  - `node --check tests/server.test.js`
  - `node tests/server.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: なし。

## PR-003 replay malformed payload matrix

- 状態: done
- commit: `7853a58`
- 変更ファイル:
  - `server.js`
  - `tests/server.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `applyActionToMirror()` に non-plain payload guard を追加し、直接呼び出しでも例外化せず `false` を返すようにした。
  - `GAME_ACTIONS` 全 action について、`null`, `[]`, `"x"`, `{}` の replay が `createRoomMirror()` で拒否される table-driven test を追加。
- 実行テスト:
  - `node --check server.js`
  - `node --check tests/server.test.js`
  - `node tests/server.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: なし。


## PR-004 snapshot roundtrip tests

- 状態: done
- commit: this PR commit (`test: online snapshot roundtripを固定`)
- 変更ファイル:
  - `tests/server.test.js`
  - `tests/online.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - server mirror snapshot を `serializeMirrorState() -> restoreMirrorState() -> serializeMirrorState()` で roundtrip できることを固定。
  - online client snapshot を `buildOnlineSnapshot() -> restoreOnlineSnapshot() -> buildOnlineSnapshot()` で roundtrip できることを固定。
  - undoState, dormant card, pending state, dice fields, actionSeq を含む復元対象の回帰を広げた。
- 実行テスト:
  - `node --check tests/server.test.js`
  - `node --check tests/online.test.js`
  - `node tests/server.test.js`
  - `node tests/online.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: なし。
