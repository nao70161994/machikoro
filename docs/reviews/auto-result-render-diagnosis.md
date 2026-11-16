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

## 実盤面上の静止対照と開始・plane分離（2026-11-16 JST）

3a13b902 / [43731937914](https://github.com/nao70161994/machikoro/actions/runs/43731937914) はCPUを止めた密集盤面上で同じTransfersを起動。1500ms内にfinished0・samples0、正本不変true。CPU進行だけが原因とは言えない。静止対照はゲーム進行検証ではなく演出単体の診断である。

a031238dはautoのpause/currentTime=0/2RAF再開を除去してnative開始へ委任。retargetは時計を触らず、hidden開始を拒否しvisibilitychangeで停止、clearでlistenerを除去する。旧unitの2RAF契約はnative開始・時計不変・clear/置換/reduced/hiddenで停止・再開なしへ同じscopeで更新。Node2ファイル/checkJs4構成/独立レビュー成功。[43732399483](https://github.com/nao70161994/machikoro/actions/runs/43732399483) はCPU844終盤finished欠落。静止対照はfinished検証を通過しても可視移動2frameが不足して失敗した。完了件数だけを成功扱いにしない。

3a78dac2はautoのcoin/owner金額planeだけをbody直下へ分離。固定boundsは盤面のclient rectへ追従し、同一値を書かず、retargetでも時計を変えない。endpointはlayer内の金額も避ける。manualは元のcontainer。Nodeでroot境界追従/取消後の残留なし/時計不変を追加し、型検査・独立レビューも成功。しかし [43732983605](https://github.com/nao70161994/machikoro/actions/runs/43732983605) はCPUと静止対照の両方で失敗。主採用は保留。独立planeによる原因解消・性能向上の主張はしない。browser observerの監視rootは、実際の描画先を採取するためbodyへ変更したが、全経路/時間/可視移動/非被覆のassertは維持する。

## Observer計測とlayout zoom候補

08964ea9 / [43777023995](https://github.com/nao70161994/machikoro/actions/runs/43777023995) は844終盤で失敗。上限付きobserver計測は47 callback、camera ResizeObserverは3回・合計51ms・最大44ms、body MutationObserverは25回・合計11ms・最大4msだった。計測範囲内ではobserverの無限連鎖を確認できない。native worldは4509×1482pxから4917×1482pxへ変わり、viewportは824×218pxまで縮む。これだけで描画面積が原因だとは断定しない。

0584abd8は俯瞰・角度0・対応ブラウザに限りCSS zoomを用い、論理camera matrixを維持して6係数をzoomで除す候補。正面閲覧は従来transform、destroyで元zoom/transformを復元する。Node関連3ファイル・checkJs・構文・差分検査は成功。実CSSの座標一致は数学テストだけでは証明できないため、100枚超のカード/ランドマーク/市場のclient矩形を旧方式と比較する。幅・個数・最大差0.5pxと、従来の7経路の可視移動/完了/名前非被覆を全て保持する。静止対照の方式切替がCPU対局の描画を温めないよう別caseにする。

[ネイティブ検証43778316234](https://github.com/nao70161994/machikoro/actions/runs/43778316234) を起動。結果未確認。候補は主PR未採用であり、性能改善・商用品質を達成したとは扱わない。正面閲覧/復帰/resize等の追加確認も採用前に必要。

43778316234は終了して2件とも失敗。CPUは7経路の完了検査で失敗、静止座標対照は最大差6.6042633056640625pxで0.5px基準を超えた（native幅一致と100要素超は通過）。zoom候補は却下しcamera/helper/追加座標検査を元に戻す。許容値変更で採用しない。独立レビューでも方式切替後の復帰とobserver収束は未保証と指摘された。artifact14186973967を原因追跡用に保持。
