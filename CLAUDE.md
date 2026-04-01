# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 開発環境

- Android + Termux 環境。通常は `/tmp` が存在しないため Bash ツールが失敗するが、**`termux-chroot` 使用時は `/tmp` が利用可能になり Bash ツールも使える**。`termux-chroot` を使っていない場合はファイル操作を Read / Edit / Write / Glob / Grep ツールで行うこと。
- `termux-chroot` 使用時は git コマンドも Bash ツールで直接実行できる。使っていない場合はコマンドを提示してユーザーに手動実行してもらうこと。

## サーバー起動

```
node server.js        # ローカル起動（http://localhost:3000）
```

デプロイ先: Render（`process.env.PORT` を使用）。無料枠のため15分非アクティブでスリープする。

## アーキテクチャ概要

**フロントエンド**: バニラJS（フレームワークなし）。`index.html` に全UI。スクリプトはロード順に依存している：

```
Card.js → Player.js → GameManager.js → CPU.js → main.js
```

**バックエンド**: `server.js`（Node.js + Express + Socket.IO）。ゲームロジックは**クライアント側で動く**。サーバーはアクションの中継とルーム管理のみ。

### ゲームフロー（GameManager のフェーズ遷移）

```
roll → [selectDice] → [rerollConfirm] → [harborChoice] → pending → build → (次のターン)
```

- `selectDice`: 駅ランドマーク所持時のみ
- `rerollConfirm`: 電波塔ランドマーク所持時のみ
- `harborChoice`: 港ランドマーク所持 + ダイス合計10以上の2個振り時のみ
- `pending`: テレビ局・ビジネスセンター・清掃業・引越し屋・改装屋・ITベンチャーの保留処理

### オンライン対戦の設計

- **ホスト**がCPUターンを実行し、全アクションを `sendAction()` でサーバーに送信
- **全クライアント**が `applyAction()` でゲームロジックを同一に進める（サーバーにゲーム状態はない）
- サイコロの乱数はホストが生成して `forceDice` として送信 → 全クライアントで同じ目になる
- サーバーはアクションログ（`room.actionLog`）を蓄積し、再接続時のリプレイに使用

### CPU（js/CPU.js）

`difficulty`: `"weak"` / `"normal"` / `"strong"` の3段階。`build()` は `buildWeak` / `buildNormal` / `buildStrong` に委譲。スコアリングは `evalCard()` + `sortAffordable()` でコスパ評価。

### ローカルストレージ

| キー | 内容 |
|------|------|
| `savedGame` | ローカルゲームの中断状態（JSON） |
| `onlineSession` | オンライン再接続用情報（roomId・playerIndex・playerName・isRoomHost） |
| `selectedCount` / `playerSettings` / `cpuSpeed` | タイトル画面の設定 |
| `winStreak` / `lastWinnerName` | 連勝記録 |

### カード追加時の注意

- `js/Card.js` の `CARDS` 配列に追加
- `js/main.js` の `CARD_SETS`（basic / plus / sharp）にも追加
- `CPU.evalCard()` に新 effect のスコアロジックを追加
- `GameManager.processIncome()` に発動ロジックを追加

### 既知の制約

- `isReplaying = true` の間は `render()` と `scheduleCPU()` が抑制される（オンライン再接続のリプレイ中）
- ランドマーク「役所」は `Player.landmarks` に含まれず `hasYakusho` フラグで別管理
- 紫カード（大施設）は1人1枚制限: `card.color === "purple" && current.countCard(card.name) > 0` でチェック
