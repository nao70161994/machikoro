# ランドマーク数と対局時間の簡易比較

2026-09-29に、ゲーム開始時に有効にするランドマークを4種または6種にした場合の対局時間を比較した。既定設定やルールの変更判断に使う前段の調査であり、プレイヤーが感じる楽しさや遊びやすさを測ったものではない。

## 条件

- JavaScript版の `simulateGameLightweight` を使用し、CPU設定は実ゲーム向け (`cpuPurpose: 'live'`) とした。
- 4種はランドマーク定義の先頭4種（駅、ショッピングモール、遊園地、電波塔）、6種は定義済み全種（港、空港を追加）。
- 各条件50戦。seedは202600〜202649で、4種と6種に同じseedを使った。
- 2人戦は「普通対普通」と「強対普通」、4人戦は「普通4人」と「普通・強の交互」。
- 数値は対局全体の `turnCount`。p90は昇順配列の `floor((n - 1) * 0.9)` 番目。
- 全400戦でstep上限到達は0件。

## 結果

| 人数・CPU構成 | ランドマーク | 平均ターン | 中央値 | p90 | 範囲 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2人・普通対普通 | 4種 | 64.54 | 64 | 79 | 44–89 |
| 2人・普通対普通 | 6種 | 66.08 | 65 | 81 | 42–107 |
| 2人・強対普通 | 4種 | 67.12 | 67 | 81 | 44–84 |
| 2人・強対普通 | 6種 | 68.68 | 64 | 88 | 43–104 |
| 4人・普通4人 | 4種 | 91.24 | 90 | 112 | 59–124 |
| 4人・普通4人 | 6種 | 97.60 | 99 | 113 | 69–120 |
| 4人・普通/強交互 | 4種 | 77.34 | 75 | 93 | 53–109 |
| 4人・普通/強交互 | 6種 | 81.58 | 83 | 97 | 57–109 |

6種の平均は4種に対し、2人戦で約2.3〜2.4%、4人戦で約5.5〜7.0%長かった。4人・普通4人の中央値では差が9ターンあった一方、2人・強対普通では6種の中央値が短かった。平均だけでなく対戦相手と分布も見る必要がある。

## 読み取りと限界

今回のCPU条件では、レビューにあった「全6種が基本4種より約3割長い」という差は再現しなかった。これはCPU同士の軽量シミュレーションであり、人間の購入判断、遊園地の連続手番、空港の不建設戦略、カード選択の多様さによって実対局の長さや体感は変わりうる。50戦ずつの比較なので、微小な差を一般化する証拠にもならない。

この結果だけではランドマークの既定数を決めない。初回向けの4種設定と全種設定を実際に遊び比べ、ゲーム時間だけでなく選択肢の楽しさも確認してから判断する。

## 再現

リポジトリのルートから次のスクリプトを実行する。同じロジックでseed数や人数を変えて追加調査できる。

```sh
node <<'NODE'
const selfplay = require('./scripts/selfplay');
const runtime = selfplay.loadRuntime({ includeRL: false });
const names = runtime.Player.landmarkNames();
const lineups = {
  '2p-normal': ['normal', 'normal'],
  '2p-strong-vs-normal': ['strong', 'normal'],
  '4p-normal': ['normal', 'normal', 'normal', 'normal'],
  '4p-normal-strong-mix': ['normal', 'strong', 'normal', 'strong'],
};
for (const [lineup, difficulties] of Object.entries(lineups)) {
  for (const [landmarkCount, enabledLandmarks] of [['4', names.slice(0, 4)], ['6', names]]) {
    const turns = [];
    let exhausted = 0;
    for (let index = 0; index < 50; index++) {
      const result = selfplay.simulateGameLightweight({
        runtime,
        difficulties,
        enabledLandmarks,
        seed: 202600 + index,
        maxSteps: 2500,
        cpuPurpose: 'live',
      });
      turns.push(result.turns);
      if (result.exhausted) exhausted++;
    }
    turns.sort((a, b) => a - b);
    const mean = turns.reduce((sum, value) => sum + value, 0) / turns.length;
    const p90 = turns[Math.floor((turns.length - 1) * 0.9)];
    console.log({
      lineup, landmarkCount, games: turns.length,
      meanTurns: Number(mean.toFixed(2)), medianTurns: turns[24], p90Turns: p90,
      minTurns: turns[0], maxTurns: turns.at(-1), exhausted,
    });
  }
}
NODE
```
