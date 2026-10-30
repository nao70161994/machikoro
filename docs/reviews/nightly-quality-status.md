# 品質改善の最新確認状況

対象: PR #19 / `feat/nightly-table-quality`。mainへのマージは保留。

このページは最新状況の要約です。経緯・原因分類・画像・独立レビューは
[調査記録](nightly-table-quality-2026-10-23.md)を参照してください。
テスト成功と商用品質への到達は別に評価します。

## 固定環境で確認済みの対象

固定環境の最新完走対象は `437e65a9`。市場closeの同期化まで含む。Nightlyは全345件を収集し完走したが、初回343成功・1再試行成功・1許可済skipのため、安定成功とはまだ判定しない。

| 対象 | 根拠 | 状況 |
| --- | --- | --- |
| PR | #19 / feat/nightly-table-quality | Draft、マージ保留 |
| 全Nightly | [40887636045](https://github.com/nao70161994/machikoro/actions/runs/40887636045) | 345件の網羅性確認成功。6分割の各ブラウザjobは8.9〜13.8分。SW二世代テストのみ再試行成功 |
| 通常Release | [40887602108](https://github.com/nao70161994/machikoro/actions/runs/40887602108) | 成功 |
| 16画面・操作 | [40887602130](https://github.com/nao70161994/machikoro/actions/runs/40887602130) | 成功 |
| 建設・市場再表示 | [40887631096](https://github.com/nao70161994/machikoro/actions/runs/40887631096) | 固定WebKit、7件retry0成功 |
| 通常速度の縦横実UI完走 | [40885367734](https://github.com/nao70161994/machikoro/actions/runs/40885367734) | eb289904、CPU1500ms。390縦70ターン/182actions、844横71ターン/184actions、双方errorsなし。最新変更の代替証拠ではない |

### 04a9f83eで修正、固定環境を確認中

- **SWテストの観測競合**: タイトル復帰後の `waitForLoadState` が旧documentのloadで解決し、v2確認が実reloadと競合していた。確認クリック前に実navigation待機を登録する。v2/cache/controller/errorの検証は維持し、例外の握り潰し・時間延長は行わない。context closeの失敗時も世代serverを停止する。
- **横持ちCPU待機**: 通常のローカルCPU通知を無効な操作欄へ移す。有効操作・復旧・接続通知は通常配置へ戻す。非表示ボタンのnative hidden属性と既存displayを同期する。
- **長い手番名**: 横持ちCPU待機の固定高フッターだけ、名前の折り返しでフェーズを押し出さないようにする。人間手番の全文表示は維持。全文は既存title/ariaでも確認できる。

[改善前](assets/nightly-quality/cpu-inline-844-before.png) / [改善後](assets/nightly-quality/cpu-inline-844-after.png) / [測定条件](assets/nightly-quality/cpu-inline-844-comparison.json)。844×390の同条件4CPU序盤fixtureで盤面高218→250px、双方撮影中の正本不変。比較は437e65a9のCSS/mainと候補の差。CPU予定を停止した表示fixtureであり、実対局・物理端末確認ではない。

ローカル確認: ui/main単体、main/UI型、変更JSのESLint成功。ブラウザ5件中、SW・CPU・終盤ラベル2幅は成功し、人間手番名1件の回帰を検出。変更を横持ちCPUだけへ限定し、CPU・人間手番名2件を再実行して双方成功。assert・時間・許容値は変更していない。ローカルブラウザはTermux Chromiumであり、固定WebKitのCI結果とは区別する。

独立レビューは比較前後PNGを目視しCPU通知の配置を採用可と評価。有効操作と復旧通知の退避条件も確認。終盤・native WebKitは別証拠が必要。通常速度の実UI画像では縦持ち終盤の所有者ラベルとカード群の対応、勝利画面の長いランドマーク名の組版に改善余地が残る。横持ち上端の切れという初見の指摘は原寸再確認で撤回され、製品不具合として扱わない。

### 最新6e778b87：縦持ち2人戦の所属ラベル

通常速度の実UI画像で、施設群末尾の空きへ所有者名が配置される問題を確認。非対称な終盤の表示fixtureで再現した。縦持ち2人戦の見出し帯を28→48pxへ広げ、施設群と市場の境界に名前を置く余地を確保する。四方向配置・カード群・正本・ラベルの衝突判定は変更しない。

- 40px案はラベル移動に効かず、64px案は48pxと同効果でカード縮小が大きいため不採用。
- 390pxの俯瞰倍率は0.360→0.352（約2.2%減）。独立目視レビューは所属識別の改善が上回ると評価。任意の所有構成で常に先頭配置される保証とはしない。
- 320/390pxの非対称終盤で、市場側へのラベル配置・全文・卓の収容・正本不変を確認済み。4人戦390/844pxの全文と6〜9人全卓を含むlocal4ケース成功（38秒）。独立目視でも320/390に重なり・切れの重大退行なし。静的資産確認と構文確認成功。347件、6分割58/58/58/58/58/57。横持ちと3人以上にはこの見出し寸法変更を適用しない。
- [変更前](assets/nightly-quality/owner-band-390-before.png) / [変更後](assets/nightly-quality/owner-band-390-after.png) / [測定条件](assets/nightly-quality/owner-band-390-comparison.json)。実対局写真とcontrolled fixtureは区別する。

## 最新候補の固定環境検証

`6e778b871efcbdf7f17523f4a37e2f98e8459b27`（2026-10-30）。実行中／待機中のため成功とは扱わない。

- [Nightly・347件](https://github.com/nao70161994/machikoro/actions/runs/40980358246)
- [通常Release](https://github.com/nao70161994/machikoro/actions/runs/40980339545)
- [16画面・操作](https://github.com/nao70161994/machikoro/actions/runs/40980339536)
- [CPU1500ms・縦横の実UI完走](https://github.com/nao70161994/machikoro/actions/runs/40980359766)

直前04a9f83eのNightly40979687526／Release40979677841／16画面40979677934／実UI40979697667も別commitの検証として追跡する。新候補をPushしたことによる中断・再開始は行わない。

## 実UI検証の追加幅

既存の390縦／844横に加え、手動workflowの `ui_viewport_set=extended` で320×568／1440×900を実行できるようにする。通常は `standard` の2幅だけを使い、全幅の重複実行を避ける。CPU速度は通常1500ms、既存の操作・勝利・エラー検証と時間制限を保持し、幅入力は4種類以外を拒否する。

ローカルの追加2幅は各6操作のpartial smokeで成功（320:23.5秒、1440:32.2秒）。開始から勝利までの証拠ではない。固定WebKitでの完走結果を別途取得する。

## 04a9f83eの確定結果と建設通知の追加修正

Release40979677841、16画面40979677934、通常速度縦横完走40979697667は成功。Nightly40979687526は全346件の網羅性確認まで完走したが、344初回成功・1再試行成功・1許可済skip。SW世代切替は初回成功した一方、320px更新通知ありの建設通知が再試行となったため、安定成功とはしない。

[失敗時の描画記録](assets/nightly-quality/notice-expiry-before-first-frame-320.json)ではclose後232msにnotice追加、1430msに削除、次の観測RAFが1489ms。通知の1200ms寿命が最初の観測より先に終了した。flightは同RAFで再生開始し、1693msでcurrentTime205msの移動中フレームを観測できたため、カード移動と文字通知で開始時刻の扱いが異なっていた。

追加修正はnoticeの最初の描画更新から1200msを数える。CSS180msの出現、カード480ms、既存1500/2500msの観測期限・全文・アート・非遮蔽のassertは維持。取消時はpending RAFも取り消し、callback内でsession/turn/actor/BUILD/可視状態/再生復元/接続を再検査する。独立レビューを受け、古いcallbackが新通知のRAF handleを消さない順序も採用。

ローカルの建設5条件は51.5秒で成功。最初の更新までtimerを始めないこと、1200ms維持、取消後callbackとphase変更後に再開しないことを単体回帰で検証する。最初のRAFを「paint完了」と同一視せず、固定WebKitの既存可視性assertで効果を確認する。

04の390縦実UIは61ターン・156actions・242クリック・435155ms、CPU1500ms、pageErrorsなし。閲覧→Back2クリック646msで正本/倍率/角度復帰。first-build/mid/late/winnerの独立目視で重大な新規退行なし。6eの名前帯・追加notice修正の証拠とは区別する。

## 8514588aの固定環境結果と狭幅操作の追加修正

[通常Release40981644006](https://github.com/nao70161994/machikoro/actions/runs/40981644006)、[16画面40981644175](https://github.com/nao70161994/machikoro/actions/runs/40981644175)、[重点WebKit40981661263](https://github.com/nao70161994/machikoro/actions/runs/40981661263)は成功。重点7件はretry0・2.7分。

[Nightly40982123534](https://github.com/nao70161994/machikoro/actions/runs/40982123534)は347件を完走。346初回成功・0再試行・1許可済skip、網羅性確認成功。shardのテスト時間8.5〜12.1分、35分未完了を解消した。過去6e実行で別の2件（建設見送り確認、夕暮れ市場の幾何一括判定）も再試行になっていたため、最新成功だけで原因調査を省略しない。

実UI完走は全4幅で成功（ゲームロジックは同じ6e/25）。CPU1500ms・非seedの人間席自動UI操作であり、物理端末・人間の感性評価ではない。

|幅|commit|ターン|人間actions/クリック|経過ms|pageErrors|正面閲覧→復帰|
|---|---|---|---|---|---|---|
|320×568|25d83934|64|183/295|403603|0|2クリック613ms、正本/倍率/角度復帰|
|390×844|6e778b87|82|234/344|756842|0|2クリック789ms、正本/倍率/角度復帰|
|844×390|6e778b87|64|155/249|533505|0|2クリック764ms、正本/倍率/角度復帰|
|1440×900|25d83934|83|193/298|929235|0|2クリック1936ms、正本/倍率/角度復帰|

### 実対局画像から発見した320pxの収支操作

独立レビューで、横スクロールするcamera navに収支も含まれ、固定メニューの手前で一部がクリップされることを確認。camera commandだけを内部スクロールへ分け、収支は同じ行で固定する。360px以下では無効な「戻る」だけを隠し、有効時には表示する。カード卓の高さや操作対象寸法を縮めない。

[同fixture変更前](assets/nightly-quality/receipt-controls-320-before.png) / [変更後](assets/nightly-quality/receipt-controls-320-after.png) / [測定条件](assets/nightly-quality/receipt-controls-320-comparison.json)。ガイドONの320×568で収支右端220pxがnav右端202pxを越えていたが、修正後202pxに収まりhit-testも成功。卓高384px・撮影中正本は双方不変。実対局の新旧比較ではなく、同条件の表示fixture比較。

ガイドON・戻る有効・Tabで市場→自分へのfocusとhit・通常click収支開閉を4幅で確認（12.3秒）。既存CPU通知と所属境界ケースも別バッチで成功。初回のガイド検証は誤った直下summary selectorで失敗したため、実DOMのdetails>summaryへ修正。製品不具合とfixture誤りを区別する。独立目視でもカード／市場／操作に新たな退行なし、型・ESLint・field単体成功。

残る可視品質：320終盤の任意構成ではownerラベルの末尾配置と省略が残る。建設の一時通知が自分の施設を覆う場合もあり、操作は覆わないが視線誘導の改善余地として扱う。これらを直ったとは報告しない。

## 残った6eのfixture競合と診断追加

[夕暮れ市場のtrace集計](assets/nightly-quality/sunset-market-detached-fixture-evidence.json)では、最初の幅で38カードすべて正常、次幅では38カードすべてfont NaN・animationName空・詳細target寸法0となっていた。失敗snapshotはCPU手番。個別のカードCSSの欠けではなく、locator採取と評価の間にCPU再描画でDOMが差し替わったことと整合する。寸法専用caseだけ整合した人間2席として開始し、既存の寸法・文字・色・操作対象assertを維持し `isConnected` も追加した。CPU実進行は別の実UI完走で検証する。独立レビューでもfixture修正と分類する判断を支持。

建設見送り確認の1回の失敗は、画面に自動復旧中の表示があったが、復旧が原因か結果かは旧traceで確定できない。元の操作／assertは変更せず、再発時にcheckpoint・modal policy・confirm状態を採取するafterEachを追加する。これを製品不具合の解決とは報告しない。追加後の見送り4条件＋夕暮れ市場のlocal5件は34秒で成功。現在348件、6分割58件ずつ。

## 完了判定の根拠と残差

- 元main3回のログは[失敗監査JSON](nightly-main-failure-audit.json)に記録。23種類と現行検証契約を対応付けている。assert削除・差分許容値の緩和・強制クリック・時間延長で失敗を隠さない。
- 元の318件は6分割と実行IDの和集合検証で保持し、追加回帰を含め現在347件。分割数やテスト数だけで安定性を証明しない。最新Release/Nightlyの初回結果と中断／許可済skipを確認する。
- 実対局と表示fixture、ローカルChromiumと固定WebKit、自動ブラウザと物理スマートフォンを区別する。物理端末は未確認。
- 公式の静止画・PV比較は[一次調査](nightly-table-quality-2026-10-23.md)と[追加履歴](nightly-quality-history.md)に記録。大きな発動カード、ライティング、キャラクター反応、連鎖演出の一体感には差が残る。既存作品の画像・キャラクターは使用していない。
- 俯瞰終盤の小字は自然な拡大閲覧と併せて評価する。勝利時の長い名称の組版、任意の所有構成のラベル順位付けにも改善余地がある。
- テスト成功だけで商用品質へ到達したとしない。最新実プレイの画像／操作記録と独立レビューを照合して判断する。

## 調査履歴

[追加調査の時系列記録](nightly-quality-history.md)には、過去の失敗・撤回案・訂正・close競合の再現を保存している。原main調査と設計は[一次記録](nightly-table-quality-2026-10-23.md)を参照。
