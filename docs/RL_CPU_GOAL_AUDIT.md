# 深層学習CPU 次段階ゴール監査

更新日: 2026-09-13

この表は、深層学習CPU改善ゴールの要求と、現ワークツリーで確認できる証拠を対応付ける。`環境外` は未達ではなく、この実行環境では検証できない項目を表す。

| 要件 | 状態 | 証拠 |
| --- | --- | --- |
| 採用基準モデル（seed71・seed103・seed145）の固定 | 達成 | `models/rl_model/registry.json`, `models/rl_model/reports/portfolio-audit.md` |
| model ID/schema/hash/load/fallback診断 | 達成 | `js/RLModelPortfolio.js`, `js/RLCPU.js`, `tests/rl-model-portfolio.test.js`, `tests/rlcpu.test.js` |
| model card／再現manifest | 達成 | `models/rl_model/reports/model-cards.json`, `models/rl_model/reports/model-cards.md`, `models/rl_model/reports/reproducibility-manifest.json`, `models/rl_model/reports/reproducibility-manifest.md` |
| paired bootstrap／検出力／席差等の評価 | 達成 | `scripts/eval-rl-head-to-head.js`, `scripts/rl-statistics.js`, `tests/rl-statistics.test.js` |
| 特殊pending・target・失敗fixture導線 | 達成（実失敗fixture未収録） | `scripts/eval-rl-special-scenarios.js`, `scripts/import-rl-match-fixture.js`, `tests/fixtures/rl-failures/` |
| 6戦略×2人数帯×3 seedの再現計画 | 達成（計画） | `scripts/plan-rl-strategy-runs.js`, `tests/plan-rl-strategy-runs.test.js`（36 run） |
| 候補の50/100/300戦ゲート | 達成（候補評価） | `scripts/review-rl-candidate-promotion.js`, `models/rl_model/eval-strategy-mp-mover-legal-curriculum-seed415-promotion-300/` |
| target headの学習・JS/Python parity | 達成 | `scripts/rl/train.py`, `scripts/rl/network.py`, `js/RLCPU.js`, `tests/rl-train.test.js`, `tests/rlcpu.test.js` |
| lazy load/hash検証/安全fallback/メモリ予算 | 達成 | `js/RLModelPortfolio.js`, `tests/rl-model-portfolio.test.js`, `compression-report.*` |
| UIの自動・手動モデル選択と診断/export/行動説明 | 達成 | `js/localPlayerSettings.js`, `js/onlinePlayerSettings.js`, `js/appDiagnostics.js`, `js/main.js`, UI回帰テスト |
| local/online/reconnect/save/PWA/CPU/RL回帰 | 達成 | `npm test` および `npm run test:all`（終了コード0） |
| Critical/High/Mediumの未解決 | 0件 | registry validation、運用レポート、全体回帰 |
| 外部本番canary観測 | 環境外 | 実行環境に本番観測資格情報なし。採用条件には算入しない |
| 実機Safari検証 | 環境外 | 実機・ブラウザ操作環境なし。Safari向け自動回帰は成功 |

## 現在の採用判断

- seed415（target head付き4人strength）は、3/4/5/10人の300戦promotionで総合直接優位を示したが、seed145と同じ資産エンジン型で、追加100戦比較でも戦略差が明確でないため `candidate` のままにする。
- seed71のrank1候補は追加100戦screenでtop3採用モデルを置き換える根拠がなく、採用を変更しない。
- seed145／seed415のtopCards重複は低優先度の警告として記録する。追加比較済みのため、次回は新しい戦略仮説または新規seedが得られた場合に再評価する。
