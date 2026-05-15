# Card system notes

この文書は、新カード・新ランドマーク・新ルールを小さく追加するための現状整理と移行方針です。
現時点では挙動を変えず、`js/Card.js`, `js/GameManager.js`, `js/Player.js`, `js/CPU.js` の責務と追従箇所を明示します。

## 現在の正本

- カード定義: `js/Card.js`
- 効果定数: `CARD_EFFECTS`
- 分類定数: `CARD_CATEGORIES`
- 安定ID: `CARD_IDS`, `CARD_NAME_BY_ID`
- effect 分類 metadata: `CARD_EFFECT_METADATA`
- 実ルール: `js/GameManager.js`
- ランドマーク定義: `js/Player.js`
- CPU 評価: `js/CPU.js`
- オンライン検証 / replay: `server.js`
- UI 表示 / 建設メニュー: `js/ui.js`

`GameManager` はゲームルールの正本です。
CPU と UI は `GameManager` の挙動を予測または表示する補助層として扱い、ルールを独自に増やさない方針にします。

## 新カード追加時の現状チェックリスト

1. `js/Card.js`
    - `CARD_IDS`, `CARD_NAME_BY_ID`, `CARD_ID_BY_NAME` に安定IDと表示名を追加する。
    - `CARD_EFFECTS` に effect を追加する。既存 effect を使う場合も `CARD_EFFECT_METADATA` の分類が合っているか確認する。
    - `CARDS` にカードを追加する。
    - `CARD_EFFECT_DESCRIPTIONS` に説明文を追加する。
    - 新 effect の場合は `CARD_EFFECT_METADATA` に `timing`, `targetScope`, `cpuKind` を追加する。
2. `js/GameManager.js`
    - 色別発火順に合う場所へ実ルールを追加する。
    - 副作用なし収入なら `GameManager.calcCardIncome()` の共有化を優先する。
    - 選択式効果なら pending 状態と resolver を追加する。
3. `js/CPU.js`
    - `evalCard()`, `_cardActivationValue()`, `_cardSelfIncomeValue()` の追従漏れを確認する。
    - コンボや依存カードがある場合は、名前ベースの補正箇所も確認する。
4. `js/ui.js` / `js/main.js`
    - pending UI、建設可能判定、CPU action 経路に追加 UI が必要か確認する。
5. `server.js`
    - オンライン action payload と allowed action 検証に新 action が必要か確認する。
6. `tests/`
    - ルール発火、CPU 評価、オンライン replay に影響する場合は targeted test を追加する。

## Effect 分類

### 金額計算 dispatch 対象

最初に dispatch table 化しやすい分類です。ここでは「金額を返す純粋計算」だけを共有し、休業や pending 追加などの副作用は含めません。

- `NORMAL`
- `CHEESE`
- `FURNITURE`
- `MARKET`
- `FLOWER`
- `FOODWAREHOUSE`
- `FEWLANDMARK`
- `CORNFIELD`
- `DRINKFACTORY`
- `WINERY`（金額計算のみ。発動後の休業は発火処理側で行う）

`GameManager.calcCardIncome()` は `CARD_INCOME_EFFECT_HANDLERS` を通して金額計算を共有します。CPU も `GameManager.calcCardIncome()` を参照するため、単純な収入計算はルール本体と CPU 評価のズレを減らせます。

`CARD_INCOME_EFFECT_HANDLERS` は金額計算だけを担当します。`WINERY` の休業、pending の追加、coin transfer の実行などの副作用は含めません。新しい単純収入 effect を追加する場合は、`CARD_EFFECT_METADATA` と `CARD_INCOME_EFFECT_HANDLERS` の両方へ追加してください。

### 条件付き income / steal

発火条件や対象の財布に依存するため、純粋な income table とは分けます。

- `HARBOR`
- `HARBOR_RED`
- `TUNA`
- `FRENCHR`
- `MEMBERBAR`
- `STADIUM`
- `PUBLISHER`
- `TAXOFFICE`
- `ITSTARTUP`
- `PARK`

これらは `CARD_EFFECT_METADATA` の `requires`, `targetScope`, `cpuKind` を入口にし、必要なら `coinTransfer` などの追加 metadata を足すと CPU と説明文の追従漏れを減らせます。

### Pending / interactive

UI、CPU、online action schema まで波及する高リスク分類です。

- `TV`
- `BUSINESS`
- `CLEANING`
- `MOVER`
- `RENOVATION`
- `ITSTARTUP`

現状は `pendingTV`, `pendingBusiness`, `pendingCleaning`, `pendingMover`, `pendingRenovation`, `pendingIT` の個別 state で管理されています。
新しい interactive 効果を追加する前に、`pendingActions = [{ type, sourceCardId, count, payload }]` の薄い queue へ段階移行するのが安全です。

### Build-time / upkeep

建設時や特定ダイス後に処理するため、通常のカード発火順から独立しています。

- `LOAN`

同種のカードを増やす場合は、`onBuild` と `afterIncome` の hook として扱うと分岐が増えにくくなります。

## Magic string / number の現状リスク

カード名による依存が残っています。

- `牧場`, `森林`, `鉱山`, `花畑`, `ブドウ園`
- `パン屋`, `コンビニ`, `食品倉庫`, `改装屋`, `ピザ屋`, `バーガーショップ`, `寿司屋`

これらは CPU の戦略補正と GameManager の収入計算に散っています。
カード名のまま増やすと、名前変更や同系統カード追加時に追従漏れが起きます。

段階的には、既に追加済みの `CARD_IDS` / `CARD_NAME_BY_ID` を足場にして、次にカード定義へ以下のような補助情報を追加します。

```js
{
    id: "wheat_field",
    name: "麦畑",
    tags: ["farm"],
    provides: ["farm_income_source"],
}
```

効果側は `card.name` ではなく `tags` / `provides` を見るようにします。

## ランドマーク追加時の現状チェックリスト

1. `js/Player.js`
    - `LANDMARK_NAMES` と `Player._LANDMARK_DEFS` に追加する。
2. `js/GameManager.js`
    - dice / roll / build / nextTurn のどこに hook するか確認する。
3. `js/CPU.js`
    - urgency、購入優先度、行動評価に追加する。
4. `js/ui.js`, `js/storage.js`, `server.js`
    - 表示、保存、オンライン検証が未知ランドマークを拒否しないか確認する。
5. `tests/`
    - 勝利条件、有効ランドマーク選択、オンライン snapshot 復元を確認する。

## 段階的改善案

### Step 1: データの名前を安定化する

- `CARD_IDS`, `CARD_NAME_BY_ID`, `CARD_ID_BY_NAME` は追加済み。
- `Card` は stable `id` を保持し、`cloneCard()` と `createCardById()` でも維持する。
- `Card` constructor は互換を維持しているため、内部定義の object 化は後続 PR で行う。

### Step 2: effect metadata を追加する

処理は変えず、`js/Card.js` に分類情報を追加済みです。今後はこの metadata を参照する側を小さく増やします。

- `timing`: `income`, `pending`, `build`, `turnEnd`
- `targetScope`: `self`, `current`, `opponent`, `opponents`, `all`
- `requires`: `harbor`, `landmarkCount`, `dice`
- `cpuKind`: `income`, `comboIncome`, `conditionalIncome`, `steal`, `conditionalSteal`, `interactive`, `upkeep`, `redistribute`
- `triggers`: `onBuild`, `afterIncome`, `turnEndPrompt`。`LOAN` と `ITSTARTUP` のような複合 effect だけが使います。

### Step 3: 副作用なし income を dispatch table 化する

`GameManager.calcCardIncome()` は `CARD_INCOME_EFFECT_HANDLERS` による table dispatch へ移行済みです。
この table は `card, owner, game` を受け取り、数値だけを返します。pending 系や coin transfer 系、休業などの副作用は引き続き発火処理側に残します。

### Step 4: pending action queue を導入する

既存の個別 pending field をすぐ消さず、まず共通 helper を追加します。

- `_hasPendingActions()`
- `_addPendingAction(type, payload)`
- `_resolvePendingAction(type)`

テストが揃った後に個別 field を置換します。

### Step 5: CPU が metadata を読む

CPU の手書き補正を残したまま、依存関係と effect 分類だけ metadata 参照へ寄せます。
特に combo 情報は `synergyInputs` / `synergyOutputs` としてカード定義側へ移すと、新カード追加時の確認箇所が減ります。

## Metadata の現在の限界

`CARD_EFFECT_METADATA` は effect 単位の分類です。`NORMAL` はカード色によって青/緑の収入にも赤の steal にもなるため、最終的な発火分類は card color と組み合わせて判断します。`ITSTARTUP` と `LOAN` は複合 effect の漏れを避けるため `triggers` を持ちますが、dispatch 本体はまだ既存の `GameManager` ルール処理に残しています。後続 PR では `comboSource` などを足して段階的に精密化します。

## 変更時の確認コマンド

- `node --check js/Card.js`
- `node tests/gamemanager.test.js`
- `node --check js/GameManager.js`
- `node --check js/Player.js`
- `node --check js/CPU.js`
- `npm run test:cpu`
- `npm test`

オンライン action や pending UI に触った場合は `npm run test:online` も実行します。
