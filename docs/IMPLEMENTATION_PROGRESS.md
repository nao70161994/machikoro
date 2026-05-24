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

- 状態: implemented; full suite passed and pushed in `a6b8179`.
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

## Continuous review Cycle 12 public surface / restore guard hardening

- 状態: completed; full verification passed; committed in this cycle.
- 変更ファイル:
  - `server.js`, `server/roomLifecycle.js`, `server/mirrorReplay.js`, `tests/server.test.js`
  - `sw.js`, `tests/sw.test.js`
  - `js/main.js`, `js/online.js`, `js/ui.js`, related UI tests
  - `js/RLModelPortfolio.js`, `models/rl_model/portfolio/*.browser.json`, `scripts/validate-rl-registry.js`, related RL tests
  - `tests/cpu.test.js`, `tests/release-e2e.test.js`, `tests/test-utils.test.js`
- 実装内容:
  - root `express.static(__dirname)` を廃止し、公開rootファイルと `/js`, `/icons`, `/models/rl_model/portfolio` だけを allowlist 配信するようにした。
  - `createRoom` に socket 単位に加えて IP/rate-key 単位の軽い rate limit を追加した。
  - client-error payload の `message` / `url` も query/hash scrub 対象にした。
  - restore snapshot の pending count を上限付きにし、pending field / pendingActions / pendingIT と phase の不整合を拒否する。旧snapshotで `cards` 欠落時は初期カードを消さず維持する。
  - Service Worker は allowlist 外 GET を runtime cache しない。RL portfolio JSON は従来どおり runtime network-first cache の対象。
  - player type select に programmatic label、card/landmark/set toggle に `aria-pressed` を追加した。
  - RL portfolio entries を freeze し、配布モデルJSONへ explicit `stateSchema` / `actionSchema` を追加した。registry helper は lineup eval の `gamesPerLineup` も latest/best 判定に使う。
  - async `runTest` の fire-and-forget 再発を release/cpu test 側で抑止した。
- deferred / design required:
  - signed restore snapshot / server persisted canonical state / missing-room restore signature は引き続き design decision required。
  - non-host hostless restore 本実装、iOS Safari install guidance、実機複数端末の長時間 online/PWA 回帰は manual/design required。


## Continuous review Cycle 13 restore boundary / accessibility / pending queue hardening

- 状態: completed; full verification passed and pushed in `8e64774`.
- 変更ファイル:
  - `server.js`, `tests/server.test.js`
  - `js/online.js`, `tests/online.test.js`
  - `index.html`, `js/appShell.js`, `js/ui.js`, `tests/main.test.js`, `tests/ui.test.js`
  - `js/GameManager.js`, `js/CPU.js`, `scripts/selfplay.js`, `tests/gamemanager.test.js`, `tests/cpu.test.js`
  - `scripts/rl/game_env.py`, `scripts/rl/train.py`, `tests/rl-train.test.js`
  - `tests/rl-model-portfolio.test.js`, docs maintenance files
- 実装内容:
  - 既存roomを `recreateRoom` で復元置換できるのは現在の hostPlayerIndex 本人だけに限定した。非ホストは従来どおり rejoin + host再選出は可能だが、canonical state replacement はできない。
  - room 作成/復元時に `roomId` を room object へ保持し、canonical mirror mismatch diagnostics の room identity を失わないようにした。
  - 未使用の `handleRemoteAction` helper を削除し、remote/replay 経路を `applyReplayedAction` に集約した。
  - `onlinePendingAction` に保存時の `roomId` を含め、`appError` 経由の pending cleanup は現在roomに属する action だけを消すようにした。
  - crash overlay を `alertdialog` 化して focus を回復操作へ移し、offline notice / tabs / online sub-tabs / icon-only controls / card detail / Business Center chip の accessibility metadata を補強した。
  - `GameManager.clearPendingField` を追加し、fallback で pending field を消す場合も `pendingActionQueue` の残り順序を保持するようにした。CPU fallback と selfplay fallback はこの helper を使う。
  - Python RL target-head training は raw pending count ではなく pending queue 先頭fieldから target kind を決めるようにした。
  - online RL CPU factory と RL portfolio XHR/cache/runtime loading の positive path test を追加した。
- deferred / design required:
  - pending action key の完全な per-tab/per-session namespacing は保存schema変更が大きいため未実装。
  - signed restore snapshot / server persisted canonical state は引き続き design decision required。
  - iOS/Android 実機の crash overlay focus, tab announcement, PWA install/update/reconnect は manual verification required。

## Continuous review Cycle 14 restore replay / pending trace / mobile a11y hardening

- 状態: completed; full verification passed and pushed in `555c49a`.
- 変更ファイル:
  - `server.js`, `server/mirrorReplay.js`, `tests/server.test.js`
  - `js/online.js`, `tests/online.test.js`
  - `js/storage.js`, `tests/storage.test.js`
  - `scripts/selfplay.js`, `scripts/compare-rl-match-trace.js`, `scripts/rl/export_debug_fixture.py`, `tests/compare-rl-match-trace.test.js`, `tests/rlcpu.test.js`
  - `index.html`, `style.css`, `tests/main.test.js`
- 実装内容:
  - `onlinePendingAction` の `roomId` を restore append / reconnect resend の gate にも使い、別room/旧tabの未ack actionが復元bundleや再送に混入しないようにした。
  - server restore の actionLog sanitize で、entry の `roomId` が復元対象roomと違う場合は拒否し、`stateSnapshot.actionSeq` 以下の action は replay 対象から除外する。
  - restore payload の `reconnectTokenHashes` は人数分の配列を要求し、人間slotは64桁hash必須、CPU slotのみ空hashを許容する。
  - restore payload の playerNames は live room と同じ sanitize contract を通す。未sanitize/空/過長名は復元前に拒否する。
  - local save の `pendingActions` は field/action 対応と pending count 一致を検証する。legacy の `pendingActions` 欠落は許容するが、空配列と非zero pending count の不整合は拒否する。
  - JS/Python RL trace export と compare normalization に `pendingActions` を含め、queue順序のズレを trace parity で検出できるようにした。
  - online/server snapshots と undo snapshot の `log` は末尾30件に制限し、長期対戦で actionLog compact 後も snapshot payload が膨らみ続けないようにした。
  - `onlineStatus` を live region 化し、card detail button の touch hit area を拡大した。
- deferred / design required:
  - client-error origin policy の production 強化は Render/ntfy の既存運用を変える可能性があるため、`PUBLIC_ORIGIN` / token 必須化の設計判断待ち。
  - signed restore snapshot / server persisted canonical state は引き続き design decision required。
  - 実機 iOS/Android の live region 読み上げ、tap target、restore/reconnect 長時間回帰は manual verification required。


## Continuous review Cycle 15 restore rank / PWA lifecycle / pending replay hardening

- 状態: completed; full verification passed; commit/push pending.
- 変更ファイル:
  - `server.js`, `server/restoreRank.js`, `tests/server.test.js`
  - `js/online.js`, `tests/online.test.js`
  - `sw.js`, `tests/sw.test.js`
  - `index.html`, `js/main.js`, `js/ui.js`, `tests/main.test.js`, `tests/ui.test.js`
  - `.github/workflows/release-test.yml`, `tests/release-e2e.test.js`
- 実装内容:
  - restore freshness rank は未知 action を replay 可能件数へ含めない。server 側 allowlist と client `GAME_ACTION_REGISTRY` の同期を test で固定した。
  - 既存 restored room の置換判定は、raw actionLog ではなく sanitize 後 actionLog の rank で行うようにした。
  - snapshot 圧縮後は `stateSnapshot.actionSeq` 以下の action と、`seq` を持たない legacy action を replay 対象から外し、古い action の二重適用を避ける。
  - `onlinePendingAction` は roomId がある場合は current room と一致する時だけ復元bundle append / reconnect resend に使う。roomId なし legacy entry は `seq` がある場合だけ互換再送を維持し、seq もない stale 候補は混入させない。
  - Service Worker の runtime cache write は `event.waitUntil` に載せ、fetch event lifetime 中に cache 更新を完了できるようにした。
  - PWA update banner は interactive content を含むため `role=status` ではなく `role=region` + live message へ整理した。
  - `pwaApplyUpdate` が存在しない環境では reload fallback へ倒す。release workflow には `npm run test:pwa` gate を追加した。
  - 勝利時の online cleanup は `clearOnlineSessionStorage` を使い、online restore bundle もまとめて消す。
- targeted verification passed before full suite:
  - `git diff --check`
  - `node --check server.js server/restoreRank.js js/online.js js/main.js sw.js js/ui.js`
  - `node tests/server.test.js`, `node tests/online.test.js`, `node tests/sw.test.js`, `node tests/main.test.js`, `node tests/release-e2e.test.js`, `node tests/ui.test.js`
- deferred / design required:
  - signed restore snapshot / server persisted canonical state は引き続き design decision required。
  - hostless restore 本実装、実機 iOS/Android の長時間 online/PWA/reconnect/accessibility 回帰は manual verification required。
  - inline Service Worker update flow の appShell への完全分離は larger refactor のため未実施。

## UI action enabled parity follow-up

- 状態: completed; full verification passed before commit.
- 変更ファイル:
  - `js/ui.js`, `tests/ui.test.js`, `docs/POST_IMPLEMENTATION_AUDIT.md`, `docs/AI_HANDOFF.md`, `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - skip/end turn, build card, build landmark, undo build の enabled 表示を `allowedActionsFor` と同期した。
  - online reconnect / socket disconnected / `onlineActionInFlight` 中は UI 表示側も入力不可として扱うようにした。
  - build card と landmark は別 action として判定し、片方だけ許可される状態でも別系統を誤って有効化しないようにした。
  - `ROOM_REPLACED` には触れていない。
- regression:
  - skip/end turn が `nextTurn` と online gate に同期することを UI test で固定した。
  - build/landmark/undo 表示が `buildCard` / `buildLandmark` / `undoBuild` と online gate に同期することを UI test で固定した。

## UI action gate final audit

- 状態: completed; full verification passed; commit/push pending.
- 変更ファイル:
  - `js/ui.js`, `tests/ui.test.js`, `docs/POST_IMPLEMENTATION_AUDIT.md`, `docs/AI_HANDOFF.md`, `docs/IMPLEMENTATION_PROGRESS.md`
- 実装内容:
  - UI 表示側の online input block 判定を handler 側と揃え、socket 未定義も操作不可にした。
  - CPUターン、他人onlineターン、onlineActionInFlight、reconnecting、socket disconnected/missing、pending resolver の gate 回帰テストを追加した。
  - `buildCard` / `buildLandmark` / `undoBuild` / `nextTurn` の独立表示gateを最終確認した。
  - `ROOM_REPLACED` には触れていない。

## Maintainability up-cycle restart Cycle 1

- 状態: completed; verification/commit pending.
- 新規指摘:
  - High: `scripts/compare-rl-match-trace.js` は trace mismatch を表示しても CLI exit code が 0 のままで、RL parity regression を CI/automation が取りこぼす可能性があった。
  - High: online game 中に Service Worker update が waiting になった場合、title/reset へ戻ったあとも `_waitingSW` を再評価せず、update banner / auto-apply が stranded になる可能性があった。
  - Low: `docs/RELEASE_CHECKLIST.md` の release workflow 説明が `.github/workflows/release-test.yml` とずれ、`npm run test:pwa` gate を本文で落としていた。
  - Medium/deferred: hostless restore / server persisted canonical state / signed restore snapshot は設計判断待ちとして維持。実機 iOS/Android の長時間 online/PWA 回帰も manual verification required。
- 修正済み:
  - RL match trace comparison は mismatch 時に `printComparison()` が 1 を返し、CLI が `process.exitCode = 1` を設定するようにした。match 時の成功挙動は維持した。
  - PWA waiting SW の再評価を `refreshPwaUpdateState()` に分離し、`restartGame()` で title/reset へ戻った後に再評価するようにした。
  - Release checklist の CI gate 説明を workflow 実体に同期した。
  - `tests/compare-rl-match-trace.test.js`, `tests/main.test.js`, `tests/release-e2e.test.js` に regression assertion を追加した。
- rollback: なし。
- regressions: full verification passed.
- benchmark影響: ゲームロジック、CPU preset、RL model は未変更。RL parity tooling は mismatch を失敗として扱うため automation gate が厳しくなる。
- 残課題:
  - action metadata contract の追加 test、legacy pending outbound のさらなる room gate、`CLIENT_ERROR_SHARED_TOKEN` 運用docsの明確化、hostless restore 本実装、実機複数端末確認は継続 backlog / manual / design required。

## Maintainability up-cycle restart/UI lifecycle Cycle 2

- 状態: completed; verification pending.
- 新規指摘:
  - High: `selectDice` / `rerollConfirm` / `harborChoice` の dice choice UI が watchdog の usable action 対象外で、gameScreen orphan lock 時に復旧できない可能性があった。
  - High: online `gameStart` / `rejoinData` と local `resumeGame()` が stale modal/root lock を引き継ぐ可能性があった。
  - High: local start/resume が待機中 online socket や delayed human action を止めず、後着 online event / 古い timeout が新しいゲームへ干渉し得た。
  - High: online init が CPU schedule / autoskip / delayed action / undo の transient reset をローカル init と同等に行っていなかった。
  - Medium: restart fallback cleanup は `clearOnlineSessionStorage()` 不在時に restore bundle keys を直接消すテストが薄かった。
  - Medium: 0コストカードを autoskip が建設可能扱いしない問題を確認した。
- 修正済み:
  - watchdog の primary action snapshot に `diceChoose` を追加し、`selectDice` / `rerollDice` / `skipReroll` / `resolveHarbor` を interactive action として扱うようにした。
  - `startGame()` / `resumeGame()` は local play へ入る前に online runtime と stale UI lock を reset する。
  - `gameStart` / `rejoinData` は game screen 表示前に `resetUiLocksForGameReset()` を通し、online start は lifecycle start 通知を送る。
  - `initOnlineGame()` で `cpuScheduleToken` 更新、delayed action / autoskip cancel、`prevCoins` / `undoState` reset を行う。
  - ローカル CPU build failure は pass 扱いで `nextTurn` へ進め、online 送信失敗時だけ従来どおり停止する。
  - autoskip の建設可能判定から `card.cost > 0` を外し、0コストカードも在庫があれば建設可能扱いにした。
  - restart fallback cleanup は online restore bundle keys も消すようにした。
- tests added/updated:
  - dice choice phase の orphan gameScreen lock watchdog recovery。
  - online gameStart / rejoinData の stale modal lock cleanup と lifecycle start privacy。
  - resumeGame の delayed action / online state / UI lock reset。
  - restart の restore bundle cleanup と stopConfetti。
  - local CPU build failure pass。
- rollback: なし。
- regressions: full verification passed; no rollback.
- 実行テスト: `git diff --check`, `npm run test:static`, `npm run test:smoke`, `npm test`, `npm run test:online`, `npm run test:release`, `npm run test:pwa`, `npm run test:cpu`, `npm run test:rl`, `node --check js/*.js`, `node --check server.js`, `python3 -m py_compile scripts/rl/*.py`.
- benchmark影響: CPU preset/RL model は未変更。CPU build failure の fallback 挙動だけ、停止より pass を優先する安定化。
- 残課題:
  - PWA version mismatch inline flow は引き続き source-level/release approximation 中心で、実ブラウザ cache/controller timing は manual verification required。
  - online storage の per-room namespace 化、hostless restore、signed/server persisted canonical state は design required。

## Maintainability continuation Cycle 1 - UI/online resilience

- 状態: completed; full verification passed before commit.
- 新規指摘:
  - High: freeze watchdog の duplicate report suppression が同じ state key の再発時に recovery まで抑止し、通知spamは防げても UI lock が残る可能性があった。
  - High: Safari / older WebView では `inert` fallback が不十分な場合、modal open 中に背景 root が pointer 操作を受ける余地があった。
  - High: `pendingModal` が stale 表示されたまま pending action が無い状態は active modal として扱われ、既存 stale cleanup に到達しない可能性があった。
  - High: online reconnect の pending action 判定が `stateSnapshot.actionSeq >= pending.seq` だけで clientActionId 付き未ack action を受理済み扱いし得た。
  - High: `actionAccepted` が ack の `clientActionId` を見ずに `onlinePendingAction` を消し、遅延ack / stale tab 由来の localStorage 干渉で active pending を失う可能性があった。
- 修正済み:
  - duplicate freeze report は引き続き通知抑止するが、`recoverUiInteractability()` は毎回実行するようにした。
  - modal background lock は `inert` / `aria-hidden` に加え、既存値を保存したうえで `pointer-events:none` を付与・復元する。
  - stale `pendingModal` を `stale-modal-ui-locked` として分類し、watchdog recovery で閉じる。
  - online pending は clientActionId がある場合、replay log / acceptedClientActions / matching actionAccepted id でのみ clear する。seq-only compact fallback は legacy pending のみに限定した。
- rollback: なし。
- regressions: targeted tests passed; full verification pending.
- benchmark影響: CPU preset / RL model / gameplay scoring は未変更。online restore の未ack保持が厳密になるため、二重消失より再送安全性を優先。
- 残課題:
  - modal manager の stack 化、action container 内の enabled descendant 診断強化、`INVALID_SESSION` / `ROOM_REPLACED` 時の tab nonce 付き pending clear は次Cycle候補。
  - hostless restore / signed or server-persisted canonical state は design decision required。
  - 実機 iOS/Android の長時間 online/PWA/accessibility 回帰は manual verification required。

## Maintainability continuation Cycle 2 - appError pending ownership

- 状態: completed; full verification passed before commit.
- 新規指摘:
  - Medium: `handleAppError()` が一般的な current-room appError でも `onlinePendingAction` を消しており、`INVALID_SESSION` / `ROOM_REPLACED` / stale tab 由来エラーで active pending を失う余地があった。
- 修正済み:
  - pending clear を明示的な `無効な操作です` の再同期パスと、再接続失敗でセッションを破棄するパスへ限定した。
  - 一般 appError は status 表示だけにし、pending restore/resend record を保持する。
  - online tests に一般エラーで pending を保持し、無効操作では pending を clear して rejoin する assertion を追加した。
- rollback: なし。
- regressions: なし。targeted online test と full verification は全通過。
- benchmark影響: なし。
- 実行テスト: `git diff --check`, `node --check js/*.js`, `node --check server.js`, `python3 -m py_compile scripts/rl/*.py`, `npm run test:static`, `npm run test:smoke`, `npm test`, `npm run test:online`, `npm run test:release`, `npm run test:pwa`, `npm run test:cpu`, `npm run test:rl`.
- 残課題:
  - modal stack/deny-nesting policy は UI 仕様判断が必要。action container 内 enabled descendant 診断は Cycle 3 で対応済み。
  - hostless restore / signed or server-persisted canonical state は design decision required。
  - 実機 iOS/Android の長時間 online/PWA/accessibility 回帰は manual verification required。

## Maintainability continuation Cycle 3 - UI container child diagnostics

- 状態: completed; full verification passed before commit.
- 新規指摘:
  - Medium: `buildMenu` / `pendingMenu` / `diceChoose` のようなコンテナ型 action UI は、コンテナが表示されているだけでクリック可能扱いになり、実DOM上の子ボタンが全 disabled/hidden/pointer-events none の場合を見落とす余地があった。
  - Medium: freeze snapshot の localStorage 保存は長い payload を `slice(0, 7000)` しており、診断情報が増えた時に invalid JSON を残す潜在リスクがあった。
- 修正済み:
  - `safeElementSnapshot()` に interactive child の総数/usable数を追加し、allowed action container が子操作を1つも押せない場合は `child-not-clickable` として検出するようにした。
  - localStorage 用 freeze snapshot は full payload が長い場合に compact payload へ縮約し、保存値が常に parse 可能な JSON になるようにした。
  - integration test に disabled child button の検出回帰を追加した。
- rollback: なし。
- regressions: なし。targeted integration test と full verification は全通過。
- benchmark影響: なし。
- 実行テスト: `git diff --check`, `node --check js/*.js`, `node --check server.js`, `python3 -m py_compile scripts/rl/*.py`, `npm run test:static`, `npm run test:smoke`, `npm test`, `npm run test:online`, `npm run test:release`, `npm run test:pwa`, `npm run test:cpu`, `npm run test:rl`.
- 残課題:
  - modal stack/deny-nesting policy は UI 仕様判断が必要。
  - hostless restore / signed or server-persisted canonical state は design decision required。
  - 実機 iOS/Android の長時間 online/PWA/accessibility 回帰は manual verification required。

## Maintainability continuation Cycle 4 - docs drift cleanup

- 状態: completed; docs-only verification passed before commit.
- 新規指摘:
  - Low: Cycle 2/3 で対応済みの appError pending ownership と action container child diagnostics が、handoff/progress の follow-up 文言に残っていた。
- 修正済み:
  - `docs/AI_HANDOFF.md` の next follow-up を、残る design/manual 項目だけへ更新した。
  - `docs/IMPLEMENTATION_PROGRESS.md` の Cycle 2 残課題から、Cycle 3 対応済みの action container 診断を除外した。
- rollback: なし。
- regressions: なし。docs-only。
- benchmark影響: なし。
- 実行テスト: `git diff --check`。直前の Cycle 3 で full verification 済み。
- 残課題:
  - modal stack/deny-nesting policy は UI 仕様判断が必要。
  - hostless restore / signed or server-persisted canonical state は design decision required。
  - 実機 iOS/Android の長時間 online/PWA/accessibility 回帰は manual verification required。

## Backlog cleanup - action metadata contract tests

- 状態: completed; targeted verification passed before commit.
- 対象: action metadata contract の追加 test。
- 修正済み:
  - `GAME_ACTION_REGISTRY` の `phase` metadata が `GAME_PHASE_ACTIONS` と pending resolver action 群からずれないことを `tests/gamemanager.test.js` に追加した。
  - pending resolver action は `phase: pending` かつ `payloadKind: resolve*` に固定し、新 action 追加時に registry / allowed action contract の更新漏れを検出しやすくした。
- コード挙動: 変更なし。テストとdocsのみ。
- 残課題:
  - online storage の per-room namespace 化の足場、legacy pending outbound room gate 強化、小さな helper 分離、pending 種別 HTML helper 化は継続 backlog。
  - modal stack / hostless restore / signed restore / server-persisted canonical state / production origin-token policy / 実機確認項目は対象外。

## Backlog cleanup - legacy pending outbound room gate

- 状態: completed; targeted verification passed before commit.
- 対象: legacy pending outbound の room gate 強化。
- 修正済み:
  - `_clearPendingOutboundActionForCurrentSession()` が explicit roomId 必須 option を受け取り、無効操作エラー時は roomId 付きの current-room pending だけを即削除するようにした。
  - roomId なし legacy pending は無効操作エラーだけでは現在room所属とみなさず、rejoinData の既存 canonical 判定 / resend gate に処理を任せる。
  - `tests/online.test.js` に roomId なし legacy pending が invalid-action resync 開始時に即削除されない回帰テストを追加した。
- コード挙動: current-room pending の invalid-action clear は維持。legacy roomless pending の扱いだけをより保守的にした。
- 残課題:
  - online storage の per-room namespace 化の実移行は、互換 migration とUI再開導線の設計が必要なため継続 backlog。
  - 小さな helper 分離、pending 種別 HTML helper 化は継続 backlog。

## Backlog cleanup - pending HTML helper split

- 状態: completed; targeted verification in progress before commit.
- 対象: pending 種別 HTML helper 化。
- 修正済み:
  - `renderPending()` 内に直書きされていた pending 種別ごとの HTML 生成を `buildPendingMenuHtml()` と `buildPending*Html()` helper に分離した。
  - pending queue 先頭 gate / `allowedActions` gate は `shouldRenderPendingField()` に集約し、種別追加時の条件ずれを見つけやすくした。
  - `tests/ui.test.js` に cleaning / mover / renovation / IT の helper 出力と先頭 pending gate の回帰テストを追加した。
- コード挙動: pending modal の表示制御、pointer-events 正規化、delegated handler の data-action は維持。
- 残課題:
  - online storage の per-room namespace 化の足場は継続 backlog。
  - CPU / UI / server の小さな helper 分離は継続 backlog。

## Backlog cleanup - online room-scoped storage footing

- 状態: completed; targeted verification in progress before commit.
- 対象: online storage の per-room namespace 化の調査・小さな足場。
- 修正済み:
  - `onlinePendingAction` の room-scoped key を作る `_onlineRoomStorageKey()` helper を追加した。
  - 未ack outbound action は従来の `onlinePendingAction` を正本として維持しつつ、`onlinePendingAction:room:<ROOM>` にも dual-write する足場を追加した。
  - `actionAccepted` 等の pending cleanup では current room の scoped copy も削除するようにした。
  - `tests/online.test.js` に room-scoped pending copy の保存・削除回帰テストを追加した。
- コード挙動: 既存の復元 / 再送は従来 key を読み続ける。per-room key は移行前の補助コピーで、UI再開導線や互換 migration は未変更。
- 残課題:
  - `onlineGameStart` / `onlineActionLog` / `onlineStateSnapshot` の scoped read migration、旧key pruning は設計を小さく分けて継続 backlog。
  - CPU / UI / server の小さな helper 分離は継続 backlog。

## Backlog cleanup - online restore bundle scoped copy

- 状態: completed; full verification passed before commit.
- 対象: online storage の per-room namespace 化の小さな足場拡張。
- 修正済み:
  - `onlineGameStart` / `onlineActionLog` / `onlineStateSnapshot` の restore bundle 更新を `_writeOnlineRestoreStorageJson()` に集約し、従来keyへ書きつつ room-scoped key にも dual-write するようにした。
  - restore bundle の削除を `_removeOnlineRestoreStorageItem()` に集約し、従来keyと current room の scoped key を一緒に削除するようにした。
  - `tests/online.test.js` に `gameStart` と `_saveActionLog()` 圧縮時の scoped bundle 保存回帰テストを追加した。
- コード挙動: 読み取り正本は従来keyのまま維持。room-scoped copy は次段階の read migration / pruning 用の足場。
- 残課題:
  - scoped read migration、旧key pruning、複数room resume UI の扱いは継続 backlog。
  - CPU / UI / server の小さな helper 分離は継続 backlog。

## Backlog cleanup - online pending reset scoped cleanup

- 状態: completed; full verification passed before commit.
- 対象: online storage の per-room namespace 化に伴う pending outbound cleanup の小さな補強。
- 修正済み:
  - `resetOnlineState()` が `myRoomId` を消す前の roomId を保持し、legacy `onlinePendingAction` と `onlinePendingAction:room:<ROOM>` の両方を消せるようにした。
  - `_clearPendingOutboundAction()` に roomId 引数を追加し、既存呼び出しは current room のまま維持した。
  - `tests/online.test.js` に reset 時の room-scoped pending copy 削除回帰テストを追加した。
- コード挙動: pending の読み取り正本は従来keyのまま。複数room resume UI と scoped read migration は未変更。
- 残課題:
  - scoped read migration、旧key pruning、複数room resume UI の扱いは継続 backlog。
  - CPU / UI / server の小さな helper 分離は継続 backlog。

## Backlog cleanup - server hostChanged helper split

- 状態: completed; full verification passed before commit.
- 対象: server.js の小さな helper 分離。
- 修正済み:
  - host migration 時の `hostChanged` payload 生成を `roomHostChangedPayload()` に集約した。
  - `emitRoomHostChanged()` を追加し、disconnect 時と restore/recreate 時の通知形を同じ helper 経由にした。
  - `tests/server.test.js` に hostChanged payload / emit contract の回帰テストを追加した。
- コード挙動: host migration の条件や hostEpoch 更新処理は変更なし。通知 payload 生成だけを共通化。
- 残課題:
  - scoped read migration、旧key pruning、複数room resume UI の扱いは継続 backlog。
  - CPU / UI / server のさらなる小さな helper 分離は継続 backlog。

## Backlog cleanup - server export contract cleanup

- 状態: completed; full verification passed before commit.
- 対象: server.js の小さな保守性改善。
- 修正済み:
  - `module.exports` に重複していた game lifecycle 系 export 名を整理した。
  - `tests/server.test.js` に `module.exports` の公開名重複を検出する静的回帰テストを追加した。
- コード挙動: 公開値自体は同じで、重複定義の削除のみ。
- 残課題:
  - scoped read migration、旧key pruning、複数room resume UI の扱いは継続 backlog。
  - CPU / UI / server のさらなる小さな helper 分離は継続 backlog。

## Backlog cleanup - online room key contract

- 状態: completed; full verification passed before commit.
- 対象: online storage の per-room namespace 化の小さな足場補強。
- 修正済み:
  - `_onlineRoomStorageKey()` を idempotent にし、既に scoped key の場合は二重に `:room:` suffix を付けないようにした。
  - room id の trim / uppercase 正規化、空 roomId fallback、二重scoping防止を `tests/online.test.js` で固定した。
- コード挙動: scoped read migration は未実施。既存の legacy key 読み取り正本は維持。
- 残課題:
  - scoped read migration、旧key pruning、複数room resume UI の扱いは継続 backlog。
  - CPU / UI / server のさらなる小さな helper 分離は継続 backlog。

## Backlog cleanup - online pending scoped read

- 状態: completed; full verification passed before commit.
- 対象: online storage の per-room namespace 化の小さな足場補強。
- 修正済み:
  - `_readOnlineRoomStorageJson()` を追加し、current room の scoped storage がある場合は legacy key より優先して読めるようにした。
  - `_readPendingOutboundAction()` は current room の scoped pending を優先し、scoped copy が無い場合は従来通り legacy pending へ fallback する。
  - 別roomの legacy pending と current room の scoped pending が共存するケース、scoped 未作成時の legacy fallback を `tests/online.test.js` で固定した。
- コード挙動: restore bundle の scoped read migration は未実施。pending outbound の小さな読み取り足場に限定。
- 残課題:
  - `onlineGameStart` / `onlineActionLog` / `onlineStateSnapshot` の scoped read migration、旧key pruning、複数room resume UI は継続 backlog / design required。
  - CPU / UI / server のさらなる小さな helper 分離は継続 backlog。

## Backlog cleanup - build menu HTML helper split

- 状態: completed; full verification passed before commit.
- 対象: ui.js の小さな helper 分離。
- 修正済み:
  - `renderBuildMenu()` 内のカードフィルタ、カード一覧、ランドマーク一覧、undo button、全体HTML生成を `buildCardFilterBarHtml()` / `buildVisibleCardButtonsHtml()` / `buildLandmarkButtonsHtml()` / `buildUndoBuildButtonHtml()` / `buildBuildMenuHtml()` へ分離した。
  - action gate と描画タイミングは既存の `renderBuildMenu()` に残し、HTML組み立てのみ helper 化した。
  - `tests/ui.test.js` に `buildBuildMenuHtml()` のカード/ランドマーク/フィルタ出力 contract を追加した。
- コード挙動: build menu の表示内容と delegated handler 用 `data-action` は維持。
- 残課題:
  - CPU / server のさらなる小さな helper 分離は継続 backlog。
  - modal stack / deny-nesting policy、hostless restore、signed restore、server-persisted canonical state は対象外 / design required。

## Backlog cleanup - server gameStart payload helper split

- 状態: completed; full verification passed before commit.
- 対象: server.js の小さな helper 分離。
- 修正済み:
  - `checkGameStart()` から人間枠数、開始時プレイヤー名、シャッフル順、client version、reconnect token hash、開始payload生成を helper へ分離した。
  - `buildGameStartPayload()` は既存の payload shape を維持し、`checkGameStart()` は lifecycle 更新と emit に集中する形へ整理した。
  - `tests/server.test.js` に開始payload helper の名前・順番・version・token hash contract を追加した。
- コード挙動: 既存の `checkGameStart()` 開始条件、emit payload、room lifecycle reset は維持。
- 残課題:
  - CPU のさらなる小さな helper 分離は継続 backlog。
  - scoped restore migration / pruning / 複数room resume UI は design required として維持。

## Backlog cleanup - CPU evaluation cache helper split

- 状態: completed; full verification passed before commit.
- 対象: CPU.js の小さな helper 分離。
- 修正済み:
  - roll/state 評価キャッシュの signature 生成と上限制御を `js/cpuEvaluationCache.js` へ分離した。
  - `CPU.js` 側は既存の `_rollEvaluationSignature()` / `_signatureCache()` public-ish method を維持し、helper へ委譲するだけにした。
  - browser script order、Service Worker precache、Node/vm test runtime、selfplay/eval runtime の読み込み順を `cpuEvaluationCache.js` 追加に合わせた。
  - `tests/cpu.test.js` に signature ごとの entry 再利用と 16 件上限 pruning の contract を追加した。
- コード挙動: CPU の評価式、行動選択、購入判断は変更なし。キャッシュ管理だけを helper 化。
- 残課題:
  - CPU evaluation / execution の本格分離は挙動影響が大きいため、さらに targeted test を追加してから関数単位で進める。
  - scoped restore migration / pruning / 複数room resume UI は design required として維持。

## Backlog cleanup - online restore scoped read

- 状態: completed; full verification passed before commit.
- 対象: online storage の per-room namespace 化の小さな足場補強。
- 修正済み:
  - `onlineGameStart` / `onlineActionLog` / `onlineStateSnapshot` の読み取りを `_readOnlineRoomStorageJson()` 経由にし、current room の scoped copy がある場合は legacy key より優先するようにした。
  - scoped copy が存在しない場合は従来通り legacy key へ fallback するため、既存保存データ互換を維持した。
  - `tests/online.test.js` に restore bundle read の scoped 優先と legacy fallback contract を追加した。
- コード挙動: 書き込み済みの dual-write 境界は維持。旧key pruning、複数room resume UI、hostless restore は未変更。
- 残課題:
  - scoped restore の旧key pruning / 複数room resume UI は design required として維持。
  - CPU / UI / server のさらなる小さな helper 分離は継続 backlog。

## Backlog cleanup - server ntfy notifier helper split

- 状態: completed; full verification passed before commit.
- 対象: server.js の小さな helper 分離。
- 修正済み:
  - client error 通知と game lifecycle 通知で重複していた ntfy POST 処理を `server/ntfyNotifier.js` の `postNtfyNotification()` へ切り出した。
  - 既存の title / priority / tags / body / missing topic / fetch unavailable / ntfy failure の挙動は呼び出し側の options で維持した。
  - `tests/server.test.js` に helper の POST option contract を追加した。
- コード挙動: `/api/client-error`、`/api/client-error-test`、`/api/game-lifecycle` の公開挙動は変更しない。
- 残課題:
  - CPU / UI / server のさらなる小さな helper 分離は継続 backlog。
  - scoped restore の旧key pruning / 複数room resume UI は design required として維持。

## Backlog cleanup - UI notice helper split

- 状態: completed; full verification passed before commit.
- 対象: ui.js の小さな helper 分離。
- 修正済み:
  - notice/toast の `showNotice()` / `hideNotice()` と timer state を `js/uiNotice.js` へ切り出した。
  - `index.html`、`sw.js`、UI/integration test runtime の script 読み込み順を同期した。
  - 既存の non-blocking toast と alert fallback の挙動は維持した。
- コード挙動: modal / pending / build menu / action gate は未変更。notice 表示責務だけを分離。
- 残課題:
  - CPU / UI / server のさらなる小さな helper 分離は継続 backlog。
  - scoped restore の旧key pruning / 複数room resume UI は design required として維持。

## Backlog cleanup - card detail HTML helper split

- 状態: completed; full verification passed before commit.
- 対象: ui.js の小さな helper 分離。
- 修正済み:
  - `showCardDetail()` に直書きされていた施設カード詳細とランドマーク詳細の HTML 生成を `buildCardDetailContent()` / `buildLandmarkDetailContent()` へ分離した。
  - `tests/ui.test.js` に両 helper の contract test を追加した。
- コード挙動: card detail modal の表示、focus/modal lifecycle、既存の説明文・コスト・色表示は維持。
- 残課題:
  - CPU / UI / server のさらなる小さな helper 分離は継続 backlog。
  - scoped restore の旧key pruning / 複数room resume UI は design required として維持。

## Backlog cleanup - action metadata payload contract test

- 状態: completed; full verification passed before commit.
- 対象: action metadata contract の追加 test。
- 修正済み:
  - `tests/gamemanager.test.js` に `GAME_ACTION_REGISTRY` の payload metadata 固定schema test を追加した。
  - 各 action entry が frozen であること、`entry.action` が key と一致すること、既知 `payloadKind` だけを使うこと、server/client contract flags が明示 true であることを固定した。
  - `emptyObject` payload は `skipReroll` / `nextTurn` のみに限定し、将来の action 追加時に payload validation の抜けを検出しやすくした。
- コード挙動: 実装変更なし。metadata drift の検出だけを追加。
- 残課題:
  - online storage の旧key pruning / 複数room resume UI は design required として維持。
  - CPU / UI / server のさらなる小さな helper 分離は継続 backlog。

## Backlog cleanup - pending menu renderer registry

- 状態: completed; full verification passed before commit.
- 対象: pending 種別 HTML helper 化の継続。
- 修正済み:
  - `buildPendingMenuHtml()` の pending 種別 if 連鎖を `PENDING_MENU_RENDERERS` registry に寄せ、`field` / `action` / active 判定 / HTML helper を同じ entry で追えるようにした。
  - `tests/ui.test.js` の pending HTML contract に renderer 順序 assertion を追加した。
- コード挙動: 既存の pending 表示順、先頭pending gate、allowedActions gate、各 pending HTML は維持。
- 残課題:
  - CPU / UI / server のさらなる小さな helper 分離は継続 backlog。
  - modal stack / hostless restore / signed restore は対象外または design required として維持。

## Backlog cleanup - scoped restore corrupt fallback test

- 状態: completed; full verification passed before commit.
- 対象: online storage の per-room namespace 化の小さな足場。
- 修正済み:
  - `tests/online.test.js` に、current room の scoped restore bundle copy が壊れた JSON の場合でも legacy `onlineGameStart` / `onlineActionLog` / `onlineStateSnapshot` へ fallback する contract test を追加した。
- コード挙動: 実装変更なし。scoped read migration の互換 fallback を regression test で固定。
- 残課題:
  - scoped restore の旧key pruning / 複数room resume UI は design required として維持。
  - CPU / UI / server のさらなる小さな helper 分離は継続 backlog。

## Backlog cleanup - clear restore bundle scoped pending

- 状態: completed; full verification passed before commit.
- 対象: legacy pending outbound の room gate / online storage per-room namespace 化の小さな補強。
- 修正済み:
  - `_clearOnlineRestoreBundle()` が legacy `onlinePendingAction` だけでなく current room の `onlinePendingAction:room:<ROOM>` も削除するよう、既存の `_clearPendingOutboundAction()` helper 経由に統一した。
  - `tests/online.test.js` に `_clearOnlineRestoreBundle()` が room-scoped pending outbound copy を残さない回帰テストを追加した。
- コード挙動: restore bundle 破棄時の pending cleanup 範囲を current room scoped copy まで拡張。別room scoped copy の pruning / 複数room resume UI は設計判断が必要なため未変更。
- 残課題:
  - scoped restore の旧key pruning / 複数room resume UI は design required として維持。
  - CPU / UI / server のさらなる小さな helper 分離は継続 backlog。

## Backlog cleanup - server rate bucket helper split

- 状態: completed; full verification passed before commit.
- 対象: server.js の小さな helper 分離。
- 修正済み:
  - client error と game lifecycle notification の rate bucket pruning を `pruneRateBuckets()` に集約した。
  - `tests/server.test.js` に overflow bucket pruning の contract assertion を追加し、古い順に過剰bucketを落とす挙動を固定した。
- コード挙動: rate limit window / max bucket / duplicate suppression の既存値と判定順は維持。重複していた pruning 処理だけを共通化。
- 残課題:
  - CPU / UI / server のさらなる小さな helper 分離は継続 backlog。
  - scoped restore の旧key pruning / 複数room resume UI は design required として維持。

## Backlog cleanup - pending helper docs consistency

- 状態: completed; full verification passed before commit.
- 対象: pending 種別 HTML helper 化 / AI保守性 docs 整合性。
- 修正済み:
  - `docs/AI_HANDOFF.md`, `docs/POST_IMPLEMENTATION_AUDIT.md`, `docs/UI_REFACTOR.md` の古い「pending HTML helper 未完了」記述を、`PENDING_MENU_RENDERERS` registry 導入済みの現在地へ更新した。
  - `tests/main.test.js` に docs が pending HTML helper 化済みであること、古い未完了文言を再導入しないことを固定する静的テストを追加した。
- コード挙動: 変更なし。docs と regression test のみ。
- 残課題:
  - build menu / card select / stats 周辺のさらなる小さな UI helper 分離は継続 backlog。
  - CPU / server のさらなる小さな helper 分離は継続 backlog。
  - scoped restore の旧key pruning / 複数room resume UI は design required として維持。

## Backlog cleanup - stats HTML helper split

- 状態: completed; full verification passed before commit.
- 対象: UI の小さな helper 分離。
- 修正済み:
  - `js/stats.js` の `renderStats()` から filter tabs / card ranking rows / landmark rows の HTML 生成を `buildStatsFilterTabsHtml()` / `buildStatsCardRowsHtml()` / `buildStatsLandmarkRowsHtml()` に分離した。
  - `tests/stats.test.js` に helper が delegated `data-action` とランキング行の閾値・比率表示を維持する回帰テストを追加した。
- コード挙動: 統計記録、filter state、delegated click handler、表示文言は維持。HTML 生成責務だけを小さく分離。
- 残課題:
  - build menu / card select 周辺のさらなる小さな UI helper 分離は継続 backlog。
  - CPU / server のさらなる小さな helper 分離は継続 backlog。
  - scoped restore の旧key pruning / 複数room resume UI は design required として維持。

## Backlog cleanup - CPU finite option helper split

- 状態: completed; full verification passed before commit.
- 対象: CPU の小さな helper 分離。
- 修正済み:
  - `js/CPU.js` の expert 数値 option fallback 判定を `CPU._finiteOption()` に集約した。
  - `tests/cpu.test.js` に `0` を有効値として保持し、`Infinity` / 欠落だけ fallback する contract test を追加した。
- コード挙動: expert preset / tuning / benchmark heuristic は変更なし。constructor 内の重複した `Number.isFinite` 判定だけを helper 化。
- 残課題:
  - build menu / card select 周辺のさらなる小さな UI helper 分離は継続 backlog。
  - server のさらなる小さな helper 分離は継続 backlog。
  - scoped restore の旧key pruning / 複数room resume UI は design required として維持。

## Backlog cleanup - action metadata payloadKind contract test

- 状態: completed; full verification passed before commit.
- 対象: action metadata contract の追加 test。
- 修正済み:
  - `tests/gamemanager.test.js` に、`GAME_ACTION_REGISTRY` の `payloadKind` が `emptyObject` 以外では action 名と一致する contract test を追加した。
- コード挙動: 実装変更なし。server validator / client apply / replay routing が action 名ベースで共有している暗黙契約をテストで固定。
- 残課題:
  - online storage の scoped read migration / 旧key pruning / 複数room resume UI は design required として維持。
  - CPU / UI / server のさらなる小さな helper 分離は継続 backlog。

## Backlog cleanup - online restore storage key list helper

- 状態: completed; full verification passed before commit.
- 対象: online storage の per-room namespace 化の小さな足場。
- 修正済み:
  - `js/online.js` に `_onlineRoomStorageKeys()` を追加し、legacy key と room-scoped key を同じ順序で扱う restore storage contract を明示した。
  - `_writeOnlineRestoreStorageJson()` / `_removeOnlineRestoreStorageItem()` は同 helper 経由で legacy + scoped copy を更新・削除するようにした。
  - `tests/online.test.js` に key list helper の正規化・二重scoping回避・room未指定fallbackを固定するテストを追加した。
- コード挙動: restore bundle の legacy copy と scoped copy を維持する既存挙動を保持。旧key pruning / 複数room resume UI には未着手。
- 残課題:
  - scoped restore の旧key pruning / 複数room resume UI は design required として維持。
  - UI / server のさらなる小さな helper 分離は継続 backlog。

## Backlog cleanup - legacy pending outbound session reader

- 状態: completed; full verification passed before commit.
- 対象: legacy pending outbound の room gate 強化。
- 修正済み:
  - `js/online.js` に `_readPendingOutboundActionForCurrentSession()` を追加し、復元ログへ混ぜる経路では current room の明示 `roomId` を持つ pending だけを扱うようにした。
  - `_tryRestoreRoom()` / `_readLocalRestoreBundle()` は同 helper 経由で pending outbound を読むようにした。
  - `tests/online.test.js` に別room legacy pending と roomIdなし legacy pending が復元対象にならない contract test を追加した。
- コード挙動: `_readPendingOutboundAction()` の legacy fallback は互換性のため維持し、復元・再送判断だけを current session gate へ寄せた。
- 残課題:
  - scoped restore の旧key pruning / 複数room resume UI は design required として維持。
  - server / UI / CPU のさらなる小さな helper 分離は継続 backlog。

## Backlog cleanup - action metadata frozen contract test

- 状態: completed; full verification passed before commit.
- 対象: action metadata contract の追加 test。
- 修正済み:
  - `tests/gamemanager.test.js` に `GAME_ACTIONS` / `GAME_PHASE_ACTIONS` / `GAME_ACTION_REGISTRY` と各 phase action list / registry entry が frozen であることを固定する contract test を追加した。
- コード挙動: 実装変更なし。既存の metadata table を外部変更不可な編集契約としてテストで明文化した。
- 残課題:
  - scoped restore の旧key pruning / 複数room resume UI は design required として維持。
  - server / UI / CPU のさらなる小さな helper 分離は継続 backlog。

## Backlog cleanup - card select toggle HTML helper split

- 状態: completed; full verification passed before commit.
- 対象: UI の小さな helper 分離 / card select 周辺。
- 修正済み:
  - `js/ui.js` の card select modal で、カード toggle とランドマーク toggle の HTML 生成を `buildCardSelectToggleButtonHtml()` / `buildLandmarkSelectToggleButtonHtml()` に分離した。
  - `tests/ui.test.js` に data-action / target data / aria-pressed を固定する helper contract test を追加した。
- コード挙動: 既存の delegated handler と表示順を維持。HTML 文字列生成だけを小さく分離した。
- 残課題:
  - server / CPU のさらなる小さな helper 分離は継続 backlog。
  - scoped restore の旧key pruning / 複数room resume UI は design required として維持。

## Backlog cleanup - server current action gate helper split

- 状態: completed; full verification passed before commit.
- 対象: server.js の小さな helper 分離 / validateGameAction 周辺。
- 修正済み:
  - `validateGameAction()` に埋まっていた playerOrder 変換と CPU ターンのホスト代理判定を `originalPlayerIndexForGamePosition()` / `canSocketSubmitCurrentAction()` に分離した。
  - `tests/server.test.js` に helper contract test を追加し、human turn の playerOrder 判定と CPU turn の host-only 判定を固定した。
- コード挙動: 既存の allowed action / payload validation / mirror 更新は変更なし。送信者 gate の条件だけを同じ判定の helper に移した。
- 残課題:
  - server の room lifecycle / restore 周辺のさらなる helper 分離は継続 backlog。
  - scoped restore の旧key pruning / 複数room resume UI は design required として維持。

## Backlog cleanup - CPU v2simple affordable option helper split

- 状態: completed; full verification passed before commit.
- 対象: CPU.js の小さな helper 分離 / expert v2simple build 候補列挙。
- 修正済み:
  - `_buildExpertV2Simple()` 内の買えるランドマーク / カード候補列挙を `_listExpertV2SimpleAffordableLandmarks()` / `_listExpertV2SimpleAffordableCards()` に分離した。
  - `tests/cpu.test.js` に、無効ランドマーク・建設済みランドマーク・在庫切れカード・紫カード重複の候補 gate を固定する helper contract test を追加した。
- コード挙動: 候補列挙条件は既存条件の移動のみ。スコアリング、選択、購入処理は変更なし。
- 残課題:
  - CPU diagnostics / scoring 周辺のさらなる小さな helper 分離は継続 backlog。
  - scoped restore の旧key pruning / 複数room resume UI は design required として維持。
