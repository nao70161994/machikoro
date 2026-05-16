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
- commit: `9f39c00`
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


## PR-005 Python static check

- 状態: done
- commit: `0b32282`
- 変更ファイル:
  - `package.json`
  - `docs/maintenance-checklists.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `test:static:py` を追加し、`python3 -m py_compile scripts/rl/*.py` で RL Python scripts の構文を確認できるようにした。
  - `npm run test:static` から Python 構文チェックも実行するようにした。
  - Termux で Python 3 が無い場合の扱いと切り分け用コマンドを保守チェックリストに記録した。
- 実行テスト:
  - `python3 -m py_compile scripts/rl/*.py`
  - `npm run test:static:py`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: なし。


## PR-006 online trust model docs

- 状態: done
- commit: `b927e92`
- 変更ファイル:
  - `docs/ONLINE_SYNC.md`
  - `docs/TECH_DEBT.md`
  - `docs/PROJECT_ISSUES.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - 現行オンライン対戦が server authoritative ではなく casual trust model であることを `docs/ONLINE_SYNC.md` に明文化。
  - client dice、host restore snapshot、player order 境界を client 由来として整理。
  - 公開/競技運用へ進む場合に server-side dice、canonical mirror、state hash などが必要であることを技術負債・課題一覧から参照できるようにした。
- 実行テスト:
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: なし。


## PR-007 accepted clientActionId owner check

- 状態: done
- commit: `be36a0a`
- 変更ファイル:
  - `server.js`
  - `tests/server.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - accepted `clientActionId` cache を `playerIndex:clientActionId` で保持するように変更。
  - 再送 ack 検索を `clientActionId` と `playerIndex` の両方が一致する場合だけ返すようにした。
  - 旧形式 cache と actionLog fallback でも送信者が一致しない場合は既承認扱いにしないテストを追加。
- 実行テスト:
  - `node --check server.js`
  - `node --check tests/server.test.js`
  - `node tests/server.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: なし。


## PR-008 online action timeout

- 状態: done
- commit: `8ff8724`
- 変更ファイル:
  - `js/online.js`
  - `tests/online.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - online action 送信時に ack timeout timer と送信時刻を持つようにした。
  - timeout 時は pending action を保持したまま in-flight を解除し、`rejoinRoom` で canonical state の再同期へ倒す。
  - actionAccepted、rejoinData、disconnect、appError、reset で timeout を解除するようにした。
  - ack timeout で pending を消さず再同期要求を送る online test を追加。
- 実行テスト:
  - `node --check js/online.js`
  - `node --check tests/online.test.js`
  - `node tests/online.test.js`
  - `node tests/online-integration.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: なし。


## PR-009 room lifecycle rate limit / pre-start TTL

- 状態: done
- commit: `4f15e63`
- 変更ファイル:
  - `server.js`
  - `tests/server.test.js`
  - `docs/ONLINE_SYNC.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - room lifecycle 制限を `ROOM_LIFECYCLE_LIMITS` と helper に集約した。
  - 未開始roomのTTL、最大room数、socket単位の `createRoom` rate limit を追加した。
  - 新規room作成時と未開始room参加時に `lastTouchedAt` を更新し、期限切れroomを作成前に掃除してから上限を判定するようにした。
  - online sync docs に room lifecycle limits と運用上の前提を追記した。
- 実行テスト:
  - `node --check server.js`
  - `node --check tests/server.test.js`
  - `node tests/server.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: なし。


## PR-010 action registry coverage test

- 状態: done
- commit: `055a6d0`
- 変更ファイル:
  - `tests/server.test.js`
  - `tests/online.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `GAME_ACTIONS` の全値が server payload validator にあることを source coverage test で固定した。
  - `GAME_ACTIONS` の全値が server mirror replay と client `applyAction` にあることを固定した。
  - 新action追加時に server validator / replay / client apply のいずれかを漏らすと targeted test が落ちるようにした。
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


## PR-011 pending state read helper

- 状態: done
- commit: `813fe37`
- 変更ファイル:
  - `js/GameManager.js`
  - `js/main.js`
  - `server.js`
  - `tests/gamemanager.test.js`
  - `tests/main.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `GameManager.pendingActionsFor(game)` と instance wrapper `pendingActions()` を追加した。
  - pending IT の優先順を維持しつつ、TV/Business/Cleaning/Mover/Renovation を descriptor として読み取れるようにした。
  - `allowedActionsFor`、server pending payload gate、CPU pending処理の読み取りを helper 経由へ寄せた。
- 実行テスト:
  - `node --check js/GameManager.js`
  - `node --check js/main.js`
  - `node --check server.js`
  - `node tests/gamemanager.test.js`
  - `node tests/main.test.js`
  - `node tests/server.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: なし。


## PR-012 reset turn / pending helpers

- 状態: done
- commit: `b28a189`
- 変更ファイル:
  - `js/GameManager.js`
  - `js/storage.js`
  - `js/online.js`
  - `server.js`
  - `tests/gamemanager.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - pending field 初期化を `resetPendingState()` に集約した。
  - turn開始時の log/dice/build/reroll/pending 初期化を `resetTurnState()` に寄せた。
  - ローカル保存復元、オンラインsnapshot復元、server mirror復元で helper を先に呼び、旧snapshotの欠落field補完を保った。
  - reset helper の保持/初期化境界を gamemanager test で固定した。
- 実行テスト:
  - `node --check js/GameManager.js`
  - `node --check js/storage.js`
  - `node --check js/online.js`
  - `node --check server.js`
  - `node --check tests/gamemanager.test.js`
  - `node tests/gamemanager.test.js`
  - `node tests/storage.test.js`
  - `node tests/online.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: なし。


## PR-013 action registry implementation scaffold

- 状態: done
- commit: `d6e3201`
- 変更ファイル:
  - `js/GameManager.js`
  - `server.js`
  - `tests/helpers/runtime-loaders.js`
  - `tests/server.test.js`
  - `tests/online.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `GAME_ACTION_REGISTRY` を追加し、action名、phase、payload kind、server payload/replay、client apply の存在metadataを持たせた。
  - server runtime / test runtime / online test runtime から registry を参照できるようにした。
  - server payload validator と mirror replay、client `applyAction` の網羅テストを registry と照合する形へ更新した。
  - 実際のaction実行switchは維持し、共通化は次段階に残した。
- 実行テスト:
  - `node --check js/GameManager.js`
  - `node --check server.js`
  - `node --check js/online.js`
  - `node --check tests/server.test.js`
  - `node --check tests/online.test.js`
  - `node tests/server.test.js`
  - `node tests/online.test.js`
  - `git diff --check`
  - `npm run test:online`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: server/client共通dispatch化は未実施。PR-013の範囲では registry 足場のみ。


## PR-014 CARD_DEFS scaffold

- 状態: done
- commit: `0219072`
- 変更ファイル:
  - `js/Card.js`
  - `tests/gamemanager.test.js`
  - `tests/helpers/runtime-loaders.js`
  - `docs/CARD_SYSTEM.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `CARD_DEFS` をカード定義の正本として追加した。
  - `CARD_NAME_BY_ID`, `CARD_ID_BY_NAME`, `CARDS` を `CARD_DEFS` から生成するようにした。
  - `CARDS` は従来どおり `Card` instance 配列として公開し、外部挙動と順序を維持した。
  - `CARD_DEFS` と `CARDS` / ID map の順序・対応を回帰テストで固定した。
  - `docs/CARD_SYSTEM.md` の新カード追加手順を `CARD_DEFS` 前提へ更新した。
- 実行テスト:
  - `node --check js/Card.js`
  - `node --check tests/gamemanager.test.js`
  - `node tests/gamemanager.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: なし。


## PR-015 card activation profile helper

- 状態: done
- commit: `1a49085`
- 変更ファイル:
  - `js/Card.js`
  - `js/GameManager.js`
  - `tests/gamemanager.test.js`
  - `tests/helpers/runtime-loaders.js`
  - `docs/CARD_SYSTEM.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `getCardActivationProfile(card)` を追加し、effect metadata と card color を組み合わせた発火profileを返すようにした。
  - `NORMAL` の青/緑は `targetScope: self`、赤は `targetScope: current` / `cpuKind: conditionalSteal` として明示した。
  - `LOAN` / `ITSTARTUP` の複合triggerを profile から読めるようにした。
  - `GameManager.cardActivationProfile(card)` の薄いwrapperを追加し、ルール層から同じprofileを参照できる足場を作った。
  - `docs/CARD_SYSTEM.md` に profile helper と NORMAL 色別補正を追記した。
- 実行テスト:
  - `node --check js/Card.js`
  - `node --check js/GameManager.js`
  - `node --check tests/gamemanager.test.js`
  - `node tests/gamemanager.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: 実際の発火dispatch本体は既存分岐のまま。後続PRでprofile参照箇所を広げる。


## PR-016 card id count helpers

- 状態: done
- commit: `PENDING_PR_016_HASH`
- 変更ファイル:
  - `js/Player.js`
  - `js/GameManager.js`
  - `tests/gamemanager.test.js`
  - `docs/CARD_SYSTEM.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `Player.countCardById(cardId)` と `countCardIncludingDormantById(cardId)` を追加した。
  - ID なしの旧カード/テスト用カードは `CARD_NAME_BY_ID` へ fallback して既存挙動を維持した。
  - チーズ工場、家具工場、フラワーショップ、ワイナリーの収入計算を ID 参照へ寄せた。
  - 紫カード重複チェックを dormant 込みの ID helper へ移し、旧形式カードでも名前から ID を補完するようにした。
  - `docs/CARD_SYSTEM.md` にカード枚数判定 helper の使用方針を追記した。
- 実行テスト:
  - `node --check js/Player.js`
  - `node --check js/GameManager.js`
  - `node --check tests/gamemanager.test.js`
  - `node tests/gamemanager.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: カテゴリ枚数系 handler は既存カテゴリ判定のまま。後続PRでカード定義metadataへ寄せる。
