# リポジトリガイドライン

## プロジェクト概要

このリポジトリは、バニラ JavaScript で実装された街コロの Web アプリです。ローカル対戦とオンライン対戦の両方に対応しています。

- クライアント側のゲームルールはブラウザで動きます。
- `server.js` はオンライン対戦のルーム管理、検証、再接続、アクション中継を担います。
- このアプリは PWA としても保守されており、最近は Service Worker 更新フローや Android/TWA パッケージングも含みます。

挙動を変えるときは、ローカル対戦、オンライン同期、再接続復元、保存状態、PWA 更新挙動の整合性を保ってください。

## 構成と責務

トップレベルの主なファイル:

- `index.html`: アプリ本体と script 読み込み順。
- `style.css`: すべての見た目。
- `manifest.json`: PWA マニフェスト。
- `sw.js`: Service Worker の更新とキャッシュ挙動。
- `server.js`: Express + Socket.IO サーバー、ルーム管理、検証、再接続、復元。
- `package.json`: 実行・テスト用 script。
- `.github/workflows/build-apk.yml`: Android/TWA ビルド workflow。
- `TESTPLAN.md`: 高リスクなゲームプレイ / オンライン変更向けの手動回帰チェックリスト。
- `scripts/rl/README.md`: RL 学習・評価フローと artifact の説明。

クライアントモジュール:

- `js/Card.js`: カード定義、効果 / 分類定数、カード補助。
- `js/Player.js`: プレイヤー状態、ランドマーク定義、勝利判定。
- `js/GameManager.js`: ルール、フェーズ、pending 効果、ログの正本。
- `js/CPU.js`: CPU 評価と行動選択。
- `js/online.js`: Socket.IO クライアントフロー、アクション適用、オンライン開始、再起動復元。
- `js/ui.js`: 描画、モーダル、ログ、建設メニュー、フィルタ、チュートリアル UI。
- `js/storage.js`: ローカル save / resume、再接続永続化、設定保存。
- `js/main.js`: 起動処理、イベントハンドラ、CPU スケジューリング、タイトル / ゲーム進行。
- `js/audio.js`: 音声補助。
- `js/confetti.js`: 紙吹雪アニメーション補助。
- `js/stats.js`: 統計補助と UI 支援。
- `js/appShell.js`: クラッシュ UI、オフライン表示、PWA インストールバナー、シェル初期化。
- `js/RLCPU.js`: 新しい experimental CPU 向けの export 済み RL モデルランタイム。

RL / 学習系スクリプト:

- `scripts/rl/train.py`: Python 側の RL 学習ループ。
- `scripts/rl/run-baseline.sh`: Termux でも打ちやすい baseline 学習ラッパー。
- `scripts/rl/export_model.py`: `.npz` checkpoint をブラウザで読める形式へ export。
- `scripts/eval-rl-vs-js.js`: RL checkpoint を JS CPU 群と比較。
- `scripts/summarize-rl-metrics.js`: `train_metrics.csv` を集計して順位 artifact を生成。
- `models/rl_model/`: 学習出力、summary、export 済み checkpoint の保存先。

テスト:

- `tests/run-all.js`: `npm test` から呼ばれる test entrypoint。
- `tests/gamemanager.test.js`: ルールとフェーズ遷移の回帰テスト。
- `tests/server.test.js`: サーバー検証とルーム挙動のテスト。
- `tests/cpu.test.js`: CPU 判断ロジックのテスト。
- `tests/online.test.js`: オンラインクライアントフローのテスト。
- `tests/main.test.js`: main の bootstrap / フロー回帰テスト。
- `tests/selfplay.test.js`: self-play script の回帰テスト。
- `tests/tune-expert.test.js`: expert tuning script の回帰テスト。
- `tests/train-expert-crowd.test.js`: 4人戦 `expert vs normal,normal,normal` tuning 補助のテスト。
- `tests/rlcpu.test.js`: RL CPU ランタイムの回帰テスト。
- `tests/rl-train.test.js`: RL 学習補助処理の回帰テスト。
- `tests/eval-rl-vs-js.test.js`: RL-vs-JS 評価の回帰テスト。
- `tests/summarize-rl-metrics.test.js`: RL metrics 集計の回帰テスト。

基本的な責務分担:

- ルール変更は `js/GameManager.js`。
- カード定義、効果定数、説明文は `js/Card.js`。
- CPU tuning は `js/CPU.js`。
- RL CPU ランタイムと export 済みモデルの統合は `js/RLCPU.js`。
- UI とモーダル挙動は `js/ui.js`。
- save / reconnect の永続化は `js/storage.js`。
- オンラインクライアントフローは `js/online.js` と `js/main.js`。
- サーバー側の検証、ルーム管理、再接続、復元は `server.js`。
- RL 学習 / 評価フローは `scripts/rl/*.py`, `scripts/*.js`, `models/rl_model/`。

## アーキテクチャメモ

重要な不変条件:

- `GameManager` はゲームルールの唯一の正です。
- オンライン対戦は決定論的で、ホストが正しいアクションを生成し、全クライアントがそれを再生します。
- サーバーは完全なゲーム状態を持たず、セッション情報と action log を元に検証・中継・再構築します。
- 長時間のオンライン対戦では、サーバー側 `stateSnapshot` とクライアント側 `onlineStateSnapshot` の両方で古い action を圧縮することがあります。再接続ロジックは snapshot 復元と残り action replay の両方を扱う必要があります。
- 再接続とサーバー再起動後の復元は例外対応ではなく、中核機能です。

現在の実装で重要なゲームプレイ / 実行時の前提:

- script 読み込み順は重要です。`index.html` で定義された依存順を維持してください。
- 文字列リテラルではなく、`CARD_EFFECTS`, `CARD_CATEGORIES`, `LANDMARK_NAMES`, `GAME_PHASES`, `LOG_TYPES` など既存の frozen 定数を使ってください。
- ログエントリは自由文字列ではなく構造化オブジェクトです。
- オンライン対戦ではプレイヤー順がシャッフルされることがあるため、検証時は UI 上の index ではなくサーバー側の対応順を使う必要があります。
- オンラインでの CPU 手番はホスト主導です。CPU のタイミングを変えるときは、重複送信や停止が起きないか確認してください。
- `expert` CPU は人数別の tuning を持ちます。現在は 4人戦 `expert` を 2人戦 `expert` と別問題として扱っています。
- `scripts/selfplay.js` は `--fast` と `--lite` を持ち、軽量な `expert` 評価に使えます。`--lite` は特に 4人戦 crowd シナリオで self-play / tuning を繰り返す用途向けです。
- `scripts/tune-expert.js` は `crowdNormal` / `crowd-normal` を受け付け、`expert` を `normal,normal,normal` と直接比較できます。
- `scripts/train-expert-crowd.js` は現在の軽量 tuning 補助で、`expert vs normal,normal,normal` を前提にしています。
- RL 学習は現在 `expert` とは別ラインで、置き換えではなく新 CPU として導入する前提です。
- RL の baseline 学習は、Termux での長いコマンド折り返し事故を避けるため `sh scripts/rl/run-baseline.sh` を使ってください。既定値は `1000 / 500 / 1 / strong` に加えて `hidden=128`、初期評価スキップ、`max_steps=1200`、進捗表示を含む軽量 sanity run 向けです。出力先は `run-label` ごとに分かれるので、別ラベルなら並列実行しても衝突しません。
- 現行の模倣なし RL 実験は `sh scripts/rl/run-js-oracle-terminal-shaped.sh` を使います。JS CPU oracle、終局報酬調整、`self` / `pool` 混合、`restore-best-at-end` が有効です。詳しい報酬設計と相手比率は `scripts/rl/README.md` を確認してください。
- RL 学習相手の `normal/strong/expert` は、Python heuristic ではなく JS `CPU.js` oracle を使う設定を優先してください。Python heuristic は JS CPU とズレることがあるため、現在は主に比較・fallback 用です。
- RL checkpoint の品質は `vs_random` だけでなく、`scripts/eval-rl-vs-js.js` と summary artifact を主に見て判断してください。
- アプリレベルの Socket.IO 失敗通知には専用の `appError` event を使ってください。transport レベルの `error` に混ぜないでください。
- Service Worker / version mismatch の挙動は製品仕様の一部です。キャッシュ資産、起動フロー、オンライン画面を触る場合は、update banner と reload 挙動も考慮してください。

新しいカードや効果を追加するときは、関連する層をすべて更新してください:

- `js/Card.js`: 効果定数、説明文、カードデータ。
- `js/GameManager.js`: ルール実行。
- `js/CPU.js`: 必要なら評価 / 判断ロジック。
- `js/ui.js`: 必要なら利用可能カードセットや表示。
- 影響するルール経路のテスト。

## ビルド・テスト・開発コマンド

- `npm install`: 依存関係をインストール。
- `node server.js`: ローカルでアプリを起動 (`http://localhost:3000`)。
- `npm test`: `tests/run-all.js` 経由で全 Node テストを実行。
- `npm run train-rl:baseline`: RL baseline 学習を開始。
- `npm run eval-rl-vs-js -- --model <path>`: export 済み RL checkpoint を JS CPU 群と比較。
- `npm run summarize-rl-metrics -- --csv models/rl_model/train_metrics.csv`: RL run を集計。
- `node --check server.js`: サーバーの構文確認。
- `node --check js/<file>.js`: 編集したクライアントファイルの構文確認。

期待される確認:

- クライアントファイルを 1 つ以上編集したら、編集した各 `js/*.js` に対して `node --check` を実行してください。
- ルール、オンラインフロー、サーバー検証、共有ゲーム挙動を変更したら `npm test` を実行してください。
- CPU / self-play / tuning を変更したら、可能な範囲で関連する targeted test (`tests/cpu.test.js`, `tests/selfplay.test.js`, `tests/tune-expert.test.js`, `tests/train-expert-crowd.test.js`) も実行してください。
- RL 学習 / 評価 / ランタイムを変更したら、可能な範囲で関連する targeted test (`tests/rlcpu.test.js`, `tests/rl-train.test.js`, `tests/eval-rl-vs-js.test.js`, `tests/summarize-rl-metrics.test.js`) も実行してください。
- オンライン / 再接続を変更したら、部屋作成 / 参加、再接続、ホスト移譲または再起動復元、CPU 手番、Undo 同期を手動確認してください。
- PWA / 更新挙動を変更したら、Service Worker の更新プロンプトと reload 挙動を手動確認してください。

## コーディング規約と編集方針

- JS、HTML、CSS、workflow YAML は 4 スペースインデントを使ってください。
- 既存の browser-global / CommonJS スタイルに従ってください。bundler、framework、module-system の大きな書き換えは安易に入れないでください。
- 関数名と変数名は `camelCase` を使ってください。
- 既存の日本語カード名、ラベル、ゲーム用語は維持してください。
- 周囲の書き方に厳密に合わせてください。formatter や linter はありません。
- 新しい stringly-typed 分岐を足すより、既存の定数や helper table を拡張する方を優先してください。
- DOM 側の確認フローは custom modal を使ってください。native `confirm()` を戻さないでください。

## テスト方針

- 回帰テストは `tests/` 配下の最も適切なファイルへ追加・更新してください。
- ルール、検証、replay 安全性、境界状態遷移を狙った targeted assertion を優先してください。
- UI だけのアニメーション / 表示変更は、Node テストより手動確認の方が適切な場合があります。
- 高リスクな手動確認、特に pending action、オンライン CPU フロー、再接続、Undo、無効 target まわりは `TESTPLAN.md` を使ってください。

## コミットと Pull Request の方針

最近の履歴では、次の規約がはっきりしています:

- `feat:`, `fix:`, `docs:`, `debug:` のような prefix を使う。
- 件名は簡潔な日本語で書く。
- 件名は挙動の変化に絞り、必要なら短い括弧書きで失敗モードを補足する。

最近のコミット例:

- `feat: サーバー再起動後にオンラインゲームへ復帰できる機能を追加`
- `fix: シャッフル後の人間プレイヤーアクションがサーバーで拒否されるバグを修正`
- `fix: タイトル画面中のSW更新を自動適用（ゲーム中は手動バナー）`
- `docs: CLAUDE.mdを最新状態に更新`

コミットは小さく、挙動単位で分けるのを優先してください。強く結びついていない限り、ゲームプレイ、オンライン / サーバー、PWA、CI / APK の変更は分離してください。

PR には次を含めてください:

- 何の挙動が変わったか。
- どのファイル / モジュールを触ったか。
- 実行した自動確認。
- 実施した手動確認。特にオンライン / PWA 変更時。
- 見た目の変更がある場合は screenshot または recording。

## 環境メモ

このリポジトリは Android + Termux から作業されることが多いです。デスクトップ前提でしか成り立たない仮定は避けてください。

- `CLAUDE.md` には Termux / `termux-chroot` 固有の補足があります。
- コマンドは、可能な限り単純で移植しやすいものを使ってください。
- workflow や build 手順を追加する場合は、再現可能で非対話的なコマンドを優先してください。
