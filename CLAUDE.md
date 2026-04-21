# CLAUDE.md

このファイルは、このリポジトリで Claude Code が最初に参照する入口です。

まずここを読み、詳細はリンク先の文書を参照してください。

## 優先事項

1. ローカル対戦、オンライン同期、再接続復元、保存状態、PWA 更新フローの挙動は一貫させてください。
2. `js/GameManager.js` をルールの唯一の正として扱ってください。
3. オンライン挙動、再接続挙動、CPU の進行タイミングは、確認なしで安易に変えないでください。

## Claude 向けメモ

- このリポジトリは Android + Termux から編集されることが多いです。
- 長いシェルコマンドは端末の折り返しで壊れやすいので、使える場合は既存のラッパースクリプトを優先してください。
- RL の baseline 学習は、フルコマンドを打ち直さず `sh scripts/rl/run-baseline.sh` を使ってください。既定値は Termux 向けにかなり軽量化され、初期評価スキップ、`max_steps` 制限、進捗表示も有効です。出力は `run-label` ごとの別ディレクトリへ分かれます。
- 現行の模倣なし RL 実験は `sh scripts/rl/run-js-oracle-terminal-shaped.sh` を使ってください。JS CPU oracle、終局報酬調整、`self` / `pool` 混合、best checkpoint 復元が有効です。
- 4人用 RL 実験は `sh scripts/rl/run-self-only-4p-h256-lr2e5-5000.sh` を使ってください。`--player-count 4` により `STATE_DIM = 353` の多人数用状態表現を使います。4人用モデルの主評価は `--js-eval-lineups` の4人JS評価です。既存2人モデルは `STATE_DIM = 145` のままです。
- 4人用 RL 変更後は `npm run compare-rl-match-trace -- --python-model models/rl_model/model --js-model models/rl_model/model.browser.json --lineup rl,normal,normal,strong --max-steps 30 --js-cpu-oracle` で Python/JS の固定 trace 比較を行ってください。
- RL 候補モデルは `models/rl_model/registry.json` を参照・更新してください。モデル本体や `runs/` は生成物扱いですが、実ゲームで使う配布用 browser JSON は `models/rl_model/portfolio/` に置きます。2026-04時点では 2人用主採用が `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3`、3〜4人用採用が `self-only-4p-h256-lr1e5-5000-seed102` です。
- `AI（深層学習・ランダム）` は人数別に portfolio からランダム選択します。2人戦は2人用候補、3〜4人戦は多人数候補、5人以上は未対応で `CPU（最強）` を使います。
- 台帳更新後は `npm run validate-rl-registry` と `npm run report-rl-registry` を実行してください。履歴を残すときは `--format markdown --output ...` を使います。
- 採用モデルの評価カバレッジ確認には `npm run audit-rl-portfolio` を使ってください。2人/3人/4人の不足がすぐ見えます。
- 次にやるべき再評価・多様性見直しを機械的に出したいときは `npm run plan-rl-next-actions` を使ってください。
- 2人戦の採用候補と現 main の比較対象を固定ルールで出したいときは `npm run review-rl-adoptions` を使ってください。
- 台帳系レポートを一括更新したいときは `npm run refresh-rl-ops-reports` を使ってください。
- `termux-chroot` が有効でない場合、一部のシェル挙動は通常の Linux デスクトップと異なることがあります。

## 次に読む文書

- リポジトリ全体のルールと責務分担: [AGENTS.md](./AGENTS.md)
- 人間向けの全体概要と主要コマンド: [README.md](./README.md)
- RL 学習・評価・artifact の流れ: [scripts/rl/README.md](./scripts/rl/README.md)
- 高リスク変更時の手動確認項目: [TESTPLAN.md](./TESTPLAN.md)

## 重要な不変条件

- `index.html` の script 読み込み順は重要です。
- オンライン対戦は決定論的で、ホスト主導です。
- サーバーはアクションを検証・中継しますが、完全なゲーム状態は持ちません。
- 再接続とサーバー再起動後の復元は、例外対応ではなく製品の中核機能です。
- 文字列リテラルではなく、`CARD_EFFECTS`、`CARD_CATEGORIES`、`LANDMARK_NAMES`、`GAME_PHASES`、`LOG_TYPES` など既存定数を使ってください。

## 主な責務の対応

- ルール本体: `js/GameManager.js`
- カード・定数: `js/Card.js`
- 通常 CPU: `js/CPU.js`
- RL CPU ランタイム: `js/RLCPU.js`
- オンラインクライアントの流れ: `js/online.js`, `js/main.js`
- 保存・再接続永続化: `js/storage.js`
- UI / モーダル: `js/ui.js`
- サーバー検証 / ルーム / 復元: `server.js`
- RL 学習・評価フロー: `scripts/rl/*.py`, `scripts/*.js`, `models/rl_model/`

## よく使う確認コマンド

- 全自動テスト: `npm test`
- クライアント 1 ファイルの構文確認: `node --check js/<file>.js`
- RL baseline 学習: `sh scripts/rl/run-baseline.sh`
- 模倣なし RL カリキュラム学習: `sh scripts/rl/run-js-oracle-terminal-shaped.sh --run-label <label>`
- 4人用 RL 自己対戦: `sh scripts/rl/run-self-only-4p-h256-lr2e5-5000.sh --run-label <label>`
- RL と JS CPU の比較: `npm run eval-rl-vs-js -- --model <path>`
- 3人/4人の採用済みモデル評価: `sh scripts/rl/eval-run-3p.sh 100 <model-id>`, `sh scripts/rl/eval-run-4p.sh 100 <model-id>`
- RL 台帳の検証/棚卸し: `npm run validate-rl-registry`, `npm run report-rl-registry`
- RL 採用モデルの評価監査: `npm run audit-rl-portfolio`
- RL 次アクション抽出: `npm run plan-rl-next-actions`
- RL 2人戦採用候補レビュー: `npm run review-rl-adoptions`
- RL 台帳系レポート一括更新: `npm run refresh-rl-ops-reports`
- RL metrics 集計: `npm run summarize-rl-metrics -- --csv models/rl_model/train_metrics.csv`

## 編集時の基本

- ルール、オンラインフロー、再接続、検証、共有ゲーム挙動を変更したら `npm test` を実行してください。
- CPU / self-play / tuning を変更したら、関連する CPU 系テストも追加で実行してください。
- RL ランタイムや学習・評価ツールを変更したら、RL 系テストも追加で実行してください。
- オンラインや再接続を変更したら、[TESTPLAN.md](./TESTPLAN.md) の手動確認項目も見てください。

## RL の位置づけ

- RL は現在 `expert` とは別ラインです。
- 製品方針としては、`expert` を直接置き換えるのではなく、新しい CPU として導入する前提です。
- checkpoint の品質判断は `vs_random` だけでなく、JS CPU 評価と summary artefact を主に見てください。
- `normal/strong/expert` 相手の学習は Python heuristic ではなく JS `CPU.js` oracle を優先してください。詳細な報酬設計、相手比率、`js=...` ログの読み方は [scripts/rl/README.md](./scripts/rl/README.md) を参照してください。
