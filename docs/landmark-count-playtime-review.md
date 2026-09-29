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

## 3人・5人戦の追加比較

人数による違いを確認するため、2026-09-29に3人・5人戦を追加測定した。各CPU構成・ランドマーク数50戦、seed 202700〜202749を4種/6種で共通にした。ランドマークは上記と同じ定義を使い、step上限到達は0件だった。

| 人数・CPU構成 | ランドマーク | 平均ターン | 中央値 | p90 | 範囲 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3人・普通3人 | 4種 | 81.54 | 80 | 101 | 63–114 |
| 3人・普通3人 | 6種 | 80.76 | 80 | 92 | 62–114 |
| 3人・普通/強混合 | 4種 | 79.86 | 79 | 97 | 49–114 |
| 3人・普通/強混合 | 6種 | 81.22 | 81 | 95 | 63–104 |
| 5人・普通5人 | 4種 | 105.74 | 107 | 122 | 62–139 |
| 5人・普通5人 | 6種 | 108.88 | 110 | 127 | 77–129 |
| 5人・普通/強混合 | 4種 | 87.16 | 81 | 106 | 66–145 |
| 5人・普通/強混合 | 6種 | 98.66 | 101 | 112 | 64–143 |

6種の平均は4種に対し、3人・普通戦では約−1.0%、3人混合で約+1.7%、5人・普通戦で約+3.0%、5人混合で約+13.2%だった。人数が増えるほど一律に長くなるのではなく、CPU構成によるばらつきが残った。

5人混合の差だけ別seedでも確認した。seed 202800〜202899の各100戦では、4種が平均90.43ターン（中央値91、p90 109、58–121）、6種が平均99.21ターン（中央値100、p90 116、68–126）で、6種は約9.7%長かった。50戦の結果より差は小さくなったが、このCPU構成では長くなる傾向が再現した。どちらの追加測定もstep上限到達は0件だった。

再現時は下の既存コードの `lineups` に次を追加し、追加比較は `seed` を `202700 + index` にして各50戦実行する。

```js
{
    '3p-normal': ['normal', 'normal', 'normal'],
    '3p-normal-strong-mix': ['normal', 'strong', 'normal'],
    '5p-normal': ['normal', 'normal', 'normal', 'normal', 'normal'],
    '5p-normal-strong-mix': ['normal', 'strong', 'normal', 'strong', 'normal'],
}
```

5人混合の追加100戦は同じ処理で `seed` を `202800 + index`、反復数を100にする。

## 読み取りと限界

今回のCPU条件では、レビューにあった「全6種が基本4種より約3割長い」という差は再現しなかった。5人混合では別seedの追加100戦でも約9.7%長くなる傾向が見られたが、CPUの組み合わせによって差は異なった。これはCPU同士の軽量シミュレーションであり、人間の購入判断、遊園地の連続手番、空港の不建設戦略、カード選択の多様さによって実対局の長さや体感は変わりうる。50〜100戦ずつの比較なので、微小な差を一般化する証拠にもならない。

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
