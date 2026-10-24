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
