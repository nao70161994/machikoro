# Machi Koro

バニラ JavaScript で実装した街コロ Web アプリです。ローカル対戦、CPU 対戦、Socket.IO を使ったオンライン対戦、PWA 配布に対応しています。

## 起動方法

1. 依存関係をインストールします。

```bash
npm install
```

2. ローカルサーバーを起動します。

```bash
node server.js
```

3. ブラウザで `http://localhost:3000` を開きます。

## 主な機能

- ローカル対戦と CPU 対戦
- オンラインルーム作成・参加
- ホスト主導の決定論的なオンライン同期
- 再接続トークンによる復帰
- サーバー再起動後のルーム復元
- Service Worker による PWA 配布
- Android / TWA ビルドワークフロー

## テスト

自動テスト:

```bash
npm test
```

編集後の構文確認:

```bash
node --check server.js
node --check js/main.js
node --check js/online.js
```

高リスクの手動確認項目は [`TESTPLAN.md`](./TESTPLAN.md) にまとめています。オンライン変更時は最低でも以下を確認してください。

- 部屋作成 / 参加
- 再接続
- ホスト移譲
- サーバー再起動後の復元
- CPU 手番進行
- Undo 同期

## プロジェクト構成

主要ファイル:

- `index.html`: アプリ本体とスクリプトロード順
- `style.css`: 全スタイル
- `server.js`: Express + Socket.IO サーバー、オンライン検証、復元
- `sw.js`: Service Worker
- `manifest.json`: PWA マニフェスト

主要クライアントモジュール:

- `js/Card.js`: カード定義・定数
- `js/Player.js`: プレイヤー状態
- `js/GameManager.js`: ルール本体
- `js/CPU.js`: CPU 判断ロジック
- `js/online.js`: オンライン同期、再接続、復元
- `js/ui.js`: 描画、モーダル、ログ、チュートリアル UI
- `js/storage.js`: セーブ / 復帰 / 設定保存
- `js/main.js`: 起動、入力、CPU 進行、タイトル/ゲーム画面制御
- `js/stats.js`: ローカル統計表示
- `js/appShell.js`: クラッシュ表示、オフライン表示、PWA インストールバナー、初期ビュー初期化

テスト:

- `tests/gamemanager.test.js`
- `tests/server.test.js`
- `tests/cpu.test.js`
- `tests/online.test.js`
- `tests/main.test.js`
- `tests/run-all.js`

## オンライン復元の要点

- クライアントは `onlineGameStart` と `onlineActionLog` を `localStorage` に保存します。
- 長時間ゲームでは、サーバーとクライアントの両方が古いアクション列を `stateSnapshot` に圧縮し、差分ログだけを保持します。
- 再接続時は「ゲーム初期化 → snapshot 復元 → 残り actionLog 再生」で状態を再構築します。
- アプリ固有のオンライン失敗通知は Socket.IO 標準の `error` ではなく `appError` イベントで扱います。

## デプロイメモ

- Render での稼働を前提にしています。
- `/api/version` はクライアント/サーバーのビルド差分検知に使います。
- Android 向けには `.github/workflows/build-apk.yml` で TWA APK をビルドします。

## 開発メモ

- `GameManager` がルールの唯一の正です。
- オンライン同期を変えるときは、クライアント送信、サーバー検証、再接続復元、保存状態を必ず一緒に確認してください。
- 定数比較では既存の `CARD_EFFECTS`、`CARD_CATEGORIES`、`LANDMARK_NAMES`、`GAME_PHASES`、`LOG_TYPES` を使ってください。
