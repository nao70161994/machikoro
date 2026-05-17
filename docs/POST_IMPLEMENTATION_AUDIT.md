# Post Implementation Audit

作成日: 2026-05-17
対象: docs/IMPLEMENTATION_ROADMAP.md PR-001〜PR-033 一括実装後

## 結論

重大問題: なし。

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
| main/server/GameManager 責務増加 | 行数と追加責務を確認 | server.js 1274行, GameManager.js 881行, main.js 1099行 | residual |
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

- PR-031: canonical mirror の長時間手動確認。対象は再接続、Undo、host 移譲、server restart restore。lightweight state hash / mismatch log は実装済み。
- PR-032: pendingIT は queue 外 special case として設計固定済み。
- PR-032: pending queue read path は `ensurePendingActionQueue()` 経由へ移行済み。互換 field は旧 snapshot / 不整合 queue 補修用に残す。
- PR-033: v2 schema を実装する場合は、既存 portfolio と別 lineage にして schema mismatch guard を先に入れる。

### Low

- server.js, GameManager.js, main.js は依然として大きい。今回のPR群で境界は増えたが、責務分離は継続課題。
- PR-013〜016 の残課題として、effect dispatch 本体とカテゴリ metadata 移行はまだ段階途中。
- UI 周りの inline handler / render 細分化は progress log 上の残課題として継続。

## 次回推奨

1. TESTPLAN.md に沿ってオンライン手動回帰を実施する。
2. TESTPLAN.md のオンライン手動回帰で、canonical mirror mismatch log が出ないことを確認する。
3. pending queue の read path を 1 action 種別ずつ移行し、互換 field の削減判断を行う。
4. RL schema v2 は metadata / registry / browser JSON の schema guard を先に入れてから新次元を試す。
