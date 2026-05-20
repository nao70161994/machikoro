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
