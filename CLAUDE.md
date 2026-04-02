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
Card.js → Player.js → GameManager.js → CPU.js → ui.js → storage.js → main.js
```

| ファイル | 役割 |
|---------|------|
| `js/ui.js` | ログ描画・分類・pending モーダル・カードフィルター・ターンアナウンサー・buildMenu レンダリング・`CARD_SETS` / `enabledCards` / `enabledLandmarks` |
| `js/storage.js` | ローカルゲーム保存・復元（`saveGameState` / `loadGameState`） |
| `js/main.js` | ゲーム進行・オンライン通信・CPU制御・イベントハンドラ |

**バックエンド**: `server.js`（Node.js + Express + Socket.IO）。ゲームロジックは**クライアント側で動く**。サーバーはアクションの中継とルーム管理のみ。

### ゲームフロー（GameManager のフェーズ遷移）

```
roll → [selectDice] → [rerollConfirm] → [harborChoice] → pending → build → (次のターン)
```

- `selectDice`: 駅ランドマーク所持時のみ
- `rerollConfirm`: 電波塔ランドマーク所持時のみ
- `harborChoice`: 港ランドマーク所持 + ダイス合計10以上の2個振り時のみ
- `pending`: テレビ局・ビジネスセンター・清掃業・引越し屋・改装屋・ITベンチャーの保留処理

### 勝利条件・ランドマーク設定

- ゲーム開始時に使用するランドマークを選択できる（`enabledLandmarks: Set<string>`）
- `game.enabledLandmarks` に格納され、`Player.hasWon(enabledLandmarks)` で勝利判定
- デフォルトは `Player.landmarkNames()` が返す全ランドマーク（駅・ショッピングモール・遊園地・電波塔・港・空港）
- 遊園地のゾロ目判定は**ロール時点**の所持状態で行う（`hadAmusementParkAtRoll` フラグ）

### チュートリアル

- `tutorialEnabled`（デフォルト `true`）/ `tutorialLevel`（`'beginner'` など）でローカルストレージ管理
- チュートリアル中はゲームの進行に合わせてヒントを表示

### オンライン対戦の設計

- **ホスト**がCPUターンを実行し、全アクションを `sendAction()` でサーバーに送信
- **全クライアント**が `applyAction()` でゲームロジックを同一に進める（サーバーにゲーム状態はない）
- サイコロの乱数はホストが生成して `forceDice` として送信 → 全クライアントで同じ目になる
- サーバーはアクションログ（`room.actionLog`）を蓄積し、再接続時のリプレイに使用
- ホスト切断時は残存プレイヤーの先頭が新ホストになり `hostChanged` イベントで通知される
- 再接続トークン（UUID）をルーム作成・参加時に発行。`rejoinRoom` 時に `roomId + playerIndex + playerName + reconnectToken` の4つが一致しないと拒否される
- 開始済みルームは2時間アクティビティがないと自動削除（`lastTouchedAt` + TTL）
- プレイヤー名はサーバー受信時に `sanitizeName()` でバリデーション・20文字以内に制限

### CPU（js/CPU.js）

`difficulty`: `"weak"` / `"normal"` / `"strong"` の3段階。`build()` は `buildWeak` / `buildNormal` / `buildStrong` に委譲。スコアリングは `evalCard()` + `sortAffordable()` でコスパ評価。CPU判断ロジックは大幅に強化済み（手番ごとの期待値・他プレイヤー状況考慮）。

#### CPU進行チェーン（main.js）

- `scheduleCPU()` はトークン方式で自己再起動チェーンを形成。`cpuScheduleToken` をインクリメントし、古いチェーンは自動破棄される
- `cpuDo(action, data, fallback)` はアクションを実行後に `scheduleCPU()` を呼び、次フェーズへ自動進行する
- 駅（`selectDice`）・電波塔（`rerollConfirm`）・港（`harborChoice`）の各フェーズも `scheduleCPU` チェーンで処理される
- ITベンチャー所持時は `nextTurn` ステップに `!game.pendingIT` ガードがあり、`pendingIT=true` の間は再進行しない（無限ループ防止）

### ローカルストレージ

| キー | 内容 |
|------|------|
| `savedGame` | ローカルゲームの中断状態（JSON） |
| `onlineSession` | オンライン再接続用情報（roomId・playerIndex・playerName・isRoomHost・reconnectToken） |
| `selectedCount` / `playerSettings` / `cpuSpeed` | タイトル画面の設定 |
| `winStreak` / `lastWinnerName` | 連勝記録 |
| `tutorialEnabled` / `tutorialLevel` | チュートリアル設定 |

### UI 設計メモ

- **pending ダイアログ**（テレビ局・改装屋等）は `#pendingModal` のフルスクリーンオーバーレイで表示。`renderPending()` が innerHTML を書き換え、コンテンツがある間だけ `display:flex`。
- **ビジネスセンター**のカード選択は `<select>` ではなくタップ可能な `.bc-chip` ボタン方式。`bcSelectCard()` が選択状態と hidden input を更新。`onResolveBusiness()` は hidden input の値をそのまま参照する。
- **ログ全履歴**は `fullLog[]` 配列で管理（最大300件）。`game.log` のリセットを `prevLogLength` との比較で検知し、ターン切り替えには `__SEP__` 区切り文字を挿入。電波塔リロール（`cur[0].startsWith("📡")`）の場合は区切りを挿入しない。
- **ターンアナウンサー**は `#turnAnnouncer` の fixed オーバーレイ。`prevPlayerIndex` の変化を `render()` 内で検知し、`showTurnAnnouncer()` で1.3秒表示後フェードアウト。`isReplaying = true` のときは発火しない。
- **カードフィルター**は `cardFilter` 変数（`''` = 全て）で管理。`setCardFilter()` を呼ぶと `renderBuildMenu()` が再実行される。

### カード追加時の注意

- `js/Card.js` の `CARDS` 配列に追加
- `js/ui.js` の `CARD_SETS`（basic / plus / sharp）にも追加
- `CPU.evalCard()` に新 effect のスコアロジックを追加
- `GameManager.processIncome()` に発動ロジックを追加

### セキュリティ・バリデーション

- プレイヤー名は `sanitizeName()` でHTMLタグ・特殊文字を除去（サーバー側）
- フロントエンドは `escapeHtml()` でプレイヤー名・カード名を `innerHTML` に挿入前にエスケープ
- `validateGameAction()` でアクションの妥当性をサーバー側で検証（フェーズ・権限・所持金・在庫・紫重複など）
- ブラウザネイティブ `confirm()` は廃止済み。確認ダイアログはカスタムモーダル `showConfirm()` を使うこと

### テスト

```
npm test    # tests/run-all.js → gamemanager.test.js + server.test.js
```

Node.js 組み込み `assert` モジュールのみ使用。

| ファイル | 内容 |
|---------|------|
| `tests/gamemanager.test.js` | GameManager 単体テスト（フェーズ遷移・pendingRenovation・buildCard・テレビ局・ITベンチャー・電波塔・ログリセット・CARDSソート検証など） |
| `tests/server.test.js` | サーバー回帰テスト（validateGameAction・sanitizeName 等） |
| `tests/run-all.js` | 両テストを順次実行するエントリポイント |

新機能追加時は対応するテストファイルにケースを追加すること。UI 固有の処理（DOM 操作・アニメーション）はブラウザ環境依存のため Node.js テストでは検証できない。GameManager ロジックに集中してテストを書く。

### 既知の制約

- `isReplaying = true` の間は `render()` と `scheduleCPU()` が抑制される（オンライン再接続のリプレイ中）
- ランドマーク「役所」は `Player.landmarks` に含まれず `hasYakusho` フラグで別管理
- 紫カード（大施設）は1人1枚制限: `card.color === "purple" && current.countCard(card.name) > 0` でチェック
- `main.js` は約1116行（`ui.js` / `storage.js` に分割済み）。さらなる分割は将来課題
- `CARD_SETS` は `ui.js` に定義されている（`main.js` ではない）
