# 多人数戦 Target Head 設計メモ

最終更新: 2026-04-21

## 目的

3人戦 / 4人戦の RL で、以下の「相手選択」を heuristic から policy に移す。

- テレビ局: どの相手から奪うか
- ビジネスセンター: どの相手と交換するか
- 引越し屋: どの相手へ渡すか

現状は Python / JS ともに「脅威度最大の相手」を自動選択している。多人数戦の駆け引きを RL が学べていないため、紫カード系の上限を手作り heuristic が固定している。

## 現状棚卸し

### Python 側

- 状態表現
  - [encode.py](../../scripts/rl/encode.py)
  - `encode_state_v2()` は「自分 + 脅威度順の相手3枠」で相手を並べる
- 対象選択
  - [game_env.py](../../scripts/rl/game_env.py)
  - `_target_opponent_index()` が脅威度最大の相手 index を返す
  - `pending_tv`, `pending_biz`, `pending_mover` はすべてこの相手 1 人前提
- 行動空間
  - `ACT_TV_TARGET` は 1 行動だけ
  - ビジネスセンターは `give x take`
  - 引越し屋は `give card`
  - 相手次元を持たない

### JS 側

- RL ランタイム
  - [js/RLCPU.js](../../js/RLCPU.js)
  - `_selectOpponentIndex()` が脅威度最大の相手を返す
  - `chooseTVTarget()`, `chooseBusinessMove()`, `chooseMoverMove()` はこの 1 相手へ固定
- ルール本体
  - [js/GameManager.js](../../js/GameManager.js)
  - `resolveTV(targetIndex)`, `resolveBusiness(..., targetIndex, ...)`, `resolveMover(..., targetIndex)` 自体は複数相手に対応している
- ルールベース CPU
  - [js/CPU.js](../../js/CPU.js)
  - `chooseTVTarget()`, `chooseBusinessMove()`, `chooseMoverMove()` は明示的に全相手を比較して target を選んでいる

## 変えてはいけない前提

- 2人戦モデル (`STATE_DIM = 145`) と export 互換を壊さない
- 既存 2人戦 checkpoint をそのままブラウザで読めること
- `NUM_ACTIONS = 1580` 前提の既存モデルを即座に無効化しないこと
- JS/Python parity テストを維持すること

## 問題の本質

現状の多人数戦モデルは、

- 相手の状態を「脅威度順スロット」で見る
- しかし行動は「対象相手を選ばない」

という半端な構造になっている。

このため、モデルが学べるのは「強い相手がいる時に TV/BC/Mover を使うかどうか」までで、

- 1位を削る
- 2位に嫌がらせする
- 最下位へ不要カードを押し付ける

のような target choice を直接最適化できない。

## 推奨方針

### 段階 1: target head を pending action に追加

まずは pending の対象選択だけを head 化する。

- TV: target player head
- BC: target player head + give head + take head
- Mover: target player head + give card head

この段階では build / landmark / other pending は現状維持でよい。

### 段階 2: player-slot action へ寄せる

相手が 3 人いる多人数戦では、「実プレイヤー index」より「脅威度順 slot」で選ぶ方が状態表現と整合する。

推奨:

- `targetSlot = 0..MAX_PLAYERS-2`
- 実行時に slot -> actual player index へ変換

これで、

- state 側の相手並び
- target 側の出力

を同じ順序に揃えられる。

## action / head 案

### 案A: 既存 action を維持して target だけ別 head

最小変更案。

- TV
  - 既存 `ACT_TV_TARGET` は維持
  - 追加 `tvTargetHead: MAX_PLAYERS-1`
- BC
  - 既存 `BC give/take` を維持
  - 追加 `bcTargetHead: MAX_PLAYERS-1`
- Mover
  - 既存 `MOVER_BASE + card` を維持
  - 追加 `moverTargetHead: MAX_PLAYERS-1`

利点:

- 既存 `NUM_ACTIONS = 1580` を保てる
- 2人戦 export 互換を壊さない
- 既存 BC give/take head と同じ発想で拡張できる

欠点:

- pending ごとに head の意味が変わる
- 実装が分散しやすい

### 案B: target を action 空間へ展開

例:

- TV: `ACT_TV_TARGET_BASE + slot`
- BC: `target x give x take`
- Mover: `target x card`

利点:

- 1 本の方策 head に閉じる

欠点:

- action 空間がかなり膨らむ
- 既存 checkpoint 互換を切る必要が出る

現時点では非推奨。

## 推奨実装案

案Aを採る。

### 2人戦

- 現状通り target は 1 択
- 新 head は shape を持っても、mask で 1 択になる
- 既存 2人戦モデルは fallback で現状動作を維持する

### 3人戦 / 4人戦

- target head を使う
- slot ベースで選ぶ
- 無効 slot は mask 0

## mask 案

pending ごとに target mask を持つ。

- `tvTargetMask[playerSlots]`
- `bcTargetMask[playerSlots]`
- `moverTargetMask[playerSlots]`

ルール:

- 自分 slot は存在しない
- 存在しない相手 slot は 0
- TV: coins > 0 の相手だけ 1
- BC: minor card を 1 枚以上持つ相手だけ 1
- Mover: カード受け取り自体はほぼ全相手で可能なので、存在相手なら 1

## fallback 方針

既存モデルを壊さないため、JS/Python ともに以下を残す。

- target head が無い model:
  - 現行 heuristic (`_target_opponent_index`, `_selectOpponentIndex`) を使う
- target head がある model:
  - target mask つきで head を選ぶ

## 実装順

1. `network.py` / `RLCPU.js` に target head 読み込みを追加
2. Python env に slot 変換 helper を追加
3. Python train/inference に target head 選択を追加
4. JS `RLCPU.js` に target head 選択を追加
5. parity fixture / tests を追加
6. 多人数用 model だけ target head あり export を許可
7. 2人戦 model は target head なしでも継続運用

## 先に必要なテスト

- Python `_target_opponent_index()` の現仕様固定
- `encode_state_v2()` の相手脅威度順固定
- JS `RLCPU` の target heuristic 固定
- target head 追加後は
  - target mask
  - slot -> player index 変換
  - JS/Python parity

を追加する。

## 補足

引越し屋は target head だけでなく、「dormant カードを渡せるか」を action 表現へ入れるかも別課題。

現状は active カード限定で、これは target head とは独立の制約。
