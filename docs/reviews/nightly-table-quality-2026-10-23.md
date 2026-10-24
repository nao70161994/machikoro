# 夜間回帰とカード卓品質改善（2026-10-23）

## 目的・進行状況

PR #18までの成果を維持し、回帰の正常化と全モードの実プレイ品質を改善する。四方向の所有カード＋中央市場を維持する。作業ブランチ `feat/nightly-table-quality`。マージは保留。

未完了：WebKit/通常Releaseの成功確認、実対局完走、全画面条件の画像比較、独立再レビュー、PR。

## 再現元

基点main: `a265ca7e99fa786191f633568ee89bb5fd190a27`。
同一commitの直近3回が35分でcancelledになった。

- https://github.com/nao70161994/machikoro/actions/runs/39859235094
- https://github.com/nao70161994/machikoro/actions/runs/39681495562
- https://github.com/nao70161994/machikoro/actions/runs/39502306142

実際の選択対象は318件（WebKit316、Chromium2）。1 workerで全対象を実行していた。途中で打ち切られており、未到達のテストを成功扱いにはしない。共通19件、和集合23件の失敗をログから確認した。

## 失敗の分類と対応中の内容

|領域|原因・方針|
|---|---|
|5/10人の人数期待値|旧3席限定の期待値。全所有カードの現仕様を維持し、全席・カード内容を検証する|
|320pxカード幅|全体俯瞰と正面閲覧を区別し、操作による正面閲覧で70px以上を検証する。全席一覧も維持する|
|市場の排他制御|実不具合。native dialogへ移動した市場がイベント処理対象外だったため両rootを処理する|
|ログ・比較・更新通知併用|閉じたその他メニュー内のボタンを直接クリックする旧操作経路。実際のメニュー展開から検証する|
|回転カード収支・休業|実不具合。擬似要素の行高と元テキスト行の競合、収支・休業の重なりを整理する|
|紫施設4種|一時的演出DOMの同期取得を見直し、確定収支の施設・所有者・相手・金額を検証する|
|長い名前HUD|実不具合。折り返し可能にして省略なしで表示する|
|市場12出目|全カードが収まる場合と内部overflowがある場合を実測で区別し、カードがクリップされない契約を維持する|
|1440px3人卓|実ブラウザで寸法と祖先clipを調査中|
|比較終了後focus|閉じたmenu内へfocusが戻らない可能性。元のdisclosureを開いて操作位置へ復帰する|

## CI構成

全projectを標準Playwright shardで6分割し、runner当たり1 workerを維持する。全件と各shardの一覧、実行結果を照合し、欠落・重複・未実行・中断を検知する。timeout延長やforce click、assert削除で解決しない。

## 検証記録

ローカルはTermux Chromium、1 browser/worker。自動ブラウザであり物理スマートフォンの実機確認ではない。WebKitはGitHub CIで確認する。スクリーンショット差分だけで美しさを保証しない。

P1/P2評価は320/390縦、844×390横、1440 PC、2〜4人中心・5〜10人適応、序盤〜終盤〜勝利、カードの対応・閲覧復帰・市場・演出の時系列を対象にする。公式画像/PVとの比較と独立レビューを記録し、残差を隠さない。

### 初回検証と追加発見

- `npm test`（unit）成功。追加のCI inventory unit4件成功。
- Chromium一括24件: 21成功、3失敗。追加修正前の途中結果であり完了ではない。
- 1440px3人市場のbuy buttonがカード枠border分だけはみ出す実不具合を再現。子buttonを親内寸100%へ変更。
- 比較画面はcardboard初回ではPlazaField未mountの早期returnにより内容空になる実不具合。共有比較だけ先に描画するよう修正。
- 回転カードの休業・収支は二つの行を分離。旧行boxが残る問題をflex化して解消。出目の行は実際の文字の高さを確保する。
- 市場スクロールはcamera変換後のscreen距離をintrinsic scroll量に加えていた。layout座標で計算し、列数確定の後にrevealする。
- 観戦者(selfIndex=-1)を現在手番本人と扱う旧assertは、全10席・正しい選択席・所有カード一致・ゲーム状態不変の検証へ修正。観戦者に「あなた」の誤表示をしない。
- 市場出目12は1440pxだけでなく390pxケースも追加したため選択総数は319件になる。全画面内に候補が既にあるときはスクロール不要。狭い棚で隠れた候補は実際の移動と完全可視を検証する。
- CI独立レビューで最終retry中断の見逃しと広すぎるopt-in skip許可を発見。最終attempt中断は拒否し、既存1件のproject・タイトル・skip理由に限定した。

### 公式比較の一次資料

- 公式サイト: https://m-machikoro.g-rounding.com/
- 公式実画面: https://m-machikoro.g-rounding.com/images/about_01.webp
- 公式カード: https://m-machikoro.g-rounding.com/images/style_01.webp
- 公式PV（サイト埋込先）: https://www.youtube.com/watch?v=wpWuKtMiMc0

公式実画面を目視した。四方向カード＋中央市場の構成は一致する一方、公式は発動カード・獲得額・連鎖の大きな表示が盤面と一体化している。現状の卓は平面的で、発動時の主役切替・キャラクターの反応・空間の華やかさに差がある。公式アセットは製品へ取り込まない。PVの時系列視聴はまだ未実施であり、静止画確認と混同しない。

### 再レビュー後の追加修正

- 独立レビューで390pxの開いた収支が建設操作を覆うことを発見。操作欄の実測上端に合わせ、収支・ログの下端位置を更新する。メニューを明示的に開いたときはログより前面に表示する。
- スマホ市場ヘッダーは見出しと拡大を同じ行へ集約。44px操作高を維持し、分類ラベルは新しい出目帯高と位置を揃えた。
- 狭幅出目12テストは1個のサイコロへ12を渡していたため、確定出目metadataとして無効だった。駅→2個→6+6の正しい経路へ修正。元テストの自動移動未発火と、変換座標の製品修正を区別する。
- 再確認6件すべて成功（市場・ログ排他、更新通知中のSELECT_DICE/REROLL_CONFIRM/HARBOR_CHOICE、390/1440の正規出目12）。`artifacts/nightly-quality-p0-controls`。
- 旧readable倍率0.95固定assertは実寸へ合わせて1.6まで拡大する現仕様と不整合。最低倍率と実カード幅、拡大・縮小、全体倍率の復帰、状態不変を検証する形へ更新した。
- 変更後 `test:types` 成功。
- Draft PR: https://github.com/nao70161994/machikoro/pull/19
- 最初の分割CI: https://github.com/nao70161994/machikoro/actions/runs/39877929675 。全体成功はまだ未確認。

公式PVの取得はTermux ffmpegのlibplaceboリンクエラーで失敗。PVの時系列比較は未検証のまま。環境を破壊するライブラリ更新はせず、公式静止画比較を進める。

## 継続記録（2026-10-24）

前のGoal turnは実装・完走検証・全件CI結果を得た進捗。Goalは未完了。

### 実対局の証拠

390×844、自動ブラウザの人間席UI操作＋CPU弱（速度1500ms）で77ターン、約14分、勝者プレイヤー1まで完走。人間側192アクション、291クリック、39回市場を開き、特殊効果・振り直しを実操作。pageerrorは0件。相手正面閲覧→Backの2操作は約874ms、倍率/角度と正本状態が復帰した。これは自動操作であり物理端末・人間の感性によるプレイ評価ではない。

- [実対局の勝利](assets/nightly-quality/actual-ui-winner-390.png)
- [実対局の出目確定](assets/nightly-quality/actual-ui-dice-motion-4-390.png)
- 詳細JSON: `artifacts/nightly-quality-ui-playthrough/*/ui-playthrough-summary.json`

### 同一fixtureでの改善前後（実対局とは別）

|幅|main|修正後|
|---|---|---|
|320|[前](assets/nightly-quality/main-320-late.png)|[後](assets/nightly-quality/after-320-late.png)|
|390|[前](assets/nightly-quality/main-390-late.png)|[後](assets/nightly-quality/after-390-late.png)|
|844横|[前](assets/nightly-quality/main-844-late.png)|[後](assets/nightly-quality/after-844-late.png)|
|1440|[前](assets/nightly-quality/main-1440-late.png)|[後](assets/nightly-quality/after-1440-late.png)|

### 回帰の追加発見と修復

- 固定containerのNightly `39879663667` は全319件の実行結果を集約できた（WebKit317/Chromium2、既存opt-in UI対局1件は別実行）。35分の打ち切りは解消したが、25件失敗のためCI正常化は未達。
- [失敗一覧](nightly-quality-ci-failures-75e3f377.json)。後半のfocus、ガイド、夕暮れの旧geometry期待、画像差分等を調査継続。基準PNG・許容差の自動更新は行っていない。
- reading休業badgeと経済効果の実重なりを修正。art62px/native160×124/経済効果は維持し、非発動時の休業pillをアート端へ分離。8ケース（38施設・四サイズ全景・上席収支休業・小待機室・送金）成功。独立静的レビューも重大指摘なし。
- 内訳を開くと排他処理が祖先の出目パネルまで閉じる実不具合を発見。祖先detailsを除外する修正とNode回帰を追加した。ブラウザ検証中。
- fixtureはCPUオブジェクトだけ消さず、設定も実際に人間席として初期化する。CPU自然対局の検証とは区別する。
- 通常unit全件の再実行成功。CI契約の追加targeted Node成功。
- 公式PVは代替取得したfragmented MP4をブラウザへ渡したが、抽出画像は黒画面で無効だった。テストprocess成功を映像比較成功とは扱わず、PV時系列比較は未検証。公式静止画のみ比較済み。

残作業：全失敗原因の修復、16画像の厳密な目視比較（固定環境のフォント差と製品差を区別）、Release/Nightly安定成功、最新状態の独立再レビュー、PR本文の最終化。PR #19はDraft・未マージを維持する。

### 追加再検証と公式PV（10/24）

- 出目内訳の祖先details保持はNode4件とブラウザの同出目更新/フォーカスで成功。高コントラストregionはaria-live無効時も空regionが存在する契約を検査する。
- ランドマーク表示は320/390/1440を別ケースに分け、3件成功。狭幅・多種類名、縦持ちガイド、夕暮れの2施設district artも再検証成功。
- 高速市場往復は可視の起動ボタンから開閉し、20回のテーマ変更と同一市場DOM・正本不変を保持して2ケースへ分割。固定8列ではなく実際の市場列数/可視行数で全カード名と表示カードの四辺を検査する。
- 施設連鎖の実フレーム観測をロール前にarmし、撮影/プロトコル遅延の影響を避ける。金額/所有者/順序/opacity/既存時間閾値は変更せず再検証成功。建設通知も同様の観測へ修復中。
- 横持ちHUDは実測203×44px、文字12px。既存52px条件に未達。ツールバー44pxとラベルfitはChromiumで成功したがWebKitを再確認する。
- 公式PVのfragmented MP4はMediaSource経由なら129.229秒の映像として再生可能だった。70→82秒を実時間12秒連続再生しpaused:falseを確認、65/70/72/74/76/78/80/82/84/86/88/90秒を撮影・目視した。以前の黒画像は比較に使わない。
- 参照元は[公式Steamページ](https://store.steampowered.com/app/1969860/)のPV配信（store API取得movie pv_jp）。映像ファイル・公式画像を製品やリポジトリへ取り込まない。
- 公式72秒では大型の透明サイコロが中央市場の前に出る。80秒は建設カードを画面中央へ大きく持ち上げ、周辺を暗くして主役を明確にする。84秒はランドマークの発光とプレイヤー表示が連動する。現状は四方向と全体復帰の構成は成立するが、この大型演出・卓面の光・プレイヤーの反応が同期する一体感には差がある。商用品質と同等と断定しない。
- PV証拠: `artifacts/nightly-quality-official-pv-gameplay/`（権利物のためローカル参照のみ）。自動ブラウザの再生確認を実機/公式ゲームの操作体験と混同しない。

### 独立レビュー・固定環境候補の扱い

- 11組33枚のexpected/actual/diffを独立目視。cardboardは所有者ラベル近傍化と市場見出し整理、plazaは手番chipと種別表示の意図変更が主。重大な新規遮蔽は認めなかった。共通の文字幅/emoji差は環境由来の疑いに留め、原因確定とは記さない。
- classic基準最終692ba012（10/8）、plaza横基準4d4ac579（10/11）、facility-art.svg正本は9e9615c8（10/4）。その後c73c28c0（10/15）で外部useからprefix付きinline SVGへ移行している。旧baselineの暗い細部を現アート正本の期待値と断定できない。描画準備完了を待ち、固定環境で全16候補を再生成して再レビューする。許容差は変更しない。
- 横持ちplaza HUDは親/各buttonを52pxに同期し、2段の間へ4px空間を追加。既存の52px/文字12px/盤面180px以上/クリック可能/縦320・390へ復帰の全検査が成功。独立レビューも3画像とcommit2af7740fを確認し、重大な重なり無し。10人や長名をこの3枚だけで保証しない。
- 市場高速往復2ケースは両方成功。Plazaの可視市場を実panして画面外へ動かす条件では、focus成立後も完全包含しない実不具合を追加再現したため製品側を調査する。非表示市場へfocusしていた旧fixture問題とは区別する。
- `test:types`、`node tests/release-e2e.test.js`、`node tests/main.test.js`成功。ownerラベル候補配列にtuple型注釈を追加した（runtime不変）。

### 固定WebKitの実UI完走と画像候補

- [実行40070663943](https://github.com/nao70161994/machikoro/actions/runs/40070663943)、SHA5eea9eac。全16画像候補の生成と、縦・横の実UI対局がすべて成功した。これは候補生成/実UIのworkflowであり、Release/Nightly全体の成功とは区別する。
- 縦390×844：53ターン、266026ms、139アクション/230クリック/31回市場、pageErrors0。横844×390：64ターン、273709ms、151アクション/243クリック/33回市場、pageErrors0。CPU速度100ms、実UIクリックとCPU助言のみ、出目・勝者のfixtureなし。
- 相手正面閲覧→全体復帰は両方2操作、縦670ms/横545ms。倍率・角度・正本状態の復帰が成功。
- [縦終盤](assets/nightly-quality/webkit-ui-portrait-late-game.png) / [縦勝利](assets/nightly-quality/webkit-ui-portrait-winner.png) / [縦操作記録](assets/nightly-quality/webkit-ui-portrait-summary.json)
- [横終盤](assets/nightly-quality/webkit-ui-landscape-late-game.png) / [横勝利](assets/nightly-quality/webkit-ui-landscape-winner.png) / [横操作記録](assets/nightly-quality/webkit-ui-landscape-summary.json)
- 全16候補を独立レビューし、重大な新規遮蔽・アート欠落なしと評価して採用した。文字幅/emojiの原因は環境由来の疑いを残す。現行inline artと手番表示・ラベル・市場配置・52px HUDを基準へ反映し、元の差分許容値0.012は維持する。候補更新だけで完成と判断せず、次の厳密なRelease/Nightlyを必須とする。
- ローカル建設フライトは320/390の実フレームで通過、844ではclose後のRAFが259/934/1193/1540msと遅れ、1500ms観測期限の時点でanimation currentTime0だった。origin/target/角度/visibility/RMは正常、製品guardの不成立とは異なる。期限・480ms寿命・60〜400ms観測帯は維持し、WebKitで照合する。端末の描画遅延は品質課題として隠さない。

### 広場のfocus実不具合の解決

- 可視の市場を実zoom/panした後、focusされたカードのbottom864に対し盤面bottom740で124pxはみ出す状態を記録（active:true）。`paint()`はnative scrollを0へ戻すが、`revealFocus()`はその前のスクロールされた矩形を読んでいたため、計測と描画で座標系が異なっていた。
- `revealFocus()`でもscrollを0へ戻してから計測し、focusイベント後のUAスクロールを同じactiveElementの場合だけ1RAF後に再照合する。ドラッグ中・モード離脱の既存guardは維持する。
- 実panで画面外になった事前条件、場外release後のパン停止、focus成立、カードの四辺完全包含、390pxへ変更後の包含をすべて維持して再検証成功（`artifacts/nightly-quality-plaza-focus-fixed/`）。単に非表示targetへの旧focusを直しただけで済ませず、追加再現した製品不具合も修正した。

### 7bc15c70のCIと、残り5件の根治

- [通常Release40071307566](https://github.com/nao70161994/machikoro/actions/runs/40071307566)は全job成功（unit/release/CPU smoke、title等、card table、seeded2人/4人plaza/4人cardboard）。
- [Nightly40071328648](https://github.com/nao70161994/machikoro/actions/runs/40071328648)は全件終了・coverage成功、失敗は25→5件。simulation/online soak/release/pwa/online部分は成功。夜間全体は未達のまま。
- 建設フライト：WebKitでもclose後84/724/1533msという長いframe間隔を再現。focusCardは同期配置/paint済みなので、以後の余分な1RAFを除去。session/entry/visibility/RM/angle/clip/途中移動取消のguardと、1500ms観測期限・60〜400ms実フレーム・480ms寿命をすべて維持したまま、Chromiumの4幅が成功。独立静的レビューも重大リスクなし。
- plaza縦スクロール2幅：pointer由来focusinが予約したRAFがpointerup後にカードへ再追従し、ドラッグ量を戻していた。pointer中はfocus RAFを予約せず、新pointerdownで前の予約世代を無効化する。keyboardの即時/次RAF追従は維持。390/1440のscroll量/transform/ログtapすべて成功（ローカルcontextのhasTouchを有効にして実tap）。
- HUD52で短横盤面が214pxへ縮んだ原因は、共通portrait selectorの特異性がlandscape操作帯の48px/padding0に勝って56pxになっていたこと。selectorを揃えて48pxを有効化し、既存HUD52/タップ44/盤面>220pxを維持。844終盤と10人市場のカード名/建設費の包含も成功。高さexpectを緩めていない。
- 10人HUDのexact44旧期待は、既存52契約へのexact52として更新。市場の診断JSONを追加し、包含assertは維持。
- 独立実対局レビューで発見した縦中盤のランドマーク切れは、CPU通知でviewportが縮むROを80ms debounceしていたため、最初の描画に旧fitが残る経路があった。overviewだけRO配信中にfitし、free/readableの既存anchor/debounceは維持する。
- 新たな通知レイアウト回帰は、製品のactivity表示＋親grid表示をfixtureで再現し、最初の描画で全所有施設・建設済5ランドマーク・全player・市場の四辺包含/正本不変を検査して成功。CPU行動そのもののテストとは区別する。復帰後も全体包含を確認した。初期test fixtureの親表示漏れ・非表示の未建設まで対象にした誤りを解消しており、製品不具合を許容する変更ではない。
- 4件＋入力2件＋通知1件の最終関連ケースは成功。通常unit全件も再実行成功。変更後の固定WebKitでNightlyを再確認する。CSS操作帯8pxの意図変更があるplaza844基準は、候補再撮影・目視を経て更新する。

### 最小の演出磨き込みと、横持ちの残高ラベル

- にぎわい広場のrollingだけ、平面の360°spinから浅い浮遊・X/Y傾き・着地へ変更。出目の面を裏返さず、既存確認dieと同じ縁/固定影で重量感を揃える。600ms・JSの進行時刻・確認layer・再生guardは不変。transformのみを動かし、影は動かさない。
- 320/844/1440の既存操作/表示/正本検査に、新600msとアプリ設定/OS両方のReduced Motionのanimation:noneを追加して成功。
- 別途、実btnRollからbefore/afterをそれぞれ操作してbuild到達。clock/寿命は変更せず、実RAFでbefore99.93msの2D matrix、after99.94msのmatrix3dを観測、両方duration600msだった。撮影フレームの厳密な同時刻性は保証しない。
- [実ロール前](assets/nightly-quality/dice-toss-before.png) / [実ロール後](assets/nightly-quality/dice-toss-after.png)。これは2別対局のロール画像で、静止16基準やfixture固定出目とは別。
- plaza横HUDでは残高『11コイン・自分』の末尾が隣席境界で切れる残課題も修復。短横だけ単位を金色コイン記号へ置き換え、『数値・自分』を保持する。他幅の『コイン』とbutton aria-label全文は維持。wallet/selfの四辺包含を追加し、HUD52px/操作44px/盤面/縦復帰も既存検査で成功。
- 独立レビューは上記diffと横HUD画像を採用可と評価。極端な大金/長名の全組合せと、人間の主観的な動的評価までは保証しない。
- 最終UI変更前の`test:types`は全project成功。最新のCSS/財布span変更でルール/同期/保存形式は変更していない。

### 再レビューで否定された解消判定と追加診断

- [実UI40089950591](https://github.com/nao70161994/machikoro/actions/runs/40089950591)、source2ee4f26cは縦71ターン/338704ms/173アクション/276クリック、横75ターン/516061ms/213アクション/318クリックで完走、双方pageErrors0。相手閲覧→復帰は659/896ms。
- しかし独立画像レビューでは縦midgameの駅/港下切れが再び見られた。RO単独テストの成功を実対局全体の解消証拠とはしない。縦late/winnerと横3状態は良好だが、中盤切れの原因はまだ未確定。
- 中盤の撮影前後と非同期8RAFでmode/scale/expectedFit、worldとviewport寸法、全owner/builtランドマーク、CPU通知/操作欄/phaseを採取する診断を追加。撮影前にfit完了を待つ変更はせず、元画像の問題を隠さない。RAFはpaint前なので一瞬の測定だけで可視不具合とも断定しない。
- ローカル部分実UI（60アクション打切り、2.2分）はmidgame turn21の人間rollで、viewport660px・scale0.497（期待0.496614）・8frameとも全所有群/ランドマーク包含で再現しなかった。これは未完走の診断runであり、WebKitのCPU処理中の問題を否定する証拠ではない。
- 財布短縮後のWebKit候補も、自席wrapperのauto intrinsic幅がchild203pxより縮み、隣席が『自分』と目標を覆うことが判明したため不採用。Chromeだけの成功で採用しない。wrapperとchildへ同一のflex-basisを明示し、walletがbuttonだけでなくwrapper内にも収まる検査へ強化した。新WebKit画像の採用判断は次の生成・目視後とする。

### WebKit自席候補の再採用

source9a054f9fの固定候補では、自席walletと目標末尾が完全表示され、相手枠との重なりが解消したことをrootと独立レビュアーの両方で確認した。旧不良候補は採用せず、この844px一枚だけを更新する。他15枚は既採用PNGとバイト単位で完全一致。元の許容値で厳密な画像比較/Release/Nightlyを再実行する。縦中盤切れの解消とは別件であり、同問題はWebKitの追加診断待ちのまま。

### 実対局中の俯瞰切れ：通知と縮尺の更新時点を特定

- WebKit自然対局 `40092028837`（9a054f9f）の縦持ちは65ターン、157操作、374775msで勝利まで完走し、pageErrorsは0件。ただし中盤画像に切れが残った。完走成功と視覚品質は別に評価する。
- `ui-playthrough-midgame-geometry.json` ではワールド寸法728×1329は不変。CPU処理通知で盤面高さ660→629pxになった時、縮尺は旧寸法の0.497のままで、必要な0.473288へ遅れて変わる。その後通知が2行になると高さ615pxへ縮み、縮尺0.473が必要値0.462754へ追従するまで自席ランドマークが切れる。所有カードの測定キャッシュではなく、通知DOM更新とカメラ更新の時差が直接原因。
- 通知と親コンテナの表示更新直後に `CardBoardField.syncViewport()` を呼び、表示中の俯瞰で実寸が変わった場合だけ同じ処理内で再fitする修正を追加。正面閲覧・手動移動・非表示・他テーマは変更せず、既存ResizeObserverはワールド寸法変更等の追従用に維持する。
- mainの回帰テストは通知ラベル・親表示更新後に同期APIが呼ばれる順序を検証し成功。実ブラウザと自然対局での修正後評価は未完了。
- 最新通常Release `40092428677` は全ジョブ成功。Nightly `40092435610` は実行中で、少なくとも夕暮れの広場844pxの領域分離に1件失敗。全体成功とは扱わない。
- 修正後のローカルChromium通知回帰は成功（`artifacts/nightly-quality-sync-notice`）。RO配信前の同一JavaScript処理内と最初の描画で、全所有施設・中央市場・建設済み5ランドマークの四辺包含を検証。正面閲覧中の同期APIはfalseを返し、倍率・角度・焦点・変換・ゲーム正本は不変。main回帰と `npm run test:types` も成功。WebKit自然対局の再確認は別途必要。

### 横持ち夕暮れの広場：ツールバーの1px越境

- Nightly `40092435610` shard4の844×390領域分離失敗をローカルでも再現。採取したDOM実測では盤面y96〜342/高さ246、操作帯y342〜390/高さ48、ツールバーy341〜385/高さ44。盤面の高さ不足ではなく、ツールバー上端の1px越境だった。
- 高さ48pxの操作帯（上下border各1px）内に高さ44pxの絶対配置ツールバーをbottom4pxで置いていたことが原因。bottomを `calc(1px + env(safe-area-inset-bottom, 0px))` とし、44pxの操作対象を維持して操作帯の内側へ配置。safe-area予約も維持。
- 独立調査でも実測・CSSの計算が一致した。判定の緩和・強制クリック・fixtureの隠蔽は行わない。ROLL/BUILD各状態の領域実測JSONをテストの添付資料に追加した。
- 7d63632cの通知同期APIも独立静的レビューを通過。正面閲覧・自由移動・他テーマ・正本への介入、描画ループの追加は認められなかった。DOM更新後の同期寸法読み取りは増えるが、寸法が変わった俯瞰だけ再fitする。

### WebKit計測負荷の分離（検証中）

- Nightly6eの最終結果は4件失敗（市場高速往復2batch、建設flight、広場の領域分離）と発動帯1件flaky。全件実行の網羅性検査は成功しているが、夜間正常化は未達。
- 建設flightの診断では追加993ms・削除1475msの実480msアニメーションが存在する一方、測定RAFはclose後419/984/1476/2131msで、動作全体が2つの描画観測の間に落ちている。カメラ・正本の不整合だけでは説明できず、記録機能による描画負荷を分離する必要がある。
- `cardboard-view.spec.js` だけ既定の全操作traceスクリーンショット/DOMsnapshotと動画記録が残っていた。既存plaza等と同じ、動画off・source trace維持・failure screenshot維持・明示的frame/geometry JSON維持へ合わせる。アニメーションの長さ・opacity・測定時間窓・テスト45秒は変更しない。次の固定環境CIで影響を検証し、記録負荷だけが原因と未確認の段階では断定しない。
- 横持ち操作帯修正後は320/390/1363/844pxの既存領域分離・実市場移動4件すべてローカル成功（26.9秒）。
