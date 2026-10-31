# GitHub Actions での RL 自己対戦学習

この仕組みは既存の `scripts/rl/train.py` / 学習ラッパーを使用します。モデルの再実装はしません。
公開リポジトリの GitHub-hosted 標準ランナーを利用し、**手動実行のみ**です。プッシュや定期実行では起動しません。
GitHub 側の利用規約、実行制限、artifact 保存制限は適用されます。

## 最初の実行

1. `main` に導入後、GitHub の **Actions → RL Self-play Training → Run workflow** を開く。
2. 最初は `player_count=2`、`games=20`、`learning_rate=recommended`、`seed=107`、`resume_run_id` 空欄で動作確認する。4人戦では `player_count=4` とする。
3. 成功したら `games=100`、必要に応じて 500 / 1000 に増やす。2人と4人は別モデルで、`recommended` は2人戦 `0.00002` / 4人戦 `0.00001`。
4. 実行ページのログ、Job summary、`rl-training-<run_id>-<attempt>` artifact を確認する。

各実行には固有の `gha-<run_id>-<attempt>` ラベルを付け、既存の `models/rl_model/portfolio/` と `registry.json` は変更しません。

## 前回の続きを学習する

実行ページ URL の末尾の数字が `run_id` です。例えば `.../actions/runs/123456789` の ID は `123456789` です。

1. 同じ人数のモデルを選ぶ。
2. `resume_run_id` に元の実行ID、`resume_attempt` に元の実行 attempt（通常 `1`）を入力する。
3. `games` は**今回追加する試合数**を選ぶ。初回と同じ総試合数を再実行する指定ではありません。
4. GitHub Actions が保存済み artifact の `model.progress.npz` を読み込み、新しい run にチェックポイントと指標を保存します。

古い artifact が削除・期限切れなら復元できません（既定 `retention-days: 30`）。
学習元を指定せずに起動した場合は新規学習です。2人用 `STATE_DIM=145` と4人用 `STATE_DIM=353` は互換ではないため、復元時に人数を照合します。
この「継続」は**重みの再読み込み（warm start）**で、乱数・探索率スケジュール・optimizerの内部状態・以前の統計を厳密に継続するものではありません。
Git 管理下の `portfolio/*.browser.json` はブラウザ用成果物であり、この学習再開に必要な `.npz` ではありません。

## 失敗・時間超過・成果物

学習ジョブは最大 300 分、そのうち学習コマンドは 240 分で中断します。
10試合ごとに `model.progress.npz` とブラウザ形式の途中状態を書き出すため、
途中で学習が失敗しても、成功したチェックポイントがあれば `if: always()` で回収できます。
一度も保存できなかった場合は再開できず、新しい run でやり直してください。

artifact には `model.progress.npz`、`model.progress.browser.json`、`best_model.npz`、`best_model.browser.json`、メタデータ、`train_metrics.csv`、`summary.json`（完走時）、ログなどがあれば含まれます。
4人戦は長い学習バッチで停止して見える問題を避けるため `--train-batch-size 1` を使っています。既存の標準バッチ8とは更新条件が異なるため、比較時に混ぜないでください。

## 評価と採用判断

学習終了後に既存の JS CPU 対戦評価を実行します。

- 2人戦: `scripts/rl/eval-run.sh` で weak / normal / strong 各20戦
- 4人戦: `scripts/rl/eval-run-4p.sh` で既定の3つの4人lineupを各20戦

上記は**smoke（一次評価）**です。評価中のモデル選抜（各2試合）も統計的な採用根拠にはなりません。
昇格判断前にはモデル本体を評価環境へ取り出し、`npm run eval-rl-models` / `npm run eval-rl-head-to-head` で
既存採用モデルとの同条件・席順固定比較を行います。少なくとも50戦、主要候補100戦、必要時300戦の再評価と、
`npm run test:rl`・Python/JS parity・特殊局面テストを実施してください。
評価で優位が確認できるまで、`portfolio/` の上書きや自動デプロイは行いません。

## 実行上の注意

公開リポジトリの標準ランナーは一般に Actions 分数の課金対象外ですが、GitHubの公平利用・実行時間制限、保存容量などの制約があります。
長時間学習を無制限に回せる保証ではありません。既存 `CPU（最強）` のルール調整と深層学習CPUの採用評価は分けて扱います。
