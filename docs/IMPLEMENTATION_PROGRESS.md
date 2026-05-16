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
