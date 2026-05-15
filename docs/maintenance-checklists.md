# Maintenance Checklists

低リスク変更でも、オンライン復元・多人数 RL・PWA は影響範囲が広いです。この表は「どの変更で何を最低限確認するか」を素早く決めるための入口です。

## ドキュメント入口

| 知りたいこと | 見る場所 |
| --- | --- |
| 高リスク変更の手動確認手順 | [`TESTPLAN.md`](../TESTPLAN.md) |
| 段階的な保守改善計画 | [`docs/REFACTOR_PLAN.md`](REFACTOR_PLAN.md) |
| Phase 1 棚卸し / 重複・未使用候補 | [`docs/PHASE1_INVENTORY.md`](PHASE1_INVENTORY.md) |
| 現在の責務境界 / 状態遷移 / online invariant | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) |
| 新カード / 新ランドマーク追加時の追従箇所 | [`docs/CARD_SYSTEM.md`](CARD_SYSTEM.md) |
| CPU ロジックの分割・データ駆動化方針 | [`docs/CPU_AI.md`](CPU_AI.md) |
| オンライン同期設計 / room lifecycle | [`docs/ONLINE_SYNC.md`](ONLINE_SYNC.md) |
| 変更種別ごとの自動確認 / 追加確認 | このファイルの「変更種別別テストコマンド」 |
| オンライン復元の保存形式 / schema 互換 | [`docs/online-restore-schema.md`](online-restore-schema.md) |
| RL 学習・評価フロー / artifact 運用 | [`scripts/rl/README.md`](../scripts/rl/README.md) |
| `CPU（最強）` v2simple の診断・凍結理由 | [`docs/expert-v2-diagnostics.md`](expert-v2-diagnostics.md) |

## Termux / スマホでの軽量確認

短時間で構文と主要回帰を見る場合は、まず次を実行します。

```bash
npm run test:static
npm run test:smoke
```

`test:static` は JS / JSON / shell の構文と parse を確認します。`test:smoke` は static に加えて core / online の主要回帰を実行します。PWA 変更時は続けて `npm run test:pwa` を実行してください。

## 変更種別別テストコマンド

| 変更種別 | 最低限の自動確認 | 追加確認 |
| --- | --- | --- |
| ドキュメントのみ | `git diff --check -- <files>` | リンク先とコマンド名が現行 `package.json` と一致するか見る。 |
| まず壊れていないか短時間で見る | `npm run test:static` | Termux で重い suite の前に、JS / JSON / shell の構文崩れを先に潰す。 |
| 主要回帰をまとめて見る | `npm run test:smoke` | static + core + online。ルールとオンライン同期の入口確認に使う。 |
| `server.js` のみ | `node --check server.js` | ルーム / 復元 / 検証に触る場合は `node tests/server.test.js`。 |
| `js/*.js` クライアント | `node --check js/<file>.js` | ルール・保存・オンラインに触る場合は該当 Node test。 |
| ルール / フェーズ | `npm run test:core` | 共有挙動まで広く見る場合は `npm test`。pending action と Undo は `TESTPLAN.md` の該当項目も見る。 |
| オンライン同期 / 再接続 | `npm run test:online` | 共有挙動まで広く見る場合は `npm test`。手動で部屋作成、参加、再接続、ホスト移譲またはサーバー再起動復元、CPU 手番、Undo 同期。 |
| 保存 / localStorage | `node tests/storage.test.js` | online restore schema を変えた場合は `docs/online-restore-schema.md` も更新。 |
| CPU 判断 | `npm run test:cpu` | 速く切り分ける場合は `node tests/cpu.test.js`。 |
| RL runtime / export | `npm run test:rl` | 速く切り分ける場合は `node tests/rlcpu.test.js`、parity 確認は `node tests/rl-match-trace.test.js`。 |
| RL 学習 / 評価 scripts | `npm run test:rl` | 速く切り分ける場合は `node tests/rl-train.test.js`、評価系は `node tests/eval-rl-vs-js.test.js`, `node tests/eval-rl-models.test.js`。 |
| RL registry / portfolio | `npm run validate-rl-registry` | `npm run audit-rl-portfolio` で role 別に期待される 2p / 3p / 4p / 5p / 10p の評価カバレッジも見る。`missing` は 2人専用 / 多人数用の role と照合して判断する。`npm run report-rl-registry` も併用。 |
| PWA / Service Worker | `npm run test:pwa` | 実ブラウザで更新通知、ゲーム中 reload 抑止、タイトル画面自動適用、オフライン表示。 |
| Android / TWA workflow | YAML 差分確認 | GitHub Actions 手動実行で artifact 失敗検知。 |

## Online Restore Compatibility

復元 schema 変更時は、次の観点を一つずつ潰してください。保存形式の詳細は `docs/online-restore-schema.md` にまとめています。

| 観点 | チェック |
| --- | --- |
| schema gate | `onlineGameStart.schemaVersion` が古い場合、復元送信せず保存データを破棄する。 |
| snapshot 欠落 | 旧 snapshot に optional pending field が無くても既定値で復元できる。 |
| snapshot 破損 | 壊れた `onlineStateSnapshot` は復元全体を巻き込まず null として扱う。 |
| validation 拒否 | 無効化カードの在庫復元、重複 `dormantIndices`、小数 `coins` を拒否する。 |
| 旧 field 補完 | 欠落した landmark key、`dormantIndices`、IT/役所 field、pending field は既定値で復元する。 |
| action replay | snapshot 後の action だけが replay され、畳み込み済み action を二重適用しない。 |
| pending action | ack 前 action は `clientActionId` / `seq` で重複排除される。 |
| shuffled order | `playerOrder` がある場合、original index と server-side index を混同しない。 |
| host restore race | `hostEpoch` / `actionSeq` が古い recreate payload による巻き戻しを防ぐ。 |
| undo | `undoState` が valid な場合だけ復元される。client 由来 snapshot は invalid `undoState` を null 化し、server 保持済み snapshot / mirror validation では invalid `undoState` を含む snapshot 全体を拒否する。 |
| app error | 復元失敗通知は `appError` 経由で、transport `error` と混ぜない。 |

## 2〜10人 / 旧データ互換チェックリスト

多人数対応は「モデル入力は固定長、実ゲーム人数は可変」という前提です。2人用旧モデル (`STATE_DIM = 145`) と多人数モデル (`STATE_DIM = 353`) の互換性を崩さないでください。

| 観点 | チェック |
| --- | --- |
| 2人旧モデル | 既存 `STATE_DIM = 145` の browser JSON を読み込める。 |
| 3〜10人モデル | `STATE_DIM = 353` の browser JSON を読み込める。 |
| 2〜10人ランダム学習 | 範囲に3人以上が含まれる場合、2人戦も多人数表現として扱う。 |
| 5人以上射影 | runtime と学習側の両方で `自分 + 脅威度上位3人` の4枠固定へ射影する。 |
| target head なし | 旧 checkpoint は target head が無くても JS fallback で停止しない。 |
| target head あり | Python checkpoint 内部名 `tv_target` / `bc_target` / `mover_target` と、browser export / JS 側の `tvTargetHead` / `businessTargetHead` / `moverTargetHead` の対応が同じ意味になる。 |
| lineups | 2p / 3p / 4p / 5p / 10p を分けて評価し、2人評価だけで採用判断しない。 |
| registry | 採用候補は `models/rl_model/registry.json` に記録し、50戦未満は smoke / 足切り扱いにする。 |

推奨 smoke:

```sh
npm run compare-rl-match-trace -- \
  --python-model models/rl_model/model \
  --js-model models/rl_model/model.browser.json \
  --lineup rl,normal,normal,strong \
  --max-steps 30 \
  --js-cpu-oracle
```

## JS/Python Parity Fixture

`compare-rl-match-trace` は、同じモデル、同じ lineup、同じ deterministic rolls で Python 環境と JS runtime の trace を比較します。主目的は「勝率」ではなく、最初にズレた step の state / legal actions / chosen action を見つけることです。

使い分け:

- `--python-model` は `.npz` checkpoint の base path を渡す。
- `--js-model` は browser export 済み JSON を渡す。
- `--lineup` に `rl` を含めると多人数構成を固定できる。
- `--rolls` を渡すと、seed 由来ではなく明示した出目列を使える。
- `--js-cpu-oracle` は Python 側の相手行動も JS `CPU.js` oracle に寄せる。

ズレた場合の見方:

- `before` が違う場合、前 step の apply / reward side effect / dormant handling を疑う。
- `legalActions` が違う場合、action mask、phase、pending count、在庫、ランドマーク条件を疑う。
- `chosenAction` だけ違う場合、model export、target head、fallback heuristic、tie-break を疑う。
- `after` が違う場合、同じ action のルール適用差分を疑う。

## TESTPLAN 整理メモ

`TESTPLAN.md` は手動確認の正本として残し、自動確認や schema 詳細は docs に寄せます。手動確認項目はカテゴリ見出し付きで並べ、ここからは変更種別別の自動確認や補助 fixture へ誘導します。新しい手動項目を追加する場合は、次の順で置くと探しやすいです。

1. ゲームルール / カード効果
2. オンライン同期 / 再接続 / 保存
3. CPU / RL
4. PWA / install / version mismatch
5. 保存 / 再接続 UI
6. CI / Android packaging

項目内では「自動確認」「手動確認」「操作」「期待結果」を分け、実ブラウザ依存の理由があるものだけ手動確認として残してください。
