# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 開発環境

- Android + Termux 環境。通常は `/tmp` が存在しないため Bash ツールが失敗するが、**`termux-chroot` 使用時は `/tmp` が利用可能になり Bash ツールも使える**。`termux-chroot` を使っていない場合はファイル操作を Read / Edit / Write / Glob / Grep ツールで行うこと。
- `termux-chroot` 使用時は git コマンドも Bash ツールで直接実行できる。使っていない場合はコマンドを提示してユーザーに手動実行してもらうこと。

## サーバー起動

```
node server.js        # ローカル起動（http://localhost:3000）
```

デプロイ先: Render（`process.env.PORT` を使用）。無料枠のため15分非アクティブでスリープ、かつインフラ側で1日1〜2回強制再起動される場合がある。UptimeRobot で監視しても防げない。

## アーキテクチャ概要

**フロントエンド**: バニラJS（フレームワークなし）。`index.html` に全UI。スクリプトはロード順に依存している：

```
Card.js → Player.js → GameManager.js → CPU.js → confetti.js → audio.js → online.js → ui.js → storage.js → main.js
```

| ファイル | 役割 |
|---------|------|
| `js/Card.js` | `Card` クラス・`CARD_EFFECTS`・`CARD_CATEGORIES`・`CARDS` 配列・`createCardByName()` |
| `js/GameManager.js` | `GameManager` クラス・`LOG_TYPES`・`GAME_PHASES` |
| `js/confetti.js` | 紙吹雪アニメーション（`startConfetti` / `stopConfetti`） |
| `js/audio.js` | サウンド再生（`playSound` / `getAudioCtx`・`winSoundPlayed`） |
| `js/online.js` | Socket.IO・オンラインセッション・`initSocket` / `applyAction` / `sendAction` / `initOnlineGame`・サーバー再起動復元ロジック |
| `js/ui.js` | ログ描画・分類・pending モーダル・カードフィルター・ターンアナウンサー・buildMenu レンダリング・`CARD_SETS` / `enabledCards` / `enabledLandmarks` |
| `js/storage.js` | ローカルゲーム保存・復元（`saveGameState` / `loadGameState`）・`reconnectOnline()` |
| `js/main.js` | ゲーム進行・CPU制御・イベントハンドラ・`CPU_PHASE_HANDLERS`・タイトル画面 |

**バックエンド**: `server.js`（Node.js + Express + Socket.IO）。ゲームロジックは**クライアント側で動く**。サーバーはアクションの中継とルーム管理のみ。

### 定数

#### `CARD_EFFECTS`（js/Card.js）
`Object.freeze()` でフリーズされた文字列定数。`NORMAL`, `CHEESE`, `FURNITURE`, `MARKET`, `FLOWER`, `FOODWAREHOUSE`, `FEWLANDMARK`, `WINERY`, `MOVER`, `DRINKFACTORY`, `LOAN`, `RENOVATION`, `HARBOR`, `HARBOR_RED`, `TUNA`, `CORNFIELD`, `FRENCHR`, `MEMBERBAR`, `STADIUM`, `TV`, `BUSINESS`, `PUBLISHER`, `TAXOFFICE`, `CLEANING`, `ITSTARTUP`, `PARK`。新カード追加時は必ずここに追加してから使うこと（文字列リテラル直書き禁止）。

#### `CARD_EFFECT_DESCRIPTIONS`（js/Card.js）
`Object.freeze()` でフリーズされた説明文関数マップ。各エフェクトに対して `(income) => string` の関数が入っている。`ui.js` の `getEffectText(card)` が `CARD_EFFECT_DESCRIPTIONS[card.effect](card.income)` で参照する。新カード追加時は必ずここにも説明を追加すること。

#### `CARD_CATEGORIES`（js/Card.js）
`Object.freeze()` でフリーズされた分類定数。`FARM`（農園）・`LIVESTOCK`（畜産）・`INDUSTRY`（工業）・`RESTAURANT`（飲食店）・`SHOP`（商店）・`FISHERY`（海産）・`MAJOR`（大施設）。カテゴリ比較は必ずこれを使う（日本語文字列リテラル直書き禁止）。

#### `LANDMARK_NAMES`（js/Player.js）
`Object.freeze()` でフリーズされたランドマーク名定数。`STATION`（駅）・`SHOPPING_MALL`（ショッピングモール）・`AMUSEMENT_PARK`（遊園地）・`RADIO_TOWER`（電波塔）・`HARBOR`（港）・`AIRPORT`（空港）・`YAKUSHO`（役所）。ランドマーク名の比較・参照は必ずこれを使う（文字列リテラル直書き禁止）。`Player._LANDMARK_DEFS` の各エントリは `name`・`cost`・`emoji`・`effect` を持つ。`getLandmarkEmoji()`・`getLandmarkEffectText()` は `_LANDMARK_DEFS` を参照する。

#### `GAME_PHASES`（js/GameManager.js）
`Object.freeze()` でフリーズされたフェーズ定数。`ROLL`, `SELECT_DICE`, `REROLL_CONFIRM`, `HARBOR_CHOICE`, `PENDING`, `BUILD`。`this.phase` への代入・比較は必ずこれを使う。

#### `LOG_TYPES`（js/GameManager.js）
`Object.freeze()` でフリーズされたログ種別定数。`DICE`, `GAIN`, `LOSE`, `BUILD`, `SPECIAL`, `SYSTEM`, `ERROR`。`addLog(type, msg)` の第1引数はこれを使う。ログエントリは `{ type: string, message: string }` オブジェクト（文字列ではない）。

### server.js での定数利用
`loadGameRuntime()` の vm.runInContext で `GAME_PHASES`・`CARD_CATEGORIES`・`LANDMARK_NAMES` をコンテキストからエクスポートしている。`getAllowedActions()` は `gameRuntime.GAME_PHASES` をデストラクチャして使う。

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
- サーバーはアクションログ（`room.actionLog`）を蓄積し、長くなりすぎた場合は `stateSnapshot` に圧縮してから差分ログだけを保持する
- ホスト切断時は残存プレイヤーの先頭が新ホストになり `hostChanged` イベントで通知される
- 再接続トークン（UUID）をルーム作成・参加時に発行。`rejoinRoom` 時に `roomId + playerIndex + playerName + reconnectToken` の4つが一致しないと拒否される（復元済みルームはトークン検証をスキップし名前のみ確認）
- 開始済みルームは2時間アクティビティがないと自動削除（`lastTouchedAt` + TTL）
- プレイヤー名はサーバー受信時に `sanitizeName()` でバリデーション・20文字以内に制限
- **プレイヤー順シャッフル**: ゲーム開始時にサーバーが `playerOrder` 配列を生成。`validateGameAction()` は `playerOrder[currentIndex]` で元のプレイヤーインデックスに変換してから `socket.playerIndex` と比較する（直接比較するとシャッフル後に人間プレイヤーのアクションが全拒否される）
- 業務エラー通知は Socket.IO 標準の `error` ではなく専用イベント `appError` を使う

#### サーバー再起動後の復元フロー

- 全クライアントがゲーム開始時の `gameStartPayload` を `localStorage('onlineGameStart')` に保存
- `sendAction` / `socket.on('gameAction')` のたびに `localStorage('onlineActionLog')` へ追記
- `rejoinRoom` でルームが見つからない場合はサーバーが `ROOM_NOT_FOUND` エラーを返す
- **ホスト**: `ROOM_NOT_FOUND` を受け取ると `recreateRoom` イベントを送信 → サーバーがアクションログからルームを再構築 → `rejoinData` で復帰
- **非ホスト**: `ROOM_NOT_FOUND` を受け取ると3秒ごと最大8回 `rejoinRoom` をリトライ（ホストの復元完了を待つ）
- 復元されたルームは `room.restored = true` フラグが立つ
- `rejoinData` は `stateSnapshot` を含む場合があり、クライアントは「初期化 → snapshot 復元 → 残り actionLog 再生」で再構築する

### CPU（js/CPU.js）

`difficulty`: `"weak"` / `"normal"` / `"strong"` の3段階。`build()` は `buildWeak` / `buildNormal` / `buildStrong` に委譲。スコアリングは `evalCard()` + `sortAffordable()` でコスパ評価。CPU判断ロジックは大幅に強化済み（手番ごとの期待値・他プレイヤー状況考慮）。

`GameManager.calcCardIncome(card, owner, game)` 静的メソッドで multiplier 系の収入を計算（CPU と GameManager の両方が使用）。

**重要**: `_buyCard()` と `_buyLandmark()` はオンライン対戦中（`isOnlineGame === true`）に `sendAction()` を呼ぶ。これにより非ホスト側にCPUの建設アクションが伝わる。`typeof isOnlineGame !== 'undefined'` ガードによりテスト環境では呼ばれない。

#### CPU進行チェーン（main.js）

- `scheduleCPU()` はトークン方式で自己再起動チェーンを形成。`cpuScheduleToken` をインクリメントし、古いチェーンは自動破棄される
- `cpuDo(action, data, fallback)` はアクションを実行後に `scheduleCPU()` を呼び、次フェーズへ自動進行する
- `CPU_PHASE_HANDLERS` テーブル（配列）でフェーズごとの処理を定義。新フェーズ追加時はここに1エントリ追加するだけ。フェーズ判定は `GAME_PHASES` 定数を使う
- ITベンチャー所持時は `nextTurn` ステップに `!game.pendingIT` ガードがあり、`pendingIT=true` の間は再進行しない（無限ループ防止）
- **build フェーズ**は `cpuDo` を使わず `cpu.build()` を直接呼ぶ。建設アクションの送信は `_buyCard` / `_buyLandmark` 内部で行う

### ローカルストレージ

| キー | 内容 |
|------|------|
| `savedGame` | ローカルゲームの中断状態（JSON） |
| `onlineSession` | オンライン再接続用情報（roomId・playerIndex・playerName・isRoomHost・reconnectToken） |
| `onlineGameStart` | オンラインゲーム開始時の `gameStartPayload`（サーバー再起動復元用） |
| `onlineActionLog` | オンラインゲームの全アクションログ（サーバー再起動復元用） |
| `selectedCount` / `playerSettings` / `cpuSpeed` | タイトル画面の設定 |
| `winStreak` / `lastWinnerName` | 連勝記録 |
| `tutorialEnabled` / `tutorialLevel` | チュートリアル設定 |

### UI 設計メモ

- **pending ダイアログ**（テレビ局・改装屋等）は `#pendingModal` のフルスクリーンオーバーレイで表示。`renderPending()` が innerHTML を書き換え、コンテンツがある間だけ `display:flex`。
- **ビジネスセンター**のカード選択は `<select>` ではなくタップ可能な `.bc-chip` ボタン方式。`bcSelectCard()` が選択状態と hidden input を更新。`onResolveBusiness()` は hidden input の値をそのまま参照する。
- **ログ全履歴**は `fullLog[]` 配列で管理（最大300件）。ログエントリは `{ type, message }` オブジェクト。`game.log` のリセットを `prevLogLength` との比較で検知し、ターン切り替えには `__SEP__` 区切り文字（文字列）を挿入。電波塔リロール（`cur[0]?.message?.startsWith("📡")`）の場合は区切りを挿入しない。
- **ターンアナウンサー**は `#turnAnnouncer` の fixed オーバーレイ。`prevPlayerIndex` の変化を `render()` 内で検知し、`showTurnAnnouncer()` で1.3秒表示後フェードアウト。`isReplaying = true` のときは発火しない。
- **カードフィルター**は `cardFilter` 変数（`''` = 全て）で管理。`setCardFilter()` を呼ぶと `renderBuildMenu()` が再実行される。

### カード追加時の注意

- `js/Card.js` の `CARD_EFFECTS` に新 effect を追加してから `CARDS` 配列にカードを追加
- `CARD_CATEGORIES` の既存分類を使う（新分類が必要なら `CARD_CATEGORIES` に追加）
- `CARD_EFFECT_DESCRIPTIONS` に説明文関数を追加
- `js/ui.js` の `CARD_SETS`（basic / plus / sharp）にも追加
- `CPU.evalCard()` に新 effect のスコアロジックを追加
- `GameManager.processIncome()` に発動ロジックを追加

### セキュリティ・バリデーション

- プレイヤー名は `sanitizeName()` でHTMLタグ・特殊文字を除去（サーバー側）
- フロントエンドは `escapeHtml()` でプレイヤー名・カード名を `innerHTML` に挿入前にエスケープ
- `validateGameAction()` でアクションの妥当性をサーバー側で検証（フェーズ・権限・所持金・在庫・紫重複など）。内部で例外が発生してもtry-catchでキャッチしサーバーは落ちない
- ブラウザネイティブ `confirm()` は廃止済み。確認ダイアログはカスタムモーダル `showConfirm()` を使うこと

### テスト

```
npm test    # tests/run-all.js → gamemanager.test.js + server.test.js + cpu.test.js + online.test.js
```

Node.js 組み込み `assert` モジュールのみ使用。現在 **93テスト**（gamemanager.test.js: 41, server.test.js: 27, cpu.test.js: 15, online.test.js: 10）。

| ファイル | 内容 |
|---------|------|
| `tests/gamemanager.test.js` | GameManager 単体テスト（フェーズ遷移・pendingRenovation・buildCard・テレビ局・ITベンチャー・電波塔・ログリセット・CARDSソート・processIncome・calcCardIncome・LOG_TYPES構造など） |
| `tests/server.test.js` | サーバー回帰テスト（validateGameAction・sanitizeName・validateCleaningPayload・validateRenovationPayload・playerOrderシャッフル対応等） |
| `tests/cpu.test.js` | CPU単体テスト（evalCard・chooseDiceCount・chooseReroll・_landmarkUrgency・sortAffordable） |
| `tests/online.test.js` | オンライン関連テスト（applyAction・initOnlineGame） |
| `tests/run-all.js` | 4ファイルを順次実行するエントリポイント |

新機能追加時は対応するテストファイルにケースを追加すること。UI 固有の処理（DOM 操作・アニメーション）はブラウザ環境依存のため Node.js テストでは検証できない。GameManager ロジックに集中してテストを書く。

### 既知の制約

- `isReplaying = true` の間は `render()` と `scheduleCPU()` が抑制される（オンライン再接続のリプレイ中）
- ランドマーク「役所」は `Player.landmarks` に含まれず `hasYakusho` フラグで別管理
- 紫カード（大施設）は1人1枚制限: `card.color === "purple" && current.countCard(card.name) > 0` でチェック
- `main.js` は約1116行（`ui.js` / `storage.js` に分割済み）。さらなる分割は将来課題
- `main.js` の末尾には `initMainView()` があり、タイトル初期描画・クラッシュ監視・オフライン監視・PWA インストールバナー初期化を束ねる
- `CARD_SETS` は `ui.js` に定義されている（`main.js` ではない）
