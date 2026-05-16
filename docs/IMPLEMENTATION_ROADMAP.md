# Implementation roadmap

作成日: 2026-05-17

このロードマップは `docs/PROJECT_ISSUES.md`, `docs/TECH_DEBT.md`, `docs/AI_MAINTENANCE_ISSUES.md` を実装順に並べ替えたものです。Codex が上から順に小さな PR として処理できる粒度を優先します。

## 方針

- Critical / High を先に潰す。
- 破壊的な構造変更は、先に guard / test / docs を入れてから行う。
- 1 PR は 1 failure mode または 1 boundary に限定する。
- オンライン、復元、CPU、PWA は既存挙動を壊すと影響が大きいため、必ず targeted test を追加する。
- 大規模 rename、保存形式の即時切替、server authoritative 化は単独 PR で行わない。

## 全体依存関係

1. **安全柵**: malformed payload guard、size limit、roundtrip test、schema coverage。
2. **境界の明文化**: online trust model、action schema、snapshot field list、AI向け注意点。
3. **小さな構造整理**: pending helper、card definition正本化、action registry coverage。
4. **実装分離**: server validation/mirror分離、CPU実行器共通化、UI event delegation。
5. **長期変更**: server canonical mirror、server-side dice、pending queue、RL schema v2。

## Priority 0: 即対応する安全柵

### PR-001 Socket.IO payload guard

- 優先順位: Critical
- 対象ファイル: `server.js`, `tests/server.test.js`
- 修正内容: `createRoom`, `joinRoom`, `gameAction`, `rejoinRoom`, `recreateRoom` などの Socket.IO event entrypoint に plain object guard を追加する。`null`, `[]`, `"x"`, `{ unexpected: true }` を受けても例外化せず `appError` または拒否結果を返す。
- 期待効果: 壊れたクライアントや外部 client からの per-socket 例外を防ぐ。
- リスク: handler の destructuring 位置を変えるため、既存正常 payload を誤って拒否する可能性。
- テスト方法: `node --check server.js`, `node tests/server.test.js`, `npm run test:online`
- 推奨コミット単位: `fix: Socket.IO payload入口を不正形から保護`
- 依存: なし。

### PR-002 recreateRoom payload size limit

- 優先順位: Critical
- 対象ファイル: `server.js`, `tests/server.test.js`, `docs/ONLINE_SYNC.md`
- 修正内容: `recreateRoom` / restore payload に actionLog 件数、player cards 総数、文字列長、log length、JSON概算サイズの上限を追加する。制限値を docs に記録する。
- 期待効果: client snapshot/actionLog を使った CPU/メモリ DoS を抑える。
- リスク: 既存の長時間対戦が制限値に当たる可能性。まず十分大きい値で入れる。
- テスト方法: `node tests/server.test.js`, `npm run test:online`
- 推奨コミット単位: `fix: 復元payloadのサイズ上限を追加`
- 依存: PR-001 後が望ましい。

### PR-003 replay malformed payload matrix

- 優先順位: Critical
- 対象ファイル: `server.js`, `tests/server.test.js`
- 修正内容: `GAME_ACTIONS` 全 action について、`null`, `[]`, `"x"`, `{}` payload の replay が例外化せず拒否されることを table-driven test で固定する。必要なら `applyActionToMirror()` の前に payload guard を追加する。
- 期待効果: server restart restore / actionLog replay の壊れ方を一括で固定できる。
- リスク: 旧互換 payload まで拒否しないように個別例外を丁寧に扱う必要がある。
- テスト方法: `node tests/server.test.js`, `npm run test:online`
- 推奨コミット単位: `test: replay payload不正形の拒否を網羅`
- 依存: PR-001 後。

### PR-004 snapshot roundtrip tests

- 優先順位: High
- 対象ファイル: `tests/server.test.js`, `tests/online.test.js`, 必要なら `server.js`, `js/online.js`
- 修正内容: `serializeMirrorState -> restoreMirrorState -> serializeMirrorState`、`buildOnlineSnapshot -> restoreOnlineSnapshot -> buildOnlineSnapshot`、Undo snapshot の roundtrip deep equality を追加する。
- 期待効果: `pendingTunaDice`, dormant, `undoState`, `hadAmusementParkAtRoll`, IT積立などの復元漏れを検出できる。
- リスク: 旧 snapshot 互換の補完挙動と完全一致テストが衝突する可能性。新形式 fixture と旧形式 fixture を分ける。
- テスト方法: `node tests/server.test.js`, `node tests/online.test.js`, `npm run test:online`
- 推奨コミット単位: `test: online snapshot roundtripを固定`
- 依存: PR-003 後が望ましい。

### PR-005 Python static check

- 優先順位: High
- 対象ファイル: `package.json`, `tests/run-all.js` または新規 script, `docs/maintenance-checklists.md`
- 修正内容: `test:static` か新規 `test:static:py` に `python3 -m py_compile` を追加する。Termuxで Python が無い場合の扱いを docs に明記する。
- 期待効果: RL Python の構文壊れを早期検出する。
- リスク: Python 未導入環境で `test:static` が落ちる可能性。必須化するか別 script にするかを明示する。
- テスト方法: `npm run test:static`, `python3 -m py_compile scripts/rl/*.py`
- 推奨コミット単位: `test: Python構文チェック入口を追加`
- 依存: なし。

## Priority 1: オンライン信頼境界の明文化と短期補強

### PR-006 online trust model docs

- 優先順位: Critical
- 対象ファイル: `docs/ONLINE_SYNC.md`, `docs/TECH_DEBT.md`, `docs/PROJECT_ISSUES.md`
- 修正内容: 現状は client dice / host restore snapshot を信頼する casual model であること、公開/競技運用には server-side dice と canonical mirror が必要なことを明記する。
- 期待効果: AIや人間が「server authoritative」と誤認して修正するのを防ぐ。
- リスク: 実装変更なしなのでリスク低。
- テスト方法: docs のみ。`git diff --check`
- 推奨コミット単位: `docs: オンライン信頼境界を明文化`
- 依存: なし。

### PR-007 accepted clientActionId owner check

- 優先順位: Medium
- 対象ファイル: `server.js`, `tests/server.test.js`
- 修正内容: accepted action の再送判定で `clientActionId` だけでなく `playerIndex` も一致確認する。
- 期待効果: 冪等 ack の権限境界が明確になる。
- リスク: 古い clientActionId fixture が playerIndex を持たない場合に調整が必要。
- テスト方法: `node tests/server.test.js`, `npm run test:online`
- 推奨コミット単位: `fix: action再送ackを送信者単位で照合`
- 依存: PR-001 後。

### PR-008 online action timeout

- 優先順位: High
- 対象ファイル: `js/online.js`, `js/main.js`, `tests/online.test.js`, `tests/online-integration.test.js`
- 修正内容: `onlineActionInFlight` に送信時刻と timeout を追加し、一定時間 ack が無い場合は再同期/再接続へ倒す。
- 期待効果: モバイル回線での操作不能状態を減らす。
- リスク: 遅延した ack と timeout 再同期が競合する可能性。
- テスト方法: `node tests/online.test.js`, `node tests/online-integration.test.js`, `npm run test:online`
- 推奨コミット単位: `fix: online action送信待ちにtimeoutを追加`
- 依存: PR-004 後が望ましい。

### PR-009 room lifecycle rate limit / pre-start TTL

- 優先順位: High
- 対象ファイル: `server.js`, `tests/server.test.js`, `docs/ONLINE_SYNC.md`
- 修正内容: 未開始 room TTL、最大 room 数、socket単位 createRoom rate limit を追加する。
- 期待効果: room spam とメモリDoSを抑える。
- リスク: 正常な部屋作成を誤って拒否しないよう制限値を緩めにする。
- テスト方法: `node tests/server.test.js`
- 推奨コミット単位: `fix: 未開始roomのTTLと作成制限を追加`
- 依存: PR-001 後。

## Priority 2: action / phase / pending の足場整理

### PR-010 action registry coverage test

- 優先順位: High
- 対象ファイル: `js/GameManager.js`, `server.js`, `js/online.js`, `tests/server.test.js`, `tests/online.test.js`
- 修正内容: `GAME_ACTIONS` の全値が server payload validator、server mirror apply、client apply に対応していることをテストで固定する。まず実装統合はせず coverage test のみ。
- 期待効果: 新 action 追加時の replay/client/server 漏れを即検出する。
- リスク: private switch の検査方法が弱くなる可能性。必要なら test-only action list helper を追加する。
- テスト方法: `node tests/server.test.js`, `node tests/online.test.js`, `npm run test:online`
- 推奨コミット単位: `test: action schemaの層間網羅性を固定`
- 依存: PR-003 後。

### PR-011 pending state read helper

- 優先順位: High
- 対象ファイル: `js/GameManager.js`, `tests/gamemanager.test.js`, `server.js`, `js/main.js`
- 修正内容: `GameManager.pendingActionsFor(game)` または `getPendingActionState(game)` を追加し、既存 `pendingTV` 等を読み取って action descriptors を返す。既存fieldは消さない。
- 期待効果: pending queue 導入前に、UI/CPU/server が同じ一覧を見られる。
- リスク: `pendingIT` の優先順を誤ると既存挙動が変わる。
- テスト方法: `node tests/gamemanager.test.js`, `node tests/server.test.js`, `npm test`
- 推奨コミット単位: `feat: pending action状態の読み取りhelperを追加`
- 依存: PR-010 後が望ましい。

### PR-012 reset turn / pending helpers

- 優先順位: High
- 対象ファイル: `js/GameManager.js`, `tests/gamemanager.test.js`, `js/storage.js`, `js/online.js`
- 修正内容: turn/pending初期化の重複を `resetTurnState()` / `resetPendingState()` へ寄せる。まず `nextTurn` と restore 初期化の重複を減らす。
- 期待効果: 新 pending field 追加時の初期化漏れを減らす。
- リスク: restore時に保持すべき field まで消さないよう注意。
- テスト方法: `node tests/gamemanager.test.js`, `node tests/storage.test.js`, `node tests/online.test.js`, `npm test`
- 推奨コミット単位: `refactor: turnとpending初期化をhelper化`
- 依存: PR-011 後。

### PR-013 action registry implementation scaffold

- 優先順位: Medium
- 対象ファイル: `js/GameManager.js`, `server.js`, `js/online.js`, `tests/server.test.js`, `tests/online.test.js`
- 修正内容: 実行本体は大きく変えず、`GAME_ACTION_REGISTRY` に action name, phase, payload kind, replay/apply presence を持たせる。server/client共通化はまだしない。
- 期待効果: 新 action 追加時の作業リストが registry に集約される。
- リスク: registry と実switchの二重管理が一時的に増える。
- テスト方法: `npm run test:online`, `npm test`
- 推奨コミット単位: `feat: action registryの足場を追加`
- 依存: PR-010, PR-011 後。

## Priority 3: Card/data model の正本化

### PR-014 CARD_DEFS scaffold

- 優先順位: High
- 対象ファイル: `js/Card.js`, `tests/gamemanager.test.js`, `docs/CARD_SYSTEM.md`
- 修正内容: `CARD_DEFS` object 配列を導入し、既存 `CARDS`, `CARD_NAME_BY_ID`, `CARD_ID_BY_NAME` を生成する。外部挙動は変えない。
- 期待効果: positional constructor と ID map の二重管理を減らす。
- リスク: card order が変わると UI/CPU/RL に影響するため、順序テストが必要。
- テスト方法: `node --check js/Card.js`, `node tests/gamemanager.test.js`, `npm test`
- 推奨コミット単位: `refactor: カード定義の正本をCARD_DEFSへ集約`
- 依存: PR-010 後が望ましい。

### PR-015 card activation profile helper

- 優先順位: Medium
- 対象ファイル: `js/Card.js`, `js/GameManager.js`, `tests/gamemanager.test.js`, `docs/CARD_SYSTEM.md`
- 修正内容: `getCardActivationProfile(card)` を追加し、`NORMAL` の色別 target/timing と複合 effect の triggers を明文化する。
- 期待効果: metadata駆動化で赤NORMALをself income扱いする誤修正を防ぐ。
- リスク: 実処理とprofileが一時的に二重管理になる。
- テスト方法: `node tests/gamemanager.test.js`
- 推奨コミット単位: `feat: カード発火profile helperを追加`
- 依存: PR-014 後。

### PR-016 card id count helpers

- 優先順位: Medium
- 対象ファイル: `js/Player.js`, `js/GameManager.js`, `tests/gamemanager.test.js`, `docs/CARD_SYSTEM.md`
- 修正内容: `Player.countCardById()`, `countCardIncludingDormantById()` を追加し、income handlers の一部を ID 参照へ移す。
- 期待効果: 名前変更・多言語化・同系カード追加に強くなる。
- リスク: 旧 name fallback と id 比較の混在期間が発生する。
- テスト方法: `node tests/gamemanager.test.js`, `npm test`
- 推奨コミット単位: `refactor: カード枚数判定をID参照へ寄せる`
- 依存: PR-014 後。

### PR-017 shopStock ID migration scaffold

- 優先順位: Medium
- 対象ファイル: `js/main.js`, `js/online.js`, `js/storage.js`, `server.js`, `tests/online.test.js`, `tests/storage.test.js`
- 修正内容: 保存形式は維持しつつ、内部 helper で name/id どちらでも stock を読めるようにする。いきなり保存形式を切り替えない。
- 期待効果: 将来の `shopStockById` 移行準備。
- リスク: 在庫 key の二重管理で減算漏れが起きる可能性。
- テスト方法: `node tests/storage.test.js`, `node tests/online.test.js`, `npm run test:online`
- 推奨コミット単位: `feat: shop stockのID移行helperを追加`
- 依存: PR-016 後。

## Priority 4: CPU / RL の停止・乖離対策

### PR-018 CPU smoke coverage

- 優先順位: High
- 対象ファイル: `package.json`, `tests/run-all.js`, `tests/cpu.test.js`
- 修正内容: `test:smoke` に軽量な CPU pending/loop 回帰を含める。重い simulation は入れない。
- 期待効果: Termux日常確認でCPU停止退行を検出できる。
- リスク: smoke 実行時間が増える。
- テスト方法: `npm run test:smoke`, `npm run test:cpu`
- 推奨コミット単位: `test: smokeにCPU停止回帰を追加`
- 依存: なし。

### PR-019 CPU execution helper alignment

- 優先順位: Medium
- 対象ファイル: `js/main.js`, `js/CPU.js`, `scripts/selfplay.js`, `tests/cpu.test.js`, `tests/selfplay.test.js`
- 修正内容: live/simulation/selfplay の pending解決順と fallback を共通 helper へ寄せる。最初はTV/Business/Mover/Renovationだけ対象。
- 期待効果: liveと評価環境の乖離を減らす。
- リスク: CPU挙動が微妙に変わるため、既存勝率/診断テストへの影響がある。
- テスト方法: `npm run test:cpu`, `node tests/selfplay.test.js`, `npm test`
- 推奨コミット単位: `refactor: CPU pending実行を共通helperへ寄せる`
- 依存: PR-011, PR-018 後。

### PR-020 CPU build action result

- 優先順位: High
- 対象ファイル: `js/CPU.js`, `js/RLCPU.js`, `js/main.js`, `tests/main.test.js`, `tests/cpu.test.js`, `tests/rlcpu.test.js`
- 修正内容: `_buyCard`, `_buyLandmark`, `build()` が success/failure を返し、online send failure 時は次 step へ流れないようにする。
- 期待効果: オンラインCPUが建設送信失敗時に購入機会を失う問題を防ぐ。
- リスク: 既存CPU buildの戻り値未使用前提を変えるため、影響範囲が広い。
- テスト方法: `node tests/main.test.js`, `npm run test:cpu`, `node tests/rlcpu.test.js`, `npm test`
- 推奨コミット単位: `fix: CPU建設actionの送信失敗を検知`
- 依存: PR-019 前でも可能だが、後の方が安全。

### PR-021 CPU tuning extraction scaffold

- 優先順位: Medium
- 対象ファイル: `js/CPU.js`, 新規 `js/cpuTuning.js` または docs, `index.html`, `tests/cpu.test.js`
- 修正内容: まず expert preset / default option を別テーブルへ分離する。script order を維持する。
- 期待効果: tuning の意味と live/eval/training の差分が追いやすくなる。
- リスク: browser-global script order が増える。
- テスト方法: `node --check js/CPU.js`, `npm run test:cpu`, `npm test`
- 推奨コミット単位: `refactor: CPU tuning presetを分離`
- 依存: PR-019 後が望ましい。

## Priority 5: UI / Mobile / PWA の安全改善

### PR-022 PWA banner and z-index scale

- 優先順位: High
- 対象ファイル: `style.css`, `index.html`, `js/appShell.js`, `tests/main.test.js`, `docs/maintenance-checklists.md`
- 修正内容: `#pwaUpdateBanner` のCSSを追加し、install/update共通classを作る。modal/pending/PWAの z-index scale をコメント化する。
- 期待効果: PWA banner がゲーム中modalを覆う事故を減らす。
- リスク: PWA表示の見た目が変わる。
- テスト方法: `npm run test:pwa`, `node tests/main.test.js`, 手動で更新バナー表示を確認。
- 推奨コミット単位: `fix: PWAバナーの表示階層を整理`
- 依存: なし。

### PR-023 appShell offline button selectors

- 優先順位: Medium
- 対象ファイル: `index.html`, `js/appShell.js`, `tests/main.test.js`
- 修正内容: online create/join submit button に専用 id を追加し、`updateOnlineTabState()` が正しいボタンを無効化するようにする。
- 期待効果: オフライン時の操作制御が安定する。
- リスク: HTML id 追加に伴うテスト fixture 更新。
- テスト方法: `node tests/main.test.js`, `npm run test:pwa`
- 推奨コミット単位: `fix: オンライン操作ボタンの無効化対象を明確化`
- 依存: なし。

### PR-024 showNotice helper

- 優先順位: Medium
- 対象ファイル: `js/ui.js`, `js/main.js`, `js/storage.js`, `js/online.js`, `tests/ui.test.js`, `tests/storage.test.js`, `tests/online.test.js`
- 修正内容: native `alert()` を直接呼ばず `showNotice()` 経由へ置換する。最初は alert fallback 付きで挙動を保つ。
- 期待効果: PWA/TWA/スマホで通知UXを統一できる。
- リスク: テスト環境で alert capture が変わる。
- テスト方法: `node tests/storage.test.js`, `node tests/online.test.js`, `npm test`
- 推奨コミット単位: `refactor: 通知表示をshowNoticeへ集約`
- 依存: なし。

### PR-025 pending UI event delegation scaffold

- 優先順位: Medium
- 対象ファイル: `js/ui.js`, `js/main.js`, `tests/ui.test.js`, `tests/main.test.js`
- 修正内容: pending modal だけ `data-action` / `data-*` に移し、delegated listener で main action を呼ぶ。build menu は後回し。
- 期待効果: 新 pending effect 追加時の inline handler 事故を減らす。
- リスク: UIイベントの既存挙動を壊しやすい。
- テスト方法: `node tests/ui.test.js`, `node tests/main.test.js`, `npm test`
- 推奨コミット単位: `refactor: pending UIをdata-actionへ移行`
- 依存: PR-011 後が望ましい。

### PR-026 render side-effect split scaffold

- 優先順位: High
- 対象ファイル: `js/ui.js`, `js/storage.js`, `tests/ui.test.js`, `tests/storage.test.js`
- 修正内容: `renderWinnerState()`, `renderActiveGameState()`, `persistAfterRender()` へ薄く分割する。挙動は変えない。
- 期待効果: UI変更が勝利処理や保存処理に波及するリスクを下げる。
- リスク: stats二重記録やsave漏れが出やすい。
- テスト方法: `node tests/ui.test.js`, `node tests/storage.test.js`, `npm test`
- 推奨コミット単位: `refactor: renderの勝利処理と保存境界を分離`
- 依存: PR-024 後が望ましい。

## Priority 6: server.js / architecture 分離

### PR-027 server section markers and test-only exports note

- 優先順位: High
- 対象ファイル: `server.js`, `docs/ARCHITECTURE.md`, `docs/AI_MAINTENANCE_ISSUES.md`
- 修正内容: `server.js` に Room lifecycle / Validation / Mirror replay / Snapshot / Socket events / Test exports の section comment を入れる。exports は test-only であることを docs に追記する。
- 期待効果: 大規模分離前に読み取り負荷を下げる。
- リスク: コメント中心で挙動リスクは低い。
- テスト方法: `node --check server.js`, `npm run test:static`
- 推奨コミット単位: `docs: server内部境界を明記`
- 依存: なし。

### PR-028 action validation extraction

- 優先順位: High
- 対象ファイル: `server.js`, 新規 `server/actionValidation.js` または同等, `tests/server.test.js`
- 修正内容: payload validation の純関数群を server から切り出す。Socket event と room lifecycle は残す。
- 期待効果: online validation変更の差分が小さくなる。
- リスク: CommonJS/browser runtime dependency の渡し方を誤るとテストが壊れる。
- テスト方法: `node --check server.js`, `node tests/server.test.js`, `npm run test:online`
- 推奨コミット単位: `refactor: server action validationを分離`
- 依存: PR-027, PR-010 後。

### PR-029 mirror replay extraction

- 優先順位: Medium
- 対象ファイル: `server.js`, 新規 `server/mirrorReplay.js`, `tests/server.test.js`
- 修正内容: `createRoomMirror`, `applyActionToMirror`, snapshot serialize/restore 付近を切り出す。
- 期待効果: restore/replay修正の影響範囲が見える。
- リスク: stateful room data と pure mirror data の境界が難しい。
- テスト方法: `node tests/server.test.js`, `npm run test:online`
- 推奨コミット単位: `refactor: server mirror replayを分離`
- 依存: PR-004, PR-028 後。

## Priority 7: 長期設計テーマ

### PR-030 server-side dice design and prototype

- 優先順位: Critical / long-term
- 対象ファイル: `docs/ONLINE_SYNC.md`, `server.js`, `js/online.js`, `js/main.js`, `tests/server.test.js`, `tests/online.test.js`
- 修正内容: まず設計docsで server-side dice と旧client互換方針を決める。その後、onlineだけ server が出目を発行する prototype を作る。
- 期待効果: cheating耐性が大幅に上がる。
- リスク: 既存 replay/action schema と乱数演出が変わるため高リスク。
- テスト方法: `npm run test:online`, `npm test`, 手動オンライン確認。
- 推奨コミット単位: docs設計PRと実装PRを分ける。
- 依存: PR-010, PR-028 後。

### PR-031 server canonical mirror experiment

- 優先順位: Critical / long-term
- 対象ファイル: `server.js`, server mirror modules, `tests/server.test.js`, `docs/ONLINE_SYNC.md`
- 修正内容: room に canonical mirror を保持し、action ごとに増分適用する実験を行う。actionLog replay は復元/検証補助に下げる。
- 期待効果: 長時間対戦、latency、restore、payload検証の複雑さを減らす。
- リスク: onlineの中核設計変更。既存再接続/Undo/host移譲に広く影響。
- テスト方法: `npm run test:online`, `npm test`, `TESTPLAN.md` のオンライン手動確認。
- 推奨コミット単位: 実験branch推奨。mainへは小分けで入れる。
- 依存: PR-004, PR-028, PR-029, PR-030 後。

### PR-032 pendingActions queue migration

- 優先順位: High / long-term
- 対象ファイル: `js/GameManager.js`, `js/main.js`, `js/ui.js`, `js/online.js`, `server.js`, `js/storage.js`, tests全般
- 修正内容: 既存 `pendingTV` などを互換 field として残しながら、内部正本を `pendingActions` queue へ移す。
- 期待効果: 新 interactive card 追加時の修正箇所を減らす。
- リスク: 保存互換、replay互換、UI表示順に大きく影響。
- テスト方法: `npm test`, `npm run test:online`, `npm run test:cpu`
- 推奨コミット単位: helper導入、dual-write、read移行、field削減の4段階。
- 依存: PR-011, PR-012, PR-013 後。

### PR-033 RL state/action schema v2 design

- 優先順位: Medium / long-term
- 対象ファイル: `docs/CPU_AI.md`, `docs/rl-experiments.md`, `js/RLCPU.js`, `scripts/rl/train.py`, RL tests
- 修正内容: business action factorization、省略相手集約特徴、正規化overflow feature を設計する。既存モデル互換は維持する。
- 期待効果: 拡張カード、多人数、学習品質への耐性が上がる。
- リスク: 既存 portfolio / registry / model compatibility へ影響。
- テスト方法: `npm run test:rl`, `npm test`, Python/JS trace比較。
- 推奨コミット単位: docs設計、runtime互換層、training対応、portfolio更新を分ける。
- 依存: PR-014, PR-015, PR-021 後が望ましい。

## 実装時の標準確認

### Docs only

- `git diff --check`

### Client JS touched

- `node --check js/<file>.js`
- 関連 targeted test
- `npm run test:static`

### Online/server touched

- `node --check server.js`
- `node tests/server.test.js`
- `node tests/online.test.js`
- `npm run test:online`
- `npm run test:smoke`

### GameManager/card touched

- `node --check js/GameManager.js`
- `node --check js/Card.js`
- `node tests/gamemanager.test.js`
- `npm test`

### CPU/RL touched

- `node --check js/CPU.js`
- `npm run test:cpu`
- `npm run test:rl` when RL touched
- `npm test`

### UI/PWA touched

- `node tests/ui.test.js`
- `node tests/main.test.js`
- `npm run test:pwa` when appShell/SW/index update flow touched
- スマホ低画面 / modal / PWA banner の手動確認

## 推奨コミット順まとめ

1. `fix: Socket.IO payload入口を不正形から保護`
2. `fix: 復元payloadのサイズ上限を追加`
3. `test: replay payload不正形の拒否を網羅`
4. `test: online snapshot roundtripを固定`
5. `test: Python構文チェック入口を追加`
6. `docs: オンライン信頼境界を明文化`
7. `test: action schemaの層間網羅性を固定`
8. `feat: pending action状態の読み取りhelperを追加`
9. `refactor: カード定義の正本をCARD_DEFSへ集約`
10. `test: smokeにCPU停止回帰を追加`
11. `fix: PWAバナーの表示階層を整理`
12. `docs: server内部境界を明記`

この順番なら、先にテストと境界を固めてから構造整理へ進めます。
