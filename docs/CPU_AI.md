# CPU AI notes

この文書は、`js/CPU.js` を段階的に保守しやすくするためのメモです。
現時点ではコードを分割せず、CPU ロジックをデータ駆動化する順番を固定します。

## 現状の責務

`js/CPU.js` は次の責務を同時に持っています。

- 難易度別の行動選択
- カード購入評価
- ランドマーク購入評価
- dice / reroll / harbor の判断
- pending action の対象選択
- expert tuning preset
- self-play / simulation 向けの評価補助
- RL / 診断スクリプトから使われる oracle 的な判断

最大のリスクは、ゲームルールとカード知識を CPU が独自に複製していることです。
新カード追加時は、ゲーム本体が正しくても CPU 評価が追従しない可能性があります。

## 変更しない前提

- `GameManager` がルール正本であることは維持する。
- CPU はルールを実行せず、期待値や優先度を推定する補助層に留める。
- expert tuning の数値は一括で動かさない。
- RL runtime と JS CPU oracle の互換性を壊さない。

## 分離したい知識

### Card effect value

現在は `evalCard()`, `_cardActivationValue()`, `_cardSelfIncomeValue()` が effect ごとの価値を別々に持っています。
将来的には、`CARD_EFFECT_METADATA` に以下を持たせ、CPU はそれを読む形にします。

- `cpuKind`: `income`, `steal`, `combo`, `interactive`, `upkeep`
- `targetScope`: `self`, `current`, `opponents`, `all`
- `requires`: landmark、dice、landmark count など
- `estimate`: 純粋な期待値関数または既存 helper 名

### Combo knowledge

現在は `牧場`, `森林`, `鉱山`, `花畑`, `ブドウ園` などの名前でコンボを判断しています。
今後はカード定義側へ寄せます。

候補 metadata:

```js
{
    id: "cheese_factory",
    synergyInputs: ["livestock"],
    synergyOutputs: ["factory_payoff"],
}
```

CPU は card name ではなく `tags`, `provides`, `synergyInputs` を見ます。

### Landmark urgency

ランドマーク優先度は `LANDMARK_NAMES` ごとの分岐が多く、追加時の追従漏れが起きやすい領域です。
まず `Player._LANDMARK_DEFS` に CPU 用 hint を足せる形へ準備します。

候補 metadata:

- `cpuBaseUrgency`
- `cpuUnlocks`: dice, mallIncome, harborCards, reroll, extraTurn, skipIncome
- `requires`: station など

## 段階的な分割順

### Step 1: CPU docs and tests first

- 現在の判断入口を文書化する。
- card effect 追加時に見る CPU 関数を `docs/CARD_SYSTEM.md` に固定する。
- 既存 CPU tests を守りに使う。

### Step 2: table addition without behavior change

- `CARD_EFFECT_METADATA` に CPU 分類だけ追加する。
- 既存 CPU 分岐はまだ残す。
- metadata の網羅性 test を追加する。

### Step 3: combo hints migration

- 名前ベースの combo 判定を、カード定義の tag / synergy 参照へ一部置換する。
- 最初は `CHEESE`, `FURNITURE`, `FLOWER`, `WINERY` のような明確な依存だけに絞る。

### Step 4: effect value dispatch

- `_cardActivationValue()` と `_cardSelfIncomeValue()` の副作用なし income 系だけ dispatch table に寄せる。
- pending / interactive 系は後回しにする。

### Step 5: strategy preset separation

- expert tuning preset と実行ロジックを分ける。
- tuning table は JS object のまま維持し、外部 JSON 化は必要になるまでしない。


## RL state/action schema v2 方針

PR-033 時点では既存モデル互換を優先し、実際の state/action 次元は変更しません。代わりに JS runtime と Python encoder の両方で schema identifier を公開し、次の移行で checkpoint / portfolio / trace 比較がどの表現を使ったかを明示できるようにします。

現行互換 schema:

- `state-2p-v1`: 2人用 `STATE_DIM = 145`。既存2人モデルの互換表現。
- `state-mp-v1`: 3人以上用 `STATE_DIM = 353`。自分 + 脅威度上位3人へ射影する現行多人数表現。
- `action-flat-v1`: 既存の flat action space。Business は `giveCard * NUM_CARDS + takeCard` を1 actionへ畳み込む。
- `action-factored-business-target-v2-draft`: draft identifier。Business の相手選択、渡すカード、奪うカードを分ける将来 schema 用で、現時点では学習・推論には使わない。実行時 `RLCPU` はこの action schema を明示的に拒否する。

次に v2 を実装する場合の制約:

- export 済みモデルは `stateSchema` / `actionSchema` 未指定なら既存 v1 として扱う。
- 新 schema は checkpoint metadata、browser JSON、registry に同じ文字列で記録する。
- Python/JS trace 比較は schema mismatch を失敗として扱う。
- Browser runtime は `stateDim` から期待される state schema と metadata が一致しない model JSON を拒否する。
- Business factorization はまず target head 付き多人数モデルだけで試し、2人用 portfolio とは別 lineage にする。
- overflow feature は既存の clipped count を置き換えず、`count > cap` や `extra / cap` の追加特徴として足す。

## 確認コマンド

CPU 周辺を触ったら、最低限以下を実行します。

```sh
node --check js/CPU.js
npm run test:cpu
```

カード効果や共有ルールに触った場合は以下も実行します。

```sh
node --check js/Card.js
node --check js/GameManager.js
npm test
```

RL oracle や多人数評価に影響する場合は、対象に応じて `npm run test:rl` と trace 比較も検討します。

## 難易度カーブと回帰gate

- `npm run test:cpu-difficulty-smoke` はPRごとに4/8/10人、複数seed、同一seed・全席ローテーションを軽く実行する。打切りとwindow時間をfail closedにし、勝率差と95%区間はartifactへ残す。
- `npm run test:cpu-difficulty-weekly` は2〜10人を十分なblock数で実行し、特に8/9/10人の大人数も含めて`normal → strong → expert` のpaired差分を片側95%非劣性gateとして判定する。artifactには比較用の両側95%区間も残す。
- paired評価は同じseed・同じ元席の勝敗を比較する。単純な総勝率だけで採否を決めない。
- 2〜10人の代表局面はCPU unit/pending matrix、実対局相当はself-play artifact、オンライン決定性はcanonical action/replay testsで分けて確認する。
- `strong` / `expert` の行動多様性は、最高評価との差がdifficulty別の小さな閾値以内にある合法建設候補だけを盤面署名由来の安定seedで選ぶ。action payloadへseedやscoreは追加しない。
- live 4/5人戦の`expert`はpaired評価で確認したstrong crowdの建設・出目方針を使い、pending解決などexpert固有の判断は維持する。学習・診断用expertには適用しない。
- live 3人戦の`strong`はpaired評価で確認したnormal coreの建設・出目方針を使い、strong固有のpending判断は維持する。学習・診断用strongには適用しない。
- CPUの説明は判断器が記録したreason codeと実測値だけをsidecarで表示する。canonical action、保存、online wire、replayには診断値を混ぜない。


## CPU diagnostics helper

2026-05-19: `js/cpuDiagnostics.js` を追加し、`CPU.js` の profile / trace 集計処理を分離した。CPU の評価式や行動選択は引き続き `CPU.js` が正本で、diagnostics helper は `profileStats` / `expertTraceStats` の集計だけを担当する。
