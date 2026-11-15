# 自動収支演出の描画診断（2026-11-16 JST）

主PR #19へは未採用。Goal未完了、マージ保留。主3e3940daはRelease43729456680・16画面43729456790成功、同一製品883a0831のNightly43727592329は375件/retry0/stable=trueで成功済み。

## 計測と実装

- 補助256b41cf / [43729892190](https://github.com/nao70161994/machikoro/actions/runs/43729892190)：全RAF callbackの要求/入口/出口と200ms heartbeatを軽量・上限付きで記録。callbackは多くが数十ms以内、最長layout254ms。フレーム待機は最大6028ms。7経路生成後finished0。timerはその間にも動く。[原本](assets/auto-result-render-diagnosis/before-label-cache.json)。
- 補助146308f0 / [43730635759](https://github.com/nao70161994/machikoro/actions/runs/43730635759)：同じ幾何でowner札のDOM削除/再生成とheading opacity/style再代入を避ける。viewport/scroll/障害物・panel・heading矩形/全名前/font/席色とpanel/layer参照を照合し、inspection等では解除。Node対象2ファイルとcheckJs4構成、独立ソースレビュー成功。しかし同じ標準モバイル844終盤はfinished0、最大RAF待機6031msで未解決。[原本](assets/auto-result-render-diagnosis/after-label-cache.json)。処理改善が根本原因を解消したとは扱わない。
- 補助da080bfb / [43731069788](https://github.com/nao70161994/machikoro/actions/runs/43731069788)：ゲームJS/CSSなしの同一標準モバイルDPR3・844×390・最初のscreenshot・paused2RAF後開始・600ms×7経路は成功。全7finished718ms、1503msで88frame、最大gap99ms、各経路60～540ms内の異なる位置を2回以上確認。[原本](assets/auto-result-render-diagnosis/blank-mobile-control.json)。環境一般の制約だけではゲーム側の失敗を説明できない。

## 否定された単独仮説

従来成功はDPR1だけでなくisMobile=false/hasTouch=falseも変更していたため、DPR単独の改善証拠ではない。同じ設定の再実行43729349147もfinished欠落し、実タップ後の標準mobileも失敗した。no-promotion/no-lift43727759514、SVG visibility hidden/no-shadows43728163335、no-other-animation43728528079、DPRとisMobileの交差43728906581でも完了漏れが残る。world visibility hiddenはfinishedを通過しても可視geometry0なので成功証拠ではない。

補助2396e2ba / [43731356321](https://github.com/nao70161994/machikoro/actions/runs/43731356321) はfactoryだけを従来use／同寸法の空SVGへテスト内routeで置換したが、両方finished欠落。画像方式単独の原因説は支持されない。製品のアートを削ったりassertを緩和したりする変更ではない。

Linux WebKitで処理が抑制される[上流報告](https://github.com/microsoft/playwright/issues/41044)も調べたが、対象はWorkerであり今回の原因の証拠ではない。blank対照は実際に成功しているため、上流問題を理由に失敗を除外しない。

次はゲームの更新/observer処理と、静止した実盤面上だけの演出を比較し、更新で生じる描画待ちを分ける。CPU1500ms、演出600ms、全7経路の接続中・可視・異なる位置・完了・所有者札/名前の非被覆を維持する。未達のP2候補は主へ採用しない。
