# Project issues inventory

作成日: 2026-05-16

この文書は、街コロプロジェクト全体を「半年〜数年運用したときに壊れそうな場所」という観点で棚卸ししたものです。現時点で通常プレイを即停止させる既知バグだけでなく、公開運用、オンライン長時間対戦、新カード追加、スマホ作業、AI保守で問題化しやすい構造も含めます。

> Status note (2026-05-20): この棚卸しは historical inventory です。C-01/C-04 など複数項目は `docs/IMPLEMENTATION_PROGRESS.md` の Cycle/PR 記録で対応済みです。現時点の active Critical/High はこの文書単体ではなく、最新の `docs/POST_IMPLEMENTATION_AUDIT.md` と `docs/AI_HANDOFF.md` の review note を優先してください。C-03 host-supplied restore snapshot の署名/永続 canonical state は design decision required として残っています。


## Critical

### C-01 Socket.IO event entrypoint が malformed payload に弱い

- 問題点: `createRoom`, `joinRoom`, `gameAction`, `rejoinRoom` などが handler 引数を直接 destructuring しており、`null` や文字列 payload の入口 guard が薄い。
- 原因: UI/client から正しい object が来る前提で server event を書いている。
- 影響: 壊れたクライアントや外部 Socket.IO client から per-socket 例外、ログ汚染、DoS 的挙動が起きる可能性がある。
- 推奨改善: 各 socket handler 冒頭で `isPlainObject(payload)` を確認し、失敗時は `appError` で返す。`null`, `[]`, `"x"` payload のテーブルテストを追加する。
- 修正難易度: 小。
- 関連ファイル: `server.js`, `tests/server.test.js`
- 将来的リスク: 公開URL化や外部クライアント対応を始めると最初に攻撃/事故の入口になる。

### C-02 オンライン対戦の出目を client が生成している

- 問題点: `rollDice`, `selectDice`, `rerollDice` の出目は client payload で送られ、server は 1〜6 の範囲だけ検証する。
- 原因: server は完全な authoritative state を持たず、client action log を検証/中継する設計。
- 影響: devtools 等で任意の出目を送れるため、競技性や公開対戦の cheating 耐性は低い。
- 推奨改善: server-side dice、server seed、または commit-reveal を導入する。短期の正本として `ONLINE_SYNC.md` の trust boundary に「現状は casual trust」と明記済み。
- 修正難易度: 中〜高。
- 関連ファイル: `server.js`, `js/main.js`, `js/online.js`, `docs/ONLINE_SYNC.md`
- 将来的リスク: ランク戦、公開部屋、観戦、戦績保存を入れると信頼境界が破綻する。

### C-03 server restart restore が host 由来 snapshot に強く依存する

- 問題点: host の local restore bundle を改変すると、server 再起動後に不正な coins/cards/state を持ち込める余地がある。
- 原因: 復元時に snapshot を高速化材料として使い、initial state + signed action log だけで完全再構築していない。
- 影響: 型・在庫・有効カード検証はあるが、全コイン増減やカード流通量の正当性証明が弱い。
- 推奨改善: snapshot conservation test を追加し、長期的には signed action log / server canonical mirror / state hash を導入する。現行の host restore 信頼境界は `ONLINE_SYNC.md` の trust boundary を正本にする。
- 修正難易度: 中〜高。
- 関連ファイル: `server.js`, `js/online.js`, `docs/online-restore-schema.md`
- 将来的リスク: 再接続復元が中核機能であるほど、不正復元と同期ズレ調査が難しくなる。

### C-04 recreateRoom payload に総量制限がない

- 問題点: `gameStartPayload`, `stateSnapshot`, `actionLog` に大きな配列や長い文字列を送れてしまう。
- 原因: actionLog 件数、カード総数、文字列長、JSON概算サイズの上限が server entrypoint にない。
- 影響: replay/mirror 作成が重くなり、CPU/メモリ DoS になる可能性がある。
- 推奨改善: payload size、actionLog length、player cards total、log length、string length の上限を設ける。
- 修正難易度: 小〜中。
- 関連ファイル: `server.js`, `tests/server.test.js`
- 将来的リスク: 公開運用時に低コストで server が詰まる。

## High

### H-01 `CPU.js` が最大の God Object

- 問題点: 4673行に評価、探索、実行、expert tuning、simulation、diagnostics が同居している。
- 原因: CPU改善を単一クラスへ継ぎ足してきた。
- 影響: 新カード追加時に live CPU / selfplay / RL oracle のどれかだけが追従漏れしやすい。
- 推奨改善: `cpuTuning`, `cpuEvaluation`, `cpuExecution`, `cpuDiagnostics` へ段階分離する。
- 修正難易度: 高。
- 関連ファイル: `js/CPU.js`, `scripts/selfplay.js`, `tests/cpu.test.js`
- 将来的リスク: AIが局所修正で live と評価環境を同時に壊す。

### H-02 `server.js` がオンライン God Object

- 問題点: Socket event、room lifecycle、mirror replay、snapshot、payload validation、logging、exports が同居している。
- 原因: server authority 境界を1ファイルに集約してきた。
- 影響: オンライン修正時の読み取り範囲が大きく、再接続/Undo/host移譲の片側だけ壊れやすい。
- 推奨改善: まず section 化し、その後 `actionValidation`, `mirrorReplay`, `roomLifecycle` を純関数から分離する。
- 修正難易度: 高。
- 関連ファイル: `server.js`, `tests/server.test.js`
- 将来的リスク: restore/replay の高リスク修正が常に大規模差分になる。

### H-03 `GameManager` がルール正本だが pending/effect/turn を抱えすぎ

- 問題点: pending field、カード効果、phase遷移、turn end、勝利判定が同じ class に集中している。
- 原因: ルール正本を保つためにすべて `GameManager` へ集めてきた。
- 影響: 新 interactive effect 追加時に state field、resolver、UI、online schema、CPU を横断変更する必要がある。
- 推奨改善: `pending effect descriptor`, `resetTurnState()`, `hasPendingEffects()`, `effect handler` を順に追加する。
- 修正難易度: 中〜高。
- 関連ファイル: `js/GameManager.js`, `js/main.js`, `js/ui.js`, `server.js`
- 将来的リスク: pending 解決漏れで build phase に戻らない、または replay だけ壊れる。

### H-04 action schema が client/server/replay に重複

- 問題点: client `applyAction`, server `applyActionToMirror`, server `validateActionPayloadForState` が別々の switch/if を持つ。
- 原因: browser-global 構成で共通 action registry がない。
- 影響: 新 action を phase gate に足しても replay/restore/client apply のどれかが漏れる。
- 推奨改善: `GAME_ACTIONS` を起点に action registry test を追加し、最終的に `phase`, `payloadValidator`, `apply` の対応表へ寄せる。
- 修正難易度: 中。
- 関連ファイル: `js/GameManager.js`, `js/online.js`, `server.js`, `tests/server.test.js`
- 将来的リスク: ローカルでは動くがオンライン復元だけ拒否される。

### H-05 snapshot/restore schema が分散

- 問題点: local save、Undo、online snapshot、server snapshot が別々に手書きされている。
- 原因: 保存形式が用途ごとに増え、field list の正本がない。
- 影響: `GameManager` field 追加時に再接続後だけ `pendingTunaDice`, dormant, undo, turn flags がズレる。
- 推奨改善: snapshot field list と roundtrip test を追加する。schema version と migration policy を docs に固定する。
- 修正難易度: 中。
- 関連ファイル: `js/storage.js`, `js/online.js`, `server.js`, `tests/online.test.js`, `tests/server.test.js`
- 将来的リスク: 長時間オンライン対戦やサーバー再起動復元でだけ再現するバグが増える。

### H-06 browser-global の密結合が静的解析しづらい

- 問題点: script order と global mutation に依存し、依存方向が import/export で見えない。
- 原因: vanilla JS / browser-global 方針を維持している。
- 影響: AIや人間が owner を誤認し、読み込み順や global state を壊しやすい。
- 推奨改善: module化の前に global owner table と accessor を追加する。`index.html` の script order invariant test を強化する。
- 修正難易度: 中。
- 関連ファイル: `index.html`, `js/main.js`, `js/online.js`, `js/storage.js`, `docs/ARCHITECTURE.md`
- 将来的リスク: stale global 状態バグ、テスト環境と実ブラウザの差分。

### H-07 card 定義の正本がまだ二重化

- 問題点: `CARD_IDS/CARD_NAME_BY_ID` と `CARDS = [new Card(...)]` が別々に存在する。
- 原因: stable ID を後付けしたため、positional constructor が残っている。
- 影響: 新カード追加時に ID定義、名前map、card data、説明、metadata の同期漏れが起きる。
- 推奨改善: `CARD_DEFS` object 配列を正本にして、`CARDS`, `CARD_NAME_BY_ID`, `CARD_ID_BY_NAME` を生成する。
- 修正難易度: 中。
- 関連ファイル: `js/Card.js`, `tests/gamemanager.test.js`, `docs/CARD_SYSTEM.md`
- 将来的リスク: 名前変更、多言語化、拡張パックで互換性が崩れる。

### H-08 effect metadata がまだ dispatch の正本ではない

- 問題点: `CARD_EFFECT_METADATA` はあるが、実処理は `_processRed/_processBlue/_processGreen/_processPurple` の分岐に残る。
- 原因: Phase 2 は足場に留め、全面dispatch化は避けている。
- 影響: metadata だけ足して新 effect が動いたと誤解しやすい。
- 推奨改善: 「handler または明示例外」の coverage test を追加し、副作用なし income から順に handler 化する。
- 修正難易度: 中。
- 関連ファイル: `js/Card.js`, `js/GameManager.js`, `js/CPU.js`
- 将来的リスク: 実ルール、CPU評価、説明文の三者ズレ。

### H-09 pending state が個別 field で増える構造

- 問題点: `pendingTV`, `pendingBusiness`, `pendingCleaning`, `pendingMover`, `pendingRenovation`, `pendingIT` が直接管理される。
- 原因: 既存カード単位で state field を足してきた。
- 影響: 新 pending card 追加時に `GameManager`, `main`, `ui`, `server`, `storage`, `online`, `CPU`, tests を横断する。
- 推奨改善: 既存 field を残したまま `pendingActions` queue の読み取り helper を追加し、段階移行する。
- 修正難易度: 中〜高。
- 関連ファイル: `js/GameManager.js`, `js/main.js`, `js/ui.js`, `server.js`, `js/storage.js`
- 将来的リスク: 複数 pending の順番依存や replay 破綻。

### H-10 online action in-flight に timeout がない

- 問題点: `actionAccepted` が返らず socket も切れない場合、操作不能状態が続く。
- 原因: `onlineActionInFlight` は ack/reject/disconnect 前提で解除される。
- 影響: モバイル回線や一時 packet loss で UI が固まったように見える。
- 推奨改善: send timestamp と timeout を持ち、一定時間で再同期/再接続へ倒す。
- 修正難易度: 小〜中。
- 関連ファイル: `js/online.js`, `js/main.js`, `tests/online.test.js`
- 将来的リスク: Android/TWA/モバイル回線で離脱率が上がる。

### H-11 room 作成の rate limit / 未開始 room TTL がない

- 問題点: 開始前 room は TTL cleanup の主対象ではなく、接続保持で大量 room を維持できる。
- 原因: cleanup は started room / lastTouchedAt 中心。
- 影響: room map 増大、メモリDoS、ロビーspam。
- 推奨改善: IP/socket単位 rate limit、未開始 room TTL、最大 room 数を追加する。
- 修正難易度: 小。
- 関連ファイル: `server.js`
- 将来的リスク: 公開運用で server が不安定になる。

### H-12 UI が `innerHTML` + inline handler に強く依存

- 問題点: HTML生成と action payload が混ざり、`onclick="onBuildCard('...')"` のような文字列埋め込みが多い。
- 原因: vanilla JS で簡潔に実装してきた。
- 影響: escaping、関数名変更、カード名変更、スマホUI修正の差分が大きくなる。
- 推奨改善: pending UI から `data-action` + delegated listener へ移行する。
- 修正難易度: 中。
- 関連ファイル: `js/ui.js`, `index.html`, `tests/ui.test.js`
- 将来的リスク: 新カード追加時にUIだけ壊れる、XSS境界を誤る。

### H-13 PWA update banner の CSS と overlay 階層が弱い

- 問題点: `#pwaUpdateBanner` 用 CSS が不足し、`#pwaInstallBanner` は `z-index: 9999` で modal より前面に出る。
- 原因: overlay z-index scale がない。
- 影響: 更新/インストールバナーが pending modal や confirm を覆い、スマホで操作不能になる可能性。
- 推奨改善: install/update 共通 `.pwa-banner` と z-index scale を導入する。
- 修正難易度: 小。
- 関連ファイル: `index.html`, `style.css`, `js/appShell.js`
- 将来的リスク: PWA/TWA 更新フローがゲーム中操作を妨害する。

### H-14 `render()` が描画・保存・勝利副作用を兼任

- 問題点: UI描画内で stats、音、confetti、localStorage削除、毎回保存が実行される。
- 原因: render が lifecycle boundary も担当している。
- 影響: UI変更が保存/復元/勝利処理に波及する。
- 推奨改善: `renderWinnerState`, `renderActiveGameState`, `persistAfterAction` に分ける。
- 修正難易度: 中。
- 関連ファイル: `js/ui.js`, `js/storage.js`, `tests/ui.test.js`
- 将来的リスク: オンライン終了時やクラッシュ復帰時だけ状態が壊れる。

### H-15 `test:smoke` に CPU停止系が入っていない（resolved）

- 状態: resolved。`package.json` の `test:smoke` は `node tests/run-all.js cpu-smoke` を含む。
- 残課題: PWA / 実ブラウザ multi-client は `test:pwa` / `test:release` / manual checklist で分けて確認する。
- 関連ファイル: `package.json`, `tests/run-all.js`, `tests/cpu.test.js`

## Medium

### M-01 shop stock がカード名 key

- 問題点: `SHOP_STOCK[card.name]` が UI/CPU/server/restore に広く使われる。
- 原因: stable ID 導入前の保存形式。
- 影響: 名前変更や多言語化で在庫が壊れる。
- 推奨改善: `shopStockById` を内部標準にし、name fallback を残す。
- 修正難易度: 中。
- 関連ファイル: `js/main.js`, `js/CPU.js`, `js/online.js`, `server.js`
- 将来的リスク: 旧save互換と新カード追加の両立が難しくなる。

### M-02 CPU のカード知識が名前ベースで複製

- 問題点: 戦略補正に日本語カード名 magic string が多数残る。
- 原因: `cpuHints` や tag metadata がない。
- 影響: 新カードをCPUが買わない、過大評価する、コンボを理解しない。
- 推奨改善: `CARD_EFFECT_METADATA` に `comboSource`, `tags`, `cpuHints` を段階追加する。
- 修正難易度: 中〜高。
- 関連ファイル: `js/CPU.js`, `js/Card.js`, `docs/CPU_AI.md`
- 将来的リスク: 拡張パック追加時にCPU品質が急落する。

### M-03 CPU実行器が live / simulation / selfplay で三重化

- 問題点: phase/pending 解決順が `main`, `CPU._runSimulationStep`, `scripts/selfplay.js` に分散している。
- 原因: 用途別に実行器を足してきた。
- 影響: selfplayで直した停止がliveに残る、RL評価と実ゲーム挙動が乖離する。
- 推奨改善: `allowedActionsFor()` を入口にし、CPU action selection/execution helper を共有する。
- 修正難易度: 中。
- 関連ファイル: `js/main.js`, `js/CPU.js`, `scripts/selfplay.js`
- 将来的リスク: AI tournament / selfplay の信頼性が下がる。

### M-04 online restore の hostEpoch window

- 問題点: host移譲後、旧hostが最新 hostEpoch を知らずに server restart restore すると、一時的に古い復元 room が成立し得る。
- 原因: room が存在しない時点では server が他clientの新しい hostEpoch を知らない。
- 影響: 新hostが復元するまで同期ズレ window が発生する。
- 推奨改善: 復元待機 grace period、複数復元候補 rank 比較、または stale warning を導入する。
- 修正難易度: 中。
- 関連ファイル: `js/online.js`, `server.js`, `docs/ONLINE_SYNC.md`
- 将来的リスク: server restart と host handoff が重なると巻き戻りに見える。

### M-05 accepted clientActionId の owner 照合が弱い

- 問題点: 既承認 action の再送判定が clientActionId 中心で、playerIndex/socket identity の境界が薄い。
- 原因: 冪等性を優先した実装。
- 影響: action 自体は再適用されないが、ack 誤認や情報漏れの余地がある。
- 推奨改善: accepted entry の playerIndex と現在 socket の playerIndex を一致確認する。
- 修正難易度: 小。
- 関連ファイル: `server.js`, `tests/server.test.js`
- 将来的リスク: 再送処理拡張時に権限境界が曖昧になる。

### M-06 client restore validation が server より弱い

- 問題点: `restoreOnlineSnapshot()` は phase/currentPlayerIndex/cards 等をほぼ代入する。
- 原因: server canonical を前提にしている。
- 影響: 壊れた localStorage や古い server data で client だけ異常状態になる。
- 推奨改善: client側も最小 validation を追加し、失敗時は snapshot を捨てて actionLog replay へ倒す。
- 修正難易度: 小〜中。
- 関連ファイル: `js/online.js`, `tests/online.test.js`
- 将来的リスク: snapshot field 追加時にクライアントだけ壊れる。

### M-07 malformed replay payload matrix が不足

- 問題点: 全 action に対する `null`, `[]`, `"x"`, `{}` payload 拒否テストがない。
- 原因: actionごとの個別テスト中心。
- 影響: 新 action 追加時に replayだけ例外化する。
- 推奨改善: `GAME_ACTIONS` 全値に対する table-driven replay validation test を追加する。
- 修正難易度: 中。
- 関連ファイル: `server.js`, `tests/server.test.js`
- 将来的リスク: server restart restore の信頼性が落ちる。

### M-08 snapshot roundtrip の deep equality が弱い

- 問題点: key一致テストはあるが serialize→restore→serialize の値一致が不足。
- 原因: client/server/undo snapshot が別実装。
- 影響: `pendingTunaDice`, `undoState`, dormant, `hadAmusementParkAtRoll` が静かに落ちる可能性。
- 推奨改善: client/server/undo の roundtrip deep equality test を追加する。
- 修正難易度: 中。
- 関連ファイル: `js/online.js`, `server.js`, `tests/online.test.js`, `tests/server.test.js`
- 将来的リスク: 新field追加時に復元だけ壊れる。

### M-09 RL business action space がカード数の二乗

- 問題点: Business center の give/take が `CARDS.length^2` に近い action 空間を持つ。
- 原因: 互換性重視の joint action design。
- 影響: 新カード追加で推論/学習コストとモデル互換性が悪化する。
- 推奨改善: target/give/take の factorized decision を主にし、joint mask は互換層へ下げる。
- 修正難易度: 高。
- 関連ファイル: `js/RLCPU.js`, `scripts/rl/train.py`
- 将来的リスク: 拡張パック追加がRL再学習必須になる。

### M-10 RL多人数 state の情報落ち

- 問題点: 5人以上は自分 + 脅威上位3人へ射影する。
- 原因: state dimension 固定と性能/学習安定性優先。
- 影響: 下位席の赤/妨害/勝利直前が見えないことがある。
- 推奨改善: 省略人数の集約特徴を次世代 state schema に追加する。
- 修正難易度: 高。
- 関連ファイル: `js/RLCPU.js`, `scripts/rl/train.py`, `tests/rlcpu.test.js`
- 将来的リスク: 多人数モデルが局所最適になる。

### M-11 style.css が巨大で media query がない

- 問題点: 2198行の単一CSSで、幅/高さ/横向き/低スペ端末向け調整が乏しい。
- 原因: コンポーネント分割前の一枚CSS。
- 影響: 小型Android、横向き、TWA safe-area、長いカード説明で崩れやすい。
- 推奨改善: UI領域別コメント、media query、component class へ段階分割する。
- 修正難易度: 中。
- 関連ファイル: `style.css`, `docs/REFACTOR_PLAN.md`
- 将来的リスク: UI追加ごとにCSS例外が増える。

### M-12 `appShell.updateOnlineTabState()` が最初の button に依存

- 問題点: `querySelector('#onlineCreate button')` が本来の作成ボタンではなく人数調整ボタンを拾う可能性がある。
- 原因: submit button に専用 id がない。
- 影響: オフライン時に止めたい操作が止まらない、または別の操作が止まる。
- 推奨改善: create/join submit button に id を追加し、テストを更新する。
- 修正難易度: 小。
- 関連ファイル: `index.html`, `js/appShell.js`, `tests/main.test.js`
- 将来的リスク: オフラインUXが不安定になる。

### M-13 native `alert()` が残る

- 問題点: custom modal 方針とズレる alert が複数残る。
- 原因: 古い簡易通知経路。
- 影響: Android/TWAで見た目・操作感・テスト方法が不統一。
- 推奨改善: `showNotice()` helper を追加し、段階置換する。
- 修正難易度: 小。
- 関連ファイル: `js/main.js`, `js/storage.js`, `js/online.js`
- 将来的リスク: blocking alert が reconnect flow を妨げる。

### M-14 server runtime log に構造がない

- 問題点: `console.log` が room lifecycle や restore に直接散在する。
- 原因: 小規模運用前提のログ。
- 影響: Termuxや本番で重要ログとノイズの判別が難しい。
- 推奨改善: `logServerEvent(type, message, fields)` と `LOG_LEVEL` を追加する。
- 修正難易度: 小。
- 関連ファイル: `server.js`
- 将来的リスク: 障害原因の追跡が難しくなる。

### M-15 Python static check が `test:static` に入っていない

- 問題点: RL Python は重要だが、JS/JSON/sh の static check から漏れる。
- 原因: package script が Node中心。
- 影響: Python構文壊れがpush前に漏れる。
- 推奨改善: `python3 -m py_compile $(git ls-files '*.py')` 相当の軽量入口を追加する。
- 修正難易度: 小。
- 関連ファイル: `package.json`, `scripts/rl/*.py`
- 将来的リスク: RL改善時の基本回帰漏れ。

## Low

### L-01 docs の行数・棚卸し値が古くなりやすい

- 問題点: `PHASE1_INVENTORY.md` の固定行数と実測がずれる。
- 原因: 棚卸し値を手書きで保存している。
- 影響: AI/人間の初期判断が少し鈍る。
- 推奨改善: 固定値は参考扱いにし、再計測コマンドを正本にする。
- 修正難易度: 小。
- 関連ファイル: `docs/PHASE1_INVENTORY.md`
- 将来的リスク: docs の信頼性低下。

### L-02 server exports が test-only API として見えにくい

- 問題点: `server.js` が多数の内部関数を `module.exports` している。
- 原因: テスト容易性のため。
- 影響: AI が内部関数を外部契約と誤認する。
- 推奨改善: `__test` export にまとめるか docs に test-only と明記する。
- 修正難易度: 小。
- 関連ファイル: `server.js`, `tests/server.test.js`
- 将来的リスク: 内部改修時に不要な互換維持をしてしまう。

### L-03 UI test がHTML文字列詳細に依存

- 問題点: UI tests が `innerHTML` の文言や断片に依存する。
- 原因: DOM component abstraction がない。
- 影響: 仕様ではない文言変更でテストが落ちる。
- 推奨改善: semantic assertion、`data-testid` 相当、DOM node helper を追加する。
- 修正難易度: 小〜中。
- 関連ファイル: `tests/ui.test.js`, `tests/main.test.js`, `js/ui.js`
- 将来的リスク: UI改善がテスト保守で重くなる。

### L-04 `CPU.takeTurn()` が空実装

- 問題点: 実際の入口ではない空メソッドが残る。
- 原因: 旧設計の名残。
- 影響: AI/人間がここを直しても挙動が変わらない。
- 推奨改善: deprecatedコメントを強めるか削除候補として docs 化する。
- 修正難易度: 小。
- 関連ファイル: `js/CPU.js`
- 将来的リスク: 誤修正。

### L-05 manual multi-client smoke が手動依存

- 問題点: 実ブラウザ複数タブ、Socket.IO transport、PWA/SW絡みの自動 smoke がない。
- 原因: Playwright等を入れていない。
- 影響: race/transport差分は最後まで手動確認依存。
- 推奨改善: まず `TESTPLAN.md` の最小オンライン手動項目を短い checklist script/docs にする。
- 修正難易度: 小〜中。
- 関連ファイル: `TESTPLAN.md`, `tests/online-integration.test.js`
- 将来的リスク: オンライン同期修正の実機漏れ。
