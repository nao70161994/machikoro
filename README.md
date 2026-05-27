# ダイスシティ

バニラ JavaScript で実装したダイスシティ Web アプリです。ローカル対戦、CPU 対戦、Socket.IO を使ったオンライン対戦、PWA 配布に対応しています。

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

## 現時点の運用上の制限

- `CPU（最強）` の v2simple 手書き強化は凍結中です。再開条件と評価ゲートは [docs/expert-v2-diagnostics.md](docs/expert-v2-diagnostics.md) に集約します。
- `AI（深層学習・ランダム）` は v2simple とは別CPUとして扱います。3人以上のRLは現行 `self-only-4p-h256-lr1e5-5000-seed103` を使い、5人以上では脅威度上位3人の相手へ射影して判断します。50戦未満の短期評価は smoke / 足切り専用です。
- ルールベース CPU と RL CPU は5人以上でも対応します。5人以上のRLは動作対応済みで、5p / 10p の軽量 lineup 評価も registry に記録済みです。追加採用判断では 2p / 3p / 4p / 5p / 10p を分けて確認します。

## 運用ドキュメント

運用フェーズの入口は [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) です。ntfy 通知分類、CI失敗時の対応、PWA stale client 対応、Render 環境変数、公開前確認、Codex へ投げる障害対応テンプレをまとめています。

- 公開前チェック: [`docs/RELEASE_CHECKLIST.md`](./docs/RELEASE_CHECKLIST.md)
- ntfy / client error / lifecycle 通知: [`docs/NTFY_ERROR_REPORTING.md`](./docs/NTFY_ERROR_REPORTING.md)
- PWA 更新と stale client: [`docs/PWA_MODEL_LOADING.md`](./docs/PWA_MODEL_LOADING.md)
- AI / Codex 引き継ぎ: [`docs/AI_HANDOFF.md`](./docs/AI_HANDOFF.md)

## テスト

既定の自動テスト:

```bash
npm test
```

simulation 系も含めた全体確認:

```bash
npm run test:all
```

変更種別ごとの targeted test:

```bash
npm run test:core
npm run test:online
npm run test:pwa
npm run test:release
npm run test:cpu
npm run test:rl
```

Termux / Android で短時間に入口を確認する場合:

```bash
npm run test:static
npm run test:smoke
```

リリース前の疑似実機 E2E / PWA / ntfy / online restore 近似確認:

```bash
npm run test:release
```

- `test:static`: JS / JSON / shell / Python の構文・parse 確認をまとめて実行します。
- `test:smoke`: static に加えて core / online / cpu-smoke の主要回帰を実行します。
- `test:release`: mobile profile / PWA update / ntfy / restore / long-run snapshot の疑似E2Eを実行します。

編集後の構文確認:

```bash
node --check server.js
node --check js/main.js
node --check js/online.js
```

変更種別別の推奨確認は [`docs/maintenance-checklists.md`](./docs/maintenance-checklists.md) を入口にしてください。リリース前の最終確認は [`docs/RELEASE_CHECKLIST.md`](./docs/RELEASE_CHECKLIST.md)、疑似実機 E2E と CI は [`docs/AUTOMATED_RELEASE_TEST.md`](./docs/AUTOMATED_RELEASE_TEST.md) にまとめています。高リスクの手動確認項目は [`TESTPLAN.md`](./TESTPLAN.md)、オンライン同期の設計入口は [`docs/ONLINE_SYNC.md`](./docs/ONLINE_SYNC.md)、オンライン復元 / 保存 schema の詳細は [`docs/online-restore-schema.md`](./docs/online-restore-schema.md) にまとめています。

AI / 人間が途中参加するときは、まず [`docs/AI_HANDOFF.md`](./docs/AI_HANDOFF.md) を読み、そこから [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)、[`docs/REFACTOR_PLAN.md`](./docs/REFACTOR_PLAN.md)、[`docs/CARD_SYSTEM.md`](./docs/CARD_SYSTEM.md) へ進んでください。

Service Worker / manifest / app shell を変更した場合は、PWA 更新通知、ゲーム中の手動 reload、タイトル画面での自動適用、オフライン表示も [`TESTPLAN.md`](./TESTPLAN.md) で確認してください。

CPU の自己対戦:

```bash
npm run selfplay -- --games 20 expert strong strong normal
```

現行の live `CPU（最強）` は `expertPreset: "v2simple"` を使います。2026-05 時点の既定設定は次です。

- `build=ev`
- `dice=strongCrowdThreshold`
- `reroll=simple`
- `it=always`
- `tv=simple`
- `business=simple`
- `cleaning=simple`
- `harbor=simple`
- `mover=simple`
- `renovation=simple`
- `combo=core`
- `landmarkCardMargin=25`
- `landmarkCardCompareMode=base`
- `landmarkCardCompareTargets=harborMall`
- `landmarkCardPenaltyMode=none`
- `harborLandmarkBaseBonus=2.5`
- `landmarkProgressRemaining=3`
- `landmarkCostWeight=0.12`
- `buildTempo=0.03`
- `airportSkip=whenNoLandmark`
- `incomeCap=none`

この設定の評価 CLI は既定で `mode=lite` の高速比較として動きます。現行 `v2simple` は 2026-05-23 時点の best rule-based preset / 凍結候補です。基準線は、100戦 seed 1 の `normalCrowd=57.0%`, `strongWeighted=57.5%`, `strongMin=38.0%`, strong profile `duel=87.0%`, `trio=78.0%`, `crowd=60.0%`, `allStrong4=38.0%` と、refined duplicate guard 採用後の 50-game seeds 11,12,13 `normalCrowd=58.0%`, `strongWeighted=44.8%`, `strongMin=39.3%`, `crowd=52.0%`, `allStrong4=39.3%` を併記して見ます。詳細と停止判断は `docs/expert-v2-diagnostics.md` に集約します。

`combo=core` は、将来コンボ先が未購入で在庫がある場合だけ、起点カードに薄い先行価値を足します。対象は `牧場 -> チーズ工場`、`森林/鉱山 -> 家具工場`、`花畑 -> フラワーショップ`、`ブドウ園 -> ワイナリー` です。補正係数は既定 `0.35` で、評価スクリプトでは `--combo-weight` で比較できます。`buildTempo=0.03` は購入後の残金評価を旧 `0.05` より少し弱め、低テンポな残金温存に寄りすぎないようにした採用値です。過去に試した `buildGuardMode` は悪化したため削除済みで、`incomeCap` 系は比較用に残していますが既定では使いません。

`strong` 比較の速度改善も入っています。本物 `strong` 同士の `duel 1戦` は、直近の最適化で `12.364秒 -> 4.792秒` まで短縮しています。ここから先の最適化案は複数試しましたが、悪化が多かったため、現時点ではここを打ち止めにしています。

`CPU（最強）` と `CPU（強）` の基準比較:

```bash
sh scripts/eval-cpu-top-tier.sh 50
```

```bash
npm run eval-expert-vs-strong -- --games 50 --format markdown
```

既定では `duel / trio / crowd / allStrong4` の 4 プロファイルで `CPU（最強）` 側の勝率を測ります。重み付き総合値は `1 / 2 / 3 / 4` で、人数が多く `strong` 比率が高い条件を強く見ます。

v2simple の変更候補を採用判断する前に、normal crowd と strong 4 profile をまとめて確認する場合:

```bash
npm run eval-expert-v2-benchmark -- --games 50
```

`CPU（最強）` の係数 tuning 前に、まず `CPU（強）` に対する負け筋を確認する場合:

```bash
npm run diagnose-expert-losses -- --games 8 --profiles duel,trio,crowd --expert-preset v2simple
```

profile ごとに、`winner` の difficulty / seat、`expertMissing`、`winnerBuilt`、`expertCards / winnerCards`、`finalActions` を集計します。
JSON形式では負けた expert の最後の建設判断に `finalActionDiagnostics` が付きます。`v2simple-card-breakdown` は候補カードの `score` / `breakdown` / `deltaScore` / `nearTie` / `landmarkDelayPreview` / `opponentWinThreats` を確認するための診断専用出力です。通常プレイや selfplay の標準 trace には出しません。

`v2simple` の分岐頻度だけを見る場合:

```bash
node scripts/diagnose-expert-v2-branches.js --games 20 --profiles duel,trio,crowd,allStrong4
```

この診断はサイコロ、リロール、港、テレビ局の僅差分岐に加えて、build EV 内の貸金業、清掃業、公園、combo payoff readiness、landmark-gated、mall-name、mall spend delay、mall basic low income、red-saturated、ITInvest、Business などの発火と flip 可能性を数えます。`mover` 行では引越し屋の対象選択について、harmful gift の取り逃しや leader 回避で反転し得る局面を確認できます。
v2simple の診断履歴と採用/却下メモは [docs/expert-v2-diagnostics.md](docs/expert-v2-diagnostics.md) にまとめています。

現行の v2simple 採用セットは次の小変更で凍結候補にしています。

- `buildTempo=0.03`: 旧 `0.05` より残金温存を弱め、100戦 seed 1 で strongWeighted / strongMin / allStrong4 を改善。
- 赤カード相手ターン EV 補正: `redOpponentTurnBonus = min(1, opponentTurnEv * 0.25)` で薄く加点。0.30/0.32 などの強化は過剰で不採用。
- Business Center: 現在は `business=simple`。harmful gift / broad scored exchange は allStrong4 や strongMin を壊すため不採用。
- late basic duplicate guard: ショッピングモール未建設かつ残りランドマーク4以下で、低EVの `コンビニ` / `ピザ屋` / `バーガーショップ` / `食品倉庫` 重複だけを軽く減点します。normalCrowd で勝ち筋になりやすい `パン屋` repeat は減点しません。

試したが不採用の主な方向は、duplicate guard 追加強化、airport skip 無効化/例外、landmark pressure、TV denial、Business Center harmful gift、赤カード crowd 補正、portfolio/growth 一律加点、Cleaning value、special spend guard です。いずれも quick gate で現行を超えない、50/100戦で戻る、または normalCrowd / allStrong4 / strongMin を壊しました。

今後 v2simple 探索を再開するなら、広い係数調整ではなく allStrong4/crowd の paired before/after trace で「1つの小ルールが複数seedの敗戦を反転し、normalCrowd を壊さない」と説明できる診断を先に作ってください。採用ゲートは 20-game quick の後、50-game multi-seed と必要なら100-game確認で strongWeighted 改善、strongMin 維持/改善、normalCrowd -2pt以内です。

`CPU（最強）` の tuning 候補をこの基準で粗く探索する場合:

```bash
sh scripts/search-cpu-top-tier.sh 8 5
# 保存先を明示する場合
sh scripts/search-cpu-top-tier.sh 8 5 models/cpu_top_tier_search/search-g8-top5
```

```bash
npm run search-expert-top-tier -- --games 8 --top 5 --format markdown
```

これは `tune-expert` の候補群を `duel / trio / crowd / allStrong4` で再採点し、`weightedWinRate` と `minWinRate` で上位候補を絞るための入口です。

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
- `selfplay` / tuning の `expert` は未指定なら `default` プリセットを使います。実ゲームの `CPU（最強）` は `expertPurpose: "live"` かつ `expertPreset: "v2simple"` の realtime 軽量ロジックを使います。`eval-expert-*` は同じ live v2simple option を既定にしつつ、速度優先で `lite` 実行します。
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

`expert` とは別に、`scripts/rl` 配下で RL 学習系を管理しています。現状は 2 人戦と多人数戦の学習・評価基盤が中心で、既存 `expert` を置き換えるのではなく、新しい CPU として段階的に導入する前提です。

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
初期の `terminal-shaped-h128-lr1e4` は100戦評価で normal が不安定だったため archive 扱いです。`hidden=256` 系も pass 方策へ崩れやすい傾向がありましたが、低学習率・両側自己対戦・報酬クリップの設定では改善しています。2026-05時点では 多人数用に `self-only-4p-h256-lr1e5-5000-seed103` を採用しています。

実ゲームでは、`CPU（最強）` と `AI（深層学習・ランダム）` を別系統として扱います。`CPU（最強）` は安定したルールベースの基準CPU、`AI（深層学習・ランダム）` は portfolio から人数別モデルを選ぶ学習CPUです。

- 2人戦: 採用済み 2人用モデル群からランダム
- 3人以上: 採用済み多人数モデルを使用。5人以上では自分 + 脅威度上位3人の相手へ射影して判断します

2026-05時点の採用済みモデル:

- 2人用主採用: `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3`
- 2人用補助候補: `self-only-both-h256-lr2e5-5000-seed70-rewardcap`, `self-only-both-h256-lr2e5-5000-seed69-rewardcap`
- 多人数用採用: `self-only-4p-h256-lr1e5-5000-seed103`

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
sh scripts/rl/eval-run-3p.sh self-only-4p-h256-lr1e5-5000-seed103 100
sh scripts/rl/eval-run-4p.sh self-only-4p-h256-lr1e5-5000-seed103 100
sh scripts/rl/eval-run-multiplayer.sh self-only-4p-h256-lr1e5-5000-seed103 100
```

台帳運用の基本:

```bash
npm run validate-rl-registry
npm run report-rl-registry
npm run audit-rl-portfolio
npm run plan-rl-next-actions
npm run review-rl-adoptions
npm run refresh-rl-ops-reports
npm run eval-rl-models -- --models <model-id> --games 50 --output models/rl_model/eval-summary.json --csv models/rl_model/eval-summary.csv
npm run update-rl-registry-from-eval -- --input models/rl_model/eval-summary.json
npm run report-rl-diversity
```

棚卸し結果を履歴として残す場合:

```bash
npm run report-rl-registry -- --format markdown --output models/rl_model/reports/registry-report.md
```

詳しい学習方式、評価指標、集計オプションは [scripts/rl/README.md](./scripts/rl/README.md) を参照してください。

## プロジェクト構成

主要ファイル:

- `index.html`: アプリ本体とスクリプトロード順
- `style.css`: 全スタイル
- `server.js`: Express + Socket.IO サーバー、オンライン検証、復元
- `sw.js`: Service Worker
- `manifest.json` / `manifest.webmanifest`: PWA マニフェスト

主要クライアントモジュール:

- `js/Card.js`: カード定義・定数
- `js/Player.js`: プレイヤー状態
- `js/GameManager.js`: ルール本体
- `js/CPU.js`: CPU 判断ロジック
- `js/online.js`: オンライン同期、再接続、復元
- `js/ui.js`: 描画、モーダル、ログ、チュートリアル UI
- `js/storage.js`: セーブ / 復帰 / 設定保存
- `js/main.js`: 起動、入力、CPU 進行、タイトル/ゲーム画面制御
- `js/audio.js`: 音声補助
- `js/confetti.js`: 紙吹雪アニメーション補助
- `js/stats.js`: ローカル統計表示
- `js/appShell.js`: クラッシュ表示、オフライン表示、PWA インストールバナー、初期ビュー初期化
- `js/RLCPU.js`: export 済み RL モデルを読む `AI（深層学習・ランダム）` 用ランタイム

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
- `scripts/rl/eval-run-multiplayer.sh`: 採用済み 3人/4人/5人/10人 lineup をまとめて評価
- `scripts/rl/eval-run-top10-multiplayer.sh`: `run-label` の top checkpoint 群を 3人/4人/5人/10人複数 lineup で後評価。第4引数で `run-ranks` を絞れます
- `scripts/rl/bg-list.sh`, `scripts/rl/bg-status.sh`, `scripts/rl/bg-tail.sh`, `scripts/rl/bg-finalize.sh`: バックグラウンド学習の監視補助
- `scripts/rl/bg-watch-summary.sh`, `scripts/rl/bg-experiment-set.sh`: 実行中/比較中ジョブの要約表示
- `scripts/rl/bg-prune.sh`: 停止済みで `summary.json` を持たない stale job の pid/status/cmd を掃除
- `scripts/rl/bg-finalize-top10-multiplayer.sh`: 完走待ち後に top10 多人数後評価まで一発で実行
- `scripts/rl/bg-finalize-experiment-set-top10-multiplayer.sh`: 複数の学習 run を完走待ちし、top10 多人数後評価と run 間比較レポートまで一発で実行
- `scripts/rl/export_model.py`: 学習済み `.npz` の browser 用 export
- `scripts/eval-rl-vs-js.js`: RL と JS CPU の 2 人戦比較
- `scripts/eval-rl-models.js`: 複数モデルの JS 評価ランキング
- `scripts/eval-rl-special-scenarios.js`: RL モデルがテレビ局 / ビジネスセンター / 清掃業 / 引越し屋 / 改装屋などの固定局面で期待 target / pending action を選べるか確認する診断
- `scripts/report-rl-registry.js`: registry の棚卸しレポート出力。評価カバレッジに加えて target head 診断も一覧します。
- `scripts/audit-rl-portfolio.js`: 採用済みモデルの 2人/3人/4人/5人/10人評価カバレッジ監査。target head 診断も含みます。
- `scripts/plan-rl-next-actions.js`: 台帳と監査から次にやる評価・見直し作業を優先順位付きで抽出
- `scripts/review-rl-adoptions.js`: 2人戦候補を weighted score で並べ、現採用モデルと比較すべき challenger を抽出
- `scripts/refresh-rl-ops-reports.js`: registry レポート、portfolio 監査、次アクション、採用候補レビュー、多様性レポートをまとめて `models/rl_model/reports/` に書き出す
- `scripts/update-rl-registry-from-eval.js`: `eval-rl-models` の JSON を registry に追記し、そのままレポート群も更新
- `scripts/rl/TARGET_HEAD_DESIGN.md`: 多人数戦のテレビ局 / ビジネスセンター / 引越し屋 target head の現状棚卸しと導入方針
- `scripts/report-rl-diversity.js`: candidate / adopted モデルを style と topCards 重複で整理し、比較すべきペアを出力
- `scripts/review-rl-multiplayer-topk.js`: top-k 多人数後評価 JSON を、現状は3人/4人総合点+多様性で並べる。5人/10人は評価出力として確認します
- `scripts/review-rl-multiplayer-experiment-set.js`: 複数 run の top10 review JSON を、run 間の総合点+多様性で比較する
- `scripts/summarize-rl-metrics.js`: 学習 metrics の集計
- `scripts/rl/README.md`: RL 系の詳細ドキュメント
- `models/rl_model/registry.json`: 採用候補モデルの台帳（モデル本体は git 管理外）
- `models/rl_model/portfolio/`: 実ゲームで使う配布用 browser JSON
- `models/rl_model/`: 学習済みモデル、評価結果、診断 review の出力先。直下の `*.json` / `*.csv` / `*.md` / `*.review.txt` と `runs/` は原則生成物として git 管理外です。`registry.json`, `portfolio/*.browser.json`, `reports/*` は運用成果物として git 管理します

テスト:

- `tests/run-all.js`: `unit`, `sim`, `all`, `core`, `online`, `pwa`, `release`, `cpu-smoke`, `cpu`, `rl` のテストグループを管理します。実行入口は `npm test` と `npm run test:*` を使ってください。
- `tests/*.test.js`: ルール、サーバー、オンライン、保存、UI、CPU、RL runtime / registry / evaluation scripts を対象別に分けています。新規テストを追加したら `tests/run-all.js` の該当グループにも登録してください。

## オンライン復元の要点

- クライアントは `onlineGameStart` と `onlineActionLog` を `localStorage` に保存します。
- 長時間ゲームでは、サーバーとクライアントの両方が古いアクション列を `stateSnapshot` に圧縮し、差分ログだけを保持します。
- 再接続時は「ゲーム初期化 → snapshot 復元 → 残り actionLog 再生」で状態を再構築します。
- アプリ固有のオンライン失敗通知は Socket.IO 標準の `error` ではなく `appError` イベントで扱います。
- 復元 payload / snapshot の field と互換性確認は [docs/online-restore-schema.md](docs/online-restore-schema.md) にまとめています。
- 変更種別ごとの確認コマンド、2〜10人 / 旧データ互換、JS/Python parity fixture は [docs/maintenance-checklists.md](docs/maintenance-checklists.md) を参照してください。

## デプロイメモ

- Render での稼働を前提にしています。
- Render 環境変数、ntfy、広告 placeholder、PWA、CI のリリース前確認は [`docs/RELEASE_CHECKLIST.md`](./docs/RELEASE_CHECKLIST.md) を参照してください。
- 通知分類、CI失敗、stale client、PWA更新、公開前確認の運用手順は [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) を参照してください。
- AdSense 審査中の変更制限は [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) の `AdSense Review Change Policy` を優先してください。審査中は docs / OGP / 遊び方説明 / unknown通知 / CI失敗 / typo / 静的ページCSS 以外の大きな変更を避けます。
- AdSense 審査提出前の公開 URL 確認は [`docs/ADSENSE_SETUP.md`](./docs/ADSENSE_SETUP.md) を参照してください。
- AdSense 審査中の公開ページはトップページ、[`privacy.html`](./privacy.html)、[`rules.html`](./rules.html) です。トップページと `rules.html` の説明メタは登録不要のプレイを伝え、`privacy.html` の説明メタはエラー通知、AdSense審査、広告の説明を伝えます。`rules.html` は勝利条件と遊び方を公開 URL で確認できる前提です。
- `/api/version` はクライアント/サーバーのビルド差分検知に使います。
- Android 向けには `.github/workflows/build-apk.yml` で TWA APK をビルドします。

## 開発メモ

- `GameManager` がルールの唯一の正です。
- オンライン同期を変えるときは、クライアント送信、サーバー検証、再接続復元、保存状態を必ず一緒に確認してください。
- 定数比較では既存の `CARD_EFFECTS`、`CARD_CATEGORIES`、`LANDMARK_NAMES`、`GAME_PHASES`、`LOG_TYPES` を使ってください。
