# RL Experiments

## 4人RL実験履歴

このファイルは RL CPU の個別実験履歴を残すためのメモです。標準フローと現行の採用方針は `scripts/rl/README.md` を参照してください。評価 artifact は生成物扱いでコミットせず、採用判断に必要な要点だけをここか `models/rl_model/registry.json` に要約します。

2026-05-09追記: `seed110-allstrong` は完走後の50戦比較で all lineup 0% となり不採用。registry / portfolio へは反映しない。出力された `eval-seed110-*` artifact は生成物扱いでコミットしない。balanced 条件の短時間確認は `self-only-4p-h256-lr1e5-500-seed111-balanced-sanity` で実行中。

2026-05-09追記: `seed111 balanced` の10戦診断では、既存 `seed102` / `seed103` が55%、`seed111` rank1 が40%、top2 が5%。短時間診断でも既存候補を上回らず、特に top2 が大きく崩れたため不採用。registry / portfolio へは反映しない。`eval-seed111-*` は生成物扱いでコミットしない。追加の50戦基準線では `seed103` が58%（56% / 56% / 74% / 46%）、`seed102` が57%（68% / 44% / 74% / 42%）で、今後の4lineup候補はこの水準を基準に比較する。

2026-05-09追記: `seed112 seed103axis` は外部10戦診断で rank1 が12.5%、top2 が10.0%に留まり、既存 `seed102` / `seed103` の55%基準線を大きく下回った。学習中からpass率の崩れが強く、通常lineupも伸びなかったため不採用。registry / portfolio へは反映しない。`eval-seed112-*` は生成物扱いでコミットしない。

2026-05-09追記: `seed113 build-pass-affordable-penalty=0.02` は build pass 診断で rank1 の購入可能passを0.0%まで抑制できたが、外部10戦 score は50.0%で既存 `seed102` / `seed103` の55.0%を下回り、top2 も12.5%と弱かった。外部20戦では rank1 が53.8%で `seed102` の48.8%は上回ったが `seed103` の61.2%には届かないため未採用。pass抑制ノブとしては有効だが、registry / portfolio へは反映しない。`seed113-*` artifact は生成物扱いでコミットしない。

2026-05-09追記: `seed114 passpen-imitation` は `seed113` 条件に periodic imitation refresh を追加して購入品質改善を狙ったが、500時点の JS 評価が 25% / 12% / 50% に留まり `seed113` より悪化した。build pass は概ね抑制されたものの勝率改善につながらなかったため未採用。registry / portfolio へは反映しない。`seed114-*` artifact は生成物扱いでコミットしない。

2026-05-09追記: `seed103 fine-tune passpen` は採用済み `seed103` checkpoint から load し、`lr=5e-6`, `games=500`, `build-pass-affordable-penalty=0.02` で微調整した。外部10戦では rank1 が67.5%と強く出たが、外部20戦では51.2%（50% / 40% / 85% / 30%）まで下がり、既存 `seed103` の61.2%（65% / 60% / 80% / 40%）を下回ったため未採用。passは正常だが勝率の安定改善にはならず、registry / portfolio へは反映しない。`seed103-finetune-*` artifact は生成物扱いでコミットしない。

2026-05-09追記: `seed103 top3 reselection` は採用済み `seed103` run の top3 checkpoint を再確認した。外部50戦では61.0%（60% / 60% / 76% / 48%）で top1 の54.5%を上回ったが、外部100戦では60.7%（61% / 68% / 80% / 34%）となり allStrong が採用基準の46%を大きく下回ったため未採用。2人戦用の `seed71-rewardcap-top3` は同じ100戦出力では60.8%（68% / 56% / 73% / 46%）だったが、2人用 stateDim の portfolio モデルなので4人用の差し替え候補にはしない。`eval-seed103-top1-top3-*` artifact は生成物扱いでコミットしない。

2026-05-09追記: `seed116 lr1e-6 fine-tune passpen` は採用済み `seed103` checkpoint から load し、`lr=1e-6`, `games=250`, `build-pass-affordable-penalty=0.02` でさらに保守的に微調整した。内部JS評価は 50% / 50% / 75% で pass も低く制御できたが、外部20戦では46.3%（75% / 25% / 65% / 20%）に留まり、`normal+normal+strong` と allStrong が大きく崩れたため未採用。registry / portfolio へは反映しない。`eval-seed116-*` artifact は生成物扱いでコミットしない。
