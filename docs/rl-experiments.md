# RL Experiments

## 4人RL実験履歴

このファイルは RL CPU の個別実験履歴を残すためのメモです。標準フローと現行の採用方針は `scripts/rl/README.md` を参照してください。評価 artifact は生成物扱いでコミットせず、採用判断に必要な要点だけをここか `models/rl_model/registry.json` に要約します。

現行4人RLの基準線は採用済み `self-only-4p-h256-lr1e5-5000-seed103` の100戦評価を主に使います。v2simple の手書きCPU診断とは分離し、RL候補は既存RL採用モデルと多人数lineup評価だけで採否判断します。

2026-05-09追記: `seed110-allstrong` は完走後の50戦比較で all lineup 0% となり不採用。registry / portfolio へは反映しない。出力された `eval-seed110-*` artifact は生成物扱いでコミットしない。

2026-05-09追記: `seed111 balanced` の10戦診断では、既存 `seed102` / `seed103` が55%、`seed111` rank1 が40%、top2 が5%。短時間診断でも既存候補を上回らず、特に top2 が大きく崩れたため不採用。registry / portfolio へは反映しない。`eval-seed111-*` は生成物扱いでコミットしない。追加の50戦基準線では `seed103` が58%（56% / 56% / 74% / 46%）、`seed102` が57%（68% / 44% / 74% / 42%）で、今後の4lineup候補はこの水準を基準に比較する。

2026-05-09追記: `seed112 seed103axis` は外部10戦診断で rank1 が12.5%、top2 が10.0%に留まり、既存 `seed102` / `seed103` の55%基準線を大きく下回った。学習中からpass率の崩れが強く、通常lineupも伸びなかったため不採用。registry / portfolio へは反映しない。`eval-seed112-*` は生成物扱いでコミットしない。

2026-05-09追記: `seed113 build-pass-affordable-penalty=0.02` は build pass 診断で rank1 の購入可能passを0.0%まで抑制できたが、外部10戦 score は50.0%で既存 `seed102` / `seed103` の55.0%を下回り、top2 も12.5%と弱かった。外部20戦では rank1 が53.8%で `seed102` の48.8%は上回ったが `seed103` の61.2%には届かないため未採用。pass抑制ノブとしては有効だが、registry / portfolio へは反映しない。`seed113-*` artifact は生成物扱いでコミットしない。

2026-05-09追記: `seed114 passpen-imitation` は `seed113` 条件に periodic imitation refresh を追加して購入品質改善を狙ったが、500時点の JS 評価が 25% / 12% / 50% に留まり `seed113` より悪化した。build pass は概ね抑制されたものの勝率改善につながらなかったため未採用。registry / portfolio へは反映しない。`seed114-*` artifact は生成物扱いでコミットしない。

2026-05-09追記: `seed103 fine-tune passpen` は採用済み `seed103` checkpoint から load し、`lr=5e-6`, `games=500`, `build-pass-affordable-penalty=0.02` で微調整した。外部10戦では rank1 が67.5%と強く出たが、外部20戦では51.2%（50% / 40% / 85% / 30%）まで下がり、既存 `seed103` の61.2%（65% / 60% / 80% / 40%）を下回ったため未採用。passは正常だが勝率の安定改善にはならず、registry / portfolio へは反映しない。`seed103-finetune-*` artifact は生成物扱いでコミットしない。

2026-05-09追記: `seed103 top3 reselection` は採用済み `seed103` run の top3 checkpoint を再確認した。外部50戦では61.0%（60% / 60% / 76% / 48%）で top1 の54.5%を上回ったが、外部100戦では60.7%（61% / 68% / 80% / 34%）となり allStrong が採用基準の46%を大きく下回ったため未採用。2人戦用の `seed71-rewardcap-top3` は同じ100戦出力では60.8%（68% / 56% / 73% / 46%）だったが、2人用 stateDim の portfolio モデルなので4人用の差し替え候補にはしない。`eval-seed103-top1-top3-*` artifact は生成物扱いでコミットしない。

2026-05-10追記: `seed103` の top1/top2/top3 を直接20戦で再評価したところ、top1 は 65% / 60% / 80%、top2 は 35% / 60% / 75%、top3 は 55% / 45% / 90%。20戦では top1 が最も安定し、top2/top3 は通常lineupで現行採用を上回る根拠が弱い。過去の top3 100戦 allStrong 崩れとも矛盾しないため、現行 `seed103` 採用を維持し、top2/top3 への差し替えは行わない。

2026-05-09追記: `seed116 lr1e-6 fine-tune passpen` は採用済み `seed103` checkpoint から load し、`lr=1e-6`, `games=250`, `build-pass-affordable-penalty=0.02` でさらに保守的に微調整した。内部JS評価は 50% / 50% / 75% で pass も低く制御できたが、外部20戦では46.3%（75% / 25% / 65% / 20%）に留まり、`normal+normal+strong` と allStrong が大きく崩れたため未採用。registry / portfolio へは反映しない。`eval-seed116-*` artifact は生成物扱いでコミットしない。

2026-05-10追記: landmark race 50戦診断では、採用済み `seed103` が58.0%（56% / 56% / 74% / 46%）、旧候補 `seed102` が50.0%（38% / 54% / 66% / 42%）。`seed103` は敗戦時 `avgLossGap=1.87`, `rem1=36`, `rem2=31` で、未達ランドマークは空港が73/84敗に集中した。`seed102` は `avgLossGap=1.95`, `rem1=44`, `rem2=32` で、空港61/100敗に加えてショッピングモール55/100敗も多い。採用判断ではなく報酬設計・checkpoint selection の仮説確認として扱い、現行 `seed103` 採用を維持する。次の仮説は広いpass penaltyではなく、空港/終盤shortfallの小さい reward shaping または selection gate。`*.landmark-race.json` は生成物扱いでコミットしない。

2026-05-10追記: `seed117 airport-progress` は終局報酬に `--terminal-airport-progress 0.001` を加え、空港未建設時の所持コイン進捗を薄く評価する実験として開始した。500 games 時点の内部JS評価は `rl+weak+normal+strong=0%`, `rl+normal+normal+strong=0%`, `rl+weak+weak+normal=100%`、best score 0.125 で、既存 `seed103` 基準に遠いため1000 games完走前に打ち切り。空港shortfall仮説は継続するが、この新規1000 preset + 係数では勝率改善につながらないため未採用。registry / portfolio へは反映しない。`seed117-*` artifact は生成物扱いでコミットしない。

2026-05-10追記: `seed118 seed103 low-lr fine-tune sanity` は `--load-checkpoint models/rl_model/runs/self-only-4p-h256-lr1e5-5000-seed103/best_model`, `lr=1e-6`, `games=250` で実行した。内部JS評価は `rl+weak+normal+strong=0%`, `rl+normal+normal+strong=100%`, `rl+weak+weak+normal=0%`、best score 0.500。3 lineup のうち2つが0%で、外部20戦へ進む前の破綻検出条件に該当したため未採用。registry / portfolio へは反映しない。次は追加fine-tuneではなく、採用済み `seed103` run 内 candidate checkpoint の再選抜を優先する。

2026-05-10追記: `seed103 candidate checkpoint reselection` として candidate-250/500/750/1000/1250/1500 を一時 browser export し、4lineup各10戦で比較した。最良は candidate-1250 の 50% / 60% / 90% / 40% だったため、現行 `seed103` best と candidate-1250 を20戦で直接比較した。現行bestは 65% / 60% / 80% / 40%、candidate-1250 は 55% / 45% / 90% / 30%。candidate-1250 は通常lineupと allStrong が落ちるため未採用。registry / portfolio へは反映しない。

2026-05-10追記: `seed119 allStrong-gate` は allStrong耐性を主目的に、`rl,strong,strong,strong` を含む `summary-weights` で再起動して評価した。初回は誤った `summary-weights` で起動して即停止したため採否判断から除外し、正しい再起動後 run の結果だけを見る。内部4戦では 500 checkpoint が 50% / 25% / 50% / 50%、1000 checkpoint が全JS 0%で、最終モデルは 500 checkpoint へ復元された。外部20戦では候補が 67.5%（60% / 65% / 95% / 50%）で現行 `seed103` の 61.2%（65% / 60% / 80% / 40%）を上回ったため50戦へ進めたが、外部50戦では 58.5%（68% / 52% / 78% / 36%）で、現行 `seed103` の 58.0%（56% / 56% / 74% / 46%）と総合同等ながら allStrong と `normal+normal+strong` が落ちた。採用条件を満たさないため未採用。registry / portfolio へは反映しない。

2026-05-10追記: `seed122 batch1 allStrong-gate` は、`seed120` / `seed121` が4人 `self-learn-both-sides` の既定 `train-batch-size=8` で batch stall 疑いになったため、`--train-batch-size 1` と debug batch log で学習更新を軽くして再確認した。速度面では `bufferBefore` が概ね数百、`elapsed` が数秒〜十数秒で進み、batch stall は回避できた。一方、250 games 時点の内部JS評価は4lineupすべて0%で、build pass も `rnd=66%`, `weak=62%`, `nrm=54%` まで崩れたため打ち切り。外部評価へは進めず未採用。registry / portfolio へは反映しない。

2026-05-10追記: `seed123 batch1 passpen` は `seed122` の pass 崩壊対策として `--train-batch-size 1` に加えて `--build-pass-affordable-penalty 0.02` を入れた。250 games 時点で build pass は `rnd=4%`, `weak=0%`, `nrm=0%` まで改善し、pass 崩壊は抑制できた。一方、内部JS評価は `rl+weak+normal+strong=0%`, `rl+normal+normal+strong=0%`, `rl+weak+weak+normal=0%`, `rl+strong+strong+strong=0%` で全敗だったため、500 games まで継続する根拠なしとして停止。外部評価へは進めず未採用。registry / portfolio へは反映しない。

2026-05-11追記: `seed124 jsmix-gate` は、`self=0.5,weak=0.2,normal=0.2,strong=0.1` のJS混合250 games sanity として実行した。内部JS評価は `rl+weak+normal+strong=50%` だけが非0で、`rl+normal+normal+strong=0%`, `rl+weak+weak+normal=0%`, `rl+strong+strong+strong=0%`。score は0.100で、通常/strong系が戻っていないため外部評価へは進めず未採用。次は模倣 warm-start の `seed125 imitation-gate` で、JS oracle 行動を初期方策に入れた場合に通常/strong系の非0が戻るかを確認する。

2026-05-11追記: `seed125 imitation-gate` は `--imitation-games 200 --imitation-opponents normal,strong` を追加し、250 games 時点の内部JS評価で `rl+normal+normal+strong=50%`, `rl+weak+weak+normal=50%`, `rl+strong+strong+strong=50%` まで戻ったため外部20戦へ進めた。しかし seed103 との同条件比較では `seed103=55.0%`（50% / 70% / 75% / 25%）に対し、`seed125=32.5%`（20% / 15% / 75% / 20%）で、特に `rl+normal+normal+strong` が大きく崩れたため未採用。registry / portfolio へは反映しない。`eval-seed125-imitation-vs-seed103-20.*` は生成物扱いでコミットしない。

2026-05-11追記: `seed126 imitation-only-gate` は、模倣だけでどこまで戻るかを見る診断として `--imitation-games 50 --imitation-max-steps 600` を使った。内部JS評価は `rl+weak+normal+strong=25%`, `rl+normal+normal+strong=50%`, `rl+weak+weak+normal=0%`, `rl+strong+strong+strong=25%`、score は0.325。seed125 の外部評価崩れを覆す材料にはならないため、外部評価へは進めず未採用。現時点では seed123〜126 の pass / JS mix / imitation 系は採用筋が薄く、次の RL 実験は seed103 の敗戦診断から単一の強い報酬仮説が出た場合だけ再開する。

2026-05-11追記: 採用済み `seed103` について、空港目前敗戦だけを狙う terminal reward の根拠があるか `rl,normal,normal,strong` と `rl,strong,strong,strong` の各100戦で確認した。全体では `win=49.0%`, `losses=102/200`, `avgLossGap=1.83`, `airportMiss=92` と空港未達は多い一方、`airportShortfall=21.3`, `airportLe3=1`, `airportLe6=4`, `airportAffordable=0` で、空港目前の小差負けには集中していなかった。狭い空港目前 reward には進めず、`seed103` 維持とする。出力 `models/rl_model/seed103-airport-race-100.json` は生成物扱いでコミットしない。
