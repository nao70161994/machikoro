# Expert v2 Diagnostics

このメモは live `CPU（最強）` の `expertPreset: "v2simple"` に関する診断履歴です。
巨大な生ログは残さず、採用・却下・保留の判断材料だけを残します。

## 現行ルール

- `build=ev`
- `dice=ev`
- `reroll=simple`
- `it=always`
- `tv=simple`
- `business=simple`
- `cleaning=simple`
- `harbor=simple`
- `mover=simple`
- `renovation=simple`
- `combo=core`
- `buildTempo=0.05`
- `incomeCap=none`

ランドマークを買える場合はランドマークを買います。ランドマークを買えない場合は build EV でカードを選びます。パス追加や広いカード禁止は採用しません。

## 採用済み

- 赤カード相手ターン EV 補正
  - `redOpponentTurnBonus = min(1, opponentTurnEv * 0.25)` を build EV に薄く加点します。
  - 条件付き赤カードは、発火時の即時評価では相手の所持コインを上限にし、build EV では将来価値として評価します。

## 却下済み

- `buildGuardMode`
  - broad な guard は勝率を悪化させたため削除済みです。
- broad portfolio / broad build bonus
  - 一律加点では改善が安定しませんでした。
- `v3portfolio-no-corn +0.4`
  - `portfolioEffective` 診断は残していますが、一律実装は見送りました。
- Cleaning value bonus
  - 価値ベースの対象選択は smoke 評価で悪化しました。
- Business Center scored exchange
  - normal は少し改善した一方、strong 側が悪化したため戻しました。
- Roll/race guard
  - 赤/青リスクは多いものの、実際に判断反転する候補が薄いため実装していません。
- Finish/special spend guard
  - 100戦の loss 診断で `finishStrictDelay` は `crowd=4`, `allStrong4=3` と薄く、実装候補に届きませんでした。
- Basic duplicate low-output penalty
  - 50戦の branch 診断で基本カード重複は `chosen=170/1526` と多い一方、`deltaEv<0.2` の低出力重複は `0/1526` でした。低出力重複 penalty は現時点で根拠不足です。

## 保留中の診断

- `portfolioEffective`
  - ready な成長カードだけを対象にした診断です。
  - 50戦では `missedNear05=170/1526`, `flip04=121/1526`, `flip08=249/1526` でしたが、カード名が分散しているため実装は保留です。
- `portfolioEffectiveByCard` / `portfolioEffectiveReadiness`
  - カード名別、ready強度別に分解する診断です。
  - 20戦では `flip04` が `青果市場`, `ブドウ園`, `高級フレンチ`, `サンマ漁船`, `ワイナリー` に分散しました。
  - `strongReady` でも `ブドウ園`, `サンマ漁船`, `ワイナリー` などへ分散し、単一カード補正や5枚まとめ補正へ進む根拠は薄い状態です。
- `basicDuplicate`
  - 基本カード重複の発火、near、flip 候補を観測します。
  - 実装候補ではなく、低価値重複が本当に過大評価されているかの切り分け用です。
- `finishDelayExamples`
  - loss 診断で、終盤 build 遅延の具体例を出力します。
  - `scoreGapToBestNonDelay`, `reasonTags`, `opponentWinThreats`, `disruptionPreview` を見て、狭い実装候補だけを拾います。

## 実装へ進む基準

- allStrong4/crowd で明確な `WouldFlip` が出ること。
- 50戦で発火が十分あり、100戦でも傾向が維持されること。
- normal crowd を壊さないこと。
- カード名や条件が2-3個程度に集中していること。
- パス追加、広いカード禁止、広い終盤 penalty にならないこと。

## よく使う診断

```sh
node scripts/diagnose-expert-v2-branches.js --games 50 --profiles crowd,allStrong4
node scripts/diagnose-expert-losses.js --games 100 --profiles crowd,allStrong4 --expert-preset v2simple
npm run eval-expert-vs-strong -- --games 100 --expert-preset v2simple
```
