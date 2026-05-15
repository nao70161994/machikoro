# Expert v2 Diagnostics

このメモは live `CPU（最強）` の `expertPreset: "v2simple"` に関する診断履歴です。
巨大な生ログは残さず、採用・却下・保留の判断材料だけを残します。

## 現行ルール

- `build=ev`
- `dice=strongCrowdThreshold`
- `reroll=simple`
- `it=always`
- `tv=simple`
- `business=harmfulGift`
- `cleaning=simple`
- `harbor=simple`
- `mover=simple`
- `renovation=simple`
- `combo=core`
- `buildTempo=0.05`
- `airportSkip=whenNoLandmark`
- `incomeCap=none`
- `landmarkCardMargin=25`
- `landmarkCardCompareMode=base`
- `landmarkCardCompareTargets=harborMall`
- `landmarkCardPenaltyMode=none`
- `harborLandmarkBaseBonus=2.5`
- `landmarkProgressRemaining=3`
- `landmarkCostWeight=0.12`

ランドマークを買える場合は原則ランドマークを優先します。ただし港 / ショッピングモールは `landmarkCardCompareTargets=harborMall` の比較対象で、カード購入が `landmarkCardMargin` 以上に上回る場合はカードを買います。ランドマークを買えない場合は build EV でカードを選びます。パス追加や広いカード禁止は採用しません。

## 現行基準線

2026-05-11 に、追加の手書き補正を止めた状態の `v2simple` を100戦で取り直しました。

```sh
npm run eval-expert-v2-benchmark -- --games 100 --seed 1 --expert-preset v2simple
```

結果は `normalCrowd=55.0%`, `strongWeighted=50.9%`, `strongMin=39.0%` です。strong profile は duel `82.0%`, trio `74.0%`, crowd `41.0%`, allStrong4 `39.0%` でした。今後の v2simple 候補は、この100戦基準線から `normalCrowd`, `strongWeighted`, `strongMin`, `allStrong4` を比較します。この基準線は、Business Center の harmful gift 限定補正を含む live v2simple option を `mode=lite` の評価 CLI で回したものです。実ゲームの live CPU は同じ option を realtime モードで使います。

## 採用済み

- 赤カード相手ターン EV 補正
  - `redOpponentTurnBonus = min(1, opponentTurnEv * 0.25)` を build EV に薄く加点します。
  - 条件付き赤カードは、発火時の即時評価では相手の所持コインを上限にし、build EV では将来価値として評価します。
- Business Center harmful gift 限定補正
  - 通常は simple の既定どおり、一番いらない自分カードと一番欲しい相手カードを交換します。
  - 貸金業/改装屋の受け取り価値が相手にとって負になる場合だけ、交換全体のスコアが既定手を上回れば押し付け候補へ差し替えます。broad scored exchange には戻しません。
  - 100戦 full suite は `normalCrowd=61.0%`, `strongWeighted=55.2%`, `strongMin=45.0%` でした。

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
- Growth vs convenience narrow bonus
  - 2026-05-10 に、強い成長カードがコンビニ重複へ僅差で負ける場合だけ小さく加点する smoke を試しました。
  - 20戦 benchmark は `normalCrowd=60.0%`, `strongWeighted=49.5%`, `strongMin=35.0%`, `allStrong4=50.0%` で、baseline 方向に対して悪化が大きかったため即時 revert しました。
  - `サンマ漁船->コンビニ` や `高級フレンチ->コンビニ` は診断上よく出ますが、単純に成長カードを押し上げる補正では改善しません。

## 保留中の診断

- `portfolioEffective`
  - ready な成長カードだけを対象にした診断です。
  - 50戦では `missedNear05=170/1526`, `flip04=121/1526`, `flip08=249/1526` でしたが、カード名が分散しているため実装は保留です。
  - 2026-05-10 の crowd/allStrong4 50戦では `missedNear05=173/1530`、missed winner は `サンマ漁船->コンビニ:72`, `青果市場->コンビニ:68`, `ブドウ園->コンビニ:42`, `高級フレンチ->コンビニ:37`, `サンマ漁船->ブドウ園:23` でした。頻度は高いものの、実装へ落とすとコンビニ即時収入を壊しやすいことが smoke で確認済みです。
- `portfolioEffectiveByCard` / `portfolioEffectiveReadiness`
  - カード名別、ready強度別に分解する診断です。
  - 20戦では `flip04` が `青果市場`, `ブドウ園`, `高級フレンチ`, `サンマ漁船`, `ワイナリー` に分散しました。
  - `strongReady` でも `ブドウ園`, `サンマ漁船`, `ワイナリー` などへ分散し、単一カード補正や5枚まとめ補正へ進む根拠は薄い状態です。
- `basicDuplicate`
  - 基本カード重複の発火、near、flip 候補を観測します。
  - 実装候補ではなく、低価値重複が本当に過大評価されているかの切り分け用です。
- `componentDominance` / `componentRanchCombo`
  - build EV の内訳要素だけで購入選択が反転しているかを見る診断です。`componentDominance` は tempo / combo / red bonus / renovation penalty の支配度を測り、`half` はその要素を半減しただけで反転する僅差候補を表します。
  - `componentRanchCombo` は combo unlock bonus で `牧場` が選ばれたケースを、購入前の牧場枚数、2位との差、代替カード名で分解します。牧場 penalty の根拠ではなく、combo補正の過大評価を疑う audit として扱います。
  - 2026-05-11 の50戦診断では `componentRanchCombo dominant=210/1544`, `gap025=210/210` と多い一方、代替先は `パン屋:133`, `改装屋:48`, `ピザ屋:28` に寄りました。`comboWeight 0.2` smoke も normal crowd を落としたため、牧場 penalty や broad combo 弱体化には進みません。
- `componentRedBasic`
  - 赤の build EV 補正で `ピザ屋` / `バーガーショップ` が選ばれたケースを、購入前枚数、ショッピングモール有無、2位との差、勝敗別で分解します。
  - 20戦では `dominant=53/613`, `gap025=53/53`, `win=21/53`, `loss=32/53` で、代替先は勝敗どちらも主に `バーガーショップ` でした。赤補正を下げても赤同士の入れ替わりになりやすいため、実装候補にはしません。
  - allStrong4 50戦では `dominant=77/787`, `win=32/77`, `loss=45/77`, `secondNames=バーガーショップ:66,パン屋:10,牧場:1` でした。loss 側への偏りは 1.5倍未満で、次点も赤同士が大半のため、赤基本カード penalty や赤EV係数変更には進みません。
- `v3Race`
  - build EV の候補カードについて、購入後の期待値で次ランドマーク/空港へ到達する概算ターンがどれだけ短縮されるかを見る仮想診断です。CPU本体の行動は変えず、現行 v2 選択と race score best が違う回数だけを測ります。
  - 主に `different`, `reachGain`, `airportGain`, `v2DelaysAirport`, `gap025`, `wouldChoose`, `v2Chosen` を見ます。allStrong4/crowd の loss 側に集中し、カード名が2-3個へ絞れ、normal crowd を壊さない場合だけ実装候補にします。
  - 2026-05-11 の allStrong4 20戦 smoke では `different=110/320`, `v2DelaysAirport=105/320` と差分は大きい一方、仮想bestは `雑貨屋:36`, `パン屋:35`, `改装屋:13` に寄りました。短期現金や妨害を捨てる broad race 補正になりやすいため、この時点では実装に進みません。
  - crowd/allStrong4 50戦でも `different=559/1544`, `v2DelaysAirport=505/1544`, `gap025=513/1544` と差分は大きい一方、仮想bestは `雑貨屋:198`, `パン屋:172`, `改装屋:74`, `貸金業:36`, `食品倉庫:28` へ寄りました。v2 が選んだ `牧場`, `ピザ屋`, `バーガーショップ` などを低額/特殊カードへ置き換える broad 変更になりやすく、まだ実装候補にはしません。
  - 追加分解の crowd/allStrong4 20戦では `different=224/613`, `lowValue=175/224`, `lowNoReach=124/175`, `airportLe6=2/224`, `remainingLe2=48/224` でした。低価値候補は終盤の空港目前に限定されておらず、到達短縮より節約寄りに広く発火しているため、v3Race 実装は停止します。
- `finishDelayExamples`
  - loss 診断で、終盤 build 遅延の具体例を出力します。
  - `scoreGapToBestNonDelay`, `reasonTags`, `opponentWinThreats`, `disruptionPreview` を見て、狭い実装候補だけを拾います。
- `missedImmediateDisruption`
  - 相手の即時勝利を止められる妨害候補を見送っていないかを見る loss 診断です。
  - 30戦では0件で、妨害不足を broad bonus / guard として実装する根拠は薄い状態です。
- `portfolioReachShorten`
  - 成長カード購入で次ランドマーク到達の概算ターンが短くなるかを見る診断です。
  - 20戦では `available=9`, `missedNear=3`, `flip04=1` と薄く、到達短縮を理由に portfolio 補正へ進む根拠は弱い状態です。

## 実装へ進む基準

- allStrong4/crowd で明確な `WouldFlip` が出ること。
- 50戦で発火が十分あり、100戦でも傾向が維持されること。
- normal crowd を壊さないこと。
- カード名や条件が2-3個程度に集中していること。
- パス追加、広いカード禁止、広い終盤 penalty にならないこと。

## 手書き強化の停止条件

2026-05-11 時点では、Business Center harmful gift、牧場combo、赤基本カード、finishStrictDelay のいずれも、小補正で改善できる単一条件には届いていません。normal crowd や allStrong4 を崩すリスクが高いため、v2simple の追加実装はいったん停止し、新しい候補は loss 側に明確に偏り、かつ normal crowd を壊さない条件に絞れる場合だけ再開します。

## v2手書き候補の評価ゲート

20戦は smoke として扱い、採用判断には使いません。`strong crowd,allStrong4` と `normal crowd` を見て、strong weighted が baseline 以上、allStrong4 が `-2pt` 以内、normal crowd が `-2pt` 以内なら50戦へ進めます。allStrong4 または normal crowd が `-4pt` 以上悪化した候補は、この時点で破棄します。

50戦は候補判定です。`strong duel,trio,crowd,allStrong4` と `normal duel,trio,crowd` を見ます。strong weighted が baseline 以上、strong min が `-1pt` 以内、allStrong4 が `-2pt` 以内、normal weighted が `-1pt` 以内なら100戦へ進めます。strong min が `-3pt` 以上、allStrong4 が `-4pt` 以上、normal crowd または normal duel が `-3pt` 以上悪化した候補は破棄します。改善が1profileだけに偏る場合は保留し、条件をさらに狭めます。

100戦で採用判定します。採用条件は、strong weighted が改善、strong min が維持以上、allStrong4 が維持以上、normal weighted が維持以上、normal 各profileに `-2pt` 以上の悪化がないことです。strong は改善するが normal crowd が落ちる候補、または normal は改善するが allStrong4 が落ちる候補は統合しません。改善幅が `+1pt` 未満で profile差が大きい場合は誤差扱いで保留します。

normal crowd は broad 補正の副作用検出用、strong 4 profile は最悪条件と汎用性の確認用です。特に allStrong4 と normal crowd のどちらかを壊す候補は、他profileで改善しても v2simple 本体へ入れません。

### benchmark比較表

`npm run eval-expert-v2-benchmark -- --games <N> --seed <seed> --expert-preset v2simple` の出力を比較するときは、まず次の4指標だけを見ます。既定の `businessMode` は `harmfulGift` です。Business Center 系の実験を再開する場合は、実装済みの mode 名を明示し、baseline harmfulGift と混ぜて比較しません。

| games | seed | candidate | normalCrowd | Δ | strongWeighted | Δ | strongMin | Δ | allStrong4 | Δ | 判定 |
| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 20 | 1 | baseline |  | - |  | - |  | - |  | - | 基準 |
| 20 | 1 | candidate |  |  |  |  |  |  |  |  | 継続/破棄 |
| 50 | 1 | baseline |  | - |  | - |  | - |  | - | 基準 |
| 50 | 1 | candidate |  |  |  |  |  |  |  |  | 100戦へ/破棄 |
| 100 | 1 | baseline |  | - |  | - |  | - |  | - | 基準 |
| 100 | 1 | candidate |  |  |  |  |  |  |  |  | 採用/保留/破棄 |

`Δ` は candidate から baseline を引いた percentage point です。`allStrong4` は strong profile の `allStrong4` 行、`strongWeighted` と `strongMin` は benchmark pack の summary 行を使います。判定は、20戦では smoke、50戦では100戦へ進めるか、100戦では本体統合できるかだけを書きます。

### `--suite` / `--profiles` の使い方

- 20戦 smoke は時間短縮のために絞ってよいです。まず `--suite strong --profiles crowd,allStrong4` で多人数 strong 系の悪化を見ます。
- broad 補正や Business Center 系など normal 副作用が疑わしい候補は、追加で `--suite normal --profiles crowd` を20戦だけ見ます。
- 50戦へ進める候補は、原則 `--suite all` の全 benchmark に戻します。部分profileだけの50戦では採用候補にしません。
- 100戦の採用判定も必ず全 suite で見ます。`--suite/--profiles` は smoke と原因切り分け用で、本体統合判断には使いません。

```sh
node scripts/eval-expert-v2-benchmark-pack.js --games 20 --suite strong --profiles crowd,allStrong4
node scripts/eval-expert-v2-benchmark-pack.js --games 20 --suite normal --profiles crowd
node scripts/eval-expert-v2-benchmark-pack.js --games 50 --suite all
node scripts/eval-expert-v2-benchmark-pack.js --games 100 --suite all
```

## 方針

現時点では、手書きの v2 build EV 強化は打ち止め寄りです。採用済みの赤カード相手ターン EV 補正と Business Center harmful gift 限定補正を除き、broad 補正や guard 系は、診断上の発火が薄いか、20-50戦評価で改善が安定しませんでした。今後は大きな手書き補正を増やすより、loss 診断で明確に集中した狭い仮説が出た場合だけ小さく検証します。

2026-05-10 の追加診断では、loss-only 50戦で crowd が `expertWinRate=44.0%`、allStrong4 が `expertWinRate=36.0%` でした。build attribution はどちらも `portfolioMissedNear05` と `portfolioVsBasic` が目立ち、空港未購入時の見送りも多い一方、成長カード補正の実装 smoke は悪化しました。現段階では「成長カードを買わせる」より、「どの局面ならコンビニ即時収入を捨ててよいか」をさらに診断する段階です。

その後、loss 診断に `airportDelay` / `basicDuplicate` と勝ち試合側の `winBuildAttribution` を追加しました。50戦 loss-only では basic duplicate が crowd `chosen=186, overGrowthNear05=32`、allStrong4 `chosen=206, overGrowthNear05=26` と多く出ました。20戦の win/loss 比較では、crowd は勝ち側にも `basicDuplicate=60, overGrowthNear05=10` が出るため単純 penalty は危険です。一方 allStrong4 は loss `overGrowthNear05=16` に対して win `overGrowthNear05=2` と差が出たため、今後見るなら allStrong4 寄りの重複基本カード vs 成長候補の僅差局面に絞ります。広い basic duplicate penalty は採用しません。

さらに `copy3Plus` と remaining/shortfall 層別を追加しました。20戦では allStrong4 の loss `overGrowthNear05=16` が `remaining=5:9,4:4,3:2,1:1`、`shortfall=<=3:9,>6:7` に分かれ、終盤 `remaining<=2 && shortfall<=6` へ集中していません。3枚目以降も勝ち側に多く出るため、過剰重複そのものや終盤空港shortfall限定 penalty へは進みません。

追加の allStrong4 JSON 診断で一度 `expertWins=3/50` が出ましたが、これは `diagnose-expert-losses.js` の既定 `expertPreset=default` を使っており、v2simple の診断ではありませんでした。v2simple は必ず `--expert-preset v2simple` を明示します。

`--expert-preset v2simple` 付きで取り直した 50戦では、baseline が allStrong4 `24/50 = 48.0%`、crowd `22/50 = 44.0%` でした。loss summary は allStrong4 `18/50 = 36.0%`、crowd `22/50 = 44.0%` で、基本カード重複は loss 固有ではありませんでした。branch 診断では allStrong4 20戦で `buildMallBasicChosen=79/281` が出たため、ショッピングモール未所持かつ遠い状態の `コンビニ/パン屋/ピザ屋` に小減点を試しましたが、0.5 と 0.25 のどちらも crowd は `26/50 = 52.0%` に上がる一方、allStrong4 は `19/50 = 38.0%` へ悪化しました。allStrong4 を壊すため採用しません。

`CPU（最強）` の v2simple と `AI（深層学習・ランダム）` の RL CPU は別系統として並行強化します。v2simple は安定したルールベース CPU として、診断で根拠が明確な小変更だけを検証します。RL CPU は portfolio / registry を通じて、人数別モデルの採用・差し替えを進めます。どちらか一方だけを強くすればよい、という扱いにはしません。

## RL 評価との分離

- v2simple の採用判断は `eval-expert-v2-benchmark-pack` と loss / branch 診断で行います。出力の `cpuFamily` は `v2simple-rule-based` です。
- RL CPU の採用判断は `eval-rl-models`, `eval-rl-vs-js`, `models/rl_model/registry.json` で行います。v2 benchmark pack の数値を RL registry の eval として転記しません。
- 比較しやすさのため、短時間 smoke は両系統とも `games=20 seed=1`、候補確認は `games=50 seed=1`、採用判断は `games=100 seed=1` を基本にします。ただし、v2 は `duel/trio/crowd/allStrong4`、RL は registry model / run-label と `rl,weak,normal,strong;rl,normal,normal,strong;rl,weak,weak,normal` を別々に見るため、score を直接同一表で順位付けしません。
- v2 と RL の横比較は「どの局面で強いか」の参考に留め、片方の結果だけで他方の採用・棄却を決めません。

## 負け筋ログからの次候補整理

この節は v2simple 専用です。RL CPU の採用や再学習は対象外です。

### 今は採用しない案

- broad portfolio / growth bonus
  - `portfolioEffective` では missed/flip 候補が見える一方、`portfolioEffectiveByCard` では候補が分散しています。一律 bonus やカード名を広く束ねた bonus は採用しません。
- finish / special spend guard
  - `finishStrictDelay` と special spend delay は発火が薄く、勝率改善に結び付く根拠が不足しています。skip / build guard や広い終盤 penalty は採用しません。
- roll/race guard
  - `rollRaceDetail` の `lateOther` は出るものの薄く、終盤サイコロ選択を broad に変える根拠には届いていません。
- Business Center scored exchange の broad 実装
  - harmful gift や交換価値差分は診断対象として残しますが、scored exchange 全体は strong 側悪化があったため採用しません。
- Business Center broad delay / spend penalty
  - harmful gift 限定補正は採用済みですが、Business Center を広く遅延扱いする補正は採用しません。
  - 2026-05-10 の50戦診断では `businessDelay delay=45/1530`, `specialSpend delayNames=ビジネスセンター:45` が出た一方、`businessDelay flip05=0`, `flip1=0` でした。軽い special spend / Business delay penalty では反転しないため、追加実装には進みません。

### 次に狭く検証する案

1. loss 診断で集中した具体例
   - `finishDelayExamples` の `reasonTags`, `scoreGapToBestNonDelay`, `opponentWinThreats`, `disruptionPreview` が同じカード/条件に集中する場合だけ、小さい補正候補にします。
2. Business Center harmful gift の audit
   - `businessSimpleMissedHarmfulGift*` は regression / audit 用に残します。これは `business=simple` が見逃した候補を測る比較用カウンタであり、現行CPUが実際に見逃した回数としては扱いません。
   - 追加診断では `missedHarmful` が crowd 6/60、allStrong4 5/62。内容は `改装屋->ブドウ園` に集中していたため、通常の simple 交換を維持したまま、貸金業/改装屋の受け取り価値が相手にとって負になる場合だけ差し替える限定実装として採用しました。
   - 限定実装の50戦 smoke は `strong crowd=44.0%`, `allStrong4=48.0%`, `normal crowd=62.0%`。100戦 full suite は `normalCrowd=61.0%`, `strongWeighted=55.2%`, `strongMin=45.0%`, `allStrong4=45.0%` でした。
   - 今後は追加候補ではなく、貸金業/改装屋などへの集中が維持されているか、想定外のカード名へ広がっていないかを見る audit として扱います。
   - 2026-05-10 に、赤カードのショッピングモール加算を支払う側ではなく所有者側で見るよう修正し、コーン畑・青果市場・食品倉庫・ドリンク工場などの収入/依存評価を実ルールと同じカテゴリ参照へ寄せました。
   - 2026-05-11 の100戦 audit では `missedHarmful=22/265`, `crowd=8/130`, `allStrong4=14/135`。内容は全て `改装屋` で、`改装屋->ブドウ園:13`, `改装屋->鉱山:7`, `改装屋->高級フレンチ:2` でした。ただし `gapLt05=0` のため、小さい tie-breaker ではなく scored exchange 寄りの変更になります。
3. roll/race の終盤例
   - `lateOther` 単体では薄いため、loss 診断で終盤サイコロ選択が具体的な敗因として重なる場合だけ検証します。
4. portfolio effective の条件付き補正
   - 現時点では低優先です。`portfolioEffectiveByCard` や readiness が2-3条件へ集中した場合だけ、broad bonus ではなく条件付きの小補正として再検討します。

## よく使う診断

```sh
node scripts/eval-expert-v2-benchmark-pack.js --games 50 --business-mode harmfulGift
node scripts/eval-expert-v2-benchmark-pack.js --games 20 --suite strong --profiles crowd,allStrong4
node scripts/diagnose-expert-v2-branches.js --games 50 --profiles crowd,allStrong4
node scripts/diagnose-expert-losses.js --games 100 --profiles crowd,allStrong4 --expert-preset v2simple
node scripts/diagnose-expert-losses.js --games 50 --profiles allStrong4 --expert-preset v2simple --format json > /tmp/v2-allstrong4-losses.json
node scripts/summarize-expert-losses-json.js /tmp/v2-allstrong4-losses.json
npm run eval-expert-vs-strong -- --games 100 --expert-preset v2simple
```
