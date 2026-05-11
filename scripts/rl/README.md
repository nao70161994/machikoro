# 街コロ強化学習 AI（scripts/rl）

PyTorch / TensorFlow が使えない Android + Termux 環境で動作する、
numpy のみで実装した Actor-Critic 強化学習 AI。
ゲームエンジンも Python で再実装し、全カード効果を再現している。

---

## ファイル構成

| ファイル | 役割 |
|---------|------|
| `cards.py` | カード・ランドマーク定義（基本 + プラス + シャープ、計 38 枚） |
| `game_env.py` | 学習用ゲームエンジン（2〜4人、全フェーズ・全カード効果実装） |
| `encode.py` | 局面ベクトル化・行動マスク生成 |
| `network.py` | numpy 製 MLP（Layer + PolicyValueNet） |
| `agent.py` | GAE Actor-Critic エージェント |
| `train.py` | 学習ループ（JS oracle / self / pool / 報酬設計 / metrics 出力） |
| `heuristic.py` | 評価用ヒューリスティックエージェント（4段階） |
| `js_cpu_action_oracle.js` | JS 側 `CPU.js` を Node から呼ぶ行動 oracle |
| `js_cpu_oracle.py` | Python 学習ループから JS CPU oracle を使うための subprocess wrapper |
| `run-js-oracle-baseline.sh` | JS oracle CPU を使う baseline ラッパー |
| `run-js-oracle-terminal-shaped.sh` | 模倣なし、終局報酬調整、自己対戦込みの現行RL実験ラッパー |
| `run-js-oracle-strong-select.sh` | `hidden=128/lr=0.0001` を固定し、strong重視のJS評価でbest checkpoint上位3件を選ぶ実験ラッパー |
| `run-js-oracle-self-both.sh` | self 対戦時だけ両席の行動を学習対象にする実験ラッパー |
| `run-self-only-h256-lr2e5-5000.sh` | `hidden=256/lr=0.00002/5000 games/self=1/両側学習/reward cap` の短縮プリセット |
| `run-self-only-4p-h256-lr2e5-5000.sh` | `--player-count 4` の4人専用自己対戦プリセット |
| `bg-list.sh` | 追跡中のバックグラウンド学習ジョブを一覧表示する |
| `bg-status.sh` | ジョブの `running/stopped/done` と summary 有無を確認する |
| `bg-tail.sh` | ジョブの最新ログを tail する |
| `bg-stop.sh` | 実行中ジョブを停止する |
| `bg-summary.sh` | 完走済み run の `summary.json` から best run / config / top score を表示する |
| `bg-rerun.sh` | 途中停止したバックグラウンド学習ジョブを、保存済み command から再起動する |
| `bg-prune.sh` | 停止済みで summary を持たない stale job の pid/status/cmd を掃除する |
| `bg-experiment-set.sh` | 複数 job の status + summary をまとめて表示する |
| `bg-watch-summary.sh` | 学習ログから進捗 / best 更新 / JS評価 / tgt を抜いて見る |
| `bg-wait.sh` | バックグラウンド学習ジョブの完走待ち。完了後に summary を表示 |
| `bg-finalize.sh` | 完走待ち + summary 表示 + `refresh-rl-ops-reports` を一発で実行 |
| `bg-finalize-top10-multiplayer.sh` | 完走待ち + report 更新 + top10 多人数後評価まで一発で実行 |
| `bg-finalize-experiment-set-top10-multiplayer.sh` | 複数 job の完走待ち + top10 多人数後評価 + run 間比較レポートを一発で実行 |
| `eval-run.sh` | `run-label` / `registry model id` / 直接 path から 2人評価する短縮ラッパー |
| `eval-run-3p.sh` | `run-label` / `registry model id` / 直接 path から 3人 lineup を評価する短縮ラッパー |
| `eval-run-4p.sh` | `run-label` / `registry model id` / 直接 path から 4人 lineup を評価する短縮ラッパー |
| `eval-run-multiplayer.sh` | 3人/4人の標準 lineup 評価をまとめて実行する短縮ラッパー |
| `eval-run-top10-multiplayer.sh` | `run-label` の top checkpoint 群を 3人/4人複数 lineup で後評価し、review まで出力する。第4引数で `run-ranks` を指定可能 |
| `../review-rl-multiplayer-topk.js` | top-k 多人数後評価 JSON を 3人/4人総合点+多様性で並べる |
| `../review-rl-multiplayer-experiment-set.js` | 複数 run の top10 review JSON を、run 間の総合点+多様性で比較する |
| `../eval-rl-models.js` | 複数の registry model / run-label をまとめてJS評価し、ランキングJSON/CSVを出力 |
| `../eval-rl-special-scenarios.js` | テレビ局 / ビジネスセンター / 清掃業 / 引越し屋 / 改装屋などの固定局面で target / pending action 選択を診断 |
| `../validate-rl-registry.js` | `models/rl_model/registry.json` のID重複・推奨モデル参照を検証 |

---

## CPU強化方針

RL CPU は `CPU（最強）` v2simple の置き換えではなく、別系統の `AI（深層学習・ランダム）` として並行強化する。registry / portfolio は RL CPU の採用管理に使い、v2simple の診断・採用判断は `docs/expert-v2-diagnostics.md` に分ける。

v2simple を評価相手や比較基準として使う場合も、RL の採用判断と v2simple の手書き変更判断は混ぜない。RL 候補は既存の採用 RL モデル、JS `weak/normal/strong/expert`、多人数 lineup 評価で判断する。

## アーキテクチャ

### 状態空間（STATE_DIM = 145）

```
self_coins / 50            1
opp_coins  / 50            1
自分のランドマーク (binary) 6
相手のランドマーク (binary) 6
自分のカード枚数 / 5       38
相手のカード枚数 / 5       38
自分の休業枚数 / 5         38
フェーズ (one-hot)          6
last_dice / 14              1
last_d1   / 6               1
last_d2   / 6               1
pending counts              5  (tv, biz, clean, mover, reno)
pending_it flag             1  ← ITベンチャー意思決定フラグ
IT ベンチャー積立 / 10      1
turn_count / 200            1
───────────────────────────
合計                      145
```

### 多人数用状態空間（4人モデル、STATE_DIM = 353）

`--player-count 3` または `--player-count 4` を指定すると、既存2人モデルとは別の多人数用状態表現を使う。既存の2人モデル互換性を保つため、デフォルトは `STATE_DIM = 145` のまま。

多人数用は最大4人固定長で、`自分 + 脅威度順の相手3枠` を並べる。3人戦では相手枠1つをゼロ埋めする。

```
自分/相手1枠あたり:
  coins / 50               1
  ランドマーク binary       6
  activeカード枚数 / 5     38
  dormantカード枚数 / 5    38
  IT積立 / 10              1
  小計                    84

4枠ぶん                  336
フェーズ one-hot           6
last_dice, d1, d2          3
pending counts             5
pending_it                 1
turn_count / 200           1
player_count正規化         1
───────────────────────────
合計                      353
```

現時点の多人数モデルは、行動空間は2人モデルと同じ `NUM_ACTIONS = 1580` を使う。テレビ局・ビジネスセンター・引越し屋の対象プレイヤーは、`tv_target` / `bc_target` / `mover_target` の optional target head があればその出力を使う。head が無い既存モデルでは、テレビ局・ビジネスセンターは脅威度最大の相手へ fallback し、引越し屋は渡すカードの価値と相手脅威度から recipient を選ぶ JS runtime fallback を使う。清掃業は action head が選んだカード名を基本にしつつ、相手被害と自分被害の差が明確に大きい場合だけ heuristic の最良カード名へ上書きする。target head の checkpoint / browser export / `js/RLCPU.js` / Python 推論 / 学習更新は実装済みで、学習ログでは `tgt=` として pending 発生率と更新率を確認できる。実装棚卸しと導入方針は [TARGET_HEAD_DESIGN.md](./TARGET_HEAD_DESIGN.md) を参照。

### 行動空間（NUM_ACTIONS = 1580）

```
ACT_ROLL1         = 0          サイコロ1個
ACT_ROLL2         = 1          サイコロ2個（駅あり時）
ACT_KEEP          = 2          振り直しなし
ACT_REROLL        = 3          振り直す（電波塔）
ACT_HARBOR_YES    = 4          +2 宣言（港）
ACT_HARBOR_NO     = 5
ACT_IT_SAVE       = 6          IT ベンチャー積立
ACT_IT_SKIP       = 7
ACT_TV_TARGET     = 8          テレビ局ターゲット（2人戦は1択）
ACT_BC_BASE       = 9〜1452    ビジネスセンター（38×38 = 1444 通り）
ACT_CLEAN_BASE    = 1453〜1490 清掃業（休業カード × 38）
ACT_MOVER_BASE    = 1491〜1528 引越し屋（渡すカード × 38、activeのみ）
ACT_RENO_BASE     = 1529〜1534 改装屋（解体ランドマーク × 6）
ACT_BUY_CARD_BASE = 1535〜1572 カード購入 × 38
ACT_BUY_LM_BASE   = 1573〜1578 ランドマーク購入 × 6
ACT_PASS          = 1579
```

### ネットワーク構造

```
入力 (145,)
  ↓  FC + ReLU (hidden=256)
  ↓  FC + ReLU (hidden=256)
  ├─→ 方策ヘッド:    FC → softmax (1580,)   ← 通常行動の確率分布
  ├─→ BC give ヘッド: FC → softmax (38,)    ← ビジネスセンター「渡すカード」
  ├─→ BC take ヘッド: FC → softmax (38,)    ← ビジネスセンター「受け取るカード」
  └─→ 価値ヘッド:    FC → tanh (1,)         ← 局面価値 (-1〜1)
```

ビジネスセンターは joint 1444 次元でなく、渡す/受け取る を独立した 38 次元で学習する
**factored head** を使う。組み合わせ構造を活かして、学習効率を改善する。

---

## 学習アルゴリズム

### 対戦相手構成

`train.py` の `--train-opponents` は `random/self/pool/weak/normal/strong/expert` の重み指定を受け付ける。

| 相手 | 内容 |
|------|------|
| `random` | Python 環境の合法手ランダム |
| `weak` | 弱い固定CPU |
| `normal` / `strong` / `expert` | 既定では Python heuristic。`--cpu-opponent-impl js-oracle` で JS `CPU.js` 実装を使う |
| `self` | 現在モデルの greedy 方策を相手として使う自己対戦。`--self-learn-both-sides` で両席学習に切り替え |
| `pool` | 過去モデル snapshot の greedy 方策を相手として使う |

既定の `self` は片側学習。学習バッファに入るのはエージェント席の行動だけで、相手席の self 行動は環境を進めるために使う。
`--self-learn-both-sides` を付けた場合は `opponent=self` のゲームだけ両席の行動を同じモデルの学習対象にする。

opponent pool は `--pool-update-every` ごとに現在モデルを deepcopy し、`--pool-max-size` 個まで保持する。
短い実験では既定の `5000` だと pool が効かないため、現行カリキュラムでは `250` を使う。

**エージェント席はゲームごとにランダム化**（先手/後手を均等に経験）。

### GAE（方策勾配）+ MC リターン（価値学習）

```
δ_t = r_t + γ · V(s_{t+1}) · (1 - done_t) - V(s_t)   # TD 残差

A_t = δ_t + (γλ) · δ_{t+1} + (γλ)² · δ_{t+2} + ...   # GAE（λ=0.95）

G_t^MC = r_t + γ·r_{t+1} + γ²·r_{t+2} + ...           # MC リターン（価値ターゲット）
```

- **方策ヘッド**: GAE advantage を使用（全ステップに信号を伝える）
- **価値ヘッド**: 純 MC リターンを使用（ブートストラップ非依存で安定）

### 更新式

```
方策損失: L_π = -log π(a_t|s_t) · Â_t      （Â = 正規化 advantage）
価値損失: L_V = (tanh(v_raw) - G_t^MC)²     （G は [-1.0, 1.0] にクリップ）
合計損失: L = L_π + L_V + エントロピー正則化
```

エントロピー正則化は softmax ヤコビアンを反映した正確な logit 勾配を使用:

```
∂H/∂logit_i = π_i · ((log π_i + 1) − Σ_j π_j · (log π_j + 1))
```

Adam（lr=3e-4）でパラメータを更新。

### 報酬設計

`train.py` は中間報酬と終局報酬を別々に設定できる。

中間報酬:

```
reward =
  reward_coin         * 自分のコイン増加
- reward_opp_coin     * 相手のコイン増加
+ reward_asset        * 自分の盤面資産増加
- reward_opp_asset    * 相手の盤面資産増加
+ reward_landmark     * 自分のランドマーク建設数増加
- reward_opp_landmark * 相手のランドマーク建設数増加
```

盤面資産は `カード購入額合計 + 建設済みランドマーク額合計`。手元コインは含めない。
手元コインは `reward_coin` / `terminal_coin_diff` で別評価する。

改装屋で自分のランドマークを破壊した場合、破壊収入による正の `coin/asset` 中間報酬は無効化する。
これは安いランドマークを破壊して再建設する報酬ループを避けるため。

終局報酬:

```
terminal =
  勝敗報酬
+ terminal_landmark_diff       * 建設済みランドマーク数差
+ terminal_landmark_value_diff * 建設済みランドマーク総コスト差
+ terminal_asset_diff          * 盤面資産差
+ terminal_coin_diff           * 手元コイン差
+ terminal_airport_progress    * 空港未建設時の所持コイン進捗
```

`terminal_asset_diff` と `terminal_coin_diff` の差分は `--terminal-diff-clip` でクリップできる。
`--terminal-airport-progress` は既定0で無効。空港未建設の終局状態だけ、所持コインを空港価格30まで `--terminal-airport-progress-clip` でクリップして加算する。空港未達敗戦の仮説検証用で、未達ペナルティは入れない。
現行の terminal-shaped 実験では中間報酬をすべて0にし、終局時だけ勝敗・ランドマーク総コスト差・盤面資産差・手元コイン差で調整する。

### 方策勾配の action mask 対応

行動選択・勾配計算の両方で masked_policy（有効行動のみ正規化）を使う。
無効行動への勾配漏れを防ぐ。強制行動（有効手が1つのみ）は価値学習のみ行い、
方策勾配の対象から除外する。

---

## 学習の実行

```bash
# 標準学習（新規）
rm -f models/rl_model/model.npz
python3 -m scripts.rl.train --games 30000 --eval-every 1000

# 継続学習（既存モデルを読み込む）
python3 -m scripts.rl.train --games 30000 --eval-every 1000 --load

# baseline 用ラッパースクリプト（Termux での実行向け）
sh scripts/rl/run-baseline.sh

# JS側 CPU oracle を学習相手に使う baseline
sh scripts/rl/run-js-oracle-baseline.sh --run-label js-oracle-baseline

# 現行の模倣なしRL実験: 中間報酬なし、終局報酬調整、self/pool込み
sh scripts/rl/run-js-oracle-terminal-shaped.sh --run-label terminal-shaped-curriculum

# hidden サイズ比較
sh scripts/rl/run-js-oracle-terminal-shaped.sh --run-label terminal-shaped-h128 --hidden 128
sh scripts/rl/run-js-oracle-terminal-shaped.sh --run-label terminal-shaped-h256 --hidden 256

# 現時点の有力条件
sh scripts/rl/run-js-oracle-terminal-shaped.sh --run-label terminal-shaped-h128-lr1e4 --hidden 128 --lr 0.0001
sh scripts/rl/run-js-oracle-terminal-shaped.sh --run-label terminal-shaped-h128-long --hidden 128 --games 3000

# seed違いの再現性確認
sh scripts/rl/run-js-oracle-terminal-shaped.sh --run-label terminal-shaped-h128-lr1e4-seed2 --hidden 128 --lr 0.0001 --seed 2
sh scripts/rl/run-js-oracle-terminal-shaped.sh --run-label terminal-shaped-h128-lr1e4-seed3 --hidden 128 --lr 0.0001 --seed 3

# strongを少量混ぜる実験（現時点では改善せず、記録用）
sh scripts/rl/run-js-oracle-terminal-shaped.sh --run-label terminal-shaped-h128-lr1e4-strong005 --hidden 128 --lr 0.0001 --seed 11 --train-opponents random=0.3,weak=0.4,normal=0.05,strong=0.05,self=0.1,pool=0.1
sh scripts/rl/run-js-oracle-terminal-shaped.sh --run-label terminal-shaped-h128-lr1e4-strong010 --hidden 128 --lr 0.0001 --seed 11 --train-opponents random=0.3,weak=0.3,normal=0.1,strong=0.1,self=0.1,pool=0.1

# strongを学習相手に混ぜず、checkpoint選抜でstrongを重く見る実験
sh scripts/rl/run-js-oracle-strong-select.sh --run-label strong-select-seed21 --seed 21

# self 対戦時に両席を学習する実験
sh scripts/rl/run-js-oracle-self-both.sh --run-label self-both-seed41 --seed 41

# h256/lr=2e-5/5000/self=1/両側学習/reward cap の短縮プリセット
sh scripts/rl/run-self-only-h256-lr2e5-5000.sh --run-label self-only-both-h256-lr2e5-5000-seed67-rewardcap --seed 67
sh scripts/rl/run-self-only-h256-lr2e5-5000.sh --run-label self-only-both-h256-lr2e5-5000-seed68-rewardcap --seed 68

# run-label から best checkpoint を外部評価する短縮ラッパー
sh scripts/rl/eval-run.sh self-only-both-h256-lr2e5-5000-seed67-rewardcap
sh scripts/rl/eval-run.sh self-only-both-h256-lr2e5-5000-seed68-rewardcap

# top-k checkpoint の2位/3位を評価する場合
sh scripts/rl/eval-run.sh self-only-both-h256-lr2e5-5000-seed67-rewardcap 20 weak,normal,strong 2
sh scripts/rl/eval-run.sh self-only-both-h256-lr2e5-5000-seed67-rewardcap 20 weak,normal,strong 3

# best/top2/top3 を同条件でまとめて後評価する場合
sh scripts/rl/eval-run-topk.sh self-only-both-h256-lr2e5-5000-seed67-rewardcap 100

# baseline の既定値を保ったままゲーム数だけ短くする
sh scripts/rl/run-baseline.sh --games 5000

# run-label ごとに出力先を分けて並列実行する
sh scripts/rl/run-baseline.sh --run-label eps030 --epsilon 0.30
sh scripts/rl/run-baseline.sh --run-label lr1e4 --lr 0.0001

# JS側 CPU との定期評価と metrics CSV 出力も有効化
python3 -m scripts.rl.train \
  --games 1000 \
  --eval-every 500 \
  --hidden 128 \
  --js-eval-games 1 \
  --js-eval-opponents strong \
  --initial-eval-games 0 \
  --eval-random-games 10 \
  --eval-heuristic-games 4 \
  --eval-pool-games 4 \
  --final-eval-random-games 20 \
  --final-eval-heuristic-games 8 \
  --final-eval-pool-games 8 \
  --progress-every 50 \
  --max-steps 1200 \
  --eval-max-steps 1200 \
  --metrics-csv models/rl_model/runs/baseline/train_metrics.csv \
  --best-checkpoint models/rl_model/runs/baseline/best_model \
  --summary-output models/rl_model/runs/baseline/summary.json \
  --summary-run-index-csv models/rl_model/runs/baseline/run_index.csv \
  --summary-config-index-csv models/rl_model/runs/baseline/config_index.csv \
  --summary-format json \
  --summary-baseline-run baseline \
  --summary-weights strong=1 \
  --run-label baseline

# オプション一覧
python3 -m scripts.rl.train \
  --games 1000       # 総ゲーム数
  --eval-every 500   # 評価間隔
  --hidden 128        # 隠れ層サイズ（軽量 baseline の既定値）
  --lr 3e-4           # 学習率
  --seed 11           # Python random / numpy のseed（再現実験用）
  --epsilon 0.20      # 初期探索率（線形減衰 → 0.02 まで）
  --load              # models/rl_model/model.npz を読み込んで継続学習
  --load-checkpoint models/rl_model/runs/<run-label>/best_model  # 指定checkpointから継続学習
  --cpu-opponent-impl js-oracle  # normal/strong/expert 相手に JS CPU oracle を使う
  --train-opponents random=0.3,weak=0.4,normal=0.1,strong=0,self=0.1,pool=0.1  # 学習相手比率
  --self-learn-both-sides  # opponent=self のゲームだけ両席の行動を学習対象にする
  --pool-update-every 250  # pool snapshot 追加間隔
  --pool-max-size 4  # pool snapshot 保持数
  --restore-best-at-end  # 学習終了時に best checkpoint を通常モデルへ復元
  --js-eval-games 1  # JS側 CPU 相手の定期評価ゲーム数
  --js-eval-opponents strong  # JS評価対象 difficulty（2人評価）
  --js-eval-lineups "rl,weak,normal,strong;rl,normal,normal,strong"  # 4人評価を使う場合
  --initial-eval-games 0  # 学習開始前の vs ランダム評価をスキップ
  --eval-random-games 10  # 定期評価での vs ランダム評価ゲーム数
  --eval-heuristic-games 4  # 定期評価での weak/normal/strong/expert 評価ゲーム数
  --eval-pool-games 4  # 定期評価での opponent pool 評価ゲーム数
  --final-eval-random-games 20  # 学習終了時の vs ランダム評価ゲーム数
  --final-eval-heuristic-games 8  # 学習終了時の weak/normal/strong/expert 評価ゲーム数
  --final-eval-pool-games 8  # 学習終了時の opponent pool 評価ゲーム数
  --progress-every 50  # 軽量な進捗表示の間隔
  --train-batch-size 8  # 何ゲーム分の遷移をまとめて train() するか
  --debug-train-batch  # train() batch の件数と所要時間を表示する
  --debug-game-seconds 30  # 長い学習ゲーム中に指定秒数ごとのdebugログを出す
  --max-steps 1200  # 学習ゲーム1試合あたりの最大 step 数
  --eval-max-steps 1200  # 評価ゲーム1試合あたりの最大 step 数
  --metrics-csv models/rl_model/runs/baseline/train_metrics.csv  # 評価結果CSV
  --best-checkpoint models/rl_model/runs/baseline/best_model  # 学習中の best checkpoint 退避先
  --summary-output models/rl_model/runs/baseline/summary.json  # 学習終了時の集計出力
  --summary-run-index-csv models/rl_model/runs/baseline/run_index.csv  # 学習終了時の run index CSV
  --summary-config-index-csv models/rl_model/runs/baseline/config_index.csv  # 学習終了時の config index CSV
  --summary-format json  # 集計出力形式（text/json）
  --summary-baseline-run baseline  # 集計時の baseline run
  --summary-weights strong=1  # 集計時の重み
  --run-label baseline  # CSV 比較用ラベル（未指定なら自動生成）
```

> **注意**: `--hidden` の値が保存済みモデルと異なる場合は読み込みエラーになる。
> 必ず保存時と同じ値を指定すること。

> **注意**: `--load` が読むのは run 別 best ではなく `models/rl_model/model.npz`。特定 run の best から再開する場合は、共有モデルを手動コピーで差し替えず、同じ `--hidden` / `--player-count` を指定して `--load-checkpoint models/rl_model/runs/<run-label>/best_model` を使う。`.npz` 拡張子は付けても付けなくてもよい。

> **運用メモ**: Termux では `--eval-every 1000` や `--js-eval-games 20` のような重い設定だと、学習より定期評価の時間が支配的になりやすい。baseline の既定値は、まず短時間で動作確認できて進捗が見えることを優先して `1000 / 500 / 1 / strong`、さらに初期評価スキップ、軽量評価回数、`max_steps=1200` にしている。

> **運用メモ**: 4人自己対戦で `--self-learn-both-sides` を使う場合、1ゲームあたりの遷移数が大きくなり、既定 `--train-batch-size 8` では `train()` が長時間無出力になることがある。速度切り分け時は `--debug-train-batch` と `--debug-game-seconds` を使い、短時間 sanity run では `--train-batch-size 1` で batch stall を避ける。これは学習更新単位を変える実験条件なので、採用評価では run label と docs に明記する。

### 学習ログの見方

```
[  1000] rnd=56%  weak=72%  nrm=48%  str=40%  exp=35%  pool=n/a  train=54%  pl=0.210  vl=0.063  adv=0.047  tgt=12%/11%(tv=5% bc=4% mv=2%)  eps=0.193  js=strong=60%(f70%/s50%/d10%)/1@17.4 expert=35%(f40%/s30%/d5%)/0@21.2
```

| 指標 | 正常な範囲 | 意味 |
|------|-----------|------|
| `rnd` | 50% → 65%+ | vs ランダム greedy 勝率（200 ゲーム、主指標） |
| `weak` | 60%+ | vs ヒューリスティック weak（50 ゲーム） |
| `nrm` | 50%+ | vs ヒューリスティック normal（50 ゲーム） |
| `str` | 45%+ | vs ヒューリスティック strong（50 ゲーム） |
| `exp` | 40%+ | vs ヒューリスティック expert（50 ゲーム） |
| `pool` | 50% 前後 | vs 過去モデル（50 ゲーム、pool が空の間は n/a） |
| `train` | 50% → 上昇 | 学習ゲームでのエージェント勝率 |
| `vl` | 0.05〜0.1 → 低下 | 価値関数の精度 |
| `adv` | 0 前後に収束 | 正規化前の平均優位性（価値関数のバイアス） |
| `pl` | 0.1〜0.3 | 方策損失（0 に張り付く = 学習停止の兆候） |
| `tgt` | 多人数戦で 0% 以外 | `pending target 発生率 / 実更新率`。括弧内は `tv / bc / mover` の target head 更新率 |
| `js=...` | 比較用 | JS 側 `weak/normal/strong/expert`、または `--js-eval-lineups` の4人 lineup に対する RL 勝率。`f/s/d` は RL 先手勝率 / 後手勝率 / 引き分け率、`/@` は `exhausted` 件数 / 平均ターン |

例:

```
js=weak=25%(f50%/s0%/d0%)/0@122.5 normal=0%(f0%/s0%/d0%)/0@72.0 strong=25%(f0%/s50%/d0%)/0@68.5
```

- `weak=25%`: `weak` 相手の総合勝率。`--js-eval-games 4` なら4戦1勝。
- `f50%`: RL が先手のときの勝率。
- `s0%`: RL が後手のときの勝率。
- `d0%`: 引き分け率。
- `/0`: `exhausted` 件数。
- `@122.5`: 平均ターン数。

`--js-eval-games 4` は1勝で25%動くため、best 判定や傾向確認用の軽量評価と考える。実力確認は `scripts/eval-rl-vs-js.js --games 20` 以上で再評価する。

4人用モデルでは2人評価だけだと目的からズレるため、`--js-eval-lineups "rl,weak,normal,strong;rl,normal,normal,strong"` のように4人 lineup を指定する。4人自己対戦プリセットは既定で4人JS評価を使い、best checkpoint の算定もその lineup 勝率を優先する。

3人以上の lineup 評価では `STATE_DIM = 353` の多人数モデルだけを使う。`STATE_DIM = 145` の2人用モデルを3〜4人 lineup に混ぜると比較対象がずれるため、JS評価 / build pass 診断は2人用モデルを検出した時点でエラーにする。

### 4人 trace 比較

4人用モデルは Python 学習環境と JS 実戦環境のズレが致命的になりやすい。固定ダイス列で同じ lineup を走らせ、最初の差分を検出する。

```bash
npm run compare-rl-match-trace -- \
  --python-model models/rl_model/model \
  --js-model models/rl_model/model.browser.json \
  --lineup rl,normal,normal,strong \
  --max-steps 30 \
  --seed 7 \
  --js-cpu-oracle
```

`trace matched: steps=30` なら、その範囲では状態・合法手・選択手・ロール消費が一致している。`--lineup` は `rl,weak,normal,strong` などに差し替えられる。

### JS CPU との比較評価

学習済みモデルを browser 用 JSON に export して、JS 実装の `weak/normal/strong/expert` と 2 人戦で比較できる。
現行の模倣なしRL実験では、まず `weak` に安定して勝てるかを見てから `normal` / `strong` へ進める。

```bash
npm run export-rl-model
npm run eval-rl-vs-js -- --model models/rl_model/model.browser.json --games 20 --opponents weak,normal,strong
```

opponent 難易度ごとのブレを切り分けたい場合は `--shared-seeds`（別名 `--same-seed`）を付ける。
既定では `weak` / `normal` / `strong` ごとに評価 seed 範囲をずらすが、`--shared-seeds` では各 opponent に同じ `seed..seed+games-1` を使う。
これは difficulty 間や候補モデル間を同じ seed 条件で見直すための診断用で、相手やモデルの選択が分岐した後の乱数消費まで完全に揃えるものではない。採用判断では通常どおり十分なゲーム数で再評価する。

`--cpu-opponent-impl js-oracle` は、Python 学習環境の `normal/strong/expert` 相手に JS 側 `CPU.js` を oracle として使う。
これは Python heuristic と JS CPU のズレを避けるための現行推奨設定。

評価結果には `rl-business` も出力する。これは RL 席がビジネスセンターを発動した回数、skip率、交換相手 difficulty、渡したカード、取ったカード、交換ペアの上位を表す。
BC ヘッド改善前の診断では、まずこの値で「そもそもBCを使っているか」「交換が偏っているか」「多人数で誰を狙っているか」を見る。

2026-04-20にBC統計のカード名参照バグを修正した。修正前の `skipped` は、RL がカード名で返した交換を集計側が配列 index と誤解していたため、実交換を skip と誤記録している可能性がある。
採用済み4人モデルのBC診断は、次の短縮コマンドで取り直す。

```bash
sh scripts/rl/eval-bc-adopted.sh
```

引数は `[GAMES] [MODEL_ID] [OUT_PREFIX]`。既定では `self-only-4p-h256-lr1e5-5000-seed103` を4人3lineupで50戦評価し、`models/rl_model/eval-bc-adopted.json/csv` に出力する。
旧採用 `seed102` の修正後再評価では、4人50戦×3lineupでBC発動1回、skip 0.0%。交換内容は `パン屋->サンマ漁船`、対象は `strong` だった。現行モデル群はBCをほぼ使わないため、BC factored head の弱さは採用ブロッカーではない。BCを強化するなら、まずBCを使う学習条件・報酬・カード購入誘導を作り、その後に target head / pair補正を検討する。

BCの選択品質だけを直接見る場合は、固定局面診断を使う。これは通常対戦を回さず、`pendingBusiness=1` の状態を作ってRLに「誰へ、何を渡し、何を取るか」だけを選ばせる。

```bash
sh scripts/rl/eval-bc-scenario.sh
```

既定では採用済み `seed103` を4人用の固定局面で診断する。旧採用 `seed102` の2026-04-20時点の結果は、全局面で最脅威の `p3` を対象にし、`highValueThreat` / `offLeaderPrize` / `protectEngine` では `パン屋->サンマ漁船`、`avoidGivingEngine` では `パン屋->マグロ漁船`、`dormantGive` では休業中カードを避けて `パン屋->鉱山` を選んだ。固定局面では明らかな破綻は見えていない。

### 複数モデルの一括評価

台帳に載っている推奨モデルや、複数の `run-label` を同じ条件で評価してランキングできる。
結果は人間向け text に加えて、後で台帳へ転記しやすい JSON / CSV として保存できる。

```bash
# registry の recommendedActiveModels を 2人戦 weak/normal/strong で一括評価
npm run eval-rl-models -- --games 50 --csv models/rl_model/eval-summary.csv

# run-label を直接指定して比較
npm run eval-rl-models -- \
  --run-labels self-only-both-h256-lr2e5-5000-seed67-rewardcap,self-only-both-h256-lr2e5-5000-seed68-rewardcap \
  --games 50 \
  --output models/rl_model/eval-summary.json \
  --csv models/rl_model/eval-summary.csv

# 4人 lineup 評価
npm run eval-rl-models -- \
  --models self-only-4p-h256-lr1e5-5000-seed103 \
  --games 50 \
  --lineups "rl,weak,normal,strong;rl,normal,normal,strong;rl,weak,weak,normal"
```

スコアは `weak=1, normal=2, strong=3, expert=2` の重み付き平均。4人 lineup では各 lineup を同重みで平均する。
20戦評価は smoke test として扱い、active 採用は最低50戦、主採用は100戦以上、可能なら300戦で確認する。
`run-label` の2位/3位 checkpoint を比較する場合は `--rank 2` / `--rank 3` を付ける。
同じ `run-label` の best/top2/top3 をまとめて比較する場合は `--run-ranks 1,2,3` を使う。
CSV / Markdown にはモデルごとの構築シグネチャも出るため、勝率だけでなく戦略の重複も見やすい。
CSV には `businessTotal` / `businessSkipRate` / `businessGive` / `businessTake` / `businessExchanges` も含める。

```bash
npm run eval-rl-models -- \
  --run-labels self-only-both-h256-lr2e5-5000-seed71-rewardcap \
  --run-ranks 1,2,3 \
  --games 100 \
  --output models/rl_model/eval-seed71-topk.json \
  --csv models/rl_model/eval-seed71-topk.csv \
  --markdown models/rl_model/eval-seed71-topk.md
```

短縮ラッパーも使える。

```bash
sh scripts/rl/eval-run-topk.sh self-only-both-h256-lr2e5-5000-seed71-rewardcap 100
```

採用済み多人数モデルの安定性確認は、3人・4人をまとめて評価する短縮ラッパーを使う。

```bash
sh scripts/rl/eval-adopted-stability.sh
```

引数は `[GAMES] [MODEL_ID] [OUT_PREFIX]`。既定は `200` 戦、`self-only-4p-h256-lr1e5-5000-seed103`、`models/rl_model/eval-adopted-stability-{3p,4p}.json/csv`。

旧採用 `seed102` の2026-04-20 200戦評価では、4人は `weak+normal+strong` 70.0%、`normal+normal+strong` 67.5%、`weak+weak+normal` 91.5%。3人は `normal+strong` 72.5%、`weak+normal` 88.0%、`weak+strong` 76.5%。4人評価でBC発動は0回、3人評価では合計23回発動し skip 0.0%。

敗戦時にランドマーク競争でどれだけ遅れているかを見る場合は landmark race 診断を使う。勝率そのものの採用判断ではなく、報酬設計や checkpoint selection の仮説確認用。

```bash
node scripts/diagnose-rl-landmark-race.js \
  --models self-only-4p-h256-lr1e5-5000-seed103,self-only-4p-h256-lr1e5-5000-seed102 \
  --games 20 \
  --lineups "rl,weak,normal,strong;rl,normal,normal,strong;rl,weak,weak,normal;rl,strong,strong,strong"
```

出力の `avgLossGap` は敗戦時の `winnerBuilt - rlBuilt`、`rem1/rem2` は残りランドマーク1/2個で負けた回数、`missing` は敗戦時にRLが残しがちなランドマーク名。3人以上の lineup では2人用 `STATE_DIM = 145` モデルを拒否する。
必要なら `--format json --output models/rl_model/<label>.landmark-race.json` で保存するが、この出力も診断artifactなので git 管理しない。

2人用候補の横並び評価は次を使う。

```bash
sh scripts/rl/eval-2p-candidates.sh
```

既定では `seed71-top3` / `seed70` / `seed69` / `h128-lr1e4` を `weak,normal,strong` 各100戦で比較し、`models/rl_model/eval-2p-candidates.json/csv/md` に出力する。`.md` はドキュメントや issue にそのまま貼るための順位表。

2026-04-20の2人用候補100戦比較では、`seed71-top3` が `weak 100% / normal 96% / strong 76%` で明確に最上位。`seed69` は `weak 93% / normal 75% / strong 40%`、`seed70` は `weak 100% / normal 77% / strong 33%` で、構築傾向の違う補助候補として残す。`terminal-shaped-h128-lr1e4` は `weak 99% / normal 53% / strong 39%` で、normal が弱いため active portfolio から外して archive 扱いにした。

`seed71-top3` は追加の300戦評価でも `weak 99.3% / normal 93.3% / strong 63.3%`。100戦評価より strong は下がったが、他の active 2人候補より明確に高いため主採用を維持する。

### metrics CSV の集計

複数 run を同じ `train_metrics.csv` に積んだあとで、best checkpoint と run 単位の上位候補を比較できる。

```bash
npm run summarize-rl-metrics -- \
  --csv models/rl_model/train_metrics.csv \
  --opponents strong,expert \
  --weights strong=1,expert=2 \
  --baseline-run baseline \
  --output models/rl_model/summary.txt \
  --run-index-csv models/rl_model/run_index.csv \
  --config-index-csv models/rl_model/config_index.csv \
  --draw-penalty 0.5 \
  --exhausted-penalty 0.02
```

`--run-label baseline` を付けると、特定 run のみで絞り込める。
`--baseline-run baseline` を付けると、各 run の best checkpoint について baseline 比の `score` 差分と相手別勝率差分も表示する。
`--output ...` を付けると、表示内容を同じ形式のままファイルへ保存できる。`--format json` と組み合わせれば機械処理用の集計ファイルにも使える。
`--run-index-csv ...` と `--config-index-csv ...` を付けると、run 全体順位と設定全体順位を CSV で別保存できる。
`--run-label` を省略した場合は `YYYYMMDD-HHMMSS-h256-lr0.0003-ev1000-js20` のような形式で自動生成され、学習開始ログと CSV の両方に残る。
`train.py` 側でも `--summary-output` を付ければ、学習終了時に同じ summarize 処理を自動実行できる。`--summary-run-index-csv` と `--summary-config-index-csv` も併用すれば、run/config 順位 CSV までまとめて自動生成される。
`scripts/rl/run-baseline.sh` は baseline 用の既定引数を固定したラッパーで、末尾に追加オプションも渡せる。既定値は `--games 1000 --eval-every 500 --hidden 128 --js-eval-games 1 --js-eval-opponents strong` に加えて、初期評価はスキップし、定期評価・最終評価のゲーム数もかなり軽くしている。さらに `--max-steps 1200 --eval-max-steps 1200` で1試合の長さも抑え、`--progress-every 50` で進捗表示を出す。出力先は既定で `models/rl_model/runs/<run-label>/` になり、`--run-label` を変えれば衝突せず並列に回せる。例えば `sh scripts/rl/run-baseline.sh --games 5000` でゲーム数だけ上書きできる。
`--best-checkpoint` を付けると、各評価時点で最良だったモデルを `.npz` と `.browser.json`、さらに参照用の `.meta.json` で別保存する。判定は JS 評価があればその重み付き score、無ければ `expert/strong/normal/rnd` の重み付き代替スコアを使う。`--summary-output` も併用していれば、学習終了後に `meta.json` へ `bestRuns` / `bestConfigs` の抜粋に加えて、この run 自身に対応する `summaryRunContext` も追記される。`summaryRunContext` には `runIndexEntry` として run 全体順位、`configIndexEntry` として設定全体順位、`combinedTop` に入っていればその順位と entry も入る。`meta.json` には `artifacts` として `checkpointPath` / `browserCheckpointPath` / `metaPath` / `summaryPath` / `runIndexCsvPath` / `configIndexCsvPath` もまとまって入る。
集計結果には run 別だけでなく `hidden/lr` ごとの best config も含まれる。

### 現行の実験方針（2026-05）

- RL は `expert` 置き換えではなく、新CPUとして導入する前提。
- Python heuristic と JS `CPU.js` のズレが大きかったため、学習相手の `normal/strong/expert` は `--cpu-opponent-impl js-oracle` で JS oracle を使う。
- 模倣学習は `strong` 風の方策を早く作れるが、模倣なしRLの学習可能性を検証するため、`run-js-oracle-terminal-shaped.sh` では `--imitation-games 0` と `--imitation-refresh-games 0` にしている。
- 現行カリキュラムは `random=0.3,weak=0.4,normal=0.1,strong=0,self=0.1,pool=0.1`。`strong` は学習相手から一旦外し、評価対象としてだけ残す。
- `self` は既定では現在モデルを相手にする片側自己対戦。`--self-learn-both-sides` で `opponent=self` のゲームだけ両席を学習対象にできる。
- `pool` は過去モデル snapshot との対戦。短期実験でも効くよう `--pool-update-every 250 --pool-max-size 4` を使う。
- `--restore-best-at-end` で、学習終了時に途中 best checkpoint を `models/rl_model/model.npz` / `model.browser.json` へ復元する。長く回すと最終モデルが劣化することがあるため、現行スクリプトでは有効化している。
- `hidden=128` と `hidden=256` は比較対象。従来の混合相手では `hidden=256` が pass 方策へ崩れやすかったが、`lr=2e-5〜3e-5`、完全自己対戦、両側学習では有力候補が出ている。
- 学習済みモデル本体は git 管理しない。採用候補・評価結果・構築傾向は `models/rl_model/registry.json` に記録する。

これまでの観察:

- `strong` 模倣ありの best は一時的に `weak 80% / normal 65% / strong 25%` 程度まで到達した。
- 模倣なしで行動直後のコイン/資産中間報酬を入れる方式は、報酬ハックや方策崩れが疑われ、安定しなかった。
- 終局時だけ勝敗・ランドマーク建設済コスト差・盤面資産差・手元コイン差を加える方式へ移行中。
- 2人用モデルは300戦 JS 評価で `seed71-top3` が `weak 99.3% / normal 93.3% / strong 63.3%` となり、現時点の主採用モデル。
- `seed69` は `weak 93% / normal 75% / strong 40%`、`seed70` は `weak 100% / normal 77% / strong 33%`。どちらも `seed71-top3` より弱いが構築傾向が違うため、戦略バリエーション用に active portfolio へ低重みで残す。
- `terminal-shaped-h128-lr1e4` は100戦評価で `weak 99% / normal 53% / strong 39%`。normal が不安定なので active portfolio から外し、archive 扱いにした。
- `terminal-shaped-h128-long` は `weak 90% / normal 70% / strong 15%`。`h128-lr1e4` とは構築傾向が違うが、strong 性能が低く現時点の候補価値も薄いため archive 扱いにした。
- 旧来の混合相手 `hidden=256` 系は `lr=0.0003` で pass 99% 付近まで崩壊し、`lr=0.0001` でも pass 40〜50% 台が残った。一方、低学習率・完全自己対戦・両側学習・報酬クリップでは改善しており、3〜4人用には `self-only-4p-h256-lr1e5-5000-seed103` を採用している。
- `h128-lr1e4` の seed違い（seed2/seed3）は `weak 75% / normal 50% / strong 0%` 程度で、strong勝率の再現性はまだ弱い。
- `strong` を学習相手に `0.05` / `0.10` 混ぜるだけでは改善せず、どちらも best JS評価で `strong 0%`。単純な strong 混入より、勝ち試合の分析や checkpoint 選抜の改善を優先する。
- `terminal-shaped-h128-lr1e4` が strong に勝つ試合は、パン屋を厚く積み、マグロ漁船/コンビニ/寿司屋を絡めて全ランドマーク到達まで走る傾向がある。20戦中の strong 勝利7試合では平均60.0ターン、最終ランドマーク平均6.0個。
- 完全自己対戦のみでも、両側学習なし/高めlrでは外部JS評価が崩れることがある。`self-only-both-5000-seed51` は `pool=100%` でも JS `weak 12% / normal 0% / strong 0%` で rejected。
- `hidden=256 + lr=3e-5 + self=1 + --self-learn-both-sides + 5000 games` は当初 `weak 90% / normal 65% / strong 45%` を出したが、後評価で `seed71-top3` より normal が大きく弱いため archive 扱いにした。
- `hidden=256 + lr=2e-5 + rewardcap` は当初 `weak 95% / normal 70% / strong 35%` の安定型候補だったが、shared-seeds 100戦で normal が伸びず archive 扱いにした。
- `seed71 rewardcap` の top3 checkpoint は50戦 JS 評価で `weak 100% / normal 92% / strong 78%`、100戦 JS 評価で `weak 100% / normal 96% / strong 76%`。現時点の最強候補だが、単一採用ではなく戦略バリエーション用に別系統候補も残す。

ルールベースの `CPU（最強）` を `CPU（強）` より明確に上位へ保つための基準比較は次を使う。

```bash
sh scripts/eval-cpu-top-tier.sh 50
```

詳細な保存用出力が必要なら次を使う。

```bash
npm run eval-expert-vs-strong -- --games 50 --format markdown
```

既定プロファイルは `duel / trio / crowd / allStrong4`。重み付き総合値は `1 / 2 / 3 / 4` で、人数が多く `strong` 比率が高い条件をより重く見る。

候補 tuning の粗探索は次を使う。

```bash
sh scripts/search-cpu-top-tier.sh 8 5
# 保存先を明示する場合
sh scripts/search-cpu-top-tier.sh 8 5 models/cpu_top_tier_search/search-g8-top5
```

```bash
npm run search-expert-top-tier -- --games 8 --top 5 --format markdown
```

これは `tune-expert` の候補群を同じ top-tier benchmark で再採点し、`weightedWinRate` と `minWinRate` で上位を出す。まずここで候補を絞り、その後に `eval-expert-vs-strong` のゲーム数を増やして確認する。
- 補助終局報酬は強すぎると自己対戦内だけの資産/建設パターンを強化する可能性がある。rewardcap 実験では `terminal_landmark_value_diff=0.004`、`terminal_asset_diff=0.002`、`terminal_coin_diff=0.001`、`terminal_diff_clip=20` を使用。
- モデルごとに構築傾向が異なるため、最終的には単一モデルでなく複数 RL CPU、または試合開始時に候補モデルから選ぶ CPU を検討する。

### モデル台帳

`models/rl_model/registry.json` は採用候補モデルの軽量台帳。
モデル本体 `.npz` / `.browser.json` や `runs/` はサイズ・生成物扱いのため git 管理しない。
例外として、実ゲームで使うポートフォリオ用の軽量配布セットだけは `models/rl_model/portfolio/*.browser.json` として git 管理する。
`CPU（最強）` は安定したルールベースの基準CPU、`AI（深層学習・ランダム）` はこの portfolio 配下から人数別モデルをランダム選択する別系統の学習CPUとして扱う。
`js/RLModelPortfolio.js` は人数別に候補を絞り込む。現時点では2人戦は既存の2人向け候補、3〜4人戦は採用済みの `self-only-4p-h256-lr1e5-5000-seed103` を使う。採用モデルと配布ファイルの整合性は `tests/rl-model-portfolio.test.js` で検査する。

UI 上の説明文もこの挙動に合わせている。ローカル/オンラインのプレイヤー設定では、2人戦は「2人用の複数モデルからランダム」、3〜4人戦は「3〜4人用の深層学習モデルからランダム」と表示し、あわせて `CPU（最強）` が安定したルールベースの基準CPUであることを示す。5人以上では `AI（深層学習）` を無効化し、`CPU（最強）` を案内する。

バックグラウンドで学習を回すときは、次の補助スクリプトを使う。

```sh
sh scripts/rl/run-background.sh self-only-4p-h256-lr2e5-1000-seed104 \
  sh scripts/rl/run-self-only-4p-h256-lr2e5-1000.sh --run-label self-only-4p-h256-lr2e5-1000-seed104 --seed 104

sh scripts/rl/bg-status.sh self-only-4p-h256-lr2e5-1000-seed104
sh scripts/rl/bg-tail.sh self-only-4p-h256-lr2e5-1000-seed104
sh scripts/rl/bg-stop.sh self-only-4p-h256-lr2e5-1000-seed104
sh scripts/rl/bg-list.sh
sh scripts/rl/bg-summary.sh self-only-4p-h256-lr2e5-1000-seed104
sh scripts/rl/bg-wait.sh self-only-4p-h256-lr2e5-1000-seed104 15
sh scripts/rl/bg-finalize.sh self-only-4p-h256-lr2e5-1000-seed104
sh scripts/rl/bg-finalize-top10-multiplayer.sh self-only-4p-h256-lr2e5-5000-seed103-targethead-rerun 15 50

# 比較実験セットの完走待ち + top10後評価 + run比較
sh scripts/rl/bg-finalize-experiment-set-top10-multiplayer.sh lr-compare-4p \
  self-only-4p-h256-lr2e5-5000-seed103-targethead-rerun \
  self-only-4p-h256-lr1e4-5000-seed105-targethead
sh scripts/rl/bg-rerun.sh self-only-4p-h256-lr2e5-5000-seed103-targethead
sh scripts/rl/bg-rerun.sh old-job-name old-job-name-rerun -- \
  sh scripts/rl/run-self-only-4p-h256-lr2e5-5000.sh --run-label old-job-name-rerun --seed 105
sh scripts/rl/bg-prune.sh self-only-4p-h256-lr2e5-5000-seed103-targethead
sh scripts/rl/bg-prune.sh --stale-all
sh scripts/rl/bg-watch-summary.sh self-only-4p-h256-lr2e5-5000-seed103-targethead-rerun
sh scripts/rl/bg-experiment-set.sh \
  self-only-4p-h256-lr2e5-5000-seed103-targethead-rerun \
  self-only-4p-h256-lr1e4-5000-seed105-targethead
```

4人用 RL CPU を `CPU（最強）` とは別系統で強化する場合は、まず短時間 sanity で allStrong4 を JS 評価に含め、見込みがあれば長め background run に進む。

```sh
# sanity: 既存 1000 preset に allStrong4 評価を追加して短時間確認
sh scripts/rl/run-self-only-4p-h256-lr2e5-1000.sh \
  --run-label <run-label> \
  --seed <seed> \
  --js-eval-games 2 \
  --js-eval-lineups "rl,weak,normal,strong;rl,normal,normal,strong;rl,strong,strong,strong" \
  --summary-weights "rl+weak+normal+strong=2,rl+normal+normal+strong=3,rl+strong+strong+strong=4"

# long: sanity が悪くなければ detached で 2000 games
sh scripts/rl/run-background.sh <run-label> \
  sh scripts/rl/run-self-only-4p-h256-lr2e5-1000.sh \
    --run-label <run-label> \
    --seed <seed> \
    --games 2000 \
    --eval-every 500 \
    --js-eval-games 4 \
    --js-eval-lineups "rl,weak,normal,strong;rl,normal,normal,strong;rl,strong,strong,strong" \
    --summary-weights "rl+weak+normal+strong=2,rl+normal+normal+strong=3,rl+strong+strong+strong=4"

# 完走後は実在する top checkpoint を同じ lineup で比較する。
# 例: run dir に best_model.browser.json と best_model.top2.browser.json だけなら --run-ranks 1,2 を使う。
npm run eval-rl-models -- \
  --run-labels <run-label> \
  --run-ranks 1,2 \
  --games 50 \
  --lineups "rl,weak,normal,strong;rl,normal,normal,strong;rl,strong,strong,strong" \
  --output models/rl_model/<run-label>-top.json \
  --csv models/rl_model/<run-label>-top.csv \
  --markdown models/rl_model/<run-label>-top.md
```

既存4人用モデルと比較する場合は、採用済み `self-only-4p-h256-lr1e5-5000-seed103` と候補 `self-only-4p-h256-lr1e5-5000-seed102` を同じ lineup に入れる。短時間 run は、完走後に run-label と registry model をまとめて評価する。

```sh
npm run eval-rl-models -- \
  --models self-only-4p-h256-lr1e5-5000-seed103,self-only-4p-h256-lr1e5-5000-seed102 \
  --run-labels <run-label> \
  --model-paths models/rl_model/runs/<run-label>/best_model.candidate-1250.browser.json \
  --run-ranks 1,2 \
  --games 50 \
  --lineups "rl,weak,normal,strong;rl,normal,normal,strong;rl,strong,strong,strong" \
  --output models/rl_model/<run-label>-vs-existing.json \
  --csv models/rl_model/<run-label>-vs-existing.csv \
  --markdown models/rl_model/<run-label>-vs-existing.md
```

`--model-paths` は registry 未登録の一時 export 済み browser JSON を比較するための指定です。candidate checkpoint を手動 export して再選抜する時だけ使い、採用候補にならない artifact はコミットしません。

参考値として、2026-05-08 に既存4人用モデルだけを同じ3lineupで各10戦評価した。10戦なので採用判断には使わず、`seed110-allstrong` 完走後比較の事前基準として扱う。結果は `models/rl_model/eval-existing-4p-allstrong-small.{json,csv,md}` に保存し、`seed102` が score 63.3%（weak+normal+strong 70% / normal+normal+strong 50% / strong+strong+strong 70%）、`seed103` が score 53.3%（50% / 60% / 50%）。

4人RL実験メモ:

| run | 状態 | 要点 | registry / portfolio |
| --- | --- | --- | --- |
| `seed110 allStrong` | 不採用 | 50戦比較で all lineup 0%。allStrong寄せが崩壊 | 未反映 |
| `seed111 balanced` | 不採用 | 10戦で rank1 40%、top2 5%。既存55%基準未満 | 未反映 |
| `seed112 seed103axis` | 不採用 | 外部10戦で rank1 12.5%、top2 10.0%。pass崩壊が強い | 未反映 |
| `seed113 pass penalty 0.02` | 不採用 | 購入可能passは0.0%まで抑制したが、20戦で既存seed103未満 | 未反映 |
| `seed114 passpen-imitation` | 不採用 | passは概ね抑制、imitation refresh後も500時点JS評価25% / 12% / 50%で悪化 | 未反映 |
| `seed103 fine-tune passpen` | 不採用 | 10戦は67.5%だが、20戦で51.2%に低下。既存seed103未満 | 未反映 |
| `seed103 top3 reselection` | 不採用 | 50戦では61.0%だが、100戦で allStrong が34%まで崩れた | 未反映 |
| `seed116 lr1e-6 fine-tune passpen` | 不採用 | passは低いが、20戦で46.3%。normal+normal+strong と allStrong が崩れた | 未反映 |
| `seed118 seed103 low-lr fine-tune` | 不採用 | 内部3lineupのうち2つが0%。外部20戦前に破綻検出 | 未反映 |
| `seed103 candidate checkpoint reselection` | 不採用 | candidate-1250も現行bestより通常lineup/allStrongが低い | 未反映 |
| `seed119 allStrong-gate` | 不採用 | 20戦では67.5%だが、50戦で58.5%。allStrong 36% と normal+normal+strong 52% が現行seed103を下回った | 未反映 |

`seed103` top checkpoint 再評価の詳細は `docs/rl-experiments.md` に移す。現行は top1採用を維持し、top2/top3への差し替えは行わない。

個別実験の詳細ログは `docs/rl-experiments.md` に移す。この README では、標準フロー、現行基準線、registry / portfolio 反映方針、最新サマリ表だけを維持する。

2026-05-10時点の次の単一仮説は `allStrong耐性` です。追加fine-tune、空港progress報酬、既存candidate再選抜はいずれも現行 `seed103` を上回らず、`seed119 allStrong-gate` も20戦では良化したが50戦で allStrong と `normal+normal+strong` が崩れました。新しい候補はまず `rl,strong,strong,strong` と `rl,normal,normal,strong` の20戦ゲートを通し、さらに50戦でも両方を維持できる場合だけ採用候補にします。`rl,weak,weak,normal` だけ高い候補は採用候補にしません。

- `run-background.sh`: detached 起動し、`logs/` と `pids/` に log / pid / exit code / command を残す
- `bg-status.sh`: 実際の `python3 -m scripts.rl.train` を見て running/stopped を返す
- `bg-status.sh` は `--run-label <job>` の完全一致で train process を探す。`foo` と `foo-rerun` のような prefix 重複でも誤判定しない
- `bg-tail.sh`: 最新ログの末尾を表示する
- `bg-stop.sh`: PID を解決して停止する
- `bg-list.sh`: 追跡中ジョブを一覧表示する
- `bg-summary.sh`: 完走済み run の `summary.json` から best run / config / top score を抜き出す
- `bg-experiment-set.sh`: 複数の比較 run をまとめて眺めるための簡易レポート
- `bg-watch-summary.sh`: 学習中に進捗 / best 更新 / `js=` / `tgt=` だけを抜いて見る
- `bg-wait.sh`: 完走まで待機し、終わったら `bg-summary.sh` を表示する
- `bg-finalize.sh`: `bg-wait.sh` または `bg-summary.sh` を呼んだ後で `npm run refresh-rl-ops-reports` まで流す
- `bg-finalize-top10-multiplayer.sh`: `bg-finalize.sh` の後で `eval-run-top10-multiplayer.sh` まで続けて実行する
- `bg-finalize-experiment-set-top10-multiplayer.sh`: 複数 job を順に `bg-finalize-top10-multiplayer.sh` へ流し、最後に run 間比較レポートまで生成する
- `bg-rerun.sh`: 停止済みジョブの `.cmd` を読み、同じ command を新しい job 名で再起動する。古い job で `.cmd` が無い場合は `-- <command...>` で明示できる
- `bg-prune.sh`: `state!=running` かつ `summary_state=missing` の stale job だけ掃除する。完走済み job と実行中 job は消さない

現時点の実運用:

- 2人戦主採用: `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3`
- 2人戦の補助多様性候補: `self-only-both-h256-lr2e5-5000-seed70-rewardcap`, `self-only-both-h256-lr2e5-5000-seed69-rewardcap`
- 3〜4人戦採用: `self-only-4p-h256-lr1e5-5000-seed103`

台帳に記録する主な情報:

- `id`: run / モデル識別子。
- `status`: `adopted` / `candidate` / `candidate-4p` / `archive` / `rejected`。
- `path`: ローカルの browser 用モデルJSONへの相対パス。
- `training`: wrapper、games、hidden、lr、報酬プロファイルなど。
- `style`: 構築傾向のラベルと主要カード/ランドマーク。
- `evals`: 20戦 smoke や 50/100戦 JS 評価などの記録。採用判断の主評価は原則50戦以上、主採用は100戦以上を使う。
- `portfolioPolicy`: 勝率だけでなく、席差・pass率・平均ターン・構築傾向を含めた採用方針。

台帳を更新するときは、最低限次を確認する:

```bash
npm run validate-rl-registry
npm run report-rl-registry
npm run audit-rl-portfolio
npm run plan-rl-next-actions
npm run eval-rl-models -- --models <model-id> --games 50 --csv models/rl_model/eval-summary.csv
```

貼り付け用の Markdown 順位表も同時に出す場合は `--markdown` を使う。

```bash
npm run eval-rl-models -- \
  --models <model-id> \
  --games 100 \
  --csv models/rl_model/eval-summary.csv \
  --markdown models/rl_model/eval-summary.md
```

評価JSONから `registry.json` の `evals` に貼る候補を作る場合は次を使う。

```bash
npm run render-rl-registry-evals -- \
  --input models/rl_model/eval-summary.json \
  --output models/rl_model/eval-summary.registry-evals.json \
  --date 2026-04-20
```

内容を確認したあと、registry へ重複なしで反映する場合は `--update-registry` を付ける。
存在しない model id はエラーにするため、誤った評価JSONを黙って混ぜない。

```bash
npm run render-rl-registry-evals -- \
  --input models/rl_model/eval-summary.json \
  --registry models/rl_model/registry.json \
  --update-registry \
  --output models/rl_model/eval-summary.registry-update.json \
  --date 2026-04-20
```

勝率が採用圏に近く、構築傾向が明確に違うモデルは `archive` ではなく `candidate` として残す。
逆に勝率が高くても、より強い同系統モデルと戦略が重なる場合は代表だけを active 候補にする。
学習中の top-k と後評価はズレる前提で扱う。採用判断は学習中 score ではなく、`eval-run-topk.sh` などで best/top2/top3 を同条件・十分なゲーム数で再評価した結果を優先する。
`npm run validate-rl-registry` は、active model の評価ゲーム数不足や recommended model の style 重複を警告する。警告は即エラーではないが、採用判断前に理由を `registry.json` の `reason` / `style.summary` に残す。
`npm run report-rl-registry` は status 別件数、警告、各モデルの最新評価数、style、target head 診断を一覧する。候補棚卸しや archive 判断前の確認に使う。
text 出力に加えて markdown/json と `actions` セクションを持ち、警告から再評価・多様性見直し・eval 追記の候補作業を拾える。
`npm run audit-rl-portfolio` は `recommendedActiveModels` だけに絞って、2人JS評価、3人lineup評価、4人lineup評価、portfolio 配布整合、target head 診断を監査する。
`npm run plan-rl-next-actions` は report/audit をまとめて読み、評価不足・採用カバレッジ不足・多様性見直しを優先順位付きで並べる。オートで次に進める作業の仕分けに使う。
`npm run review-rl-adoptions` は 2人戦候補を weak/normal/strong の weighted score、評価ゲーム数、pass 率、style、target 診断で並べ、`adopted-2p-main` と比較すべき challenger を出力する。採用の自動更新はしないが、どの pair を 100 戦で再比較すべきかを固定化できる。
`review-rl-adoptions` は `status` が `adopted` / `candidate` の2人戦候補だけを対象にし、`archive` / `rejected` / `candidate-4p` は候補一覧と actions から除外する。archive 済みモデルの棚卸しは `npm run report-rl-registry` で確認する。
3人/4人戦の自己対戦安定化では、`sh scripts/rl/eval-run-top10-multiplayer.sh <run-label> 50` を標準後評価フローにする。必要なら第4引数で `run-ranks` を `1,2,3` のように絞る。内部では指定 checkpoint を `rl,normal,strong` / `rl,weak,normal` / `rl,weak,strong` と `rl,weak,normal,strong` / `rl,normal,normal,strong` / `rl,weak,weak,normal` で各50戦評価し、続けて `review-rl-multiplayer-topk` の text/markdown/json を出す。review は 3人平均50% + 4人平均50% を総合点とし、近い総合点では多様性を優先して見る前提。50戦未満の review は `smokeOnly` / `promotionBlocked` と表示され、足切りには使えるが採用判断には使わない。

複数 run を比較するときは、各 run の top10 review JSON を `review-rl-multiplayer-experiment-set` へ渡す。`bg-finalize-experiment-set-top10-multiplayer.sh` はこの運用をまとめたもので、完走待ちから run 間比較レポートまでを一発で生成する。
`npm run refresh-rl-ops-reports` は report / audit / next-actions / adoption-review をまとめて `models/rl_model/reports/` へ書き出す。学習や評価の後処理を一発で更新したいときに使う。
`npm run update-rl-registry-from-eval -- --input <json>` は `eval-rl-models` の JSON を registry に追記し、続けて report / audit / next-actions / adoption-review を更新する。評価後の標準フローとして使える。
`npm run report-rl-diversity` は active 候補を style.label と topCards 重複で束ね、比較すべき pair と `eval-rl-models` コマンドを出す。多様性の棚卸しを個別判断から外したいときに使う。
履歴として残す場合は `--output` を付ける。`models/rl_model/*.md` / `*.json` は生成物として git 管理しない。
target head や特殊行動の局面診断だけを確認する場合は `npm run eval-rl-special-scenarios` を使う。`--models` / `--run-labels` / `--player-count` / `--scenarios` で対象を絞り、必要なら `--format json --output models/rl_model/<label>.special-scenarios.json` で保存する。この出力も評価診断artifactなので git 管理しない。mover / cleaning fallback を変更した場合は、最低限 `cleaningOpponentEngine`, `cleaningAvoidSelfDamage`, `moverTargetSafeRecipient`, `moverAvoidHelpingLeader`, `moverDormantPreferred` を確認する。改装屋の pending 選択を変更した場合は `renovationAvoidPremiumLandmark` も確認する。
adoption review や top-k review の `*.review.md` / `*.review.json` / `*.review.txt` も再生成可能な診断artifactとして扱う。採用判断として残す内容は `registry.json` の `status` / `reason` / `evaluations` / `style` へ要約し、長い review 出力そのものはコミットしない。

```bash
npm run report-rl-registry -- --format markdown --output models/rl_model/registry-report.md
npm run report-rl-registry -- --format json --output models/rl_model/registry-report.json
```

現時点の候補:

| id | status | JS評価 | 構築傾向 |
|----|--------|-------------|----------|
| `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3` | adopted | 300戦 weak 99.3% / normal 93.3% / strong 63.3% | ブドウ園・牧場・ワイナリー寄り、2人用主採用 |
| `self-only-both-h256-lr2e5-5000-seed71-rewardcap` | candidate | 50戦 weak 96% / normal 94% / strong 68% | ブドウ園・牧場・バーガー寄り |
| `self-only-both-h256-lr2e5-5000-seed70-rewardcap` | candidate | 100戦 weak 100% / normal 77% / strong 33% | 寿司屋・食品倉庫・牧場寄り、補助採用 |
| `self-only-both-h256-lr2e5-5000-seed69-rewardcap` | candidate | 100戦 weak 93% / normal 75% / strong 40% | バーガー・食品倉庫・麦畑寄り、補助採用 |
| `self-only-both-h256-lr3e5-5000-seed62` | archive | 100戦 weak 99% / normal 56% / strong 65% | パン屋・食品倉庫・寿司屋寄り。seed71-top3 より normal が大きく弱いため除外 |
| `self-only-both-h256-lr2e5-5000-seed66-rewardcap` | archive | shared-seeds 100戦 weak 98% / normal 50% / strong 66% | パン屋・食品倉庫・ピザ屋寄り。seed71-top3 より総合で弱く除外 |
| `self-only-4p-h256-lr1e5-5000-seed103` | adopted | runtime fallback後4人100戦: weak+normal+strong 57% / normal+normal+strong 51% / weak+weak+normal 78%、3人50戦: normal+strong 72% / weak+strong 72% | 3〜4人用。麦畑・ブドウ園・ピザ屋寄り |
| `self-only-4p-h256-lr1e5-5000-seed102` | candidate-4p | 4人100戦: weak+normal+strong 73% / normal+normal+strong 72%、3人100戦: normal+strong 73% | 旧採用。ブドウ園・牧場・ピザ屋寄り |
| `terminal-shaped-h128-lr1e4` | archive | 100戦 weak 99% / normal 53% / strong 39% | パン屋・牧場・マグロ漁船・寿司屋・コンビニ寄り、normal 不安定で active から除外 |
| `strong-select-seed21` | archive | weak 85% / normal 75% / strong 10% | 麦畑・ブドウ園・バーガーショップ寄り。strong 性能が低く除外 |
| `terminal-shaped-h128-long` | archive | weak 90% / normal 70% / strong 15% | 雑貨屋・貸金業・マグロ漁船・引越し屋・ピザ屋寄り。strong 性能が低く除外 |
| `terminal-shaped-curriculum-h128` | archive | weak 75% / normal 35% / strong 5% | 寿司屋・牧場・チーズ工場寄り |
| `terminal-shaped-curriculum-h256` | rejected | JS 評価 0% 傾向 | pass 崩壊 |
| `terminal-shaped-curriculum-h256-lr1e4` | rejected | JS 評価 0% 傾向 | 高 pass 率 |

仮候補への昇格判断は 4戦の checkpoint 評価ではなく、最低20戦の JS 評価を使う。
active 採用や主採用の判断では、台帳の `minimumAdoptionGamesPerOpponent` に従って十分なゲーム数で再評価する。
仮候補の基準は `weak >= 70%`、`normal >= 50%`、`strong >= 10%`。
`strong` 対応済みとみなす目安は `weak >= 75%`、`normal >= 60%`、`strong >= 30%`。

---

## ヒューリスティックエージェント（heuristic.py）

評価専用の固定方策。JS 側 CPU.js とは独立した Python 実装。

| レベル | 行動方針 |
|--------|---------|
| `weak` | 完全ランダム |
| `normal` | 最安値カード購入・ランドマーク安い順に建設 |
| `strong` | 期待収入スコア（income × 発動確率 / cost）で最良カードを選択。ダイス目が低ければ振り直し |
| `expert` | strong ＋ 次ランドマーク優先強化・harbor +2 必ず宣言 |

---

## チェックポイント管理

```
models/rl_model/model.npz   ← 学習済みモデル（numpy形式）
```

- 保存内容: 全レイヤーの重み・バイアス・Adam の m/v/t 状態
- 書き込みはアトミック（一時ファイル経由 → os.replace）
- スキーマバージョン管理あり（`schema_version=3`）
  - バージョン不一致時は `SchemaVersionError` を送出してプロセスを停止
  - 旧モデルは削除して新規学習を開始すること

### 非互換チェックポイントの対処

`STATE_DIM`・`NUM_ACTIONS`・hidden サイズが変わった場合は削除して再学習:

```bash
rm -f models/rl_model/model.npz
python3 -m scripts.rl.train --games 30000
```

---

## ゲームエンジン（game_env.py）

### フェーズ遷移

```
roll → [selectDice] → [rerollConfirm] → [harborChoice] → pending → build → (次ターン)
```

- `selectDice`: 駅所持時のみ（1個 or 2個選択）
- `rerollConfirm`: 電波塔所持時のみ
- `harborChoice`: 港所持 + ダイス合計10以上 + 2個振り時のみ
- `pending`: テレビ局・ビジネスセンター・清掃業・引越し屋・改装屋・ITベンチャー

### 既知の制限・簡略化

| 項目 | 詳細 |
|------|------|
| 引越し屋（Mover） | 休業中カードも対象に含める。同名カードに active/dormant が混在する場合は dormant を優先して移動する |
| ビジネスセンター | 休業中カードも交換対象に含める。同名カードに active/dormant が混在する場合は dormant を優先して交換する |
| プレイヤー数 | 2〜4人戦に対応。5人以上は未対応 |

---

## 開発履歴

| フェーズ | アルゴリズム | 結果 |
|---------|------------|------|
| 初期 | REINFORCE + 自己対戦 | 符号バグ → vs_random=0% |
| 符号修正後 | REINFORCE + 自己対戦 | 高分散 → 50% で停滞 |
| TD(0) 移行 | Actor-Critic (TD) + 自己対戦 | advantage ≈ 0 → 学習停止 |
| GAE 移行 | GAE (λ=0.95) + 自己対戦 | 全ステップに信号伝播するも不安定 |
| vs ランダム移行 | GAE + vs ランダム訓練 | 固定ターゲットで清潔なシグナル |
| MC リターン導入 | GAE（方策）+ MC リターン（価値）| 価値ターゲットが安定し学習改善 |
| 環境バグ修正 | 上記 + ゲームエンジン修正 | 初めて正しい環境で学習が可能になった |
| BC factored head | 独立 38+38 次元ヘッド | 1444 次元 joint を分解してサンプル効率改善 |
| opponent pool | 過去モデルをプールで保持 | 相手分布を広げ過適合を抑制 |
| 先手バイアス修正 | 席ランダム化 | P0 固定から均等な先手/後手学習へ |
| エントロピー勾配修正 | softmax ヤコビアン適用 | 正確なエントロピー正則化 |

### 主要バグ修正履歴（2026-04）

- `PHASE_SELECT_DICE` の欠落（駅で2個振りができなかった）
- 方策勾配が無効行動にも流れていた（action mask 非適用）
- 評価がサンプリングだったのを greedy に変更
- Adam の m/v/t が save/load されていなかった
- 価値ターゲットにブートストラップを使っていた（→ MC リターンに変更）
- `pending_it` が状態表現に含まれていなかった
- MC リターンのクリップ上限が tanh 出力範囲と不一致（`[-1.5,1.5]` → `[-1.0,1.0]`）
- エージェント席が P0 固定だった（→ ゲームごとにランダム化）
- エントロピー勾配が softmax ヤコビアンを無視した近似だった（→ 正確な式に修正）
