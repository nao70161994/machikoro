# Post Implementation Audit

作成日: 2026-05-17
対象: docs/IMPLEMENTATION_ROADMAP.md PR-001〜PR-033 一括実装後

## 結論

重大問題: なし。

2026-05-19 追記: Phase A の PWA 改善として、RL model JSON の install/update precache を廃止し、runtime cache と Service Worker 実行テストを追加しました。

2026-05-19 追記: accessibility 基盤として dialog semantics、modal focus 管理、non-blocking notice、focus-visible、reduced motion を追加しました。

2026-05-19 追記: online recovery 改善として、onlineSession 削除時の restore bundle cleanup、restore rank details 診断、hostless restore 設計 docs を追加しました。

2026-05-19 追記: RL parity 改善として、Python RL 環境の既知近似を出力する parity report と docs を追加しました。

PR-031〜PR-033 の experimental 足場は、現行の自動テスト範囲では既存挙動を壊していないことを確認しました。監査中に docs 末尾の余分な空行は修正しましたが、コード修正が必要な重大/高優先度の不具合は見つかりませんでした。

## 監査チェックリスト

| 要件 | 確認内容 | 証跡 | 判定 |
| --- | --- | --- | --- |
| 自動実装で混入したバグの洗い出し | PR-031〜033 の実装箇所と関連テストを直接確認 | server canonical mirror / pending queue / RL schema helper のコード確認 | pass |
| 設計ズレの確認 | IMPLEMENTATION_PROGRESS.md の残課題と実装境界を確認 | 残課題一覧を Medium/Low に分類 | pass |
| docs不整合の確認 | ONLINE_SYNC.md, CPU_AI.md, rl-experiments.md, progress log を確認 | canonical mirror / pendingActions / RL schema v2 の記述あり | pass |
| 未テスト箇所の確認 | required test と targeted test を実行 | 実行コマンド一覧 | pass |
| PR-031 副作用確認 | canonical mirror stale 判定、accepted action 増分適用、actionLog compact 境界を確認 | server.js, tests/server.test.js, ONLINE_SYNC.md | pass |
| PR-032 副作用確認 | pendingActionQueue dual-write、旧 field fallback、save/online/server mirror snapshot 復元を確認 | GameManager.js, storage.js, online.js, server/mirrorReplay.js | pass |
| PR-033 互換性確認 | schema identifier は metadata のみで既存 state/action 次元を変更しないことを確認 | RLCPU.js, scripts/rl/encode.py, RL tests | pass |
| main/server/GameManager 責務増加 | 小さい責務分離を実施 | server/roomLifecycle.js 抽出、GameManager income metadata 接続、main delegated UI handler 拡張 | pass |
| commit / push | 監査結果を commit/push する | 監査文書 commit 3e0bd1c と完了証跡 commit 65e5afe を push 済み | pass |
| working tree clean | commit/push 後に確認する | 最終確認で git status --short が空 | pass |

## 重点監査結果

### PR-031 server canonical mirror

確認した内容:

- validateGameAction() は getRoomCanonicalMirror(room) を経由し、stale marker が合わない場合は createRoomMirror(room) で再構築する。
- accepted action は applyAcceptedActionToRoomCanonicalMirror() で canonical mirror へ増分適用され、同じ action を再度 replay しなくても次 validation に反映される。
- roomCanonicalMirrorMarker() は restorePayloadRank(...).actionSeq と actionLog.length を見ており、snapshot compact や手動 actionLog 変更で stale 扱いになる。
- compactRoomActionLog() 後も marker 更新で canonical mirror と snapshot/log 境界の整合を維持する。

残リスク:

- in-memory mirror なので server restart 後は snapshot/actionLog replay が引き続き復元正本。
- 長時間の実ブラウザ再接続、Undo、host 移譲は自動テストに加えて TESTPLAN.md ベースの手動確認が必要。

### PR-032 pending action queue

確認した内容:

- 既存 public method game.pendingActions() は維持され、内部 queue は pendingActionQueue に分離されている。
- pendingTV などの互換 field が正本として残り、queue が欠落/不整合でも pendingActionsFor() は field fallback する。
- save / online snapshot / server mirror snapshot は schema 名 pendingActions を保存し、旧 snapshot は field から queue を再構築できる。
- CPU simulation clone も pending queue を引き継ぐ。

残リスク:

- 主読み取りはまだ descriptor / field fallback 経由であり、完全な queue 正本化は未完了。
- pendingIT は既存仕様通り queue 外の special case のまま。

### PR-033 RL state/action schema v2

確認した内容:

- JS runtime は RLCPU.STATE_SCHEMAS, RLCPU.ACTION_SCHEMAS, RLCPU.resolveModelSchema() を追加しただけで、既存推論の state/action 次元は変更していない。
- Python encoder も同じ schema identifier を公開し、state_schema_for_dim() で既存 145 / 353 次元を識別する。
- draft action schema は識別子のみで、既存 portfolio / registry / browser model の互換性を壊さない。

残リスク:

- v2 draft は設計段階。実際の Business factorization、overflow feature、portfolio 更新は別 lineage の後続作業が必要。

## 実行コマンド

全て pass。

- git diff --check
- npm run test:static
- npm run test:online
- npm run test:smoke
- npm test
- npm run test:cpu
- npm run test:rl

追加 targeted check:

- node --check js/GameManager.js
- node --check js/storage.js
- node --check js/online.js
- node --check js/CPU.js
- node --check js/RLCPU.js
- node --check server/mirrorReplay.js
- node --check tests/gamemanager.test.js
- node --check tests/rlcpu.test.js
- node --check tests/rl-train.test.js
- python3 -m py_compile scripts/rl/encode.py
- node tests/gamemanager.test.js
- node tests/server.test.js
- node tests/online.test.js
- node tests/cpu.test.js
- node tests/rlcpu.test.js
- node tests/rl-train.test.js

## 残課題

### High

なし。

### Medium

- manual verification required: RL target head 採用モデルの学習 / portfolio 更新は未実施。既存採用モデルと別 lineage で行い、`docs/RL_PARITY.md` と registry に既知近似を明記する。
- manual verification required: hostless restore は trust boundary 変更を伴うため未実装。`docs/HOSTLESS_RESTORE_DESIGN.md` に沿って、候補 bundle / hash 一致 / grace window / provisional room の仕様判断後に実装する。
- manual verification required: accessibility 基盤は実ブラウザでキーボードのみ操作、Tab trap、Esc close、reduced motion、モバイル低画面での notice / modal 重なりを確認する。手順は `docs/ACCESSIBILITY_GUIDE.md` を参照。
- manual verification required: PWA RL model loading は実ブラウザ Network panel で install/update 時に model JSON が先読みされないこと、RL CPU 選択時にだけ取得され2回目以降 cache 命中することを確認する。手順は `docs/PWA_MODEL_LOADING.md` を参照。
- manual verification required: PR-031 canonical mirror の長時間手動確認は docs/CANONICAL_MIRROR_MANUAL_TEST.md に再接続、Undo、host移譲、server restart restore、長時間プレイの手順、grep確認、mismatch記録テンプレートを整備した。この環境では実ブラウザ複数端末の実操作は代替できないため、実機確認結果の記入待ち。

### Low

- addressed: server.js / GameManager.js / main.js の責務分離は、大規模全面分割を避けて server/roomLifecycle.js 抽出、GameManager income handler の metadata 接続、main の delegated UI handler 拡張を実施した。
- addressed: effect dispatch 本体と category metadata 移行は、income 系 metadata に incomeHandler を追加し、GameManager の income handler table を CARD_EFFECT_METADATA から生成する形にした。全面 dispatch 化は docs/EFFECT_DISPATCH_MIGRATION.md の順序に従う。
- addressed: UI inline handler / render 細分化は、build menu と player panel の一部を data-action delegated handler へ移行し、docs/UI_REFACTOR.md に残りの安全な順序を明記した。

## 対応済み残課題

- PR-031: canonical mirror の手動回帰チェックリストを docs/CANONICAL_MIRROR_MANUAL_TEST.md に追加済み。
- PR-031: canonical mirror の lightweight state hash / mismatch log を追加済み。
- PR-032: pendingIT は queue 外 special case として設計固定済み。
- PR-032: pending queue read path は ensurePendingActionQueue() 経由へ移行済み。互換 field は旧 snapshot / 不整合 queue 補修用に残す。
- PR-033: RL schema mismatch guard は実装済み。v2 schema 本体は既存 portfolio と別 lineage で導入する。

## 次回推奨

1. docs/CANONICAL_MIRROR_MANUAL_TEST.md に沿って実ブラウザ複数端末のオンライン手動回帰を実施し、結果を記録する。
2. UI / effect dispatch / ファイル分割の後続は docs/UI_REFACTOR.md と docs/EFFECT_DISPATCH_MIGRATION.md の順序で、1テーマ1PRとして進める。
3. RL schema v2 本体は既存 portfolio と別 lineage にして、新次元 / factored action head / registry 更新を分けて試す。


### Phase D dice choice delegated handler

確認した内容:

- `renderDiceChoose()` の inline `onclick` を `data-action` に置き換え、main 側の delegated click handler で駅 / 電波塔 / 港の選択を処理するようにした。
- pending menu / build menu と同じ helper を使い、今後の UI 分離で action 入口を追いやすくした。

残リスク:

- Business Center chip selection、card / landmark toggle、stats UI は inline handler が残る。入力状態や既存 DOM id 依存を壊さないよう、別テーマで targeted test を追加してから移す。


### Phase D Business Center delegated handler

確認した内容:

- Business Center chip の inline `onclick` を `data-action="selectBusinessCard"` に置き換えた。
- hidden input と selected class の更新は既存 `bcSelectCard()` を使い、交換 action payload の読み取り経路は維持した。

残リスク:

- card / landmark toggle と stats UI は inline handler が残るため、次の小さい delegated handler 化対象として扱う。


### Phase D card select delegated handler

確認した内容:

- カード選択 modal のセット / カード / ランドマーク / 決定操作を `data-action` に移行した。
- 既存の toggle 関数は維持し、handler 入口だけを delegated click に寄せた。

残リスク:

- stats UI は inline handler が残る。統計 view mode と player filter の state 更新を壊さないよう targeted test と一緒に移す。


### Phase D stats delegated handler

確認した内容:

- stats UI の filter / reset 操作を `data-action` に移行した。
- `renderStats()` が stats container に一度だけ delegated click handler を登録し、再描画後も同じ入口で処理する。

残リスク:

- `index.html` 直書きの静的 inline handler は残る。起動順と既存 global API への影響が大きいため、画面領域ごとに別テーマで小さく移す。


### Phase D static shell delegated handler

確認した内容:

- `index.html` の静的 inline handler を `data-ui-*` 属性へ移し、main 側 document handler で既存関数へ委譲するようにした。
- ゲーム内の `data-action` と衝突しない別 namespace にしたため、pending/build/dice の delegated handler へ副作用を出さない。

残リスク:

- 動的に生成する player settings / online player settings の select/input inline handler は残る。DOM 再描画と設定保存の境界を壊さないよう、次テーマで個別に扱う。


### Phase D player settings delegated handler

確認した内容:

- ローカル / オンラインのプレイヤー設定 UI から動的 inline handler を外し、既存の設定更新関数を document delegated handler から呼ぶようにした。
- `index.html` と主要動的 UI から inline handler を取り除き、残る UI action は data attribute 経由で追える状態にした。

残リスク:

- 今後追加する動的 UI は `data-action` または `data-ui-*` に合わせる必要がある。


### Phase D renderPending helper split

確認した内容:

- `renderPending()` の表示可否判定と modal content 更新を helper に分離した。
- pending 種別 HTML の全面再構成は、テンプレート文字列差分が大きくなるため今回の自動対応からは外した。

残リスク:

- pending 種別ごとの HTML helper 化は未完了。HTML 出力の targeted assertion を増やしてから小さく進める。


### Phase D CPU diagnostics split

確認した内容:

- `CPU.js` の診断系 profile / trace 集計処理を `js/cpuDiagnostics.js` に分離した。
- CPU の判断ロジック、評価式、行動選択は変更していない。

残リスク:

- evaluation / execution の本格分離は CPU の中核判断に触れるため、今回の自動対応では診断系に限定した。


### Phase D category group metadata

確認した内容:

- 飲食店・商店のカテゴリ組み合わせを `CARD_CATEGORY_GROUPS` に移し、GameManager の該当分岐を helper 経由へ移行した。
- 効果の発火順、金額計算、ログ文言は変更していない。

残リスク:

- pending / steal / redistribute の全面 dispatch registry 化は未実施。挙動差分が出やすいため、効果単位で進める。


### Phase D server restore rank split

確認した内容:

- `restorePayloadRank()` / `restorePayloadRankDetails()` / restore room replacement 判定を `server/restoreRank.js` に分離した。
- `server.js` の public test export と restore flow の呼び出し名は維持した。
- restore rank と recreateRoom 既存 tests をそのまま通し、挙動変更ではなく責務分離に限定した。

残リスク:

- hostless restore 本実装、socket handler の大規模分割、validation 境界の再設計は trust boundary と手動回帰に触れるため未実施。


### Phase D static inline handler regression guard

確認した内容:

- 主要 HTML/JS の inline handler 属性再導入を検出する static test を追加した。
- `js/cpuDiagnostics.js` を PWA static asset cache に追加し、offline 起動時の CPU helper 欠落を避けた。

残リスク:

- Service Worker の実更新挙動は自動テストでは完全代替できないため、更新バナーと reload は実ブラウザで確認する。

### 2026-05-20 pending modal recursion fix

確認した内容:

- 実機 iPhone Safari で `updatePendingModalContent()` が大量に再帰表示される症状は、helper 本体が同名関数を再呼び出ししていたため発生していた。
- `updatePendingModalContent()` を実際の DOM 更新処理へ戻し、`pendingMenu` / `pendingModal` が欠ける場合は `false` で抜ける guard を追加した。
- DOM 更新中に再入しても即 return する guard を追加し、Safari の modal / layout 更新タイミングやテスト用 setter 由来の再帰で stack overflow しないようにした。
- `renderPending()` は末尾でも同 helper を使うように統一し、表示・非表示の経路を同じ guard に通した。

再発防止:

- `tests/ui.test.js` に、DOM 欠落時と `innerHTML` setter からの再入時に `updatePendingModalContent()` が再帰しない targeted test を追加した。
- pending modal まわりを触る場合は `node tests/ui.test.js` に加え、`npm run test:smoke` / `npm test` / `npm run test:online` で render / delegated handler / online pending 復元経路を確認する。

残リスク:

- 実ブラウザ iPhone Safari での長時間 pending 操作、画面復帰、複数 pending の連続解決は manual verification required。


### 2026-05-20 UI update recursion / null DOM cross-audit

確認した内容:

- `js/ui.js` / `js/main.js` / `js/stats.js` の modal / pending / notice / build menu / stats / card select 周辺を確認した。
- 直接自己再帰は前回の `updatePendingModalContent()` 修正後に再発していないことを確認した。
- `renderDiceChoose()` / `renderBuildMenu()` / `renderCardSelectModal()` / `toggleLog()` / `showCardDetail()` / `showConfirm()` / Business Center chip 選択に DOM 欠落 guard を追加した。
- `bindStaticUiHandlers()` に重複登録 guard を追加し、既存の delegated handler / card select modal / stats handler の guard と合わせて再登録経路を抑止した。
- CPU speed label 更新は対象 label がない画面でも例外化しないようにした。

再発防止:

- `tests/ui.test.js` に、対象 DOM が欠ける状態で UI 更新関数が例外化しない targeted test を追加した。
- `tests/main.test.js` に、static / delegated UI handler が再呼び出しで重複登録されない targeted test を追加した。

残リスク:

- 実ブラウザ iPhone Safari での長時間 pending / modal 操作、画面復帰、複数 pending の連続解決は manual verification required。
- build menu や card select のさらなる helper 分離は可能だが、HTML 出力差分が大きくなるため今回の自動対応では guard と再発テストに限定した。

### Continuous review Cycle 1 runtime/online safety

確認した内容:

- サブエージェントレビューで Critical は未検出。High として、遅延 dice callback の世代ずれ、pending queue の out-of-order 解決、勝利後 online action の許可を確認した。
- `main.js` の遅延 dice action は token と timeout id で管理し、`init()` / `restartGame()` で古い callback を無効化した。
- `GameManager.nextPendingActionFor()` / `canResolvePendingField()` を追加し、pending queue の先頭以外は action gate と resolver の両方で拒否するようにした。
- `renderPending()` は pending queue の先頭 panel だけを描画するようにし、server の `getAllowedActions()` も同じ正本へ揃えた。
- `validateGameAction()` は canonical mirror が勝利済みなら action を拒否し、最終ランドマーク建設後の `undoBuild` / `nextTurn` 通過を防止した。

再発防止:

- pending queue の先頭制約、UI panel 表示、勝利後 server action reject、遅延 dice callback invalidation の targeted tests を追加した。
- pending / restore / online action を触る場合は `node tests/gamemanager.test.js` と `node tests/server.test.js` を最低限実行する。

残リスク:

- action contract の重複、snapshot ownership の分散、server socket handler の大きさは Medium/design。小さな helper 分離は可能だが、仕様境界を崩さないため継続 review cycle で扱う。
- 複数端末の online pending 連続解決、勝利直後の reconnect / restore は manual verification required。

### Continuous review Cycle 2 restore replay winner guard

確認した内容:

- Cycle 2 再レビューで、live の `validateGameAction()` は勝利後 action を拒否する一方、`createRoomMirror()` の actionLog replay は終局後 action を再生できる不整合を確認した。
- `validateReplayAction()` に勝利済み game の action reject を追加し、server restart restore で終局後 actionLog を復元正本へ混ぜないようにした。

再発防止:

- `createRoomMirror` に、最終ランドマーク build 後の `nextTurn` / `undoBuild` replay を拒否する targeted test を追加した。

残リスク:

- 既に勝利済みの snapshot 自体を actionLog なしで復元する経路は維持している。勝利後に追加 actionLog がある bundle だけを拒否する。

### Continuous review Cycle 2 pending queue parity

確認した内容:

- Cycle 2 再レビューで、RLCPU の action mask と一部 expert eval fast path が pending field の固定順を見ており、GameManager の queue 先頭制約とズレる可能性を確認した。
- RLCPU / eval fast path の pending 判定を `GameManager.nextPendingActionFor()` に追従させた。

再発防止:

- RLCPU の action mask が queue 先頭 field だけを有効化する test を追加した。
- expert eval fast path が `GameManager.nextPendingActionFor(game)` と field guard を使うことを static test で固定した。


### Continuous review Cycle 3 UI/PWA accessibility contract

確認した内容:

- `pendingModal` は見た目と挙動として non-blocking floating panel だが、ARIA 上は modal dialog と宣言されていた。assistive technology に対する契約を実挙動へ合わせるため `role=region` に変更した。
- Service Worker の waiting update banner は、オンライン対戦中に一度 disabled になったボタン状態が同一セッション内で残る可能性があった。表示時に既定文言・有効状態・opacity を初期化するようにした。
- PWA install/update banner が iPhone の home indicator / safe area と競合しないよう、bottom safe-area padding を追加した。

再発防止:

- `tests/main.test.js` の PWA/TWA safety assertion に pending panel の ARIA contract、update button reset、safe-area padding を追加した。

残リスク:

- iPhone Safari / Android Chrome の実機 standalone 表示、Service Worker waiting 状態の実操作、オンライン対戦中から終了後への banner 状態遷移は manual verification required。


### Continuous review Cycle 3 online/RL safety fixes

確認した内容:

- `resolveRenovation()` の自動不発処理は queue 先頭が renovation でなくなった場合に停止するようにし、壊れた restore snapshot からの無限 loop を避ける。
- server room table は `Object.create(null)` と roomId validation / own lookup helper で prototype key を踏まないようにした。
- `gameAction` の accepted payload は validation 後に canonicalize し、actionLog / accepted cache / broadcast / restore payload に余分な key を残さない。
- host migration 後の restore では、local host bundle の rank が server bundle より新しければ、server の stale hostPlayerIndex によらず replacement を試す。
- RL Python env と JS CPU oracle は pending queue の先頭 field を共有し、JS 評価 export は run-local browser json を使う。persistent oracle には応答 timeout を追加した。

再発防止:

- GameManager / server / online / RL train の targeted tests に、非連続 pending queue、roomId prototype key、payload canonicalization、host migration stale restore、Python/JS pending queue parity、oracle timeout/export path を追加した。

残リスク:

- host がローカル restore snapshot を改ざんした場合の完全な防御には、server-signed snapshot または server-side persisted canonical state が必要。これは設計判断待ち。


### Continuous review Cycle 3 pendingActions schema hardening

確認した内容:

- `pendingActions` は pending queue 正本だが、snapshot validation が action/field 対応と legacy count 一致を十分に固定していなかった。server mirror では不一致 snapshot を拒否する。
- client queue normalization は壊れた pair を採用せず、必要なら legacy pending fields から rebuild する。
- CPU fallback / selfplay fallback は `GameManager.nextPendingActionFor()` の queue 先頭だけを解決対象にする。

再発防止:

- GameManager / server / main の targeted tests と schema docs を追加した。

### Continuous review Cycle 4 eval fast path behavioral guard

確認した内容:

- Cycle 4 では全体再レビューを行い、Critical は未検出。
- 自動で安全に対応できる Medium として、expert eval fast path の pending queue regression test が static source assertion に偏っていた点を修正した。
- `scripts/eval-expert-vs-normal.js` / `scripts/eval-expert-vs-weak.js` の fast evaluator に test-only probe を追加し、queue 先頭が cleaning の場合は cleaning だけ、queue 先頭が TV の場合は TV だけが解決されることを実行時に検証する。

残リスク:

- host-supplied restore snapshot を server が署名/永続 canonical state なしで正本化する問題は設計判断待ち。
- ntfy client error reporting は rate limit / dedupe 済みだが、production でより強い spam/privacy 境界が必要なら shared token / origin gate を別 PR で検討する。

### Continuous review Cycle 5 ntfy endpoint gate

確認した内容:

- ntfy client error endpoint は従来の payload validation / dedupe / rate limit に加えて、optional shared token と origin gate を持つ。
- `CLIENT_ERROR_SHARED_TOKEN` 未設定時は既存クライアント通知を維持する。設定時は `X-Client-Error-Token` または Bearer token が必要。
- cross-origin browser report は default で拒否し、必要な場合は `CLIENT_ERROR_ALLOWED_ORIGINS` で許可する。

残リスク:

- shared token を browser に配る運用は強い秘密にはならない。公開productionでより強い abuse 対策が必要なら、server-side sampling や認証済み運用を別途検討する。

### Continuous review Cycle 5 RL eval simulator guard

確認した内容:

- `eval-rl-vs-js` は RL portfolio / adoption 判断に近い評価なので、現時点では lightweight/fast simulator を使わない方針を明示した。
- `buildRlEvalRunSeriesOptions()` は `fast=false` / `lite=false` / `lightweightCpuOnly=false` を常に `runSeries()` へ渡す。

残リスク:

- 将来 `eval-rl-vs-js` に fast/lite を正式導入する場合は、評価用途を smoke と adoption に分ける設計判断が必要。

### Continuous review Cycle 5 accessibility label pass

確認した内容:

- 目視テキストに依存していた主要 input/select/button に `label for` / `aria-describedby` / `aria-label` を追加した。
- UI event は既存の `data-ui-action` / `data-ui-input` / `data-ui-change` を維持し、挙動変更を避けた。

残リスク:

- 実スクリーンリーダーでの読み上げ順とモバイル実機フォーカス確認は manual verification required。

### Continuous review Cycle 5 diagnostics helper split

確認した内容:

- 巨大 diagnostics script のうち、純粋 helper として切り出しやすい counter utilities だけを `scripts/diagnostics/expert-v2-branch-counters.js` へ分離した。
- CLI / runDiagnostics / toText の挙動は既存 exports 経由で維持する。

残リスク:

- formatting や branch instrumentation の分離はまだ大きめの差分になるため、今後も helper 単位で小さく進める。

### Automated release pseudo-E2E gate

確認した内容:

- Playwright は現状依存に無く、sandbox/network 制約下で browser binary を追加取得しない方針にした。
- 代替として既存 Node/vm harness に `release` group を追加し、`npm run test:release` で mobile/PWA/ntfy/restore/long-run 近似をまとめて実行できるようにした。
- ntfy test は mock fetch を使い、実通知を送らずに title/body/topic を検証する。
- PWA update は `index.html` の update contract と SW `message` / `activate` lifecycle を検証する。

残リスク:

- 実ブラウザの描画、OS install prompt、iOS Safari の keyboard/safe-area 挙動、Android TWA/WebView 差分、実ネットワークでの sleep/reconnect は manual only。
- 将来 Playwright を導入できる環境になった場合は、この `release` group に browser-backed spec を追加する。


### Continuous review Cycle 6 maintainability and runtime guards

確認した内容:

- Critical は未検出。High として、Socket.IO script 未読込時の online 初期化、復元済み room の非ホスト置換、RL モデル比較 seed schedule の不公平性、release CI と docs の gate 不一致を確認した。
- Medium/Low として、SW activate lifecycle、RL model runtime cache、reduced motion、SW/index asset drift、docs stale status を確認した。

修正済み:

- `initSocket()` は `io` 未定義時に notice を出して return し、socket handler や online state を作らない。
- 復元済み room replacement は、現ホストが接続中なら非ホスト payload による置換を拒み、通常 rejoin に落とす。
- SW は activate の claim を waitUntil に含め、RL model JSON を network-first runtime cache にした。
- confetti は reduced motion で interval を開始しない。
- `eval-rl-models` は既定でモデル間の seed schedule を共有する。
- release workflow は static gate を含み、docs / README / AI handoff の古い test group 記述を更新した。

残リスク:

- 大きな責務分離は引き続き小さな helper / test 先行で進める必要がある。
- 実ブラウザ複数端末、長時間 sleep/reconnect、native PWA install UI は manual verification required。
- host-supplied restore snapshot の完全な信頼境界強化は server-side signature または persisted canonical state の設計判断が必要。


### Continuous review Cycle 7 restore/RL/PWA gate hardening

確認した内容:

- Cycle 2 全体再レビューで Critical は未検出。High として、既存 room replacement 認証が incoming payload の token hash を信頼していた点、restore rank が client-writable `gameStartPayload.actionSeq` を使っていた点、APK workflow が release gate を通らず artifact を作れる点、game 中 `controllerchange` reload の可能性、RL eval seed policy が成果物に残らない点を確認した。

修正済み:

- 既存 room replacement は既存 room 側の reconnect token で認証する。
- replacement rank は replay-backed seq に限定する。
- RL model runtime/export/schema validation と portfolio schema tests を強化した。
- RL eval result / registry import に seed policy metadata を追加した。
- APK workflow と release docs を release gate に揃えた。
- game 中 SW update は reload せず banner 表示へ倒す。
- modal focus / scroll と confetti timeout lifecycle を補強した。

残リスク:

- client duplicate action idempotency、restore snapshot conservation、canonical mismatch client surfacing は継続候補。
- host-supplied snapshot への完全防御は server-signed snapshot または server persisted canonical state の設計判断が必要。
- 実ブラウザ複数端末 / native PWA install / sleep-wake は manual verification required。


### Continuous review Cycle 8 restore/PWA follow-up guards

確認した内容:

- Cycle 8 全体再レビューで Critical は未検出。High として、Cycle 7 の game 中 controllerchange guard がユーザー明示更新まで止める点、client/server restore rank の規則差分、raw actionLog seq を復元rankに使える点を確認した。

修正済み:

- ユーザー明示の PWA update は controllerchange 後に reload する。unsolicited update は game 中 banner のまま維持する。
- SW fetch は RL model / HTML の HTTP 失敗時にも cached fallback を試し、cache なしでは明示的な error / 503 を返す。
- restore rank は replay可能件数から進捗を算出し、client/server/docs/tests を同期した。
- restored actionLog の clientActionId sanitizer、restore bundle cleanup、RL custom schema action count guard を追加した。

残リスク:

- host restore の完全な改ざん耐性は server persisted canonical state または署名付きsnapshot設計が必要。
- 実ブラウザ複数端末、native PWA install/update、sleep-wake reconnect は manual verification required。

### Continuous review Cycle 9 restore ack / release gate / diagnostics polish

確認した内容:

- Cycle 9 全体再レビューで Critical は、未コミット差分のテスト落ちとして検出された `tests/main.test.js` の未定義変数と RL eval fixture schema mismatch。
- High として、restore snapshot 圧縮後に元の高い pending seq を持つ `clientActionId` が再送され、cached `actionAccepted` でクライアント二重適用され得る経路を確認した。

修正済み:

- server は `acceptedClientActions` refs を `rejoinData` に含め、client は一致する pending を再送せず破棄する。
- APK workflow の pre-build gate に `npm test` を追加した。
- RL eval metadata と registry eval duplicate 判定の再現性を補強した。
- client error URL/roomId の privacy guard と rate bucket prune を追加した。

残課題:

- Modal background inert、iOS Safari install guidance、PWA banner arbitration は安全だが別 Cycle の Medium backlog。
- Restore の signed/persisted canonical state は design decision required。

### Continuous review Cycle 10 reconnect ack / modal inert / release contract

確認した内容:

- Critical: 未コミット差分の PWA install banner 抑止条件が fixture 上で常時抑止になる regressions と、release pseudo-E2E の async rejection 見落としを確認した。
- High: 通常 `rejoinRoom` が `acceptedClientActions` を返さず、recreate path と reconnect contract がズレる経路を確認した。RL registry の同条件 eval 重複も採用判断の曖昧さとして確認した。

修正済み:

- 通常 rejoin / recreate の両方で `acceptedClientActions` を返す契約を test と docs に固定した。
- PWA install banner は update banner が明示表示中の時だけ抑止し、update 表示時は install banner を閉じる。
- modal background roots を inert/aria-hidden にし、close 時に元の状態へ戻す。
- client-error stack/filename の URL query/hash を取り除く。
- `runTest` を Promise 対応にし、release gate の async test failure を検出する。

残課題:

- iOS Safari install guidance、PWA bottom safe-area spacer、trust-proxy 運用方針は実機/デプロイ判断待ち。
- server persisted canonical state / signed restore snapshot は design decision required。

### Continuous review Cycle 11 PWA/security/test tooling hardening

確認した内容:

- High/design: server restart 後の host-supplied snapshot と missing-room restore は署名または server persisted canonical state がない限り完全には信頼できない。これは trust boundary 設計判断が必要なため自動実装対象外。
- High fixed: `runTest()` が Promise を返さず、`await runTest(...)` が非同期 test 完了を待てない問題を確認した。
- Medium fixed: PWA update banner が install prompt を隠したまま再表示しない経路、trust proxy の既定有効、production no-origin client-error report、RL eval duplicate conflict の見落としを確認した。

修正済み:

- `runTest` の Promise chain を返し、回帰 test を追加した。
- PWA install/update banner の再表示と body padding state を補強した。
- client-error endpoint は production ntfy で no-origin/no-token を拒否し、trust proxy を env opt-in にした。
- modal focus/inert 順序、close labels、pending modal viewport fallback を補強した。
- RL registry/import tooling は同一条件 conflict を警告または拒否できるようにした。

残課題:

- Signed restore snapshot / server persisted canonical state、room secret による missing-room restore 認証は design decision required。
- 実機 iOS Safari / Android Chrome の install/update/reconnect は manual verification required。

### Continuous review Cycle 12 public surface / restore guard hardening

確認した内容:

- High fixed: repository root が `express.static(__dirname)` で公開され、server/tests/scripts/docs/generated model artifacts までHTTP到達可能になり得る問題を確認した。
- High partially mitigated: restore snapshot の pending counter は小さなpayloadで大きな pending queue を復元できる余地があった。署名なし snapshot の根本 trust boundary は残るが、pending count / phase invariant は自動で安全に締めた。
- Medium fixed: client-error `message` / `url` のURL query/hash scrub、PWA runtime cache の allowlist、player setting labels、card toggle pressed state、RL portfolio explicit schema metadata、async test convention を補強した。

修正済み:

- server static surface は root file allowlist と明示ディレクトリだけに限定した。
- createRoom は socket-local rate limit に加えて IP/rate-key bucket でも連投を抑止する。
- restore snapshot は pending fields, pendingActions, pendingIT と phase の不整合および過大pendingを拒否する。
- SW は allowlist 外GETを cache.put しない。
- RL portfolio entries と配布JSON schema metadata を明示し、registry summary の lineup game count ranking を補正した。

残課題:

- server restart 後の host-supplied restore snapshot を完全に信頼可能にするには signed snapshot または persisted canonical state が必要。これは設計判断とmigrationが必要なため未実装。
- hostless restore、実機 iOS/Android PWA install/update/reconnect は manual verification required。


### Continuous review Cycle 13 restore boundary / accessibility / pending queue hardening

確認した内容:

- High fixed: 既存 restored room の host が切断中なら非ホスト payload でも `recreateRoom` replacement を試せる余地があり、hostless restore 未実装の境界と矛盾していた。置換は現在の hostPlayerIndex 本人だけに限定した。
- Medium fixed: `onlinePendingAction` は共有localStorage keyのため、別タブ・旧roomの `appError` が現行roomの未ack actionを消す可能性があった。保存entryへ `roomId` を追加し、エラー時cleanupを現在roomに限定した。
- Medium fixed: fallback pending clear が raw field だけを消すと `pendingActionQueue` の順序が再構築順へ崩れる可能性があった。`GameManager.clearPendingField` で対象fieldのみqueueから除くようにした。
- Medium fixed: Python RL target-head training が queue 先頭ではなく raw pending count で target kind を決めていたため、混在pendingで JS/Env の次actionとズレる可能性があった。
- Low fixed: `handleRemoteAction` は未使用で、将来再利用された場合に `applyReplayedAction` の undo snapshot 処理を迂回するAI保守性リスクだったため削除した。
- Low fixed: crash overlay, offline notice, tabs, online tabs, icon-only controls, card detail, Business Center chip の accessibility metadata を補強した。

残課題:

- pending action の完全な per-tab namespacing は既存restore schemaとUXに影響するため、設計判断が必要。
- server restart restore の署名付き検証や server persisted canonical state は引き続き design required。
- iOS/Android 実機での accessibility/PWA/reconnect 長時間確認は manual verification required。

### Continuous review Cycle 14 restore replay / pending trace / mobile a11y hardening

確認した内容:

- High fixed: 別roomの `onlinePendingAction` が restore actionLog append や reconnect resend に混入し得る経路を確認した。cleanupだけでなく restore/resend の使用点にも `roomId` gate を追加した。
- High fixed: snapshot compact 後に古い `actionLog` が残った場合、`stateSnapshot.actionSeq` 以下の action が再適用され得る余地を確認した。server restore sanitize で古いseqを replay対象から外し、別roomId付きentryは拒否する。
- Medium fixed: restore payload の reconnect token hash 配列が欠けると、人間プレイヤーの再接続経路が失われる可能性があった。人間slotはhash必須、CPU slotのみ空hash許容にした。
- Medium fixed: JS/Python trace comparison が pending count だけを比較し、queue順序のズレを見逃す可能性があった。trace setup/normalizationに `pendingActions` を追加した。
- Low fixed: online/server snapshot の `log` が actionLog compact 後も増え続ける可能性があった。snapshot log は local save と同じく末尾30件へ制限した。
- Low fixed: online status の live region と card detail button の touch hit area を補強した。

残課題:

- Production client-error origin policy を `PUBLIC_ORIGIN` または shared token 必須へ寄せる変更は、Render 環境での設定手順に影響するため design/ops decision required。
- Host-supplied restore snapshot の完全な信頼性は signed snapshot または server persisted canonical state が必要で、引き続き design decision required。
- 実機 iOS/Android での reconnect/PWA/accessibility 長時間確認は manual verification required。


### Continuous review Cycle 15 restore rank / PWA lifecycle / pending replay hardening

確認した内容:

- High fixed: compacted snapshot 後に `seq` を持たない古い actionLog entry が残ると、snapshot 復元後に legacy action が再適用される余地があった。snapshot actionSeq が進んでいる場合は seq なし action を replay 対象から外す。
- High fixed: existing restored room の replacement rank が sanitize 前 actionLog を見ると、古い/不正 action が freshness を水増しする余地があった。置換判定を sanitize 後 rank に変更した。
- Medium fixed: restore rank が未知 action を replay 可能件数に含めると、malformed bundle の freshness が過大評価され得た。server/client とも既知 action だけを数え、server allowlist は registry 同期 test で固定した。
- Medium fixed: roomId なし `onlinePendingAction` は旧互換として残っていたが、seq もない stale 候補は restore append / reconnect resend に使わないようにした。
- Medium fixed: Service Worker の runtime cache write が fetch event lifetime から外れて落ちる可能性があった。`event.waitUntil` で cache write を追跡する。
- Low fixed: PWA update banner の ARIA role、`pwaApplyUpdate` fallback、release workflow の PWA gate、勝利時 online restore bundle cleanup を補強した。

残課題:

- Signed restore snapshot / server persisted canonical state は design decision required。
- Hostless restore 本実装、複数実機での reconnect/PWA/update/accessibility 長時間確認は manual verification required。
- inline SW update lifecycle の appShell への完全分離は安全な小変更範囲を超えるため backlog。


### Build freeze investigation: render isolation and flow diagnostics

確認した内容:

- 実機の「購入後にゲーム画面がフリーズする」症状は、build 自体の phase 進行よりも、購入直後の `render()` が一部 UI render 例外で丸ごと中断し、skip/build menu 更新や modal inert 復元後の操作導線が残らないパターンが最も危険だった。
- 特に recent refactor で `renderPending()`, build menu, modal lifecycle, delegated handler が分離されたため、1つの render step の実機限定例外が全体 render loop を止めると、購入済み状態 `builtThisTurn=true` なのに UI が古いまま残り得る。

修正済み:

- `renderActiveGameState` の主要 step を `safeRenderStep` で分離し、`renderPending` 等の非致命 UI step が落ちても status/buttons/build menu/checkAutoSkip の更新を継続するようにした。
- render step 例外時は `machikoroLastFlowTrace` と `window.__machikoroFlowTrace` に phase / pending fields / pending action queue / modal/build/skip UI 状態の snapshot を残し、ntfy client-error にも `render-step` として送る。通知stackには短い `FLOW_TRACE` summary を含め、実機通知だけでも直前UI状態を追えるようにした。
- build card / landmark の request, confirm, online send, local apply, rendered を flow trace に記録し、購入後停止時の直前状態を実機で追えるようにした。
- regression として、購入後に `renderPending` が例外化しても confirm modal が閉じ、gameScreen inert が解除され、skip ボタンと build menu が操作可能な状態へ更新される integration test を追加した。ランドマーク購入後の同経路も固定した。

残課題:

- 実機 iPhone Safari / Android Chrome での長時間手動再現確認は manual verification required。
- 追加の実機ログが届いた場合は `machikoroLastFlowTrace` の event と snapshot を見て、落ちている render step をさらに局所修正する。

横断監査メモ:

- `safeRenderStep` は active game state の副次的な描画 step のみに適用し、`_render()` 全体・勝利処理・永続化の致命例外は従来どおり crash screen 経路へ残している。
- render step 例外は console warn だけで終わらず、`reportClientError` から `/api/client-error` に送信されることを integration test で固定した。
- 例外を意図的に起こす regression では、UI が操作可能なまま残ること、trace に step / stack / recoverable が残ること、client-error payload に `FLOW_TRACE` が含まれることを確認している。

### Build freeze re-investigation: non-exception watchdog

確認した内容:

- 前回の render step 例外仮説だけでは、ntfy 通知が来ない実機フリーズを説明しきれない。`window.onerror` / `unhandledrejection` に届かない停止、つまり購入後の UI 操作不能、pending 待ち、CPU 待ち、online in-flight 停滞を別経路で捕捉する必要がある。
- ローカル環境では `NTFY_TOPIC` は設定済み、`CLIENT_ERROR_SHARED_TOKEN` / `CLIENT_ERROR_TOKEN` は未設定だった。したがって少なくともこの環境では token gate が通知欠落の直接原因ではなく、例外が発生していないため `/api/client-error` が呼ばれていない可能性が高い。
- ただし production で shared token を設定した場合、ブラウザ側 reporter は token header を送らないため 403 になる。今回 `reportClientError` の fetch start / complete / failed / suppressed を `machikoroLastClientCheckpoint` に残すようにし、実機で `/api/client-error` に到達したか、403/429 等で落ちたかを判別できるようにした。

修正済み:

- `markClientFlowCheckpoint()` を追加し、購入、skip、local/online action apply、render 後、CPU schedule の最後に通った処理を `machikoroLastClientCheckpoint` に保存する。
- `startFreezeWatchdog()` を追加し、1秒ごとに phase / turn / pending / UI 状態を監視する。5秒以上同じ状態が続き、かつ「購入済み build で skip disabled / gameScreen inert / confirm modal 残留」など操作不能条件がある場合だけ `machikoroFreezeSnapshot` を保存して `freeze-watchdog` として `/api/client-error` へ送る。その後、post-build UI block は `render()` 再実行、inert解除、confirm modal close、skip有効化で自己回復する。
- 通常の「購入後にユーザーがターン終了を押すまで待っている」状態は freeze として扱わない。誤通知を避けるため、`builtThisTurn=true` だけでは report せず、UI block 条件を併用する。
- CPU turn 停滞、online action in-flight 停滞、pending action 不整合も watchdog の分類対象にした。

Regression:

- 購入後に skip が有効な通常待機では freeze report が出ないことを integration test で固定した。
- 購入後に skip が disabled のまま 5秒以上停滞した場合、`machikoroFreezeSnapshot` が保存され、`/api/client-error` に `freeze-watchdog` report が送られ、skip が再有効化されることを integration test で固定した。

実機で見るキー:

- `localStorage.machikoroLastClientCheckpoint`: 最後に通った処理、client-error fetch の開始/完了/失敗、HTTP status。
- `localStorage.machikoroFreezeSnapshot`: watchdog が freeze と判定した時点の phase / pending / UI snapshot。
- `localStorage.machikoroLastFlowTrace`: build/render trace の最新イベント。

### Build freeze re-investigation: UI lock / action gate

分類:

- 今回の症状は「例外」や「完全停止」ではなく、画面更新は続くが `inert` / modal / disabled button / overlay / action gate のどれかが残って操作できない UI lock として扱う。
- 前回の freeze watchdog は phase/turn 停滞を主に見ていたため、敵ターン終了後に自分ターンへ戻っていても主要ボタンが disabled のまま、または stale modal/inert が残るケースを検出しきれなかった。

原因として固定した経路:

- `showConfirm()` は modal open 時に `gameScreen` を inert にする。通常は close で戻るが、実機タイミングや stale modal 状態で `modalInertRestore` / `activeModalId` / button disabled が残ると、`allowedActionsFor()` は正しくても UI だけ押せない状態になり得る。
- CPU ターン終了後は `scheduleCPU()` が人間ターンに戻った時点で処理を止めるため、そのタイミングで stale UI lock を明示的に解除する必要がある。

修正済み:

- UI lock snapshot を `buildClientRuntimeSnapshot()` に追加した。`allowedActions`, active element, body class, visible modal list, overlay state,主要ボタンの disabled / hidden / pointer-events / inert / aria-hidden を保存する。
- watchdog に「自分のターンで `rollDice` / `nextTurn` が許可されているのに、操作可能な主要ボタンが1つもない」条件を追加した。phase が進んでいるケースでも `human-turn-ui-locked` として検出する。
- `unlockUiForHumanTurn()` / `clearUiLocks()` を追加し、自分のターン復帰時に stale `inert`, `aria-hidden`, `pointer-events`, stale confirm/card/rules modal, body `modal-open` を解除して `render()` でボタン状態を再評価する。
- build card / build landmark 後と、CPU schedule が人間ターンへ戻った地点で UI unlock checkpoint を残す。
- `window.__machikoroSendTestErrorReport()` を追加した。実機コンソールから client 側 `/api/client-error` を強制送信でき、fetch start / complete / failed / status は `machikoroLastClientCheckpoint` と `window.__machikoroClientCheckpoints` に残る。

Regression:

- 建設後に stale inert / confirm modal / disabled skip が残っても、人間ターンなら解除され skip が押せる状態になる。
- CPU ターン終了後に人間ターンへ戻った時、stale UI lock が解除され roll button が有効になる。
- 自分ターンで allowed action があるのに操作可能ボタンがない場合、watchdog が `human-turn-ui-locked` として snapshot / client-error report を残し、UI unlock を実行する。
- debug client error report function が `/api/client-error` を実際に呼び、送信開始checkpointを残す。
