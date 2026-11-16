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

## 次の二分：ゲームsubtreeの描画

c6170721 / [43778804091](https://github.com/nao70161994/machikoro/actions/runs/43778804091) は静止対照だけを選び、実盤面から7経路を生成した直後にgameScreenをdisplay:noneへする診断。body直下の独立plane、測定済み経路、アプリruntimeは残す。完了7件・1.5秒以内・各routeの60～540ms内の異なる位置2回以上・正本不変という従来検査を維持。隠した盤面で製品品質や実プレイを証明するものではない。候補製品コードの追加変更はない。

独立レビューは、静止対照でもobserver/timer等のruntimeが残るため、次の強い対照として「同じ盤面DOM/CSSをruntimeなしの別ページで描画」を提案した。描画subtreeを外した今回の結果を見て、同origin上のDOM複製と矩形一致を用い、描画構造と常駐runtimeを分ける。局所visibility/clipには全体RAF停滞の明白な原因は見つからなかった。

43778804091は失敗。ゲーム描画subtreeを非表示にしてもfinished0/期待7で、盤面の可視描画だけが唯一の原因という仮説は支持されない。artifact14187328140。次はruntimeなしの同じDOM/CSS対照へ進む。非表示操作自体が新しいlayout通知を起こし得るため、runtime原因の確定証拠とも扱わない。

## 同一DOM/CSSからアプリruntimeを除く対照

79400d86 / [43779138561](https://github.com/nao70161994/machikoro/actions/runs/43779138561) は、実際の終盤DOMを複製しscriptを除去、同originの診断URLへ遷移しTransfersだけを読み込む。DPR/viewport/CSS/画像を維持し、GameRuntimeStateが存在しないことと、100枚超のカード/ランドマーク/市場の個数・client矩形差0.5px以内を先に検査する。元の実ゲーム側のcanonical不変検査は維持する。runtimeなし側は正本が存在しないため、別のunchangedKind=frozen-board-domで盤面DOM不変を検査し、ゲーム状態保証と混同しない。演出7経路/1.5秒/各経路の異なる可視位置2回以上の検査は同じ。結果待ち。主PR未変更。

43779138561は失敗。runtime不存在・100枚超の個数/矩形差0.5px以内を通過した後もfinished0/samples0、frozen-board-dom不変true、経過1568ms。artifact14187905397の原寸開始画像ではカードアートと4方向卓を確認でき、明らかな全体欠落なし。常駐runtimeは再現の必要条件ではない。独立レビューは対照を成立と評価しつつCSS animation時計/canvas画素/SVG内imageロードは引継保証外と指摘した。

次の候補はflightFramesの最初のopacityだけ0から1へ変更する。成功したblank対照は最初から不透明であり、実Transfersは透明な最初のkeyframeを持つため、その差を切り分ける。経路・時間・終端フェードは維持する。これは原因仮説であり、WebKitが透明開始を抑制するとの確定説明ではない。Node Transfers・構文・差分検査は成功、実ブラウザで従来CPU/静止2件を確認してから判断する。

175e6842 / [43779549238](https://github.com/nao70161994/machikoro/actions/runs/43779549238) はCPU844終盤が失敗、静止盤面は全7経路の可視移動・完了を含め成功（1成功/1失敗）。初期opacityだけの変更で根本解消したとは言えず、以前の成功/再失敗もあるため再現性を確認する。artifact14187890960。

次は同じ候補に対し空画面のsimple/facility keyframe2対照・従来CPU/静止・実盤面のsimple keyframeをまとめて実行する。simple実盤面は診断用animate wrapperで16pxコインの始終点を数値translateへ換え、全7経路/時間/可視位置/正本不変のassertを維持する。製品採用のために演出を簡略化したテストだけを成功条件としない。

04b4b56b / [43779889182](https://github.com/nao70161994/machikoro/actions/runs/43779889182) は5条件中3成功/2失敗。blankのsimpleとfacility keyframeはともに成功。実盤面のoriginalは全7finished950msだが最初のsampleからcurrentTime600で可視途中位置0となり失敗、simpleは全7finished1471msで時刻0/268/350/594/600のsampleを取り成功。CPUは失敗。キーフレーム単独もruntime単独も必要十分な原因とは言えず、盤面と複雑な動きの組み合わせを残す。artifact14188145709の両static原本JSONを確認した。

次の4静止条件はoriginal、opaque（4frameの全opacityを1）、split（percent中心合わせとpx移動を別translateへ）、simple（数値translate2frame）を同じjobで比較。元の全経路/時間/可視途中位置/正本検査を維持し、blankの既知成功を重複実行しない。市場種類数の4幅操作/文字包含/状態不変検査も同時実行する。市場の件数表示は共有描画policyから算出し、関連Node2ファイル成功。独立実装担当とソース確認済みだが、画面確認前なので主PR未採用。

c8506719 / [43780486228](https://github.com/nao70161994/machikoro/actions/runs/43780486228) はoriginalとopaqueが失敗、splitとsimpleが成功。市場caseはBUILDで自動的に開いた市場dialogを閉じず最初の俯瞰ボタンをクリックし、dialogの正しい操作遮蔽でtimeoutした。製品側クリック不具合とは扱わず、テストを実close→俯瞰→summaryから拡大市場→filter操作→実closeへ修正。assert/timeout/forceは緩和しない。artifact14187679967。

splitを製品候補のflightFramesへ反映する。全4frameのtransform関数列を同じにし、percent中心合わせとpx移動を分離。時間/経路/scale/終端fadeは維持。並列は開始時からopacity1、順番確認は遅延中に先のcoinが見えないよう元のopacity0を維持する。両方の開始opacityと関数列/終端fadeをNodeで検査する。関連Node2ファイルは成功。これから4CPU条件・静止・順番確認2幅・市場4幅を一括検証し、商用品質・根本解決の判定は保留する。

8bf2dedf / [43781122735](https://github.com/nao70161994/machikoro/actions/runs/43781122735) は8件中静止・手動844/320の3件成功、CPU4件と市場1件失敗。splitだけでCPUの問題は解消していない。市場は通常clickを通過し、横持ちsummaryの固定44px幅に長い件数captionが折り返してRangeの上下がはみ出す製品CSSの問題を検出。filterは内容幅＋折返しなし、対応grid trackも内容幅へ修正し、目標44px・dialog最小44pxと既存段数を維持する。文字包含を緩和せず、native44px下限検査も追加する。

演出側は観測の切り分けを追加。テスト専用透過Element.animate wrapperで元のthis/引数/戻り値/例外を保持しWeakMapへAnimation参照を記録、生成coinの同じAnimationを固定して観測する。getAnimationsによる同期要求を避けるだけで、時計操作・経路/可視移動/finished/取消assertの削除はしない。先頭coinだけ100/300/800ms timerで予定/実時刻、pending/startTime/currentTime/document.timelineを記録し、追加style/矩形読み取りは行わない。独立レビューは条件付きで妥当と評価。getAnimationsが原因とはまだ言わない。次はCPU844終盤と修正市場4幅だけを一括実行し、既に通った手動対照は重複しない。

 efb288ee / [43782065480](https://github.com/nao70161994/machikoro/actions/runs/43782065480) は2件失敗。Animation参照を直接保持してもCPUは失敗し、getAnimations問い合わせだけが原因とは言えない。先頭coinは予定100/300/800msの観測でcurrentTime0/startTime=null/pending=true、document.timelineは9566→9830ms、hidden=false。開始待ちが継続していた。artifact14188439259の原本CPU JSONを確認。市場は次にgoalNativeWidth40<44を検出。共通summaryの既存min-height44にmin-width44も明記し、新しい寸法検査を削らない。

次の候補はfresh parallel batchの開始時刻だけを共有document.timeline.currentTimeへ一度設定する。finite numberかつstartTime未確定の場合だけで、既に開始済み・手動演出・timeline未解決には触らず、retargetで再設定しない。[Web Animations §4.4.4](https://www.w3.org/TR/web-animations-1/#setting-the-start-time-of-an-animation)の開始時刻設定はpending taskを解除するが、それだけで可視描画が滑らかになる保証ではない。Nodeで共有時刻0/1234、未解決/NaN/既開始/手動のfallback、retarget時計不変を確認し関連2ファイル成功。

補助専用Chromium mobile projectを追加し、DPR3/viewport/screen/touch/isMobile/UA・CPU速度・全assertを既存モバイルと揃えてengine差も観測する。物理iPhone検証やWebKit失敗除外の代わりにはしない。補助workflow/configは主PRへ移植しない。

89af03cb / [43782573118](https://github.com/nao70161994/machikoro/actions/runs/43782573118) はWebKit CPU失敗、市場4幅成功、同一条件Chromium CPU成功。開始時刻設定でWebKitの可視移動は解決しなかった。市場は件数/全文Range/目標非交差/通常click/最小44px/正本不変を4幅で確認、原寸PNGの目視レビューはこれから。artifact14189201265。

次は同一製品・WebKitのまま、(1)開始/演出中のスクリーンショット取得なし、(2)元の取得を残してXvfb上のheaded表示、を比較する。これらは観測/表示経路の診断であり、WebKit失敗を除外する根拠や物理Safari品質の証明にはしない。全7経路/時間/途中可視位置/状態のassertは同一で、前後画像を撮る別fixtureと動き測定を分ける必要があるか確認する。

bd29b387 / [43783172294](https://github.com/nao70161994/machikoro/actions/runs/43783172294) は、headlessの画像取得なしCPUが失敗、Xvfbでheaded表示し元の画像取得を保つ同一CPUが成功。artifact14189805683。375既存caseの失敗や製品ルールの問題とは混同しない。原因自体は未確定だが、WebKitの実行モードとの組み合わせで差がある。独立レビューは、同じ製品/ブラウザ版/DPR/fixture/全assertを維持し、既存375headlessを変更せず、新しい実描画caseのみheadedで追加検証する方式を条件付きで支持した。物理端末の証拠にはしない。

まずheadedでCPU序盤/終盤320/844の4条件・静止・手動844/320・市場4幅の8caseをretry0で確認する。成功前にCI方式変更や候補採用を完了扱いにしない。headless失敗の原本とコマンドは残す。

71e25ede / [43783873638](https://github.com/nao70161994/machikoro/actions/runs/43783873638) はheadedの8件中6成功。4CPU条件すべてで途中位置を採取でき、320序盤だけ収支札が全員配置されずunplacedで失敗。金額を一部の人だけに表示する変更や札の縮小・assert削除で隠さない。静止・手動2条件は成功。市場はheadedでhtmlがpointerを遮るためクリックtimeoutし、既に通ったheadless4幅と差がある。市場の新しい製品不具合と即断せず表示/入力座標の差も追跡する。artifact14189707498。

次はheaded320序盤だけを再現し、札plannerへ渡す実bounds/owners/obstaclesを既存datasetから1回だけ原本JSONへ記録する。追加layout測定はしない。データをNodeの純粋plannerで再現し、アンカーの有効性・候補格子・探索budgetを分けて修正する。今はheadless375ケースの実行方法を変更せず、新しい描画4ケースの採用も保留する。

0278980b / [43784743053](https://github.com/nao70161994/machikoro/actions/runs/43784743053) のheaded320序盤単独は成功。artifact14189692488の原本JSONで7回の可視sampleすべて収支札4人complete、手番1へ正常進行を確認。前回8case時は9sampleすべてunplacedだったため、再現不安定な未解決問題として扱う。今回取得したplanner入力は成功時のものであり、失敗原因の証明には使わない。別途、12px格子が合法な狭い隙間を見逃す純粋helperの反例をNodeで再現したため、障害物端に沿う有限候補追加を検討する。実320失敗との因果は未確認。

格子欠落の小修正：既存owner近傍と12px格子に加え、障害物端/領域端をownerの座標へ投影する候補を最大256件追加。無制限なedge直積を避け、札40×26の反例で旧null→合法top8、2px間隔・入力不変・探索budgetをNodeで検証。取得済成功320原本（4owners/21obstacles）も4人配置を保つ。関連Node31件と構文検査成功、独立ソースレビューで具体的な安全性欠陥なし。ただし有限探索の完全性は保証せず、実320の不安定さの原因解消ともまだ断言しない。次はheaded4CPU+静止+順番確認2幅と、既存のheadless市場4幅を一括実行する。既存375headlessの設定は変更しない。

ea3f8455の補助workflowはgrep内の「: 」をYAML通常scalarに書いたため構文で拒否された（run43785575865、実テストjobなし）。製品/テスト失敗と混同せず、runをfolded block scalarへ修正する。

f8b4522f / [43785672297](https://github.com/nao70161994/machikoro/actions/runs/43785672297) はheaded7件中6成功。320序盤は全員札unplacedが再現し、edge候補だけでは解消しなかった。artifact14190815443の失敗原本netBadgeInputをNodeへ渡して同じnullを再現。1px格子でも左席owner1の候補0で、探索budget切れではない。成功時は上席名が右上、失敗時は左上に移り、左席名の上の26px空間を塞ぐ。上席名の位置だけを合法な右上へ移した同データでは全4人配置が成立した。

名前の配置時に、余裕があれば隣接36〜96×26の収支用空間を記録し、後続名はそれを塞がない既存合法候補を優先する。名前全文・既存衝突・所有施設への近さは維持。空間のない場合は名前を隠さず既存配置へfallback、金額の最終全員検査も維持する。pure helperと回帰を追加し関連Field18件成功。実ブラウザの効果はこれから検証する。

同run市場caseは45秒枠で1440pxのaffordable click中に終了。320/390/844の原本PNGは生成済み。製品不具合の不在はまだ断定しないが、4幅12状態を一つのtestに重ねる構造を幅ごとの4caseへ分割し、各caseの45秒と全assert/通常clickを維持する。主ブランチにもこのテスト分割だけ反映した。

予約の独立ソースレビューで具体的な安全性欠陥なし。予約は順位付けだけで、実金額幅や最終nearest-owner成立は保証しない。原本planner入力を[成功](assets/auto-result/owner-receipt-320-success.json)・[未配置](assets/auto-result/owner-receipt-320-unplaced.json)として保存。3b9b6f9eの一括検証は[43891643961](https://github.com/nao70161994/machikoro/actions/runs/43891643961)で進行中（2026-11-17 JST）。

3b9b6f9e / [43891643961](https://github.com/nao70161994/machikoro/actions/runs/43891643961) は11件すべて成功・retries0。headedの4CPU（320/844×序盤/終盤）、実盤面静止1、順番確認844/320が7/7、headless市場320/390/844/1440が4/4。artifact14236853693。配置修正後に初めて4CPU条件が同じbatchで全成功した。これだけで安定性・物理端末・商用品質を証明したとはせず、原本JSON/画像確認と本採用後の全体CIを続ける。

統合後の自然対局は主46371bf8をcheckoutで固定し、既存ui-playthrough.spec.jsを変更せずheadedで実行する。320/1440は2人、390/844は4人、通常CPU1500ms、乱数/出目は固定しない。開始から勝利と既存のカメラ/状態不変/実UIクリック検査を維持し、fixtureの4CPU成功とは別の証拠にする。
