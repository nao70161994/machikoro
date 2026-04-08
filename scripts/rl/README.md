# 街コロ強化学習 AI（scripts/rl）

PyTorch / TensorFlow が使えない Android + Termux 環境で動作する、
numpy のみで実装した Actor-Critic 強化学習 AI。
ゲームエンジンも Python で再実装し、全てのカード効果を完全再現している。

---

## ファイル構成

| ファイル | 役割 |
|---------|------|
| `cards.py` | カード・ランドマーク定義（基本 + プラス + シャープ、計 38 枚） |
| `game_env.py` | 2 人対戦ゲームエンジン（全フェーズ・全カード効果実装） |
| `encode.py` | 局面ベクトル化・行動マスク生成 |
| `network.py` | numpy 製 MLP（Layer + PolicyValueNet） |
| `agent.py` | GAE Actor-Critic エージェント |
| `train.py` | 自己対戦学習ループ |

---

## アーキテクチャ

### 状態空間（STATE_DIM = 144）

```
self_coins / 50          1
opp_coins  / 50          1
自分のランドマーク (binary) 6
相手のランドマーク (binary) 6
自分のカード枚数 / 5     38
相手のカード枚数 / 5     38
自分の休業枚数 / 5       38
フェーズ (one-hot)        6
last_dice / 14            1
last_d1   / 6             1
last_d2   / 6             1
pending counts            5  (tv, biz, clean, mover, reno)
IT ベンチャー積立 / 10    1
turn_count / 200          1
─────────────────────────
合計                    144
```

### 行動空間（NUM_ACTIONS = 174）

```
ACT_ROLL1       = 0      サイコロ1個
ACT_ROLL2       = 1      サイコロ2個（駅あり時）
ACT_KEEP        = 2      振り直しなし
ACT_REROLL      = 3      振り直す（電波塔）
ACT_HARBOR_YES  = 4      +2 宣言（港）
ACT_HARBOR_NO   = 5
ACT_IT_SAVE     = 6      IT ベンチャー積立
ACT_IT_SKIP     = 7
ACT_TV_TARGET   = 8      テレビ局ターゲット（2 人戦は 1 択）
ACT_BC_BASE     = 9〜46  ビジネスセンター（奪うカード × 38）
ACT_CLEAN_BASE  = 47〜84 清掃業（休業カード × 38）
ACT_MOVER_BASE  = 85〜122 引越し屋（渡すカード × 38）
ACT_RENO_BASE   = 123〜128 改装屋（解体ランドマーク × 6）
ACT_BUY_CARD_BASE = 129〜166 カード購入 × 38
ACT_BUY_LM_BASE   = 167〜172 ランドマーク購入 × 6
ACT_PASS           = 173
```

### ネットワーク構造

```
入力 (144,)
  ↓  FC + ReLU (256)
  ↓  FC + ReLU (256)
  ├─→ 方策ヘッド: FC → softmax (174,)  ← 行動確率分布
  └─→ 価値ヘッド: FC → tanh (1,)       ← 局面価値 (-1〜1)
```

共有層によって、方策と価値を同一ネットワークで計算する。

---

## 学習アルゴリズム（GAE Actor-Critic）

### なぜ GAE か

街コロは 1 プレイヤーあたり約 200 ターンあり、報酬は終端の勝敗（±1）のみ。

- **TD(0)** では信号が 1 ステップしか遡れないため、序盤の手への gradient がほぼゼロになる（`value_loss → 0.006` になっても学習しないのはこれが原因）
- **純 MC** は高分散で学習が不安定
- **GAE（λ=0.95）** は両者のバランスを取り、終端から全ステップへ信号を伝播する

### Generalized Advantage Estimation

```
δ_t = r_t + γ · V(s_{t+1}) · (1 - done_t) - V(s_t)   # TD 残差

A_t = δ_t + (γλ) · δ_{t+1} + (γλ)² · δ_{t+2} + ...   # GAE（後ろから累積）

G_t = A_t + V(s_t)   # 価値ターゲット（MC リターン近似）
```

λ=0.95 のとき、V ≈ 0 の初期状態でも：

```
A_T   = ±1         (終端)
A_{T-1} = γλ · A_T ≈ ±0.94
A_{T-2} ≈ ±0.89
...すべてのステップに信号が届く
```

### 更新式

```
方策損失: L_π = -log π(a_t|s_t) · Â_t   （Â = 正規化 advantage）
価値損失: L_V = (tanh(v_raw) - G_t)²
合計損失: L = L_π + L_V - entropy_coef · H(π)
```

Adam（lr=3e-4）でパラメータを更新。

### 中間報酬（報酬整形）

スパース報酬を補うため、ランドマーク建設時に `+0.2` の中間報酬を与える。

```
勝利:  +1.0  (終端)
敗北:  -1.0  (終端)
ランドマーク建設: +0.2  (各建設時)
```

---

## 学習の実行

```bash
# 標準学習
python3 -m scripts.rl.train --games 30000 --eval-every 1000

# オプション
python3 -m scripts.rl.train \
  --games 30000       # 総ゲーム数
  --eval-every 1000   # 評価間隔
  --hidden 256        # 隠れ層サイズ
  --lr 3e-4           # 学習率
  --epsilon 0.15      # 初期探索率
  --load              # 既存モデルを読み込んで継続学習
```

### 学習ログの見方

```
[  1000] vs_random=56.0%  self_play_wr=51.2%  policy_loss=0.45  value_loss=0.23  mean_adv=0.012  eps=0.145
```

| 指標 | 正常な範囲 | 意味 |
|------|-----------|------|
| `vs_random` | 50% → 60%+ | ランダム対戦勝率（学習の主指標） |
| `self_play_wr` | 50% 前後 | 自己対戦での P0 勝率 |
| `value_loss` | 0.1〜0.5 → 低下 | 価値関数の精度（低すぎると advantage ≈ 0） |
| `mean_adv` | 0 前後 | 正規化前の平均優位性（偏りの検出用） |
| `policy_loss` | 変動する | 方策損失（定数のまま = 学習停止の兆候） |

**要注意サイン：**
- `value_loss < 0.01` かつ `vs_random ≈ 50%` → advantage がゼロに崩壊（TD アルゴリズムに戻っている可能性）
- `policy_loss` が定数 → 方策勾配がゼロ（学習停止）

---

## ゲームエンジン（game_env.py）

### フェーズ遷移

```
roll → [selectDice] → [rerollConfirm] → [harborChoice] → pending → build → (次ターン)
```

- `selectDice`: 駅所持時のみ（1 個 or 2 個選択）
- `rerollConfirm`: 電波塔所持時のみ
- `harborChoice`: 港所持 + ダイス合計 10 以上 + 2 個振り時のみ
- `pending`: テレビ局・ビジネスセンター・清掃業・引越し屋・改装屋・IT ベンチャー

### 実装済みカード効果

| 定数 | 効果 |
|------|------|
| `NORMAL` | 基本収入 |
| `CHEESE` | 牧場数 × 収入 |
| `FURNITURE` | 森林+鉱山数 × 収入 |
| `MARKET` | 農園カード合計 × 収入 |
| `FLOWER` | 花畑数 × 収入 |
| `FOODWAREHOUSE` | 飲食店カード合計 × 収入 |
| `DRINKFACTORY` | 全プレイヤーの飲食店合計 × 収入 |
| `FEWLANDMARK` | ランドマーク 1 個以下で発動 |
| `WINERY` | ブドウ園数 × 収入（発動後休業） |
| `MOVER` | 任意カード 1 枚を相手へ渡し +4G |
| `LOAN` | 建設時 +5G、ダイス 5/6 でペナルティ |
| `RENOVATION` | 自分のランドマーク 1 つを解体し +8G |
| `HARBOR` | 港所持時のみ発動 |
| `HARBOR_RED` | 赤カード・港所持時のみ発動 |
| `TUNA` | 2d6 × 枚数を獲得 |
| `CORNFIELD` | ランドマーク 1 個以下で発動 |
| `FRENCHR` | 相手のランドマーク 2 個以上で発動 |
| `MEMBERBAR` | 相手のランドマーク 3 個以上で発動 |
| `STADIUM` | 相手から固定額を奪う |
| `TV` | テレビ局：相手から 5G 奪う（pending） |
| `BUSINESS` | ビジネスセンター：カード交換（pending） |
| `PUBLISHER` | 相手の飲食店+商店数だけ奪う |
| `TAXOFFICE` | 相手が 10G 以上なら半分奪う |
| `CLEANING` | 任意カードを全プレイヤーから休業（pending） |
| `ITSTARTUP` | IT 積立分を相手から奪う（pending） |
| `PARK` | 全プレイヤーのコインを均等に再分配 |

---

## 開発履歴・技術的な詳細

### アルゴリズムの変遷

| フェーズ | アルゴリズム | 結果 |
|---------|------------|------|
| 初期 | REINFORCE (MC) | 符号バグ → vs_random=0% |
| 符号修正後 | REINFORCE | 高分散 → 50% で停滞（25000 ゲーム） |
| TD(0) 移行 | Actor-Critic (TD) | advantage ≈ 0 → 学習停止（value_loss=0.006） |
| 現在 | GAE (λ=0.95) | 全ステップに信号伝播、学習進行中 |

### TD(0) が失敗した理由

TD(0) ターゲット: `G_t = r_t + γ · V(s_{t+1})`

- 初期は V ≈ 0 のため、中間ステップの G_t ≈ 0
- advantage = G_t - V ≈ 0 → 方策勾配 ≈ 0
- 価値関数が「V = 0 で G_t ≈ 0 を完璧に予測」する形で収束
- `value_loss → 0.006`（一見良い値）が学習停止のサイン

### 重要な実装メモ

- **方策勾配の符号**：`d_logit = (pi - one_hot) * advantage`  
  Layer.backward() が `-= lr * grad` なので、advantage > 0 の時に選択行動の確率が上がる（符号を間違えると学習が逆になる）
- **価値ヘッドの飽和**：tanh の範囲 [-1, 1] に対し G_t を [-2, 2] にクリップ
- **エントロピー正則化**：entropy_coef=0.05 で多様な探索を維持
- **バッチサイズ**：8 ゲームぶんをまとめてから学習（1 ゲームずつでは不安定）

---

## モデルの保存場所

```
models/rl_model/model.npz   ← 学習済みモデル（numpy形式）
```

将来的にブラウザゲームへ組み込む際は ONNX 変換または tfjs 変換が必要。
