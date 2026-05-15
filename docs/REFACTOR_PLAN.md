# Refactor plan

この文書は、街コロプロジェクトの保守性・拡張性・可読性を上げるための段階的な計画です。
目的は全面書き換えではなく、新カード・新ランドマーク・新ルール・オンライン同期修正を小さく安全に追加できる構造へ寄せることです。

## 方針

- 既存挙動を壊さないため、ルール本体・オンライン同期・CPU 評価・UI 分離を同時に大きく動かさない。
- 変更前に対象ファイルを読み、変更後に `node --check` と該当テストを通す。
- スマホ / Termux でも追いやすいように、巨大な生成物や重い手順を前提にしない。
- AI が途中参加しやすいように、責務境界・状態遷移・カード追加手順を文書化してから実装を薄く分ける。

## 現状の主な保守リスク

### 1. CPU が最大の God Object

`js/CPU.js` は 4600 行超で、通常 CPU、強い CPU、expert tuning、評価関数、シミュレーション補助、診断向けの分岐が同居している。
新カード追加時に CPU 評価の追従漏れが起きやすく、自己対戦や診断スクリプトの意図も読み取りづらい。

小さな改善候補:

- CPU 評価の設定値を `CPU` クラス本体から段階的に table 化する。
- カード効果別の評価関数を `CARD_EFFECTS` key の dispatch table へ寄せる。
- expert preset / tuning と実行ロジックを分け、診断スクリプトからも同じ table を読む。

### 2. Card effect の知識が複数箇所に散っている

`js/Card.js` の `CARD_EFFECTS` / 説明文、`js/GameManager.js` の実ルール、`js/CPU.js` の評価、`server.js` の action 検証、UI の表示がそれぞれ effect を知っている。
新カード追加時の修正箇所が増え、特に CPU とオンライン replay 検証の追従漏れが起きやすい。

小さな改善候補:

- まず `CARD_SYSTEM.md` を作り、現時点の「カード追加時に触る場所」を固定する。
- `GameManager.calcCardIncome` のような共有化済みの純粋関数を増やす。
- 副作用なしの income effect と pending / transfer / dormant など副作用あり effect を分類する metadata を追加する。
- 分類 metadata を CPU 評価・説明文・テスト生成の足場として使う。

### 3. Phase / turn 処理が GameManager と main にまたがる

`js/GameManager.js` はルールの正本だが、`js/main.js` にフェーズごとの人間入力、CPU scheduling、オンライン action 送信、auto skip がある。
状態遷移が読みにくく、オンラインでは「ローカルで実行してよい処理」と「サーバー承認を待つ処理」の見分けが難しい。

小さな改善候補:

- `GAME_PHASES` ごとの許可 action 一覧を文書化する。
- server 側 `getAllowedActions` と client 側 button / CPU の gate を同じ表現に近づける。
- TurnManager 導入前に、純粋な `phase -> allowed actions` helper を追加してテストする。

### 4. オンライン同期は重要だが責務が重い

`server.js` は room 管理、検証、mirror replay、snapshot compaction、recreate、host 移譲をまとめて扱っている。
`js/online.js` は socket event、action replay、snapshot 保存、再接続、復元送信を同時に担っている。
実害バグを避けるため、分割は server authority の方針を整理してから行う必要がある。

小さな改善候補:

- `ONLINE_SYNC.md` を作り、authoritative なものと client-local なものを明文化する。
- server の room lifecycle と restore rank 比較を小さな純粋関数へ寄せる。
- `appError` event と transport error の使い分けを維持したまま、payload schema を文書化する。

### 5. UI は inline handler と HTML 生成文字列が多い

`index.html` と `js/ui.js` には `onclick` / `onchange` / `innerHTML` ベースの UI が多い。
現状の browser-global 構成では自然だが、スマホ UI 改善や component 分離を進めるときに差分が大きくなりやすい。

小さな改善候補:

- まず title / online / game / modal の DOM id と担当関数を文書化する。
- 新規 UI から `addEventListener` 初期化へ寄せ、既存 inline handler はまとめて移動しない。
- card rendering は `renderCardButton` のような小単位 helper へ切り出す。

### 6. console 出力は用途が混在している

server の運用ログ、CLI script の結果出力、test runner の成功表示がすべて `console.*` で grep に出る。
削除すべきログと維持すべき CLI 出力を区別しづらい。

小さな改善候補:

- server runtime log は `logServerEvent()` へ薄く集約する。
- CLI scripts の `console.log` は出力仕様として維持する。
- tests の console hook はテスト補助として扱い、未使用ログ検出から除外する。

## Phase 1: 解析と足場作り

優先順:

1. `docs/REFACTOR_PLAN.md` で段階的な方針を固定する。
2. `docs/ARCHITECTURE.md` に現状の責務境界と script 読み込み順を書く。
3. `docs/CARD_SYSTEM.md` にカード追加時の修正箇所と effect 分類を書く。
4. `docs/ONLINE_SYNC.md` に room lifecycle / snapshot / action log / host 権限を書く。
5. console / TODO / 巨大ファイル / inline handler の棚卸しを保守メモとして残す。

Phase 1 では、実装の大移動はしない。後続 Phase のために、どこから小さく切れるかを見える状態にする。

## Phase 1 inventory snapshot

2026-05-16 時点の軽量棚卸しです。削除や分割はまだ行わず、後続 PR の入力として扱います。

- TODO / FIXME: project files では実質なし。`docs/REFACTOR_PLAN.md` 自身の棚卸し項目だけが該当します。
- runtime console: `js/main.js` に crash 表示用の `console.error`、`server.js` に起動・room lifecycle・例外ログがあります。まず server runtime log を薄い helper に寄せる候補です。
- CLI / tests console: `scripts/` と `tests/` の `console.log` は出力仕様または test hook なので、runtime log 整理とは分けます。
- inline handlers: `index.html` に `onclick` / `onchange` が多数あり、`js/ui.js` も `innerHTML` 生成文字列内の handler に依存しています。UI 分割時は新規・変更箇所から `addEventListener` へ寄せます。
- 巨大ファイル: `js/CPU.js` が最大で、card effect 評価、戦略 table、simulation 補助が同居しています。最初の分割候補は card metadata 参照と CPU tuning table の分離です。

## Phase 2: Card / effect system

目的:

- 新カード1枚追加に必要な確認箇所を減らす。
- effect 処理と CPU 評価の追従漏れを減らす。

候補 PR:

1. effect metadata table を `js/Card.js` に追加する。
2. 副作用なし income effect の dispatch table を `GameManager` へ導入する。
3. CPU の card activation value を同じ分類 table へ寄せる。
4. card effect ごとの regression test template を追加する。

## Phase 3: Turn / phase management

目的:

- フェーズ遷移と許可 action を明確にする。
- online / local / CPU で gate がずれないようにする。

候補 PR:

1. `GAME_PHASES` ごとの allowed action helper を追加する。
2. server の `getAllowedActions` と client gate の重複を減らす。
3. TurnManager 導入前に phase transition tests を増やす。

2026-05-16 実施済み:

- `js/GameManager.js` に `GAME_ACTIONS`, `GAME_PHASE_ACTIONS`, `GameManager.allowedActionsFor(game)` を追加した。
- `server.js` の `getAllowedActions(game)` は `GameManager.allowedActionsFor(game)` の薄い wrapper に寄せた。
- `js/main.js` の人間入力は `canRunHumanAction(action)` で現在 phase / pending に対して許可された action だけを送る。
- `tests/gamemanager.test.js`, `tests/server.test.js`, `tests/main.test.js` で phase/action gate と stale UI 操作を固定した。

## Phase 4: Online sync

目的:

- room lifecycle と restore の失敗モードを見つけやすくする。
- server authority を明確にし、client snapshot は復元補助として扱う。

候補 PR:

1. restore rank / hostEpoch / actionSeq 比較を helper 化する。
2. socket payload schema を docs と tests に固定する。
3. room lifecycle の server test を scenario ごとに分ける。

2026-05-16 実施済み:

- `server.js` に `validateActionPayloadForState()` を追加し、live action と replay action の payload 判定を server 内で共有した。
- actor 権限、phase gate、server mirror replay は既存責務のまま残し、client/server 共通 validator への拡大はまだ行っていない。
- build / landmark / TV payload helper をテストで直接固定し、再接続 replay 側も同じ判定を使うようにした。

## Phase 5: UI component split

目的:

- `index.html` と `js/ui.js` の変更範囲を狭める。
- スマホでのカード表示・スクロール・オンライン画面の調整を小さく行えるようにする。

候補 PR:

1. card button rendering helper を切り出す。
2. pending modal rendering を effect ごとに分ける。
3. 新規または触る UI から `addEventListener` 初期化に寄せる。

2026-05-16 実施済み:

- `js/ui.js` の建設メニューから `renderBuildCardButton()` と `renderLandmarkBuildButton()` を切り出した。
- 既存の browser-global / inline handler 方針は維持し、HTML 生成の責務だけを小さく分けた。
- `tests/ui.test.js` で施設カードとランドマークボタンの生成 HTML を固定した。

## Phase 6: Tests and AI-readable docs

目的:

- AI / 人間が数分で構造を理解できる入口を作る。
- 追加機能の回帰確認を迷わず実行できるようにする。

候補 PR:

1. `docs/ARCHITECTURE.md`
2. `docs/CARD_SYSTEM.md`
3. `docs/CPU_AI.md`
4. `docs/ONLINE_SYNC.md`
5. 新カード追加チェックリスト
6. `npm run test:*` の使い分け早見表
