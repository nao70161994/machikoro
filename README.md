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
- `expert` の自己対戦 tuning と、別系統の RL 学習基盤

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

CPU の自己対戦:

```bash
npm run selfplay -- --games 20 expert strong strong normal
```

`expert` の評価プリセット比較:

```bash
npm run selfplay -- --games 20 --compare-presets default,rush,economy expert strong strong normal
```

軽量な `expert` 自己対戦:

```bash
npm run selfplay -- --games 10 --lite expert normal normal normal
```

- `--expert-preset <name>` で `expert` の評価係数セットを切り替えます。
- `--compare-presets a,b,c` で複数プリセットを同条件で連続比較します。
- `--format json` を付けると集計と試合明細を JSON で出力します。
- `--details` を付けると各試合の勝者、ターン数、最終盤面サマリを表示します。
- `--fast` は `expert` の探索を軽くした比較用モードです。
- `--lite` はさらに軽い self-play 専用モードで、4 人戦 `expert` の比較・学習を回しやすくするためのものです。
- 通常の `expert` CPU は `default` プリセットを使い、実戦では `expertPurpose: "live"` の軽量ロジック、self-play / tuning では `training` の重いロジックを使います。
- 現在の `expert` は `winDistance` ベースの局面評価、未決着 lookahead の勝利距離差評価、局面依存の lookahead 深さ調整を含みます。
- `TV` / `Business` / `Cleaning` の pending 選択には、相手の進行圧を使った専用補正が入っています。
- `refined` は探索で出た候補として比較用に残しています。

`expert` の近傍探索:

```bash
npm run tune-expert -- --games 8 --base-preset default --top 5 expert strong strong normal
```

人数別プロファイルでの探索:

```bash
npm run tune-expert -- --games 8 --profiles duel,crowd --top 3
```

人数別の上位候補から提案プリセットを生成:

```bash
npm run tune-expert -- --games 8 --profiles duel,crowd --top 1 --propose-preset hybridDefault
```

人数別の専用プリセット断片も同時に出力:

```bash
npm run tune-expert -- --games 8 --profiles duel,crowd --top 1 --propose-preset hybridDefault --emit-profile-presets
```

提案プリセットを基準と自動比較:

```bash
npm run tune-expert -- --games 8 --profiles duel,crowd --top 1 --propose-preset hybridDefault --evaluate-proposal
```

複数の提案候補をまとめて比較:

```bash
npm run tune-expert -- --games 8 --profiles duel,crowd --top 2 --proposal-depth 2 --propose-preset hybridDefault --evaluate-proposal
```

上位候補だけ長めに再評価:

```bash
npm run tune-expert -- --games 8 --profiles duel,crowd --top 2 --proposal-depth 2 --propose-preset hybridDefault --evaluate-proposal --finalist-count 2 --finalist-games 20
```

勝ち越し候補だけをプリセット断片として出力:

```bash
npm run tune-expert -- --games 8 --profiles duel,crowd --top 2 --proposal-depth 2 --propose-preset hybridDefault --evaluate-proposal --finalist-count 2 --finalist-games 20 --emit-winners
```

- 基準プリセットの近傍候補を自動生成して self-play で比較します。
- `--format json` を付けると候補ごとの係数と勝率一覧を JSON で出力します。
- `--emit-preset` を付けると、`CPU._expertPresets()` に貼り付けやすい JS オブジェクト断片も出力します。
- `--profiles duel,crowd` を付けると 2人戦と多人数戦を分けて同じ候補集合を比較できます。
- `--propose-preset <name>` を付けると、各プロファイルの首位候補から差分を合成した提案プリセットも出力します。
- `--emit-profile-presets` を付けると、`duel` / `trio` / `crowd` ごとの専用 tuning 断片と、そのまま `expertProfileTunings` に渡せるマップも出力します。
- `--evaluate-proposal` を付けると、生成した提案プリセットを基準プリセットと同条件で再戦させ、人数別の勝ち数差を表示します。
- `--proposal-depth N` を付けると、各プロファイルの上位 `N` 件を組み合わせた提案候補をまとめてランキングします。
- `--finalist-count N --finalist-games M` を付けると、ランキング上位 `N` 候補だけを `M` 試合で再評価します。
- `--emit-winners` を付けると、`finalist` 再評価で勝ち越した候補だけを `CPU._expertPresets()` に貼り付けやすい形で出力します。
- `crowdNormal` / `crowd-normal` プロファイルを使うと、`expert vs normal,normal,normal` 専用の探索ができます。

4 人戦 `expert` 向けの軽量探索:

```bash
npm run train-expert-crowd -- --games 3 --rounds 4 --candidates 4 --seed 17 --profile crowdNormal
```

- `train-expert-crowd` は `expert vs normal,normal,normal` を前提に、`lite` self-play で crowd tuning を探索します。
- 現在の 4 人戦 `expert` は調整途中で、序中盤を `normal` 寄りにした crowd-normal 方針を使っています。
- 既定 `expert` の `crowd` tuning も、妨害寄りではなく安定収入とランドマーク進行を重視する方向に更新済みです。
- 4 人戦でも終盤は `winDistance` と pending 妨害評価を使って、先行相手への干渉を少し強めています。

## RL 学習

`expert` とは別に、`scripts/rl` 配下で RL 学習系を管理しています。現状は 2 人戦と 3〜4 人戦の学習・評価基盤が中心で、既存 `expert` を置き換えるのではなく、新しい CPU として段階的に導入する前提です。

主な流れ:

1. `scripts/rl/train.py` で学習
2. `scripts/eval-rl-vs-js.js` で JS 側 `weak/normal/strong/expert` と比較
3. `scripts/summarize-rl-metrics.js` で `train_metrics.csv` を集計
4. `models/rl_model/registry.json` に採用候補モデルの評価・構築傾向を記録
5. `models/rl_model/portfolio/` に採用済み browser JSON を配置
6. `js/RLCPU.js` / `js/RLModelPortfolio.js` で人数別にモデルを切り替えて読み込みます

baseline 学習の開始:

```bash
sh scripts/rl/run-baseline.sh
```

現行の模倣なしRLカリキュラム実験:

```bash
sh scripts/rl/run-js-oracle-terminal-shaped.sh --run-label terminal-shaped-curriculum
```

`npm` 経由でも実行できます。

```bash
npm run train-rl:baseline
```

baseline ラッパーは、Termux でもまず動作確認できるように `--games 1000`、`--eval-every 500`、`--hidden 128`、`--js-eval-games 1`、初期評価スキップ、`max_steps=1200`、軽量な進捗表示を既定にしています。
`run-js-oracle-terminal-shaped.sh` は JS CPU oracle、終局報酬調整、`self` / `pool` を含む模倣なしRL実験用です。
2026-04時点では `hidden=128, lr=0.0001` の `terminal-shaped-h128-lr1e4` が有力候補で、20戦JS評価は `weak 90% / normal 60% / strong 35%` です。
初期の `hidden=256` 系は pass 方策へ崩れやすい傾向がありましたが、低学習率・両側自己対戦・報酬クリップの設定では改善しています。2026-04時点では 3〜4人用に `self-only-4p-h256-lr1e5-5000-seed102` を採用しています。

実ゲームでの `AI（深層学習・ランダム）` は、人数に応じて portfolio からランダム選択します。

- 2人戦: 採用済み 2人用モデル群からランダム
- 3〜4人戦: 採用済み 3〜4人用モデルからランダム
- 5人以上: 未対応のため `CPU（最強）` を使ってください

2026-04時点の採用済みモデル:

- 2人用主採用: `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3`
- 2人用補助候補: `self-only-both-h256-lr2e5-5000-seed70-rewardcap`, `self-only-both-h256-lr2e5-5000-seed69-rewardcap`
- 3〜4人用採用: `self-only-4p-h256-lr1e5-5000-seed102`

baseline 学習で生成される主な成果物:

- `models/rl_model/runs/baseline/train_metrics.csv`
- `models/rl_model/runs/baseline/summary.json`
- `models/rl_model/runs/baseline/run_index.csv`
- `models/rl_model/runs/baseline/config_index.csv`
- `models/rl_model/runs/baseline/best_model.npz`
- `models/rl_model/runs/baseline/best_model.browser.json`
- `models/rl_model/runs/baseline/best_model.meta.json`

`run-baseline.sh` は既定で `models/rl_model/runs/<run-label>/` に出力するため、`--run-label eps030` のように別ラベルを付ければ 2 本まで安全に並列実行できます。

評価短縮コマンド:

```bash
sh scripts/rl/eval-run.sh <run-label>
sh scripts/rl/eval-run-3p.sh self-only-4p-h256-lr1e5-5000-seed102 100
sh scripts/rl/eval-run-4p.sh self-only-4p-h256-lr1e5-5000-seed102 100
sh scripts/rl/eval-run-multiplayer.sh self-only-4p-h256-lr1e5-5000-seed102 100
```

台帳運用の基本:

```bash
npm run validate-rl-registry
npm run report-rl-registry
npm run audit-rl-portfolio
npm run plan-rl-next-actions
npm run review-rl-adoptions
npm run refresh-rl-ops-reports
npm run update-rl-registry-from-eval -- --input models/rl_model/eval-summary.json
npm run report-rl-diversity
```

棚卸し結果を履歴として残す場合:

```bash
npm run report-rl-registry -- --format markdown --output models/rl_model/registry-report.md
```

詳しい学習方式、評価指標、集計オプションは [scripts/rl/README.md](./scripts/rl/README.md) を参照してください。

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
- `js/RLCPU.js`: export 済み RL モデルを読む新 CPU 用ランタイム（導入準備中）

自己対戦 / tuning スクリプト:

- `scripts/selfplay.js`: CPU 自己対戦、プリセット比較、`--fast` / `--lite` 軽量モード
- `scripts/tune-expert.js`: `expert` の近傍探索、人数別プロファイル比較
- `scripts/train-expert-crowd.js`: `expert vs normal,normal,normal` 専用の crowd tuning 探索

RL スクリプト / モデル:

- `scripts/rl/train.py`: RL 学習ループ
- `scripts/rl/run-baseline.sh`: baseline 学習ラッパー
- `scripts/rl/run-js-oracle-terminal-shaped.sh`: JS oracle + 終局報酬調整 + self/pool カリキュラム学習ラッパー
- `scripts/rl/eval-run.sh`: `run-label` から 2人戦の `best_model.browser.json` を評価
- `scripts/rl/eval-run-3p.sh`: 採用済み 3人 lineup を短縮評価
- `scripts/rl/eval-run-4p.sh`: 採用済み 4人 lineup を短縮評価
- `scripts/rl/eval-run-multiplayer.sh`: 採用済み 3人/4人 lineup をまとめて評価
- `scripts/rl/eval-run-top10-multiplayer.sh`: `run-label` の top10 checkpoint を 3人/4人複数 lineup で後評価
- `scripts/rl/bg-list.sh`, `scripts/rl/bg-status.sh`, `scripts/rl/bg-tail.sh`, `scripts/rl/bg-finalize.sh`: バックグラウンド学習の監視補助
- `scripts/rl/bg-watch-summary.sh`, `scripts/rl/bg-experiment-set.sh`: 実行中/比較中ジョブの要約表示
- `scripts/rl/bg-prune.sh`: 停止済みで `summary.json` を持たない stale job の pid/status/cmd を掃除
- `scripts/rl/bg-finalize-top10-multiplayer.sh`: 完走待ち後に top10 多人数後評価まで一発で実行
- `scripts/rl/bg-finalize-experiment-set-top10-multiplayer.sh`: 複数の学習 run を完走待ちし、top10 多人数後評価と run 間比較レポートまで一発で実行
- `scripts/rl/export_model.py`: 学習済み `.npz` の browser 用 export
- `scripts/eval-rl-vs-js.js`: RL と JS CPU の 2 人戦比較
- `scripts/eval-rl-models.js`: 複数モデルの JS 評価ランキング
- `scripts/report-rl-registry.js`: registry の棚卸しレポート出力。評価カバレッジに加えて target head 診断も一覧します。
- `scripts/audit-rl-portfolio.js`: 採用済みモデルの 2人/3人/4人評価カバレッジ監査。target head 診断も含みます。
- `scripts/plan-rl-next-actions.js`: 台帳と監査から次にやる評価・見直し作業を優先順位付きで抽出
- `scripts/review-rl-adoptions.js`: 2人戦候補を weighted score で並べ、現採用モデルと比較すべき challenger を抽出
- `scripts/refresh-rl-ops-reports.js`: registry レポート、portfolio 監査、次アクション、採用候補レビューをまとめて `models/rl_model/reports/` に書き出す
- `scripts/update-rl-registry-from-eval.js`: `eval-rl-models` の JSON を registry に追記し、そのままレポート群も更新
- `scripts/rl/TARGET_HEAD_DESIGN.md`: 多人数戦のテレビ局 / ビジネスセンター / 引越し屋 target head の現状棚卸しと導入方針
- `scripts/report-rl-diversity.js`: candidate / adopted モデルを style と topCards 重複で整理し、比較すべきペアを出力
- `scripts/review-rl-multiplayer-topk.js`: top-k 多人数後評価 JSON を 3人/4人総合点+多様性で並べる
- `scripts/review-rl-multiplayer-experiment-set.js`: 複数 run の top10 review JSON を、run 間の総合点+多様性で比較する
- `scripts/summarize-rl-metrics.js`: 学習 metrics の集計
- `scripts/rl/README.md`: RL 系の詳細ドキュメント
- `models/rl_model/registry.json`: 採用候補モデルの台帳（モデル本体は git 管理外）
- `models/rl_model/portfolio/`: 実ゲームで使う配布用 browser JSON
- `models/rl_model/`: 学習済みモデルと metrics 出力先

テスト:

- `tests/gamemanager.test.js`
- `tests/server.test.js`
- `tests/cpu.test.js`
- `tests/online.test.js`
- `tests/main.test.js`
- `tests/run-all.js`

RL / 学習系テスト:

- `tests/rlcpu.test.js`
- `tests/rl-train.test.js`
- `tests/eval-rl-vs-js.test.js`
- `tests/summarize-rl-metrics.test.js`

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
