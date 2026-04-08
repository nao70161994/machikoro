# 街コロ強化学習 AI（scripts/rl）

PyTorch / TensorFlow が使えない Android + Termux 環境で動作する、
numpy のみで実装した Actor-Critic 強化学習 AI。
ゲームエンジンも Python で再実装し、全カード効果を再現している。

---

## ファイル構成

| ファイル | 役割 |
|---------|------|
| `cards.py` | カード・ランドマーク定義（基本 + プラス + シャープ、計 38 枚） |
| `game_env.py` | 2 人対戦ゲームエンジン（全フェーズ・全カード効果実装） |
| `encode.py` | 局面ベクトル化・行動マスク生成 |
| `network.py` | numpy 製 MLP（Layer + PolicyValueNet） |
| `agent.py` | GAE Actor-Critic エージェント |
| `train.py` | 学習ループ（vs ランダム + opponent pool） |
| `heuristic.py` | 評価用ヒューリスティックエージェント（4段階） |

---

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
**factored head** を使う。組み合わせ構造を活かしてサンプル効率を改善する。

---

## 学習アルゴリズム

### 対戦相手構成

| 割合 | 相手 |
|------|------|
| 70% | ランダムエージェント |
| 30% | 過去モデルスナップショット（opponent pool） |

opponent pool: 5000 ゲームごとに現在モデルを deepcopy して最大 5 個保持。
初期は pool が空のため 100% vs ランダムから始まり、徐々に過去モデルが混入する。

**エージェント席はゲームごとにランダム化**（先手/後手を均等に経験）。

### GAE（方策勾配）+ MC リターン（価値学習）

```
δ_t = r_t + γ · V(s_{t+1}) · (1 - done_t) - V(s_t)   # TD 残差

A_t = δ_t + (γλ) · δ_{t+1} + (γλ)² · δ_{t+2} + ...   # GAE（λ=0.95）

G_t^MC = r_t + γ·r_{t+1} + γ²·r_{t+2} + ...           # MC リターン（価値ターゲット）
```

- **方策ヘッド**: GAE advantage を使用（全ステップに信号を伝播）
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

```
勝利:              +1.0  (終端)
敗北 or 引き分け:  -1.0  (終端)
ランドマーク建設:  +0.2  (各建設時)
```

引き分け（タイムアウト時）は敗北と同等に扱う。

### 方策勾配の action mask 対応

行動選択・勾配計算ともに masked_policy（有効行動のみ正規化）を使用。
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

# オプション一覧
python3 -m scripts.rl.train \
  --games 30000       # 総ゲーム数
  --eval-every 1000   # 評価間隔
  --hidden 256        # 隠れ層サイズ（デフォルト: 256）
  --lr 3e-4           # 学習率
  --epsilon 0.20      # 初期探索率（線形減衰 → 0.02 まで）
  --load              # 既存モデルを読み込んで継続学習
```

> **注意**: `--hidden` の値が保存済みモデルと異なる場合は読み込みエラーになる。
> 必ず保存時と同じ値を指定すること。

### 学習ログの見方

```
[  1000] rnd=56%  weak=72%  nrm=48%  str=40%  exp=35%  pool=n/a  train=54%  pl=0.210  vl=0.063  adv=0.047  eps=0.193
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
| 引越し屋（Mover） | active カードのみ対象。dormant カードを区別するには NUM_ACTIONS の拡張が必要 |
| ビジネスセンター | active カードのみ交換対象 |
| プレイヤー数 | 2人戦のみ対応 |

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
