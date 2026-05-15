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
