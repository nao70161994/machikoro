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
  - `npm run test:online`
  - `npm run test:cpu`
  - `npm run test:rl`
  - `npm run test:pwa`
  - `node --check js/*.js`
  - `node --check server.js`
  - `python3 -m py_compile scripts/rl/*.py`
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
- commit: `91b18f3`
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


## PR-017 shopStock ID migration scaffold

- 状態: done
- commit: `e94b82a`
- 変更ファイル:
  - `js/Card.js`
  - `js/main.js`
  - `js/online.js`
  - `js/storage.js`
  - `server.js`
  - `tests/main.test.js`
  - `tests/online.test.js`
  - `tests/server.test.js`
  - `tests/storage.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - shop stock の読み書き用に `getShopStockCount`, `setShopStockCount`, `decrementShopStock`, `assignShopStockSnapshot` を追加した。
  - 保存形式は名前keyのまま維持しつつ、ID key の snapshot/undo state も名前keyへ復元できるようにした。
  - local/online/server mirror の初期化、復元、buildCard減算、server payload validation を helper 経由へ寄せた。
  - storage / online / server / main のテストで ID key stock と test runtime helper を固定した。
- 実行テスト:
  - `node --check js/Card.js`
  - `node --check js/main.js`
  - `node --check js/online.js`
  - `node --check js/storage.js`
  - `node --check server.js`
  - `node tests/storage.test.js`
  - `node tests/online.test.js`
  - `node tests/server.test.js`
  - `node tests/main.test.js`
  - `git diff --check`
  - `npm run test:online`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: CPU/RL/UI の直接 `shopStock[card.name]` 参照は後続PRで段階的に移行する。

## PR-018 CPU smoke coverage

- 状態: done
- commit: `323cfa6`
- 変更ファイル:
  - `package.json`
  - `tests/run-all.js`
  - `tests/cpu.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `cpu-smoke` test group を追加し、`MACHIKORO_CPU_SMOKE=1` で `cpu.test.js` の軽量subsetだけ実行できるようにした。
  - `test:smoke` に `node tests/run-all.js cpu-smoke` を追加した。
  - CPU pending 解決が pending phase に残らないこと、主要 pending field がクリアされることを軽量に検証した。
  - 全 CPU difficulty の `build()` が1呼び出しで終了し、手番を進めないことを smoke で固定した。
- 実行テスト:
  - `node --check tests/cpu.test.js`
  - `node --check tests/run-all.js`
  - `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`
  - `node tests/run-all.js cpu-smoke`
  - `node tests/cpu.test.js`
  - `git diff --check`
  - `npm run test:cpu`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: smoke では重い selfplay simulation は回さない。長時間のCPU品質確認は `npm run test:cpu` / `npm run test:sim` に残す。

## PR-019 CPU execution helper alignment

- 状態: done
- commit: `fe681ef`
- 変更ファイル:
  - `js/CPU.js`
  - `js/main.js`
  - `scripts/selfplay.js`
  - `tests/cpu.test.js`
  - `tests/selfplay.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - TV / Business / Mover / Renovation の CPU pending 解決を `CPU.choosePendingResolution()` へ集約した。
  - live `main.js` は共通 helper の結果を `cpuDo` で送信/適用し、旧テスト用 CPU stub でも動く fallback wrapper を残した。
  - simulation `CPU._runSimulationStep` と selfplay の軽量/trace 経路を同じ pending 解決 helper へ寄せた。
  - selfplay trace では共通 helper の選択結果から TV / Business / Mover / Renovation の action label と business stat を記録するようにした。
  - helper が未対応 pending（Cleaning / IT）を飛ばして後続 pending を処理しないことを固定した。
- 実行テスト:
  - `node --check js/CPU.js`
  - `node --check js/main.js`
  - `node --check scripts/selfplay.js`
  - `node --check tests/cpu.test.js`
  - `node --check tests/selfplay.test.js`
  - `node tests/cpu.test.js`
  - `node tests/selfplay.test.js`
  - `node tests/main.test.js`
  - `git diff --check`
  - `npm run test:cpu`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: Cleaning / IT の pending 解決は既存経路のまま。PR-019 の範囲外として、後続で必要になった時に同じ helper へ拡張する。

## PR-020 CPU build action result

- 状態: done
- commit: `a700e89`
- 変更ファイル:
  - `js/CPU.js`
  - `js/RLCPU.js`
  - `js/main.js`
  - `tests/main.test.js`
  - `tests/cpu.test.js`
  - `tests/rlcpu.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `CPU.build()` が建設成功 `true`、建設なし `null`、送信/適用失敗 `false` を返すようにした。
  - `CPU._buyCard()` / `_buyLandmark()` が local build と online `sendAction` の成否を記録して返すようにした。
  - `RLCPU.build()` も同じ success/failure/null の戻り値へ揃えた。
  - `main.js` の CPU build phase は `false` を受けた場合に後続 step、特に `nextTurn` へ進まないようにした。
  - CPU / RLCPU / main scheduler の回帰テストを追加した。
- 実行テスト:
  - `node --check js/CPU.js`
  - `node --check js/RLCPU.js`
  - `node --check js/main.js`
  - `node --check tests/cpu.test.js`
  - `node --check tests/main.test.js`
  - `node --check tests/rlcpu.test.js`
  - `node tests/main.test.js`
  - `node tests/cpu.test.js`
  - `node tests/rlcpu.test.js`
  - `git diff --check`
  - `npm run test:cpu`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: build 戻り値は `true/false/null` の軽量な結果に留めた。購入種別や理由の詳細 result object 化は後続の診断/ログ強化で扱う。


## PR-021 CPU tuning extraction scaffold

- 状態: done
- commit: `3bec7e1`
- 変更ファイル:
  - `js/cpuTuning.js`
  - `js/CPU.js`
  - `index.html`
  - `scripts/selfplay.js`
  - `tests/cpu.test.js`
  - `tests/helpers/runtime-loaders.js`
  - `tests/helpers/integration-runtime.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - expert preset / profile tuning / expert option 既定値を `js/cpuTuning.js` へ分離した。
  - `CPU.js` は外部 table を参照して tuning と v2simple の既定 mode を解決するようにした。
  - browser script order と Node/vm test runtime の読み込み順を `cpuTuning.js` → `CPU.js` に揃えた。
  - selfplay runtime も同じ読み込み順へ更新した。
  - CPU tuning scaffold が外部 table から preset と v2simple 既定 option を読むことをテストで固定した。
- 実行テスト:
  - `node --check js/cpuTuning.js`
  - `node --check js/CPU.js`
  - `node --check tests/cpu.test.js`
  - `node --check tests/helpers/runtime-loaders.js`
  - `node --check tests/helpers/integration-runtime.js`
  - `node --check scripts/selfplay.js`
  - `node tests/cpu.test.js`
  - `node tests/main.test.js`
  - `node tests/selfplay.test.js`
  - `git diff --check`
  - `npm run test:cpu`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: tuning の意味説明や各 profile の用途整理は、後続の docs / CPU 診断強化で扱う。


## PR-022 PWA banner and z-index scale

- 状態: done
- commit: `50dbacc`
- 変更ファイル:
  - `style.css`
  - `index.html`
  - `js/appShell.js`
  - `tests/main.test.js`
  - `docs/maintenance-checklists.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `#pwaUpdateBanner` と `#pwaInstallBanner` を共通 `pwa-banner` class へ揃え、更新バナーにも CSS を適用した。
  - `style.css` に PWA / pending / turn announcer / modal / crash の z-index scale をコメント付きで定義した。
  - PWA バナーの z-index を modal より下に下げ、ゲーム中 modal を覆わない階層へ整理した。
  - appShell の install banner 表示/非表示を小さな helper 経由へ寄せた。
  - PWA checklist と main test に z-index scale / update banner CSS の確認を追加した。
- 実行テスト:
  - `node --check js/appShell.js`
  - `node --check tests/main.test.js`
  - `npm run test:pwa`
  - `node tests/main.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: 実ブラウザでの更新バナー表示は自動テストでは DOM/CSS の静的確認まで。Service Worker 更新通知の見た目は次回PWA手動確認で見る。


## PR-023 appShell offline button selectors

- 状態: done
- commit: `ca4cbcd`
- 変更ファイル:
  - `index.html`
  - `js/appShell.js`
  - `tests/main.test.js`
  - `tests/helpers/integration-runtime.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - オンラインの作成/参加 submit button に `onlineCreateSubmitButton` / `onlineJoinSubmitButton` を追加した。
  - `updateOnlineTabState()` が構造依存の `#onlineCreate button` / `#onlineJoin button` ではなく専用 id を見るようにした。
  - main / integration runtime fixture を専用 id へ更新し、HTML 側の id 存在もテストで固定した。
- 実行テスト:
  - `node --check js/appShell.js`
  - `node --check tests/main.test.js`
  - `node --check tests/helpers/integration-runtime.js`
  - `node tests/main.test.js`
  - `npm run test:pwa`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: なし。


## PR-024 showNotice helper

- 状態: done
- commit: `c96704a`
- 変更ファイル:
  - `js/ui.js`
  - `js/main.js`
  - `js/storage.js`
  - `js/online.js`
  - `tests/ui.test.js`
  - `tests/storage.test.js`
  - `tests/online.test.js`
  - `tests/main.test.js`
  - `tests/helpers/integration-runtime.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - 通知入口として `showNotice()` を追加し、現段階では既存挙動を保つ `alert` fallback にした。
  - RLモデル読み込み失敗、保存/再接続データ読み込み失敗、オンライン作成/参加の入力エラーを `showNotice()` 経由へ置換した。
  - ui/storage/online/main のテスト fixture を更新し、`showNotice` fallback を回帰テストで固定した。
- 実行テスト:
  - `node --check js/ui.js`
  - `node --check js/main.js`
  - `node --check js/storage.js`
  - `node --check js/online.js`
  - `node --check tests/ui.test.js`
  - `node --check tests/storage.test.js`
  - `node --check tests/online.test.js`
  - `node --check tests/main.test.js`
  - `node --check tests/helpers/integration-runtime.js`
  - `node tests/ui.test.js`
  - `node tests/storage.test.js`
  - `node tests/online.test.js`
  - `node tests/main.test.js`
  - `npm run test:pwa`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: 専用 notice modal の UI 実装は後続PRで扱う。今回は fallback 経由で既存挙動を維持した。


## PR-025 pending UI event delegation scaffold

- 状態: done
- commit: `2dc6966`
- 変更ファイル:
  - `js/ui.js`
  - `js/main.js`
  - `tests/ui.test.js`
  - `tests/main.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - pending modal の主要解決ボタンを inline `onResolve*` 呼び出しから `data-action` / `data-*` 属性へ移行した。
  - `main.js` に pending action 用の delegated click handler を追加し、起動時に一度だけ `pendingMenu` へ登録するようにした。
  - TV pending の HTML が `data-action` を出すこと、delegated click が既存の `onResolveTV` 経路を呼ぶことをテストで固定した。
- 実行テスト:
  - `node --check js/ui.js`
  - `node --check js/main.js`
  - `node --check tests/ui.test.js`
  - `node --check tests/main.test.js`
  - `node tests/ui.test.js`
  - `node tests/main.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: ビジネスセンターのカード選択チップと build menu の inline handler は別PRで扱う。


## PR-026 render side-effect split scaffold

- 状態: done
- commit: `58c79a4`
- 変更ファイル:
  - `js/ui.js`
  - `tests/ui.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `_render()` の勝利処理を `renderWinnerState()` へ分離した。
  - 通常ゲーム中の描画処理を `renderActiveGameState()` へ分離した。
  - render 後の保存境界を `persistAfterRender()` に切り出し、通常描画後だけ呼ぶ既存順序を維持した。
  - UIテストで helper の存在と保存境界呼び出しを固定した。
- 実行テスト:
  - `node --check js/ui.js`
  - `node --check tests/ui.test.js`
  - `node --check tests/storage.test.js`
  - `node tests/ui.test.js`
  - `node tests/storage.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: render 内の coin animation / build menu / autoskip のさらなる細分化は後続のUI分離で扱う。


## PR-027 server section markers and test-only exports note

- 状態: done
- commit: `25bf5fe`
- 変更ファイル:
  - `server.js`
  - `docs/ARCHITECTURE.md`
  - `docs/AI_MAINTENANCE_ISSUES.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `server.js` に Room lifecycle / Socket events / Snapshot / Mirror replay / Validation / Test exports の section marker を追加した。
  - architecture docs に section marker が将来の抽出単位を示す保守用目印であり、実行時境界ではないことを追記した。
  - `server.js` exports は外部APIではなく主に test-only hook であることを docs に明記した。
- 実行テスト:
  - `node --check server.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:smoke`
  - `npm test`
- 残課題: PR-028 以降で section marker に沿って validation / mirror replay を実ファイルへ段階抽出する。


## PR-028 action validation extraction

- 状態: done
- commit: `17f5360`
- 変更ファイル:
  - `server.js`
  - `server/actionValidation.js`
  - `tests/server.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - server の payload validation helper 群を `server/actionValidation.js` へ factory として分離した。
  - `server.js` 側には socket event / room lifecycle / actor authority / phase gate を残し、action payload 判定だけを外部 helper へ委譲した。
  - action registry coverage test が新しい validation source を読むように更新し、registry と validator / mirror replay の整合性確認を維持した。
- 実行テスト:
  - `node --check server/actionValidation.js`
  - `node --check server.js`
  - `node --check tests/server.test.js`
  - `node tests/server.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:online`
  - `npm run test:smoke`
  - `npm test`
- 残課題: mirror replay の分離は PR-029 で扱う。


## PR-029 mirror replay extraction

- 状態: done
- commit: `6295c92`
- 変更ファイル:
  - `server.js`
  - `server/mirrorReplay.js`
  - `tests/server.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - mirror state の serialize / restore / compact と replay 適用を `server/mirrorReplay.js` へ分離した。
  - `server.js` には VM runtime 読込、Socket.IO entrypoint、room lifecycle、action authority validation を残した。
  - registry coverage test が新しい mirror replay source を読むように更新し、action registry と replay switch の整合性確認を維持した。
- 実行テスト:
  - `node --check server/mirrorReplay.js`
  - `node --check server.js`
  - `node --check tests/server.test.js`
  - `node tests/server.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:online`
  - `npm run test:smoke`
  - `npm test`
- 残課題: server-side dice と canonical mirror の設計・試作は PR-030 / PR-031 で扱う。


## PR-030 server-side dice design and prototype

- 状態: done
- commit: `5c4a79b`
- 変更ファイル:
  - `docs/ONLINE_SYNC.md`
  - `server.js`
  - `js/main.js`
  - `tests/server.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `ONLINE_SYNC.md` に live room の dice authority と restore replay 互換境界を明記した。
  - online の `rollDice` / `selectDice` / `rerollDice` で server が accepted action 用の出目を生成する prototype を追加した。
  - client 側の人間操作は online dice action で placeholder を送信し、ack / broadcast で server 確定出目を適用する流れにした。
  - server test で client dice が server dice へ置き換わることと deterministic roller による select/reroll 生成を固定した。
- 実行テスト:
  - `node --check server.js`
  - `node --check js/main.js`
  - `node --check tests/server.test.js`
  - `node tests/server.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:online`
  - `npm run test:smoke`
  - `npm test`
- 残課題: server restart restore の過去 actionLog 内 dice は replay 互換のため引き続き検証対象。完全な競技運用には PR-031 の canonical mirror / state hash が必要。

## PR-031 server canonical mirror experiment

- 状態: done
- commit: `48c24d1`
- 変更ファイル:
  - `server.js`
  - `tests/server.test.js`
  - `docs/ONLINE_SYNC.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - live room に in-memory canonical mirror を保持し、accepted action ごとに増分適用する経路を追加した。
  - snapshot/actionLog の進行 marker で canonical mirror の stale 判定を行い、外部から actionLog が更新された場合は安全に再構築するようにした。
  - validation は canonical mirror を優先し、actionLog replay は復元/再構築時の補助経路へ下げた。
  - server test で actionLog replay なしに accepted action が次の validation へ反映されることを固定した。
- 実行テスト:
  - `node --check server.js`
  - `node --check tests/server.test.js`
  - `node tests/server.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:online`
  - `npm run test:smoke`
  - `npm test`
- 残課題: canonical mirror は in-memory 実験段階のため、再接続/Undo/host移譲の手動長時間確認は TESTPLAN.md ベースで継続する。

## PR-032 pendingActions queue migration

- 状態: done
- commit: `be33889`
- 変更ファイル:
  - `js/GameManager.js`
  - `js/CPU.js`
  - `js/online.js`
  - `js/storage.js`
  - `server/mirrorReplay.js`
  - `tests/gamemanager.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - 既存の `pendingTV` などを互換 field として残しつつ、内部 queue `pendingActionQueue` を dual-write する足場を追加した。
  - 保存/online/server mirror snapshot には schema 名 `pendingActions` として queue を含め、旧 snapshot は field から queue を再構築できるようにした。
  - CPU simulation clone でも pending queue を引き継ぎ、pending 解決順の互換性を維持した。
  - GameManager test で enqueue/consume と field fallback/rebuild の挙動を固定した。
- 実行テスト:
  - `node --check js/GameManager.js`
  - `node --check js/storage.js`
  - `node --check js/online.js`
  - `node --check js/CPU.js`
  - `node --check server/mirrorReplay.js`
  - `node --check tests/gamemanager.test.js`
  - `node tests/gamemanager.test.js`
  - `node tests/server.test.js`
  - `node tests/online.test.js`
  - `node tests/cpu.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:online`
  - `npm run test:smoke`
  - `npm test`
  - `npm run test:cpu`
- 残課題: 実処理の主読み取りはまだ互換 descriptor 経由。field 削減は後続PRで小分けに進める。

## PR-033 RL state/action schema v2 design

- 状態: done
- commit: `dede0f0`
- 変更ファイル:
  - `docs/CPU_AI.md`
  - `docs/rl-experiments.md`
  - `js/RLCPU.js`
  - `scripts/rl/encode.py`
  - `tests/rlcpu.test.js`
  - `tests/rl-train.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - JS runtime に state/action schema identifier と `resolveModelSchema()` を追加し、既存モデルは未指定なら v1 schema として扱う互換層を用意した。
  - Python encoder に同じ schema identifier と `state_schema_for_dim()` を追加し、JS/Python で同じ文字列を使えるようにした。
  - `CPU_AI.md` と `rl-experiments.md` に v2 draft の境界、Business factorization、overflow feature、既存 portfolio 互換方針を記録した。
  - RLCPU / rl-train tests で schema helper と draft action schema の公開を固定した。
- 実行テスト:
  - `node --check js/RLCPU.js`
  - `node --check tests/rlcpu.test.js`
  - `node --check tests/rl-train.test.js`
  - `python3 -m py_compile scripts/rl/encode.py`
  - `node tests/rlcpu.test.js`
  - `node tests/rl-train.test.js`
  - `git diff --check`
  - `npm run test:static`
  - `npm run test:rl`
  - `npm run test:smoke`
  - `npm test`
- 残課題: v2 draft は識別子と設計のみ。実際の入力次元追加、Business head 変更、portfolio更新は既存モデルと別 lineage の後続作業に分ける。


## Post-audit online canonical mirror diagnostics

- 状態: done
- commit: `eb1c3db`
- 変更ファイル:
  - `server.js`
  - `tests/server.test.js`
  - `docs/ONLINE_SYNC.md`
  - `docs/POST_IMPLEMENTATION_AUDIT.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - canonical mirror の current marker に deterministic state hash を保存するようにした。
  - stale rebuild 時に、保存済み hash と in-memory mirror hash がズレた場合だけ `lastCanonicalMirrorMismatch` と server warning を残す診断を追加した。
  - 通常の actionLog 伸長による stale rebuild は警告しない。
- 実行テスト:
  - `node --check server.js`
  - `node --check tests/server.test.js`
  - `npm run test:online`
- 残課題: 長時間の再接続 / Undo / host 移譲 / server restart restore は TESTPLAN.md に沿った手動確認が必要。


## Post-audit pendingIT queue policy

- 状態: done
- commit: `58fdb11`
- 変更ファイル:
  - `js/GameManager.js`
  - `tests/helpers/runtime-loaders.js`
  - `tests/gamemanager.test.js`
  - `docs/CARD_SYSTEM.md`
  - `docs/POST_IMPLEMENTATION_AUDIT.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `PENDING_IT_QUEUE_POLICY` を追加し、`pendingIT` は queue 外の優先 special case として継続する方針をコード上で固定した。
  - `pendingActionsFor()` は policy を参照して `resolveIT` を返し、`serializedPendingActionsFor()` には `pendingIT` を含めないことをテストで固定した。
  - `CARD_SYSTEM.md` に新しい interactive 効果は `PENDING_ACTION_SPECS` に追加し、IT だけ例外にする運用を記録した。
- 実行テスト:
  - `node --check js/GameManager.js`
  - `node --check tests/helpers/runtime-loaders.js`
  - `node --check tests/gamemanager.test.js`
  - `node tests/gamemanager.test.js`
- 残課題: field fallback 削減は pending action 種別ごとに後続で進める。


## Post-audit pending queue read path

- 状態: done
- commit: `ace13fb`
- 変更ファイル:
  - `js/GameManager.js`
  - `tests/gamemanager.test.js`
  - `docs/CARD_SYSTEM.md`
  - `docs/POST_IMPLEMENTATION_AUDIT.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `ensurePendingActionQueue()` を追加し、queue が欠落または不整合な場合は互換 field から補修してから読み取るようにした。
  - `pendingActionsFor()` と `serializedPendingActionsFor()` を queue read path に寄せた。
  - 旧 snapshot / 古い保存データ用の互換 field は残しつつ、通常の read は補修済み queue を正として扱う。
- 実行テスト:
  - `node --check js/GameManager.js`
  - `node --check tests/gamemanager.test.js`
  - `node tests/gamemanager.test.js`
- 残課題: 互換 field の削除は save/online/server mirror の schema 互換期間を置いてから別PRで判断する。


## Post-audit RL schema mismatch guard

- 状態: done
- commit: `a9b5a73`
- 変更ファイル:
  - `js/RLCPU.js`
  - `tests/rlcpu.test.js`
  - `docs/CPU_AI.md`
  - `docs/rl-experiments.md`
  - `docs/POST_IMPLEMENTATION_AUDIT.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `RLCPU` constructor で schema compatibility を検証し、`stateDim` と metadata の不一致を拒否するようにした。
  - 現行 runtime が対応する action schema を `action-flat-v1` に限定し、v2 draft action schema の実行時読み込みを拒否する guard を追加した。
  - docs に v2 draft は別 lineage で導入するまで実ゲームへ接続しない方針を追記した。
- 実行テスト:
  - `node --check js/RLCPU.js`
  - `node --check tests/rlcpu.test.js`
  - `node tests/rlcpu.test.js`
- 残課題: v2 schema 本体、新しい action head、registry / portfolio 更新は未実装。


## Post-audit final residual triage

- 状態: done
- commit: `225184e`
- 変更ファイル:
  - `docs/POST_IMPLEMENTATION_AUDIT.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - High / Medium / Low の残課題を再分類し、対応済み Medium を残課題から移動した。
  - 実ブラウザ長時間確認が必要な canonical mirror 手動回帰だけを Medium deferred として残した。
  - 巨大ファイル分割、effect dispatch 本体移行、UI handler 分離は既存挙動を守るため Low deferred とし、次アクションを明記した。
- 実行テスト:
  - docs-only 変更のため最終一括確認で実行
- 残課題: 実ブラウザ複数端末の長時間オンライン手動回帰は docs/CANONICAL_MIRROR_MANUAL_TEST.md に沿った実機実施待ち。


## Post-audit deferred residual reduction

- 状態: done
- commit: `225184e`
- 変更ファイル:
  - `server/roomLifecycle.js`
  - `server.js`
  - `js/Card.js`
  - `js/GameManager.js`
  - `js/ui.js`
  - `js/main.js`
  - `tests/main.test.js`
  - `style.css`
  - `docs/CANONICAL_MIRROR_MANUAL_TEST.md`
  - `docs/UI_REFACTOR.md`
  - `docs/EFFECT_DISPATCH_MIGRATION.md`
  - `docs/POST_IMPLEMENTATION_AUDIT.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - PR-031 canonical mirror の実ブラウザ手動回帰について、再接続、Undo、host移譲、server restart restore、長時間プレイの再現手順とログ確認方法を追加した。
  - server room lifecycle の TTL / create rate limit helper を `server/roomLifecycle.js` へ抽出し、`server.js` の socket event 本体から分離した。
  - income 系 `CARD_EFFECT_METADATA` に `incomeHandler` を追加し、`GameManager` の income handler table を metadata から生成するようにした。
  - build menu と player panel の一部 inline handler を `data-action` delegated handler へ移行し、main 側の handler を pending / build / player panel で共有できる形にした。
  - UI と effect dispatch の後続移行順を docs に固定した。
- 実行テスト:
  - node --check server.js
  - node --check server/roomLifecycle.js
  - node --check js/Card.js
  - node --check js/GameManager.js
  - node --check js/ui.js
  - node --check js/main.js
  - node --check tests/main.test.js
  - node --check tests/gamemanager.test.js
  - node --check tests/ui.test.js
  - node tests/main.test.js
  - node tests/server.test.js
  - node tests/gamemanager.test.js
  - node tests/ui.test.js
  - git diff --check
  - npm run test:static
  - npm run test:online
  - npm run test:smoke
  - npm test
  - npm run test:cpu
  - npm run test:rl
- 残課題: 実ブラウザ複数端末の長時間オンライン手動回帰そのものは、この環境では manual verification required。


## Phase A PWA RL model loading and SW fetch tests

- 状態: done
- commit: dbd3543
- 変更ファイル:
  - `sw.js`
  - `tests/sw.test.js`
  - `tests/run-all.js`
  - `docs/PWA_MODEL_LOADING.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
  - `docs/POST_IMPLEMENTATION_AUDIT.md`
- 実装内容:
  - Service Worker install/update の optional precache から RL portfolio model JSON を外し、app shell の軽量 asset だけを precache するようにした。
  - `/models/rl_model/portfolio/*.browser.json` は fetch 時に cache-first の runtime cache として扱い、RL CPU 選択時だけ取得される境界にした。
  - Service Worker の install / RL model runtime cache / HTML offline fallback / socket.io 除外を `tests/sw.test.js` で実行テスト化し、PWA test group に追加した。
  - `docs/PWA_MODEL_LOADING.md` に model loading 方針と手動確認観点を追加した。
- 実行テスト:
  - `node --check sw.js`
  - `node --check tests/sw.test.js`
  - `node tests/sw.test.js`
  - `npm run test:pwa`
- 残課題: 実ブラウザ Network panel で install/update 時に RL model JSON が先読みされず、RL CPU 選択時だけ取得されることは manual verification required。


## Phase A accessibility baseline

- 状態: done
- commit: af3a5d1
- 変更ファイル:
  - `index.html`
  - `js/ui.js`
  - `style.css`
  - `tests/helpers/test-utils.js`
  - `tests/main.test.js`
  - `tests/ui.test.js`
  - `docs/ACCESSIBILITY_GUIDE.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
  - `docs/POST_IMPLEMENTATION_AUDIT.md`
- 実装内容:
  - rules / card select / card detail / confirm modal に dialog semantics を追加し、共通 modal helper で初期フォーカス、Tab trap、Esc close、フォーカス復帰を扱うようにした。
  - pending modal はゲーム進行上閉じられない overlay として role/aria は付けつつ Esc close 対象から外した。
  - `showNotice()` を non-blocking toast 優先に変更し、DOM が無い旧環境だけ alert fallback にした。
  - `:focus-visible` と `prefers-reduced-motion` を追加した。
  - modal / notice / accessibility CSS の静的・UI targeted tests を追加した。
  - `docs/ACCESSIBILITY_GUIDE.md` に追加 UI のルールと手動確認項目を追加した。
- 実行テスト:
  - `node --check js/ui.js`
  - `node --check tests/main.test.js`
  - `node --check tests/ui.test.js`
  - `node tests/ui.test.js`
  - `node tests/main.test.js`
  - `git diff --check`
- 残課題: 実ブラウザでキーボードのみ操作、スクリーンリーダー向け状態、reduced motion、モバイル低画面での notice / modal 重なりは manual verification required。


## Phase B online recovery cleanup and rank diagnostics

- 状態: done
- commit: b6a6ff0
- 変更ファイル:
  - `js/storage.js`
  - `js/main.js`
  - `server.js`
  - `tests/storage.test.js`
  - `tests/server.test.js`
  - `docs/ONLINE_RECOVERY.md`
  - `docs/HOSTLESS_RESTORE_DESIGN.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
  - `docs/POST_IMPLEMENTATION_AUDIT.md`
- 実装内容:
  - `onlineSession` 削除時に `onlineGameStart` / `onlineActionLog` / `onlineStateSnapshot` / `onlinePendingAction` も削除する helper を追加した。
  - 壊れた再接続 session の破棄時も restore bundle を同時に削除するようにした。
  - `restorePayloadRankDetails()` を追加し、rank の内訳（gameStartSeq / snapshotSeq / logSeq / replayedActionSeq / source）を診断できるようにした。
  - host 不在 restore は即実装せず、候補 bundle / grace window / hash 比較の設計を `docs/HOSTLESS_RESTORE_DESIGN.md` に固定した。
  - online recovery の cleanup と rank diagnostics 方針を `docs/ONLINE_RECOVERY.md` に追加した。
- 実行テスト:
  - `node --check js/storage.js`
  - `node --check js/main.js`
  - `node --check server.js`
  - `node --check tests/storage.test.js`
  - `node --check tests/server.test.js`
  - `node tests/storage.test.js`
  - `node tests/server.test.js`
- 残課題: hostless restore の実採用は破壊的な trust boundary 変更になり得るため、設計 docs と manual verification required に留めた。


## Phase C RL parity report

- 状態: done
- commit: 7c3c866
- 変更ファイル:
  - `scripts/rl/parity_report.py`
  - `tests/rl-train.test.js`
  - `docs/RL_PARITY.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
  - `docs/POST_IMPLEMENTATION_AUDIT.md`
- 実装内容:
  - Python RL 環境の既知近似を軽量に出力する `scripts/rl/parity_report.py` を追加した。
  - ワイナリーのカード実体処理と Python 集約近似の差分を gain / dormant count で明示した。
  - `tests/rl-train.test.js` に parity report の smoke assertion を追加した。
  - `docs/RL_PARITY.md` に JS 正本、Python 近似、trace 比較の使い分けを記録した。
- 実行テスト:
  - `python3 -m py_compile scripts/rl/*.py`
  - `python3 -m scripts.rl.parity_report --format text`
  - `node --check tests/rl-train.test.js`
  - `node tests/rl-train.test.js`
- 残課題: target head 採用モデルの新規学習 / portfolio 更新は既存採用モデルと別 lineage で進める。


## Phase D inline handler cleanup: dice choice

- 状態: done
- commit: 567d4eb
- 変更ファイル:
  - `js/main.js`
  - `js/ui.js`
  - `tests/main.test.js`
  - `docs/UI_REFACTOR.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `renderDiceChoose()` の駅 / 電波塔 / 港 UI から inline `onclick` を外し、`data-action` と `handleDiceChoiceClick()` に移行した。
  - build menu / pending menu と同じ `actionButtonFromEvent()` を使い、UI action の入口を main 側の delegated handler に寄せた。
  - harbor 選択の delegated handler test を追加した。
  - `docs/UI_REFACTOR.md` に残りの inline handler 削減順序を更新した。
- 実行テスト:
  - `node --check js/main.js`
  - `node --check js/ui.js`
  - `node --check tests/main.test.js`
  - `node tests/main.test.js`
  - `node tests/ui.test.js`
  - `git diff --check`
- 残課題: Business Center chip、card / landmark toggle、stats UI は DOM id と入力状態依存が残るため、別テーマで targeted test を追加してから移行する。


## Phase D inline handler cleanup: Business Center chips

- 状態: done
- commit: `a7a87f9`
- 変更ファイル:
  - `js/main.js`
  - `js/ui.js`
  - `tests/main.test.js`
  - `tests/ui.test.js`
  - `docs/UI_REFACTOR.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - Business Center のカード chip から inline `onclick` を外し、`data-action="selectBusinessCard"` を pending menu の delegated handler で処理するようにした。
  - `bcSelectCard()` は hidden input 更新と selected class 更新の既存 helper として維持し、挙動変更を避けた。
  - main / ui targeted tests で chip 選択と HTML 出力を確認した。
- 実行テスト:
  - `node --check js/main.js`
  - `node --check js/ui.js`
  - `node --check tests/main.test.js`
  - `node --check tests/ui.test.js`
  - `node tests/main.test.js`
  - `node tests/ui.test.js`
  - `git diff --check`
- 残課題: card / landmark toggle と stats UI の inline handler は残るため、次テーマで delegated handler 化する。


## Phase D inline handler cleanup: card select modal

- 状態: done
- commit: `973baea`
- 変更ファイル:
  - `index.html`
  - `js/ui.js`
  - `tests/main.test.js`
  - `tests/ui.test.js`
  - `docs/UI_REFACTOR.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - カード選択 modal のセット切替、個別カード toggle、ランドマーク toggle、決定ボタンから inline handler を外した。
  - `handleCardSelectModalClick()` と `bindCardSelectModalHandlers()` を追加し、modal 内 action を `data-action` で処理するようにした。
  - 既存の `toggleCard()` / `toggleSet()` / `toggleLandmark()` は維持し、挙動変更を避けた。
  - UI / static tests に data-action と inline handler 退避の assertion を追加した。
- 実行テスト:
  - `node --check js/ui.js`
  - `node --check tests/ui.test.js`
  - `node --check tests/main.test.js`
  - `node tests/ui.test.js`
  - `node tests/main.test.js`
  - `git diff --check`
- 残課題: stats UI の inline handler が残るため、次テーマで delegated handler 化する。


## Phase D inline handler cleanup: stats UI

- 状態: done
- commit: `50661d7`
- 変更ファイル:
  - `js/stats.js`
  - `tests/stats.test.js`
  - `docs/UI_REFACTOR.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - 統計画面の view mode、プレイヤー/CPU filter、filter解除、統計リセットから inline `onclick` を外した。
  - `handleStatsClick()` / `bindStatsHandlers()` を追加し、`tabContentStats` 内 action を `data-action` で処理するようにした。
  - stats targeted tests を data-action 前提に更新し、click handler の表示切替と clear を検証した。
- 実行テスト:
  - `node --check js/stats.js`
  - `node --check tests/stats.test.js`
  - `node tests/stats.test.js`
  - `git diff --check`
- 残課題: renderPending の helper 分離と、index.html の静的 inline handler 削減は別テーマで扱う。


## Phase D inline handler cleanup: static shell controls

- 状態: done
- commit: `2b59061`
- 変更ファイル:
  - `index.html`
  - `js/main.js`
  - `tests/main.test.js`
  - `docs/UI_REFACTOR.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `index.html` の静的 click / input / change inline handler を `data-ui-action` / `data-ui-input` / `data-ui-change` に置き換えた。
  - `main.js` に static UI 用 document delegated handler を追加し、既存 global 関数へ薄く橋渡しする形にした。
  - 既存のゲーム内 `data-action` namespace とは分離し、build / pending / dice handler と衝突しないようにした。
  - main targeted tests で static action、input、change の処理と index.html からの inline handler 消滅を確認した。
- 実行テスト:
  - `node --check js/main.js`
  - `node --check tests/main.test.js`
  - `node tests/main.test.js`
  - `git diff --check`
- 残課題: `renderPlayerSettings()` と `renderOnlinePlayerSettings()` の動的 select/input inline handler は残るため、次テーマで delegated handler 化する。


## Phase D inline handler cleanup: player settings

- 状態: done
- commit: `a434e2f`
- 変更ファイル:
  - `js/main.js`
  - `js/online.js`
  - `tests/main.test.js`
  - `tests/online.test.js`
  - `docs/UI_REFACTOR.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `renderPlayerSettings()` の player type select と player name input から inline handler を外し、static UI delegated handler の `data-ui-change` / `data-ui-input` に接続した。
  - `renderOnlinePlayerSettings()` の player type select も `data-ui-change="onlinePlayerType"` に移行した。
  - main / online targeted tests で local settings の変更反映と online settings HTML の inline handler 退避を確認した。
- 実行テスト:
  - `node --check js/main.js`
  - `node --check js/online.js`
  - `node --check tests/main.test.js`
  - `node --check tests/online.test.js`
  - `node tests/main.test.js`
  - `node tests/online.test.js`
  - `git diff --check`
- 残課題: 既知の動的 inline handler は解消済み。次は renderPending の helper 分離へ進む。


## Phase D ui renderPending helper split

- 状態: done
- commit: `2689c77`
- 変更ファイル:
  - `js/ui.js`
  - `tests/ui.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
  - `docs/POST_IMPLEMENTATION_AUDIT.md`
- 実装内容:
  - `renderPending()` から pending UI の表示可否判定と modal content 更新を helper に分離した。
  - pending 種別ごとの HTML は挙動差分リスクが高いため、このテーマでは文字列構造を維持した。
  - UI targeted test に helper 存在確認を追加した。
- 実行テスト:
  - `node --check js/ui.js`
  - `node --check tests/ui.test.js`
  - `node tests/ui.test.js`
  - `git diff --check`
- 残課題: pending 種別ごとの HTML helper 化は、snapshot 的な HTML assertion を増やしてから小分けで進める。


## Phase D CPU diagnostics split

- 状態: done
- commit: `ffb97dd`
- 変更ファイル:
  - `js/cpuDiagnostics.js`
  - `js/CPU.js`
  - `index.html`
  - `tests/helpers/runtime-loaders.js`
  - `tests/helpers/integration-runtime.js`
  - `scripts/selfplay.js`
  - `docs/CPU_AI.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - CPU の profile / trace 集計処理を `CPUDiagnostics` helper に分離した。
  - `CPU.js` 側の public / private method 名は維持し、既存テストや呼び出し側の互換性を保った。
  - ブラウザ script 順と Node runtime loader / selfplay runtime に `js/cpuDiagnostics.js` を追加した。
- 実行テスト:
  - `node --check js/cpuDiagnostics.js`
  - `node --check js/CPU.js`
  - `node tests/cpu.test.js`
  - `git diff --check`
- 残課題: evaluation / execution の分離は影響範囲が広いため、同等の helper 境界と targeted test を追加してから進める。


## Phase D effect metadata category group

- 状態: done
- commit: `96b5ef3`
- 変更ファイル:
  - `js/Card.js`
  - `js/GameManager.js`
  - `tests/helpers/runtime-loaders.js`
  - `tests/gamemanager.test.js`
  - `docs/EFFECT_DISPATCH_MIGRATION.md`
  - `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - `CARD_CATEGORY_GROUPS.RESTAURANT_OR_SHOP` と `isCardInCategoryGroup()` を追加した。
  - GameManager のショッピングモール / 出版社で使う飲食店・商店判定を category group helper へ寄せた。
  - カテゴリ判定 helper の targeted test を追加した。
- 実行テスト:
  - `node --check js/Card.js`
  - `node --check js/GameManager.js`
  - `node --check tests/gamemanager.test.js`
  - `node tests/gamemanager.test.js`
  - `git diff --check`
- 残課題: pending / steal / redistribute の dispatch registry 化は、発火順とログ文言への影響が大きいため別テーマで targeted test を増やしてから進める。


## Phase D server restore rank split

- 状態: done
- commit: `cce83c9`
- 変更ファイル:
  - `server/restoreRank.js`
  - `server.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
  - `docs/POST_IMPLEMENTATION_AUDIT.md`
  - `docs/AI_HANDOFF.md`
- 実装内容:
  - restore rank / restore replacement 判定を `server/restoreRank.js` に分離した。
  - `server.js` の test export 名と既存呼び出しは維持し、room lifecycle / recreateRoom 本体の挙動は変更していない。
  - restore rank details の source / replayedActionSeq 診断は既存 API のまま残した。
- 実行テスト:
  - `node --check server.js`
  - `node --check server/restoreRank.js`
  - `node tests/server.test.js`
  - `git diff --check`
- 残課題: hostless restore 本実装、server validation / socket handler の大きな分割、永続 room store は仕様判断と手動回帰が必要なため未実施。


## Phase D static inline handler regression guard

- 状態: done
- commit: `068e726`
- 変更ファイル:
  - `tests/main.test.js`
  - `sw.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
  - `docs/POST_IMPLEMENTATION_AUDIT.md`
- 実装内容:
  - 主要 HTML/JS に `onclick=` / `onchange=` / `oninput=` を再導入しない静的テストを追加した。
  - CPU diagnostics helper を script に追加した後の PWA precache 漏れを修正し、`/js/cpuDiagnostics.js` を `STATIC_ASSETS` に追加した。
- 実行テスト:
  - `node --check tests/main.test.js`
  - `node tests/main.test.js`
  - `git diff --check`
- 残課題: 実ブラウザでの Service Worker 更新バナーと cache refresh は manual verification required。

## Continuous review operating policy

- 状態: active policy
- 運用:
  - 1 Cycle 完了後は commit / push と working tree clean 確認を行い、停止条件に当たらない限り即座に次 Cycle を開始する。
  - 各 Cycle で前 Cycle の副作用確認とディレクトリ全体レビューを行う。
  - Low / Medium backlog だけになっても、安全に自動対応できるものが残る限り停止しない。
- 停止条件:
  - テスト失敗を3回自己修正しても直らない。
  - git conflict / push失敗。
  - 破壊的変更、実機確認、hostless restore / server persisted canonical state など設計判断が必要。
  - 自動で安全に対応できる指摘がなくなった。

## Continuous review Cycle 1 runtime/online safety

- 状態: verified, full suite passed
- 変更ファイル:
  - `js/main.js`
  - `js/GameManager.js`
  - `js/ui.js`
  - `server.js`
  - `tests/gamemanager.test.js`
  - `tests/main.test.js`
  - `tests/server.test.js`
  - `tests/ui.test.js`
- 実装内容:
  - 遅延 dice 操作に token / timeout id を追加し、`init()` / `restartGame()` 後に古い callback が action を実行しないようにした。
  - pending action queue は先頭 descriptor の action だけを許可するようにし、out-of-order な pending 解決を `GameManager` / server allowed action / UI 表示で揃えた。
  - 勝利済み canonical mirror に対する `nextTurn` / `undoBuild` などの online action を server validator で拒否するようにした。
- 実行テスト:
  - `node --check js/main.js`
  - `node --check js/GameManager.js`
  - `node --check js/ui.js`
  - `node --check server.js`
  - `node tests/gamemanager.test.js`
  - `node tests/main.test.js`
  - `node tests/ui.test.js`
  - `node tests/server.test.js`
- 残課題: action contract の統合、snapshot ownership の整理、server socket handler 分割は設計判断を伴うため Medium/design として継続管理する。

## Continuous review Cycle 2 restore replay winner guard

- 状態: implemented, targeted server tests passed
- 変更ファイル:
  - `server/mirrorReplay.js`
  - `tests/server.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
  - `docs/POST_IMPLEMENTATION_AUDIT.md`
  - `docs/AI_HANDOFF.md`
- 実装内容:
  - live validator の勝利後 action reject と同じ不変条件を restore replay 側にも追加した。
  - server restart restore / recreateRoom の actionLog replay で、終局後に続く `nextTurn` / `undoBuild` などの action を拒否する。
- 実行テスト:
  - `node --check server/mirrorReplay.js`
  - `node --check server.js`
  - `node tests/server.test.js`
- 残課題: eval script / RLCPU の pending queue 順追従は Medium として次 Cycle で安全性を確認する。

## Continuous review Cycle 2 pending queue parity

- 状態: implemented, targeted tests passed
- 変更ファイル:
  - `js/RLCPU.js`
  - `scripts/eval-expert-vs-weak.js`
  - `scripts/eval-expert-vs-normal.js`
  - `tests/rlcpu.test.js`
  - `tests/eval-expert-vs-weak.test.js`
  - `tests/eval-expert-vs-normal.test.js`
- 実装内容:
  - RLCPU の pending action mask を `GameManager.nextPendingActionFor()` に追従させ、queue 先頭以外の pending action を mask しないようにした。
  - expert eval fast path の pending 解決も queue 先頭 field を見るようにし、固定 field 順による空回りを避けた。
- 実行テスト:
  - `node --check js/RLCPU.js`
  - `node --check scripts/eval-expert-vs-weak.js`
  - `node --check scripts/eval-expert-vs-normal.js`
  - `node tests/rlcpu.test.js`
  - `node tests/eval-expert-vs-weak.test.js`
  - `node tests/eval-expert-vs-normal.test.js`


## Continuous review Cycle 3 UI/PWA accessibility contract

- 状態: implemented, targeted tests passed
- 変更ファイル:
  - `index.html`
  - `style.css`
  - `tests/main.test.js`
  - `docs/IMPLEMENTATION_PROGRESS.md`
  - `docs/POST_IMPLEMENTATION_AUDIT.md`
  - `docs/AI_HANDOFF.md`
- 実装内容:
  - `pendingModal` は背景操作を許す floating panel のため、`aria-modal=true` の dialog ではなく `role=region` へ変更した。
  - PWA waiting SW banner は表示時に message / disabled / opacity を既定状態へ戻してから、オンライン対戦中だけ更新ボタンを無効化するようにした。
  - PWA install/update banner に iPhone safe-area bottom padding を追加した。
- 実行テスト:
  - `node --check tests/main.test.js`
  - `node tests/main.test.js`
- 残課題: 実機 iPhone Safari / Android Chrome の PWA install/update banner 表示は manual verification required。


## Continuous review Cycle 3 online/RL safety fixes

- 状態: implemented, targeted tests passed
- 変更ファイル:
  - `js/GameManager.js`
  - `js/online.js`
  - `server.js`
  - `scripts/rl/game_env.py`
  - `scripts/rl/js_cpu_action_oracle.js`
  - `scripts/rl/js_cpu_oracle.py`
  - `scripts/rl/train.py`
  - `tests/gamemanager.test.js`
  - `tests/online.test.js`
  - `tests/rl-train.test.js`
  - `tests/server.test.js`
- 実装内容:
  - malformed restore snapshot 由来の非連続 `pendingRenovation` queue で auto-skip loop が止まらない可能性を guard した。
  - `rooms` を prototype-less map にし、roomId lookup / restore room lookup が prototype key を踏まないようにした。
  - accepted action payload を action ごとの whitelist で canonicalize し、余分な巨大 field を actionLog / broadcast / reconnect へ残さないようにした。
  - host migration 後、server 側 host 情報が古い場合でも、ローカル host bundle の rank が新しければ `recreateRoom` を送るようにした。
  - Python RL env / JS CPU oracle / JS eval export を pending queue・run-local export・oracle timeout に対応させた。
- 実行テスト:
  - `node --check server.js`
  - `node --check js/GameManager.js`
  - `node --check js/online.js`
  - `node --check scripts/rl/js_cpu_action_oracle.js`
  - `python3 -m py_compile scripts/rl/*.py`
  - `node tests/gamemanager.test.js`
  - `node tests/server.test.js`
  - `node tests/online.test.js`
  - `node tests/rl-train.test.js`
- 残課題: host-supplied restore snapshot の server signature / persisted canonical state は設計判断が必要。


## Continuous review Cycle 3 pendingActions schema hardening

- 状態: implemented, targeted tests passed; full suite covered by later release gates
- 実装内容:
  - snapshot `pendingActions` の action/field 固定対応と legacy pending count 一致を server mirror で検証するようにした。
  - client-side queue 正規化は action/field 不一致 entry を採用せず、count 不一致時は legacy pending fields から補修する。
  - CPU fallback / selfplay fallback の cleaning 解決を queue 先頭 action に限定した。
  - `docs/online-restore-schema.md` と `docs/CARD_SYSTEM.md` に pendingActions schema を追記した。

## Continuous review Cycle 4 eval fast path behavioral guard

- 状態: implemented, targeted tests passed
- 変更ファイル:
  - `scripts/eval-expert-vs-normal.js`
  - `scripts/eval-expert-vs-weak.js`
  - `tests/eval-expert-vs-normal.test.js`
  - `tests/eval-expert-vs-weak.test.js`
  - docs maintenance files
- 実装内容:
  - expert eval fast path に test-only probe を追加し、mixed pending queue で先頭 entry だけを解決する挙動を behavioral test で固定した。
  - 既存の source string assertion を、`[Cleaning, TV]` と `[TV, Cleaning]` の両順序を実行する検証へ置き換えた。
  - historical issue / roadmap docs に status note を追加し、既に対応済みの Critical/High を active backlog と誤読しないようにした。
- deferred:
  - host-supplied restore snapshot の server signature / persisted canonical state は design decision required。
  - ntfy endpoint の shared token / origin gate は production hardening backlog。
  - 実機 iPhone/Android の PWA / online restore 長時間確認は manual verification required。

## Continuous review Cycle 5 ntfy endpoint gate

- 状態: implemented, targeted tests passed
- 変更ファイル:
  - `server.js`
  - `tests/server.test.js`
  - `docs/NTFY_ERROR_REPORTING.md`
- 実装内容:
  - `POST /api/client-error` と `/api/client-error-test` に optional `CLIENT_ERROR_SHARED_TOKEN` gate を追加した。未設定時は既存どおり動く。
  - browser の `Origin` / `Referer` が cross-origin の場合は拒否し、same-origin と `CLIENT_ERROR_ALLOWED_ORIGINS` を許可する。
  - auth gate は rate limit / notify より前に評価し、不正tokenやcross-origin reportを通知へ流さない。

## Continuous review Cycle 5 RL eval simulator guard

- 状態: implemented, targeted tests passed
- 変更ファイル:
  - `scripts/eval-rl-vs-js.js`
  - `tests/eval-rl-vs-js.test.js`
- 実装内容:
  - RL 採用評価は fast/lite/lightweight 経路を使わない full-fidelity simulator 方針を `RL_EVAL_SIMULATION_MODE` と `buildRlEvalRunSeriesOptions()` で明示した。
  - `--fast` / `--lite` は現時点では CLI で採用せず、将来対応する場合はこの test を意図的に更新する。

## Continuous review Cycle 5 accessibility label pass

- 状態: implemented, targeted tests passed
- 変更ファイル:
  - `index.html`
  - `tests/main.test.js`
- 実装内容:
  - CPU速度 slider / online CPU速度 slider / player name / room id を programmatic label または describedby に紐付けた。
  - icon-only / empty-text buttons に `aria-label` を追加した。対象は保存削除、PWA dismiss、tutorial toggle、人数 +/-。
  - 既存 delegated handler / data-ui-action の契約は維持した。

## Continuous review Cycle 5 diagnostics helper split

- 状態: implemented, targeted tests passed
- 変更ファイル:
  - `scripts/diagnostics/expert-v2-branch-counters.js`
  - `scripts/diagnose-expert-v2-branches.js`
  - `tests/diagnose-expert-v2-branches.test.js`
- 実装内容:
  - `diagnose-expert-v2-branches.js` から counter 作成/合算/name counter 差分 helper を小さな CommonJS module へ分離した。
  - diagnostics 本体の実行フロー・CLI・出力形式は変更していない。

## Automated release pseudo-E2E gate

- 状態: implemented, targeted tests passed
- 変更ファイル:
  - `tests/release-e2e.test.js`
  - `tests/run-all.js`
  - `package.json`
  - `docs/AUTOMATED_RELEASE_TEST.md`
- 実装内容:
  - Playwright 依存は追加せず、既存 Node/vm harness で `npm run test:release` を追加した。
  - iPhone Safari / Android Chrome 相当 profile、safe-area / viewport / touch 前提、client-error capture、ntfy test endpoint mock、PWA install/update、SW lifecycle、modal focus/Esc、server restart restore / host migration、短縮 long-run snapshot roundtrip を release gate にまとめた。
  - `docs/AUTOMATED_RELEASE_TEST.md` に automated / partial / manual only の分類と release command set を追加した。
- manual only:
  - 実 iOS Safari / Android Chrome の rendering、native install UI、multi-tab SW update、実 ntfy delivery、実ネットワークでの複数端末 reconnect は手動確認が必要。


## Continuous review Cycle 6 maintainability and runtime guards

- 状態: implemented, full suite passed and pushed in commit 3494324.
- 変更ファイル:
  - `js/online.js`, `tests/online.test.js`
  - `server.js`, `tests/server.test.js`
  - `sw.js`, `tests/sw.test.js`
  - `js/confetti.js`, `tests/confetti.test.js`, `tests/run-all.js`
  - `scripts/eval-rl-models.js`, `tests/eval-rl-models.test.js`
  - `.github/workflows/release-test.yml`, `tests/release-e2e.test.js`
  - docs maintenance files
- 実装内容:
  - Socket.IO script 未読込時の `initSocket()` を早期 return にし、online state を半端に初期化しないようにした。
  - 接続中の現ホストがいる復元済み room は、非ホストが高い `hostEpoch` を名乗っても置き換えない。現ホスト不在時の既存 fallback は維持した。
  - Service Worker activate の `clients.claim()` を `waitUntil` 内へ入れ、RL model JSON は network-first + cached fallback にした。
  - `prefers-reduced-motion` 時は confetti interval を開始しない。
  - release CI に `npm run test:static` を追加し、release pseudo-E2E test で gate 順序を固定した。
  - `eval-rl-models` は既定で全モデルを同じ seed schedule / `sharedSeeds` で比較し、必要時だけ `--independent-seeds` で従来の分離 seed window を使う。
- deferred:
  - CPU.js / ui.js / server.js の大きな責務分離は、今回の Cycle では behavior guard と docs 整合を優先した。次回も helper 単位で進める。
  - host-supplied snapshot の署名 / server persisted canonical state は design decision required。
  - 実 iOS Safari / Android Chrome の長時間 online/PWA 確認は manual verification required。


## Continuous review Cycle 7 restore/RL/PWA gate hardening

- 状態: implemented, full verification passed in later release gates.
- 変更ファイル:
  - `server.js`, `server/restoreRank.js`, `tests/server.test.js`
  - `js/RLCPU.js`, `scripts/rl/export_model.py`, `tests/rlcpu.test.js`, `tests/rl-model-portfolio.test.js`, `tests/rl-train.test.js`
  - `scripts/eval-rl-models.js`, `scripts/render-rl-registry-evals.js`, `scripts/validate-rl-registry.js`, related tests
  - `index.html`, `js/ui.js`, `js/confetti.js`, `style.css`, UI/PWA tests
  - `.github/workflows/build-apk.yml`, release/PWA docs
- 実装内容:
  - 既存 room の `recreateRoom` replacement は、incoming payload 内の token hash ではなく既存 room に保存された reconnect token で認証するようにした。
  - restore rank は replacement 判定で client-writable な `gameStartPayload.actionSeq` を進捗根拠にせず、snapshot/actionLog で replay-backed な seq だけを使う。
  - RLCPU は既知 schema bundle で runtime の action/card count と不一致なら constructor で早期拒否する。Python export は `stateSchema` / `actionSchema` を明示する。
  - `eval-rl-models` の結果に `evaluationConfig` を保存し、registry import の重複判定にも seed policy を含める。
  - `validate-rl-registry -- --check-paths` が npm script 経由でも registry path と誤認しない parseArgs を追加した。
  - game 中の Service Worker `controllerchange` は reload せず update banner に倒す。
  - modal 表示中は body scroll を止め、Tab focus が modal 外へ逃げた場合は modal 内へ戻す。confetti timeout は restart/stop 時に整理する。
  - Android/TWA APK workflow に Bubblewrap build 前の `npm ci` / `test:static` / `test:pwa` / `test:release` gate を追加した。
  - PWA model loading / release checklist / AI handoff / progress docs を現状と継続運用方針へ同期した。
- deferred:
  - host-supplied snapshot の完全な署名 / server persisted canonical state は design decision required。
  - client duplicate action idempotency と replay parity matrix は次 Cycle の安全な候補。
  - 実機 iOS/Android の update/reconnect は manual verification required。


## Continuous review Cycle 8 restore/PWA follow-up guards

- 状態: implemented; full suite passed and pushed in `cd25c68`.
- 変更ファイル:
  - `index.html`, `style.css`, `sw.js`, `tests/main.test.js`, `tests/sw.test.js`
  - `js/online.js`, `server/restoreRank.js`, `server.js`, `tests/server.test.js`, `tests/helpers/online-restore-fixtures.js`
  - `js/RLCPU.js`, `tests/rlcpu.test.js`
  - `docs/ONLINE_SYNC.md`, `docs/ONLINE_RECOVERY.md`
- 実装内容:
  - game 中の SW controllerchange 抑止は unsolicited update のみ対象にし、ユーザーが `pwaApplyUpdate()` を押した場合は reload を許可する。
  - PWA update/install banner と pending modal の announce 属性、modal 中の scroll bleed guard、SW fetch の HTTP failure fallback を補強した。
  - restore freshness は raw `actionLog[].seq` ではなく `stateSnapshot.actionSeq + replayable action count` で評価し、client/server の rank 規則を揃えた。
  - restored actionLog の `clientActionId` は live action と同じ sanitizer を通す。
  - reconnect 失敗 cleanup は restore bundle も破棄する。
  - RLCPU は custom state schema でも flat action head の action count mismatch を拒否する。
- deferred:
  - server persisted canonical state / signed restore snapshot は design decision required。
  - client duplicate action idempotency と replay parity matrix は次 Cycle の安全候補。
  - 実機 iOS/Android の update/reconnect は manual verification required。

## Continuous review Cycle 9 restore ack / release gate / diagnostics polish

- 状態: implemented; full suite passed and pushed in `0bd8ba0`.
- 変更ファイル:
  - `server.js`, `js/online.js`, `tests/server.test.js`, `tests/online.test.js`
  - `js/appShell.js`, `tests/main.test.js`, `tests/release-e2e.test.js`, `docs/NTFY_ERROR_REPORTING.md`
  - `scripts/eval-rl-vs-js.js`, `scripts/render-rl-registry-evals.js`, `tests/eval-rl-vs-js.test.js`, `tests/render-rl-registry-evals.test.js`
  - `.github/workflows/build-apk.yml`, `docs/AUTOMATED_RELEASE_TEST.md`, `docs/ONLINE_SYNC.md`, `docs/online-restore-schema.md`, `AGENTS.md`
- 実装内容:
  - restore 後の `rejoinData` に snapshot 圧縮済みの受理済み `clientActionId` を含め、pending seq が canonical rank より大きい場合でも再送・二重適用しない。
  - APK build 前 gate に `npm test` を追加し、release docs と test を同期した。
  - log header の keyboard button semantics、modal focusable filtering、PWA/a11y source tests を補強した。
  - RL eval artifact は effective schema/action metadata を出し、registry eval の duplicate 判定は object key order を正規化する。
  - client error 通知は URL query/hash を送らず、ntfy 本文では roomId を hash 表示にする。rate bucket は期限切れ prune を行う。
- deferred:
  - modal background inert 化、iOS Safari install guidance、PWA banner state machine は Medium backlog。
  - server persisted canonical state / signed restore snapshot は design decision required。


## Continuous review Cycle 10 reconnect ack / modal inert / release contract

- 状態: implemented; full suite passed and pushed in `c9782ae`.
- 変更ファイル:
  - `server.js`, `tests/server.test.js`
  - `js/ui.js`, `tests/ui.test.js`
  - `js/appShell.js`, `index.html`, `tests/main.test.js`
  - `scripts/validate-rl-registry.js`, `tests/validate-rl-registry.test.js`
  - `tests/helpers/test-utils.js`, `tests/release-e2e.test.js`
  - docs maintenance files
- 実装内容:
  - 通常 `rejoinRoom` の `rejoinData` にも `acceptedClientActions` を含め、snapshot 圧縮後の pending 再送/二重適用を防ぐ契約を全復元経路で揃えた。
  - modal 表示中は title/game/PWA banner roots を `inert` + `aria-hidden` にし、close/Escape で既存属性を復元する。
  - PWA update banner 表示中は install banner を出さず、install/update banner が重ならないようにした。
  - client-error の stack/filename URL は query/hash を削除してから保存/通知する。
  - RL registry validation は同一条件で結果だけ異なる eval を warning にし、best eval 選択の曖昧さを見える化する。
  - async `runTest` が Promise rejection を拾うようにし、release pseudo-E2E の非同期失敗を見落とさない。
- deferred:
  - iOS Safari 専用 install guidance と PWA bottom spacer は実機表示確認が必要。
  - client-error endpoint の trust proxy / no-origin production policy は deploy topology の設計判断が必要。
  - server persisted canonical state / signed restore snapshot は design decision required。


## Continuous review Cycle 11 PWA/security/test tooling hardening

- 状態: implemented; full verification passed; ready to commit/push.
- 変更ファイル:
  - `server.js`, `tests/server.test.js`
  - `js/appShell.js`, `js/main.js`, `index.html`, `style.css`, `tests/main.test.js`
  - `js/ui.js`, `tests/ui.test.js`
  - `tests/helpers/test-utils.js`, `tests/test-utils.test.js`, `tests/run-all.js`
  - `scripts/validate-rl-registry.js`, `scripts/render-rl-registry-evals.js`, related tests
  - docs maintenance files
- 実装内容:
  - Express `trust proxy` を既定 false にし、`TRUST_PROXY` / `EXPRESS_TRUST_PROXY` で明示 opt-in にした。
  - production + `NTFY_TOPIC` で origin/referrer も shared token もない client-error report を拒否する。
  - PWA update banner が install prompt を一時的に隠した場合、update dismiss 後に保留中 install prompt を再表示する。banner 表示中は body class で下部余白を確保する。
  - modal open は先に modal へ focus を移してから background roots を `aria-hidden` にする。modal close buttons に programmatic label を付けた。
  - pending modal に `100vh` fallback を追加し、`100dvh` 非対応 Safari でも高さ制約が残るようにした。
  - `runTest` は async Promise を返すようにし、`await runTest(...)` が実際に完了待ちできるようにした。
  - RL registry validation は同一条件 eval の date 違い conflict も warning にし、`--strict-warnings` を追加した。registry eval import は同一条件で metrics だけ違う重複を拒否する。
- deferred / design required:
  - host-controlled restore snapshot / missing-room restore の署名付き検証、server persisted canonical state は設計判断が必要なため未実装。
  - iOS Safari 専用 install guidance は実機UX確認待ち。
