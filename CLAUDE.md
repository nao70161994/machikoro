# CLAUDE.md

このファイルは、このリポジトリで Claude Code が最初に参照する入口です。

まずここを読み、詳細はリンク先の文書を参照してください。

## 優先事項

1. ローカル対戦、オンライン同期、再接続復元、保存状態、PWA 更新フローの挙動は一貫させてください。
2. `js/GameManager.js` をルールの唯一の正として扱ってください。
3. オンライン挙動、再接続挙動、CPU の進行タイミングは、確認なしで安易に変えないでください。

## Claude 向けメモ

- このリポジトリは Android + Termux から編集されることが多いです。
- 長いシェルコマンドは端末の折り返しで壊れやすいので、使える場合は既存のラッパースクリプトを優先してください。
- RL の baseline 学習は、フルコマンドを打ち直さず `sh scripts/rl/run-baseline.sh` を使ってください。既定値は Termux 向けにかなり軽量化され、初期評価スキップ、`max_steps` 制限、進捗表示も有効です。出力は `run-label` ごとの別ディレクトリへ分かれます。
- 現行の模倣なし RL 実験は `sh scripts/rl/run-js-oracle-terminal-shaped.sh` を使ってください。JS CPU oracle、終局報酬調整、`self` / `pool` 混合、best checkpoint 復元が有効です。
- 4人用 RL 実験は `sh scripts/rl/run-self-only-4p-h256-lr2e5-5000.sh` を使ってください。`--player-count 4` により `STATE_DIM = 353` の多人数用状態表現を使います。4人用モデルの主評価は `--js-eval-lineups` の4人JS評価です。既存2人モデルは `STATE_DIM = 145` のままです。
- 4人用 RL 変更後は `npm run compare-rl-match-trace -- --python-model models/rl_model/model --js-model models/rl_model/model.browser.json --lineup rl,normal,normal,strong --max-steps 30 --js-cpu-oracle` で Python/JS の固定 trace 比較を行ってください。
- RL 候補モデルは `models/rl_model/registry.json` を参照・更新してください。モデル本体や `runs/` は生成物扱いですが、実ゲームで使う配布用 browser JSON は `models/rl_model/portfolio/` に置きます。2026-05時点では 2人用主採用が `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3`、3〜4人用採用が `self-only-4p-h256-lr1e5-5000-seed103` です。
- `CPU（最強）` は安定したルールベースの基準CPUです。`AI（深層学習・ランダム）` は別系統の学習CPUで、人数別に portfolio からランダム選択します。2人戦は2人用候補、3〜4人戦は多人数候補、5人以上は未対応で `CPU（最強）` を使います。
- 現行 live `CPU（最強）` は `expertPreset: "v2simple"` を使います。既定設定は `build=ev`, `dice=ev`, `reroll=simple`, `it=always`, `tv=simple`, `business=simple`, `cleaning=simple`, `harbor=simple`, `mover=simple`, `renovation=simple`, `combo=core`, `buildTempo=0.05`, `incomeCap=none` です。直近評価は `weak` weighted `93.17%`、`normal` weighted `66.2%`、`strong` weighted `40.4%` です。`strong` の内訳は `duel 67%`, `trio 62%`, `crowd 35%`, `allStrong4 27%` です。`buildGuardMode` は悪化したため削除済みです。
- `strong` 比較は軽量 selfplay 経路を使います。本物 `strong` 同士の `duel 1戦` は、期待値キャッシュと state cache により `12.364秒 -> 4.792秒` まで短縮済みです。追加の安全最適化は複数試しましたが悪化が多く、現時点ではここで打ち止めです。
- 台帳更新後は `npm run validate-rl-registry` と `npm run report-rl-registry` を実行してください。履歴を残すときは `--format markdown --output ...` を使います。report には target head 診断も出ます。
- 採用モデルの評価カバレッジ確認には `npm run audit-rl-portfolio` を使ってください。2人/3人/4人の不足に加えて target head 診断も見えます。
- 次にやるべき再評価・多様性見直しを機械的に出したいときは `npm run plan-rl-next-actions` を使ってください。
- 2人戦の採用候補と現 main の比較対象を固定ルールで出したいときは `npm run review-rl-adoptions` を使ってください。
- 3人/4人戦の自己対戦安定化では `sh scripts/rl/eval-run-top10-multiplayer.sh <run-label> 50` で top checkpoint 群を複数 lineup 後評価し、必要なら第4引数で `run-ranks` を `1,2,3` のように絞ってください。`npm run review-rl-multiplayer-topk -- --input <json>` で総合点+多様性を確認してください。
- バックグラウンド運用では `sh scripts/rl/bg-watch-summary.sh <job>` で進捗要約、`sh scripts/rl/bg-experiment-set.sh <job>...` で比較セット確認、`sh scripts/rl/bg-finalize-top10-multiplayer.sh <job> 15 50` で完走後の多人数後評価まで一発で進められます。複数 run をまとめる場合は `sh scripts/rl/bg-finalize-experiment-set-top10-multiplayer.sh <set-name> <job>...` を使ってください。
- 台帳系レポートを一括更新したいときは `npm run refresh-rl-ops-reports` を使ってください。
- `eval-rl-models` の JSON を registry へ追記してレポートまで更新したいときは `npm run update-rl-registry-from-eval -- --input <json>` を使ってください。
- バックグラウンド学習の stale job 整理は `sh scripts/rl/bg-prune.sh <job|--stale-all>` を使ってください。
- 多様性の重複候補と比較ペアを見たいときは `npm run report-rl-diversity` を使ってください。
- 多人数戦 target head の現状棚卸しと導入方針は `scripts/rl/TARGET_HEAD_DESIGN.md` を参照してください。
- `termux-chroot` が有効でない場合、一部のシェル挙動は通常の Linux デスクトップと異なることがあります。

## 次に読む文書

- リポジトリ全体のルールと責務分担: [AGENTS.md](./AGENTS.md)
- 人間向けの全体概要と主要コマンド: [README.md](./README.md)
- RL 学習・評価・artifact の流れ: [scripts/rl/README.md](./scripts/rl/README.md)
- 多人数戦 target head の設計メモ: [scripts/rl/TARGET_HEAD_DESIGN.md](./scripts/rl/TARGET_HEAD_DESIGN.md)
- 高リスク変更時の手動確認項目: [TESTPLAN.md](./TESTPLAN.md)

## 重要な不変条件

- `index.html` の script 読み込み順は重要です。
- オンライン対戦は決定論的で、ホスト主導です。
- サーバーはアクションを検証・中継しますが、完全なゲーム状態は持ちません。
- 再接続とサーバー再起動後の復元は、例外対応ではなく製品の中核機能です。
- 文字列リテラルではなく、`CARD_EFFECTS`、`CARD_CATEGORIES`、`LANDMARK_NAMES`、`GAME_PHASES`、`LOG_TYPES` など既存定数を使ってください。

## 主な責務の対応

- ルール本体: `js/GameManager.js`
- カード・定数: `js/Card.js`
- 通常 CPU: `js/CPU.js`
- RL CPU ランタイム: `js/RLCPU.js`
- オンラインクライアントの流れ: `js/online.js`, `js/main.js`
- 保存・再接続永続化: `js/storage.js`
- UI / モーダル: `js/ui.js`
- サーバー検証 / ルーム / 復元: `server.js`
- RL 学習・評価フロー: `scripts/rl/*.py`, `scripts/*.js`, `models/rl_model/`

## よく使う確認コマンド

- 全自動テスト: `npm test`
- `CPU（最強）` と `CPU（強）` の基準比較: `sh scripts/eval-cpu-top-tier.sh 50` または `npm run eval-expert-vs-strong -- --games 50`
- `CPU（最強）` の負け筋診断: `npm run diagnose-expert-losses -- --games 8 --profiles duel,trio,crowd`
- `CPU（最強）` v2 の分岐頻度診断: `node scripts/diagnose-expert-v2-branches.js --games 20 --profiles duel,trio,crowd,allStrong4`。build系では貸金業、清掃業、公園、combo payoff readiness、landmark-gated、mall-name、mall spend delay、mall basic low income、red-saturated、ITInvest、Business の発火と flip 可能性を確認します。pending系では `mover` の harmful gift 取り逃しや leader 回避候補を確認します。
- v2simple の直近採用は赤カード相手ターン EV 補正のみです。条件付き赤カードはロール発火時の即時評価では相手の所持コインを上限にし、build EV の購入判断では将来価値として評価します。build EV への追加 red payment cap penalty、IT build bonus / ITInvest、Business Center 補正、高額紫早買い、RedSaturated、貸金業重複 penalty、Cleaning value bonus、Mover leader 回避、PARK bonus、combo payoff not-ready penalty は、発火不足または50戦評価悪化により棄却/診断のみです。landmark-gated は `harbor=0` / `station=0` で実質モール依存のみ、カード名別でも基礎カード/赤カードが主因だったため、全体 penalty は入れない方針です。special spend は20戦で `buildSpecialSpendWouldDelayLandmark=52/1404` ですが、`Penalty05=11/1404` と反転候補が少ないため、special 全体ではなく必要ならカード名別に見ます。
- redOneDie は5戦診断で反転 `0`、businessDelay も5戦 crowd/allStrong4 で `flip05=0` / `flip1=0` だったため、現時点では実装候補に進めません。
- mallBasic は crowd/allStrong4 10戦で `chosen=74/295`, `lowIncome=10/295`、低EV増分は主に `ピザ屋:9` でした。ただしピザ屋限定 penalty 実験は normal50 が維持、strong50 が weighted `53.0%` / min `44.0%` で基準改善なしだったため棄却済みです。
- CPU v2simple の build EV 手書き調整は、直近候補の診断/評価で費用対効果が低いため現採用セットで凍結中です。再開条件は、allStrong4/crowd で明確な `WouldFlip` が出る小変更に限ります。
- `CPU（最強）` の tuning 候補探索: `sh scripts/search-cpu-top-tier.sh 8 5` または `npm run search-expert-top-tier -- --games 8 --top 5`。wrapper は `models/cpu_top_tier_search/` に `.txt/.md/.json` を保存します。
- クライアント 1 ファイルの構文確認: `node --check js/<file>.js`
- RL baseline 学習: `sh scripts/rl/run-baseline.sh`
- 模倣なし RL カリキュラム学習: `sh scripts/rl/run-js-oracle-terminal-shaped.sh --run-label <label>`
- 4人用 RL 自己対戦: `sh scripts/rl/run-self-only-4p-h256-lr2e5-5000.sh --run-label <label>`
- RL と JS CPU の比較: `npm run eval-rl-vs-js -- --model <path>`
- 3人/4人の採用済みモデル評価: `sh scripts/rl/eval-run-3p.sh <model-id> 100`, `sh scripts/rl/eval-run-4p.sh <model-id> 100`, `sh scripts/rl/eval-run-multiplayer.sh <model-id> 100`
- RL 台帳の検証/棚卸し: `npm run validate-rl-registry`, `npm run report-rl-registry`
- RL 採用モデルの評価監査: `npm run audit-rl-portfolio`
- RL 次アクション抽出: `npm run plan-rl-next-actions`
- RL 2人戦採用候補レビュー: `npm run review-rl-adoptions`
- RL 台帳系レポート一括更新: `npm run refresh-rl-ops-reports`
- RL 評価JSONの台帳反映: `npm run update-rl-registry-from-eval -- --input <json>`
- RL 多様性レポート: `npm run report-rl-diversity`
- RL metrics 集計: `npm run summarize-rl-metrics -- --csv models/rl_model/train_metrics.csv`

## 編集時の基本

- ルール、オンラインフロー、再接続、検証、共有ゲーム挙動を変更したら `npm test` を実行してください。
- CPU / self-play / tuning を変更したら、関連する CPU 系テストも追加で実行してください。
- RL ランタイムや学習・評価ツールを変更したら、RL 系テストも追加で実行してください。
- オンラインや再接続を変更したら、[TESTPLAN.md](./TESTPLAN.md) の手動確認項目も見てください。

## RL の位置づけ

- RL は現在 `expert` とは別ラインです。
- 製品方針としては、`CPU（最強）` を安定運用の基準として維持しつつ、`AI（深層学習）` を別系統の学習CPUとして育てる前提です。
- checkpoint の品質判断は `vs_random` だけでなく、JS CPU 評価と summary artefact を主に見てください。
- `normal/strong/expert` 相手の学習は Python heuristic ではなく JS `CPU.js` oracle を優先してください。詳細な報酬設計、相手比率、`js=...` ログの読み方は [scripts/rl/README.md](./scripts/rl/README.md) を参照してください。
