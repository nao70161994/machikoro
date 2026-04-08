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
| `train.py` | vs ランダム学習ループ |

---

## アーキテクチャ

### 状態空間（STATE_DIM = 145）

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
pending_it flag           1  ← ITベンチャー意思決定フラグ
IT ベンチャー積立 / 10    1
turn_count / 200          1
─────────────────────────
合計                    145
```

### 行動空間（NUM_ACTIONS = 1580）

```
ACT_ROLL1       = 0          サイコロ1個
ACT_ROLL2       = 1          サイコロ2個（駅あり時）
ACT_KEEP        = 2          振り直しなし
ACT_REROLL      = 3          振り直す（電波塔）
ACT_HARBOR_YES  = 4          +2 宣言（港）
ACT_HARBOR_NO   = 5
ACT_IT_SAVE     = 6          IT ベンチャー積立
ACT_IT_SKIP     = 7
ACT_TV_TARGET   = 8          テレビ局ターゲット（2人戦は1択）
ACT_BC_BASE     = 9〜1452    ビジネスセンター（渡すカード × 受け取るカード = 38×38）
ACT_CLEAN_BASE  = 1453〜1490 清掃業（休業カード × 38）
ACT_MOVER_BASE  = 1491〜1528 引越し屋（渡すカード × 38、activeのみ）
ACT_RENO_BASE   = 1529〜1534 改装屋（解体ランドマーク × 6）
ACT_BUY_CARD_BASE = 1535〜1572 カード購入 × 38
ACT_BUY_LM_BASE   = 1573〜1578 ランドマーク購入 × 6
ACT_PASS           = 1579
```

> **注意**: ビジネスセンターは「渡すカード × 受け取るカード」の組み合わせ（38×38=1444 通り）を
> 全てアクションとして持つため、NUM_ACTIONS が大きい。

### ネットワーク構造

```
入力 (145,)
  ↓  FC + ReLU (hidden)
  ↓  FC + ReLU (hidden)
  ├─→ 方策ヘッド: FC → softmax (1580,)  ← 行動確率分布
  └─→ 価値ヘッド: FC → tanh (1,)        ← 局面価値 (-1〜1)
```

デフォルト hidden=256。共有層によって方策と価値を同一ネットワークで計算する。

---

## 学習アルゴリズム（GAE Actor-Critic + vs ランダム訓練）

### なぜ vs ランダム訓練か

自己対戦では両プレイヤーが同時に強くなるため「相対的な優位性」がゼロに近づき、
vs_random 勝率の改善が見えにくい。ランダム固定の相手により固定ターゲットで清潔なシグナルを得る。

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
方策損失: L_π = -log π(a_t|s_t) · Â_t   （Â = 正規化 advantage）
価値損失: L_V = (tanh(v_raw) - G_t^MC)²  （G は [-1.5, 1.5] にクリップ）
合計損失: L = L_π + L_V - entropy_coef · H(π)
```

Adam（lr=3e-4）でパラメータを更新。

### 報酬設計

```
勝利:              +1.0  (終端)
敗北 or 引き分け:  -1.0  (終端)
ランドマーク建設:  +0.2  (各建設時)
```

引き分け（タイムアウト時のコイン同数）は敗北と同等に扱う。

### 方策勾配の action mask 対応

行動選択・勾配計算ともに masked_policy（有効行動のみ正規化）を使用。
無効行動への勾配漏れを防ぐ。強制行動（有効手が1つのみ）は価値学習のみ行い、
方策勾配の対象から除外する。

---

## 学習の実行

```bash
# 標準学習（新規）
rm -f models/rl_model/model.npz
python3 -m scripts.rl.train --games 30000 --eval-every 1000 --hidden 256

# 継続学習（既存モデルを読み込む）
python3 -m scripts.rl.train --games 30000 --eval-every 1000 --hidden 256 --load

# オプション一覧
python3 -m scripts.rl.train \
  --games 30000       # 総ゲーム数
  --eval-every 1000   # 評価間隔
  --hidden 256        # 隠れ層サイズ（推奨: 256）
  --lr 3e-4           # 学習率
  --epsilon 0.20      # 初期探索率（線形減衰）
  --load              # 既存モデルを読み込んで継続学習
```

> **注意**: `--hidden` の値が保存済みモデルと異なる場合は読み込みエラーになる。
> 必ず保存時と同じ値を指定すること。

### 学習ログの見方

```
[  1000] vs_random=56.0%  train_wr=54.0%  policy_loss=0.21  value_loss=0.06  mean_adv=0.05  eps=0.193
```

| 指標 | 正常な範囲 | 意味 |
|------|-----------|------|
| `vs_random` | 50% → 60%+ | 評価用 200 ゲーム greedy 勝率（主指標、±7% のノイズあり） |
| `train_wr` | 50% → 上昇 | 学習ゲームでのエージェント勝率 |
| `value_loss` | 0.05〜0.1 → 低下 | 価値関数の精度 |
| `mean_adv` | 0 前後に収束 | 正規化前の平均優位性（価値関数のバイアス） |
| `policy_loss` | 0.1〜0.3 | 方策損失（0 に張り付く = 学習停止の兆候） |

---

## チェックポイント管理

```
models/rl_model/model.npz   ← 学習済みモデル（numpy形式）
```

- 保存内容: 全レイヤーの重み・バイアス・Adam の m/v/t 状態
- 書き込みはアトミック（一時ファイル経由）
- スキーマバージョン管理あり（`schema_version=2`）

### 非互換チェックポイントの対処

`STATE_DIM` や `NUM_ACTIONS` が変わった場合（ネットワーク構造変更時）、
`--load` でエラーになる。その場合は手動で削除して新規学習を開始する:

```bash
rm -f models/rl_model/model.npz
python3 -m scripts.rl.train --games 30000 --hidden 256
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

### 主要バグ修正履歴（2026-04）

- `PHASE_SELECT_DICE` の欠落（駅で2個振りができなかった）
- 方策勾配が無効行動にも流れていた（action mask 非適用）
- 評価がサンプリングだったのを greedy に変更
- Adam の m/v/t が save/load されていなかった
- 価値ターゲットにブートストラップを使っていた（→ MC リターンに変更）
- `pending_it` が状態表現に含まれていなかった
