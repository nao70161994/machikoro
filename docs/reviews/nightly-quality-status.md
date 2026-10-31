# 品質改善の最新確認状況

対象: PR #19 / `feat/nightly-table-quality`。mainはPR #18の `a265ca7e`、マージ保留。商用品質への到達は未完了。過去の失敗・訂正・撤回案は[時系列記録](nightly-quality-history.md)、原mainの調査は[一次記録](nightly-table-quality-2026-10-23.md)を参照。

## 最新候補の確定結果

`7ecac7a4`: Release・16画面操作・全Nightly成功。Nightly352件=351初回成功/0retry成功/1既存許可skip、6分割8.1〜16.2分、実行ID照合一致。4幅の実UI対局も勝利まで成功。詳細は下記の7ec節と[達成確認表](quality-completion-audit.md)。商用品質の主観評価・ローカル描画遅延の原因には未確定事項が残る。

## 先行候補の検証履歴

|対象|commit・実行|結果|
|---|---|---|
|通常Release|8514588a / [40981644006](https://github.com/nao70161994/machikoro/actions/runs/40981644006)|成功|
|16画面・操作|8514588a / [40981644175](https://github.com/nao70161994/machikoro/actions/runs/40981644175)|成功。基準画像/許容値維持|
|全Nightly|8514588a / [40982123534](https://github.com/nao70161994/machikoro/actions/runs/40982123534)|347件完走、346初回成功・0再試行・1許可済skip。網羅性照合成功。shard8.5〜12.1分|
|重点WebKit|8514588a / [40981661263](https://github.com/nao70161994/machikoro/actions/runs/40981661263)|建設・市場7件、retry0成功、2.7分|
|収支/fixture追加後Release|dedc82d2 / [41107097490](https://github.com/nao70161994/machikoro/actions/runs/41107097490)|成功|
|同16画面・操作|dedc82d2 / [41107097606](https://github.com/nao70161994/machikoro/actions/runs/41107097606)|成功|
|同全Nightly|dedc82d2 / [41107113418](https://github.com/nao70161994/machikoro/actions/runs/41107113418)|348件完走、346初回成功・1再試行成功・1許可済skip。網羅性照合成功。安定化は未完了|

勝利ランドマークの語単位表示・PC一列配置は `0d8e68da` へpush済み。ローカル単体・4幅ブラウザ・main/UI型・ESLint成功、通常Release [41109174969](https://github.com/nao70161994/machikoro/actions/runs/41109174969)・16画面操作 [41109175145](https://github.com/nao70161994/machikoro/actions/runs/41109175145)も成功。後続のカメラ候補の結果とは区別する。

## 96bd2923の確定結果と所属名の配置修正

- [重点WebKit](https://github.com/nao70161994/machikoro/actions/runs/41118266311)は11件・再試行0・3.6分で成功。通常再配置2件、購入復帰2件、建設5条件、市場往復2件。観測期限・480ms flight・60..400ms条件は維持。
- [通常Release](https://github.com/nao70161994/machikoro/actions/runs/41118229926)は所有者名の市場境界配置1件が初回/再試行とも失敗し、32件成功。[16画面操作](https://github.com/nao70161994/machikoro/actions/runs/41118229922)は成功。
- [全Nightly](https://github.com/nao70161994/machikoro/actions/runs/41119144096)は350件を全分割で実行し網羅性照合成功。失敗は同じ所有者名の1件。35分中断なし。シミュレーション・PWA・オンライン復元/soakは成功。先行の重点成功をこの境界配置の成功と混同しない。
- 原因は表示名を短くしたことで、施設の不揃いな最終行の横へ候補が入り、近さの評価だけでは空いている市場側の見出しより優先されたこと。狭幅・縦持ち・2人のとき、市場側の候補を優先する。元の衝突・所有者への距離・viewport制約は保持し、境界に置けないときは従来候補へ戻す。全名幅優先は維持するため、任意構成での市場境界配置保証とはしない。
- 修正候補は既存の境界/全文3ケースがローカル成功（1worker・1.3分）。320/390×844の元assert、320×568と同名の追加assertは変更なし。独立ソースレビュー指摘の縦持ち条件も追加。構文・ESLint・main/UI型は成功。固定WebKit重点に同境界ケースを加えて12件で再確認する。
- 遅いページloadの単独調査は6.710秒で終了し、過去の40.555秒を再現できなかった。JS資産の完了が約5秒遅れたが、元のタイムアウトの根本原因が確定したとは扱わない。テスト上限は変更していない。
- [実UI対局320/1440](https://github.com/nao70161994/machikoro/actions/runs/41119150739)は両方勝利まで成功。CPU1500ms・非seed・人間席自動操作で、物理端末/人間による体験評価ではない。画像と操作集計の再レビューは後続で行う。

## 7ecac7a4のnative検証と同版実対局

- [重点WebKit41171828691](https://github.com/nao70161994/machikoro/actions/runs/41171828691)は20件・retry0・3.5分で成功。新しい844/320連鎖ケースも、元の6500ms・第4送金frame<500ms・opacity>0.5を維持して成功。
- [実frame](assets/nightly-quality/native-activation-7ecac.json)は320でelapsed210ms/opacity1、844で306ms/opacity1、delay2600ms/duration600ms。静止デザインposeとは異なる。各発動元の非被覆・実アート100×65px・全owner・再描画/テーマ復帰/RMの元assertも同caseで確認。localの期限失敗の原因が解消したとは断定しない。
- 同版の[全Nightly41172214298](https://github.com/nao70161994/machikoro/actions/runs/41172214298)は成功。352件=351初回成功・0再試行成功・1既存許可skip、6分割59/59/59/59/58/58、実行ID和集合も352件で一致。各shard8.1〜16.2分、35分中断なし。単体/PWA/release/online/CPU simulation/soakも成功。
- 同版の実UI対局は4幅とも勝利まで成功：[390/844](https://github.com/nao70161994/machikoro/actions/runs/41172005824)、[320/1440](https://github.com/nao70161994/machikoro/actions/runs/41172008495)。CPU1500ms・非seed・人間席自動操作。320/390/844のmid/late/first-build/winner計12枚を独立レビューし、新たな重大な切れ・操作の重なりなし。1440の4枚も独立確認し、計16枚で重大なclip/操作重なり/新規崩れなし。winnerのモール名は「ショッピング/モール」の2行・6ランドマーク一列で、旧版の語内部折返しは解消。終盤細字・広い余白は残る。
- 同版の[通常Release](https://github.com/nao70161994/machikoro/actions/runs/41171833261)・[16画面操作](https://github.com/nao70161994/machikoro/actions/runs/41171833081)も成功。基準画像・許容値は変更しない。
- [達成確認表](quality-completion-audit.md)で、過去と最新、共有状態互換と各テーマ全操作、静止姿勢と実時間、物理端末未確認を区別。独立レビューで、過去の見送り確認/自動復旧の未確定事象も明示するよう指摘を反映した。

## 発動施設の正面アートと市場スクロールによる誤取消

- 490c9d65の[重点WebKit18件](https://github.com/nao70161994/machikoro/actions/runs/41170369778)は再試行0・3.7分で成功。[Release](https://github.com/nao70161994/machikoro/actions/runs/41170367635)・[16画面](https://github.com/nao70161994/machikoro/actions/runs/41170367645)も成功。全Nightlyの新実行は、この後続候補の重点結果を確認してからまとめて行う。
- 1d1153a1の全Nightly350件は349初回成功・0再試行成功・1許可済skip。各shard7.4〜14.4分、網羅性照合成功、35分中断なし。後続候補へ結果を転用しない。
- 発動tagに、実カードと同じSVGシンボルの100×65px正面アートを追加する候補。IDがないSVGだけを複製し、カードのaction/ボタンは複製しない。横に施設名/所有者/収支/経路、実カードとownerの強調を維持。600ms表示・700ms刻み・最大8・generation/session/replay/取消は維持、新しい拡縮animationは加えない。
- 上下左右の候補をviewportへ収め、発動元被覆→他カード/市場被覆が小さい順で選択。元カード被覆、サイズ不足、他所有施設被覆がpopup面積1/3超なら文字表示へ戻す。市場は選択scoreへ含むが、収益表示中の一時的な被覆は許容。文字表示も従来どおりpointer-events:none。操作欄は卓外で覆わない。
- 320でtagが出なかった原因を採取。play時も取消時もviewportのscrollLeft/Topは0、取消scrollのtargetはcompact-market-facilitiesだった。市場の自動スクロールをcapture listenerが卓移動として扱い、最初の500ms表示待ち中に全キューを取消していた。owned cardの位置が変わらない子領域scrollは無視し、viewport自体のscroll/resize/画面変更では従来どおり取消す。
- [320前](assets/nightly-quality/activation-art-320-before.png) / [後](assets/nightly-quality/activation-art-320-after.png)、[844前](assets/nightly-quality/activation-art-844-before.png) / [後](assets/nightly-quality/activation-art-844-after.png)、[4幅測定](assets/nightly-quality/activation-art-comparison.json)。これは4席・森林1枚ずつ・銀行+1のcontrolled静止デザイン比較。画像だけexpiryをresponse内で60秒へ固定して撮影し、製品と実roll検証の600msは変更しない。自然対局/600ms中の快適さ/連続演出の証明とはしない。最初の600msのままの撮影は全8枚でcapturedLive:falseだったため比較証拠から除外した。
- 独立原寸レビューは4幅で元カード/HUD/下部操作の被覆なし、施設と収支が文字だけより認識しやすいと評価。320/390は市場下段を広く覆うため、700ms刻みで長く隠れる印象と実可視時間はnative/実対局で再評価する。公式PVの大きい主役カード、卓面光、プレイヤー反応との差はまだある。
- ローカル試作の失敗も保持。縦積み案は横持ちで全件文字fallback、320は市場scroll取消で非表示。横並びの中間案は844成功/320が全textで新art assert失敗。最終候補の2caseは元の6500ms/flight<500ms判定で両方失敗。[frame採取](assets/nightly-quality/activation-local-frame-comparison.json)では第4flightの開始が遅く、観測期限時もdelay内だった。旧490 moduleを使う別診断844は元のflight判定を通過（40.7秒）。これだけで環境原因や回帰なしとは断定しない。期限延長・判定緩和・成功するまで再実行は行わず、固定WebKitで重点20件を確認する。
- 構文・ESLint・main/UI型・runtime依存順は成功。ローカルswapが上限へ達したためブラウザ連続実行を終了。常にbrowser1worker、型検査と同時実行しない。既存の実roll1caseを844/320の独立2caseへ分け、元の送金frame/全owner/再描画・テーマ復帰・ReducedMotion/正本assertは維持し、アート寸法・元カード非被覆を追加。

## 終盤で欠ける所属名の端への配置

- controlled320×568で11/19施設・5/2ランドマークにすると、自分の名前の98候補がすべて除外され、CPU名だけ表示されることを再現。診断初回の無効カード名/Set.slice誤記はfixture側で修正してから採取し、製品不具合とは区別。
- 採取geometryでviewport内へ平行移動した候補を同じ条件で評価すると、右端(212,470.16)に有効候補が1つあった。既存のpreferred/compact両幅を先にすべて試し、配置不能のときだけ端へ収めた候補を試す。viewport・全障害物・既配置ラベル・所属距離の条件は緩和しない。名前/フォント/卓/カード寸法は不変。任意構成で全名を必ず置ける保証ではない。
- [前](assets/nightly-quality/owner-edge-320-before.png) / [後](assets/nightly-quality/owner-edge-320-after.png) / [条件と候補数](assets/nightly-quality/owner-edge-320-comparison.json)。before残高23/after30のcontrolled比較で、同一正本/自然対局ではない。カード群構成とviewportは共通。afterは欠けた自分名を施設群右下の空白で全文表示し、CPU名位置を維持。独立原寸レビューで新しい重なり/誤所属なし。
- 既存3case+追加1は最終4件27.7秒・retry0成功。初回batchは新testのspanをbutton指定した誤りで1失敗/3成功、selectorを正しい既存classへ修正（製品assertの緩和ではない）。その後新1件8秒成功、探索順修正後の最終4件も成功。構文・ESLint・main/UI型・関連単体も成功。
- 直前b7f072a3の[重点WebKit17件](https://github.com/nao70161994/machikoro/actions/runs/41169846950)は再試行0・4.1分で成功。4幅勝利の語内部1行assertと結果後の収支操作も含む。今回の端fallbackは含まないため、追加して18件を確認する。

## 勝利の単語内部折返しに対する候補

- 96のnative実対局画像ではモール名が3行。既存wordsFitはspan外枠のみの検査で内部折返しを検出できなかった。Intl分割の誤りとは断定しない。
- [ローカル測定](assets/nightly-quality/winner-word-inner-width.json)は同じ1440×900・controlled勝利fixture。card97.3125px、copy/name83.3125px、name左右padding計4px、ショッピング78.015625px。文字内幅79.3125pxで余裕は約1.3px。copyをwidth100%へ伸ばす試案は同値で改善なし。ローカルでは元から2行だったためnativeの3行を再現したとは言わない。
- 勝利の縦カードだけ、横カードから継承していたnameの左右paddingを除き、文字の利用幅を4px増やす候補。カード幅・13px文字・6列・art寸法は不変。全名escape/Intl fallback/詳細操作は変えない。一律nowrapによる長名はみ出しは導入しない。
- 既存の勝利4幅caseで全wordのRange.getClientRectsの行数も確認。元の全文・外枠fit・モール分割・1440同一行・詳細focus/正本assertは維持し、4件24.6秒で成功。独立ソースレビューは妥当と評価。nativeの再検証前に解消済みとはしない。
- focused WebKitへこの4幅と結果後の収支操作1件もまとめ、従来12件と合わせ17件を同じ候補で確認する。既存全Nightlyの進行中実行は中断・やり直ししない。

## 最新候補1d1153a1の進行中確認

- 最新mainは `a265ca7e` のまま確認。PR #19はDraft・マージ保留。
- [Release 41169297749](https://github.com/nao70161994/machikoro/actions/runs/41169297749)、[16画面41169297738](https://github.com/nao70161994/machikoro/actions/runs/41169297738)、[Nightly41169303901](https://github.com/nao70161994/machikoro/actions/runs/41169303901)を同じ版で確認中。Nightlyのinventory/online-soak/simulation/unit-PWA-releaseは成功し、6 browser shardが進行中。新しい全件成功はまだ主張しない。
- 96の1440×900実UI完走は75turn/200actions/305click/39key、934481ms（CPU待機269493ms）、pageErrors0。閲覧復帰は2click/1973ms、scale/angle/正本復帰。320と同じ実行41119150739。非seed・CPU1500msで、物理端末/人間主観評価とは異なる。
- 1440のmid/late/first-build/winner4枚とsummaryを選択取得し独立再レビュー完了。重大なclip/操作重なりなし。ただし勝利のモール名がnative画像で「ショッピン／グ／モール」の3行になる残差を発見。既存wordsFitは外枠fitのみを見ており、span内部の折返しを検出できないため、意味単位の改行は全環境で解消済みとはしない。ローカルでブラウザと型検査の同時実行は行っていない。関連テストの追加実行やPushはまとめて進める。
- 320の片側owner overlayが欠ける場合は既存の非衝突候補が全滅し元見出しへfallbackする経路と整合。ただし各候補の除外理由をまだ採取しておらず、clamp候補追加案は未実装。衝突/全文/所属距離制約を緩和して名前を置くことはしない。

## 所属名候補2f88900fと結果後の狭幅操作

- [重点WebKit 41168949776](https://github.com/nao70161994/machikoro/actions/runs/41168949776)は12件・再試行0・3.4分で成功。元の所有者名境界caseも含む。通常Releaseと16画面は確認中。
- 96の320実対局画像を独立レビューし、出目確定後に収支の92px指定が狭幅用44px指定より強く、自分ボタンが途中で切れる追加不具合を発見。狭幅mediaに結果ありのselectorを加え44pxへ統一。詳細/ariaは保持し、PCの収支表示は不変。
- 既存の収支操作caseへ実際のrollDice([1])とrenderを加え、結果あり状態を検証。初期のhit確認、320/390/844で44px、320の俯瞰初期位置で自分ボタン全文、4幅で通常click開閉・戻る・Tab・roll後正本不変を確認。ローカル1case12.6秒で成功。独立ソースレビューで採用を止める退行懸念なし。市場正面など戻るが増える状態ではcamera領域の横scroll仕様を維持する。
- 96の320実対局は73turn/169actions/274click/544255ms、CPU待機268673ms、pageErrors0。閲覧→復帰2click/793ms、scale/angle/正本復帰。画像mid/late/first-build/winnerを独立レビュー。カード・下部操作の重大なclipなし。owner overlayが置けず元の見出しへfallbackする非対称表示と、勝利説明末尾の孤立行が残る。
- 公式PV72/80/84秒と再比較。大きい立体ダイス、主役カードの拡大と減光、祝福光/プレイヤー反応の強さには差があり、現状の小さい実カードと枠強調だけで同等品質とは評価しない。静止画から連続演出を証明しない。1440画像は選択取得後に再レビューする。

## 743a9b5cの確定結果と後続候補

- [全Nightly 41112650607](https://github.com/nao70161994/machikoro/actions/runs/41112650607)は349件の実行/和集合照合まで完了したが失敗。342初回成功・3再試行成功・3失敗・1許可済skip。時間上限での中断はない。通常Release [41112628743](https://github.com/nao70161994/machikoro/actions/runs/41112628743)も同じ通常カメラ2件で失敗、16画面操作 [41112628737](https://github.com/nao70161994/machikoro/actions/runs/41112628737)は成功。
- カメラの2件は、通常resize/reflowでも比例位置へ戻す743の製品退行。元の「閲覧カードを中央へ戻す」assertを維持し、市場open〜closeだけpan保持へ限定する。live anchorはclose後false、保存したreturnViewのコピーだけtrueを維持。購入なしも同期復元してから解除する。テーマ離脱時のclose(false)も同じ解除経路、一時的な詳細modalへのsuspendは市場閲覧中として扱う。
- 建設は[自然終了とframe間隔の記録](assets/nightly-quality/flight-finishes-between-frames-743.json)を採取。1440では173msのpaused0から889msの消失へ進み、finished480だった。320/844も最初の観測が407/424msで60..400msの元判定外。取り消しやscroll誤検出ではない。
- 後続候補は二重RAFを経てからclockを開始し、最初の描画機会をpausedで待つ。両段階にgeneration/current/同一ghostを検査し、古callbackは新handleを消さない。480ms・1500ms・60..400ms判定を変えない。RAFはpaint完了の保証とは扱わない。
- 残る[ローカル中間候補の失敗](assets/nightly-quality/local-staging-late-generation.json)では320の生成自体がclose後約1.3秒まで遅れ、1500msに間に合わなかった。別batchの4件はページloadが40.555秒かかるなどsetup/操作段階で45秒上限に達した。これをすべて同じ描画原因として扱わず、成功した再実行だけを報告しない。
- 2viewportを同一caseで進めていた購入→Back検証は、390/844の独立caseへ分割。各caseの45秒上限・各軸1px・正本assertは維持し、両方成功。新規ケースを除く通常再配置2件も元assertでローカル成功。建設の全条件で6件成功したbatchと、後続の失敗batchは区別する。
- focused WebKitの選択にoverviewファイルも明示し、通常再配置2件・購入復帰2件・建設5条件・市場往復2件を同じ候補で検証する。期待値緩和・強制clickは行わない。
- 所属名は[表示整理とA/B](owner-name-readability.md)。カード/文字を縮めず普通名の末尾を読めるようにし、同名時の席番号は残す。境界配置の保証とはしない。

## P0の原因と修正

- 元mainの3回は318件（WebKit316、Chromium2）を1 workerで実行し35分で未完了。[23種類と現在の検証契約](nightly-main-failure-audit.json)を対応付け、case単位6分割とID和集合照合で欠落/重複/未実行/中断を検出する。`nightly-main-failure-audit.json`は9c70127b/340件時点の契約整理であり、最新実行結果は上のrun記録で区別する。
- 製品の不具合：市場のnative dialog移動後の排他漏れ、回転カードの収支/休業競合、HUD名、変換後の市場スクロール座標、カード追加後のviewport同期、市場close/reopen競合等。時間延長・強制click・assert削除では修復しない。
- 古いfixture：5/10人の旧3席期待値、正面閲覧と全体倍率の混同、非表示menu内の操作、CPU設定/roster不整合等。現仕様の操作・正本不変の検証へ更新。
- SW二世代は旧documentのload待機と実reloadが競合。クリック前から実navigationを待ち、v2/cache/controller/error assertは維持。
- 建設noticeはclose後232msに追加、1430msに削除、次RAF1489msで寿命を消費していた。[失敗記録](assets/nightly-quality/notice-expiry-before-first-frame-320.json)。1200ms寿命は最初の描画更新から数え、取消/世代/phase等を再検査。flight480ms・CSS180ms・観測期限は維持。RAFをpaint完了とは扱わない。
- 夕暮れ市場の[trace集計](assets/nightly-quality/sunset-market-detached-fixture-evidence.json)：CPU手番で38カード全部が正常値からfontNaN/空style/寸法0へ変化。寸法用fixtureだけ整合した人間2席へ固定し、元assertとisConnectedを確認。CPUの自然進行とは検証を分離する。
- 建設見送りの過去1失敗は自動復旧表示との関係が未確定。元操作/assertを維持して再発時のcheckpoint/modal状態を追加採取する。診断追加を製品修復とは呼ばない。

## 実UI完走と独立レビュー

CPU1500ms・非seed、人間席を自動UI操作。物理端末・人間による感性評価ではない。全4幅で開始から勝利まで成功し、pageErrors0。

|幅|commit/run|turn|人間actions/クリック|経過ms|正面閲覧→復帰|
|---|---|---|---|---|---|
|320×568|25d83934 / [40980824892](https://github.com/nao70161994/machikoro/actions/runs/40980824892)|64|183/295|403603|2クリック613ms|
|390×844|6e778b87 / [40980359766](https://github.com/nao70161994/machikoro/actions/runs/40980359766)|82|234/344|756842|2クリック789ms|
|844×390|6e778b87 / 同run|64|155/249|533505|2クリック764ms|
|1440×900|25d83934 / 同320run|83|193/298|929235|2クリック1936ms|

各対局で正本・倍率・角度の復帰を確認。mid/late/first-build/winnerの全幅画像を独立目視。320収支のclipを発見して後続修正。これらは旧commitの実進行と追加差分のtargeted検証であり、最新候補で4ゲーム再完走したという主張ではない。

2〜10人は全席/市場/所属/詳細/状態不変等のcontrolled fixtureも使い、4テーマ混在オンライン・再接続・保存・Undoは共有正本とモード切替の検証を維持。全幅×全人数の自然対局、全テーマそれぞれの全UI操作を網羅したとは報告しない。

## 見た目・操作の改善比較

各ペアは同条件の表示fixture。実対局画像・物理端末確認とは区別する。独立レビュー済み。

- CPU待機：[前](assets/nightly-quality/cpu-inline-844-before.png) / [後](assets/nightly-quality/cpu-inline-844-after.png) / [条件](assets/nightly-quality/cpu-inline-844-comparison.json)。844×390の卓高218→250px。有効操作/復旧通知は元配置へ戻す。
- 所属帯：[前](assets/nightly-quality/owner-band-390-before.png) / [後](assets/nightly-quality/owner-band-390-after.png) / [条件](assets/nightly-quality/owner-band-390-comparison.json)。縦2人戦の見出し28→48px、390俯瞰倍率0.360→0.352。40px案は無効、64px案は縮小が大きいため不採用。任意構成の先頭配置保証ではない。
- 収支：[前](assets/nightly-quality/receipt-controls-320-before.png) / [後](assets/nightly-quality/receipt-controls-320-after.png) / [条件](assets/nightly-quality/receipt-controls-320-comparison.json)。320ガイドONで収支のnav越境を解消。卓高384px/正本不変。4幅・戻る有効・Tab focus・通常click開閉を確認。
- 勝利：[前](assets/nightly-quality/winner-words-1440-before.png) / [後](assets/nightly-quality/winner-words-1440-after.png) / [条件](assets/nightly-quality/winner-word-comparison.json)。1440で完成6枚が2行→1行、名称は13pxを維持し「ショッピ/ングモール」→「ショッピング/モール」。カード幅118.375→97.3125pxで約18%縮小するが、一覧は約120px上へ移り独立レビューは改善を支持。390の幅143px/3行配置は不変。

勝利名の語分割はwinnerCollectionだけ。Intl非対応は全文fallback、全segmentをescapeしaria/action/titleは完全名のまま。4幅の元詳細操作/フォーカス復帰に全文/語のfit/PC同一行を追加確認。単体で正本不変・escape・非対応fallbackを確認。fullPage画像は全操作が同時にviewport内へ入る証拠ではない。

## dedc82d2で再発した描画待ち

[390px建設flightの失敗記録](assets/nightly-quality/construction-render-gap-390.json)ではclose後約255msに生成済みだったが、次の描画更新は1487ms（paused0）、1518msでrunning31ms。1500ms以内に60ms以上進むframeを観測できず、再試行は成功。取消・寿命不足とは異なる。layoutの93〜227msとcueの227〜255msの後に約1.2秒のframe間隔があり、paint/合成負荷と観測負荷を調査中。前回347件の初回成功だけで安定化完了としない。期限・動作frame判定は維持する。単純なclose時refresh削除は復帰snapshotのgeometryを壊す恐れがあるため採用しない。

## 採用しなかった狭幅所属ラベル案

320pxで既存横持ち仕様の18px帯へ切り替え、市場側候補を優先する案を試したが、320×568の終盤fixtureでは市場境界の必要な空白を確保できなかった。2回の候補検証は失敗し、製品変更・テスト変更は撤回した。元の320/390×844境界assertは維持する。短い画面での改善を確認したとは報告しない。

## 購入後の応答・閲覧位置の候補修正

- 購入cueがある市場closeでは、戻した卓のlayout→cameraを同期してから同taskで演出を提示する。購入なしのcloseは従来経路。単純にlayoutを除く案は復帰snapshotが混在するため不採用。480ms flight、1200ms notice、1500/2500ms観測期限は不変。
- 独立レビューで相手正面・pan後の購入→Backを追加確認し、修正前の `0d8e68da` でも横pan80pxを失う既存挙動を再現した。viewport高も616→668へ変わるためrawscroll一致だけは正しい指標ではない。
- カメラが記録する閲覧カードにviewport内の比例位置を追加。通常resizeは二重RAF後、明示syncLayoutは確定済みの卓へその場で復元し、focusCardが復元前のsnapshotを保存しない。geometryが変わるBackはカード識別子も利用。完全表示を保証する仕様ではなく、centerのclampで一部可視を保つ。
- 初期の新testは先頭カードを比較したが、実際に中央で閲覧していたのは別行のパン屋だった。異なる行のカードを同時に比例復元する要求は不適切なので、新caseを「中央に近い同一カードの追跡」に修正。既存テスト/assertは変更しない。390/844でscale/angle厳密一致・比例位置1px以内・正本不変を確認した。独立レビュー指摘に従い、保存したカードがUndo/交換等で消えていた場合は旧world中心のfallbackへ戻す。
- 最終ローカル回帰は既存11件＋新1件（390/844の購入→復帰）で12件成功、2.5分・1worker。構文、main/UI型、ESLint、関連単体も成功。native CIは後続確認する。
- [変更前画像](assets/nightly-quality/camera-return-390-before.png) / [変更後画像](assets/nightly-quality/camera-return-390-after.png)。[前の測定](assets/nightly-quality/camera-return-390-before.json) / [後の測定](assets/nightly-quality/camera-return-390-after.json)。同じ人間2席のcontrolled fixture。前は先頭の麦畑、後は実際の閲覧anchorである別行のパン屋を記録したため、縦の数値を直接比較しない。幅が変わらない横pan80pxの消失を修復。390のscrollLeft584→584、844は835→835。独立画像レビューで新しい操作の重なり・表示崩れなし。afterのカード名左側のclipは利用者が明示したpanを保持した結果で、全景fitの欠落とは区別する。
- 今回の候補が約1.2秒の描画空白そのものを解消したかは未確認。ローカルChromiumの成功をnative WebKitの安定性の証明にはしない。

## 残課題と完了判定

- 最新候補の固定環境を確認し、再試行/skip/中断を区別する。以前の全Nightlyが再試行0で完走した後も過去の別失敗を調査し、未確定事項を隠さない。
- 320終盤の任意構成でowner名の末尾配置/省略が残る。建設の一時通知が自分の施設を覆う場合もあり、操作は覆わないが視線誘導の改善余地がある。
- 公式の静止画・PVとの比較で、大きな発動カード、卓面の光、プレイヤー反応、連鎖演出の一体感には差が残る。公式の画像・キャラクターを製品へ取り込まない。
- 俯瞰終盤の細字は自然な拡大閲覧と併せて評価する。物理スマートフォンは未確認。
- テスト成功・画像一致だけで商用品質へ到達したとはしない。実プレイ・比較画像・独立レビュー・重大問題の解消を照合して判定する。

## 743の実UI完走（後続候補を含まない）

[41112655865](https://github.com/nao70161994/machikoro/actions/runs/41112655865)、CPU1500ms・非seed・人間席の自動UI操作。

|viewport|turn|人間actions/click|経過ms|閲覧→復帰|pageErrors|
|---|---|---|---|---|---|
|390×844|50|125/204|410789|2click/906ms、scale/angle/正本復帰|0|
|844×390|62|151/240|531351|2click/834ms、scale/angle/正本復帰|0|

序盤・中盤・終盤・first-build・winnerを保存し、縦横のmid/late/first-build/winner8枚を独立目視。新たな主要操作の重なり・重大な切れは見つからなかった。owner名の末尾配置、終盤の細字、横の広い余白は残る。diceの撮影target時刻とactualelapsedは一致しないため、この静止画列だけで演出の連続性を検証したとはしない。専用の実frame検証と併せて評価する。物理スマートフォン確認とは区別する。

## 次候補の確認範囲

所属名の3caseと同名確認を含む最終1case、通常再配置2case、独立化した購入復帰2caseはローカルで成功。stageの全建設条件を含む6case成功batchもあるが、後続batchの失敗は上記に残しており「関連ローカル全成功」とは報告しない。最終の構文・ESLint・main/UI型・関連単体は成功。テストの時間上限や許容値は変更していない。追加の固定WebKit重点検証を先に実行し、その結果から次の全Nightlyを判断する。

## 7ecの4幅実UI完走と独立画像確認

[操作集計](assets/nightly-quality/ui-playthrough-7ecac-summary.json)。人間席を通常のUIから自動操作し、CPU弱・1500ms・非seedで進行。全4幅で勝利、pageErrors0、相手正面閲覧→復帰は2clickでscale/angle/正本を維持。

|viewport|turn|人間actions/click/keys|CPU待ちms|全経過ms|閲覧→復帰ms|
|---|---:|---|---:|---:|---:|
|320×568|77|180/290/38|287310|579788|802|
|390×844|83|214/327/42|335146|638674|546|
|844×390|75|174/269/37|277733|610222|1014|
|1440×900|90|251/376/45|338699|1117530|1966|

異なる非seed対局なので所要時間を変更前後の性能比較には使わない。action.elapsedMsはメニュー等の複数操作を含み入力遅延そのものではない。1440の最初のrollは10122ms、同じ区間で5枚の撮影actualelapsedは1701〜7909msとなり指定0〜1200msと一致しない。画像採取時間を含むため、この列からサイコロの連続動作や操作遅延を証明しない。

[実発動320](assets/nightly-quality/activation-live-320-7ecac.png) / [実発動844](assets/nightly-quality/activation-live-844-7ecac.png)は時間固定しないnative実rollの第4送金付近。独立レビューは森林/街4/+1/銀行→街4/4/4が読め、HUD/操作への被覆なしと評価。320の市場上部、街4のownerラベルはpopupに隠れ、送金bubbleは実カードの一部に重なる。popupにもownerがあるので情報喪失ではないが、元施設との視覚対応と演出の重なりには改善余地。静止画で600msの読み取りや連鎖テンポを保証しない。

[最新1440の実対局勝利画像](assets/nightly-quality/winner-live-1440-7ecac.png)。独立レビューで語内部折返し解消と6枚一列、操作の明瞭さを確認。下端の所有施設はスクロール領域なので全件同時表示の証明にはしない。

## 発動帯と所有者名の位置対応（後続候補）

7ecの実発動画像の独立レビューで、発動帯がownerラベルを覆う点を発見。従来の位置評価は元カードと施設/市場だけを見ていた。元カード→表示中のowner名→その他の被覆面積の順で評価し、元カード辺沿い8候補を追加。overlayがない席では表示中の元見出しも対象にし、opacity0の見出しを除外する。ownerだけで文字fallbackへ戻さず、元のsource/サイズ/所有施設被覆によるfallbackを維持。100×65px・600ms・700ms刻み・取消guardを変えない。

[844前](assets/nightly-quality/activation-owner-844-before.png) / [後](assets/nightly-quality/activation-owner-844-after.png)、[320前](assets/nightly-quality/activation-owner-320-before.png) / [後](assets/nightly-quality/activation-owner-320-after.png)、[測定](assets/nightly-quality/activation-owner-comparison.json)。4人森林の直接投影で4/4を撮影、撮影だけexpiry60秒固定。実roll/送金/600ms体感の証明ではない。844は街4名の被覆→非被覆、320はこの場面では元から非被覆で配置不変。いずれも元カード非被覆・アート100×65px・正本不変。任意場面で全owner非被覆を保証する変更ではない。

既存844/320実rollケースの元判定を保ち、全発動でowner overlay非被覆の確認を追加。ローカルはbrowser1個の固定画像採取のみ実施し、終了後に構文/ESLint/mainUI型をまとめる。native20件と通常CIは後続確認。先行7ecの成功を候補の成功へ読み替えない。

後続候補の構文・ESLint・main/UI型は成功。独立ソースレビューは辞書順と追加候補の安全性を確認し、overlay欠落時の元見出しも保護する補足を反映。追加の独立画像レビューはエージェント利用上限で未実施。実装者自身の844前後確認では街4名と市場見出しが現れ、操作/元カードへの新しい被覆なし。独立画像レビュー済みとは扱わない。

追加独立レビューは利用上限の復帰後に実施できた。320/844の原寸A/B4枚を確認し、844はowner全文・元カード/市場/HUD/操作非被覆、320は配置不変・市場上部被覆は残るが増悪なしと評価。採用可能との判断。静止fixtureの評価であり実roll/600msテンポの証明とはしない。最新候補668ed718の重点WebKitは[41189002920](https://github.com/nao70161994/machikoro/actions/runs/41189002920)、Releaseは41189004547、16画面は41189004543で結果待ち。

## 668ed718の重点WebKit失敗と次の切り分け

[41189002920](https://github.com/nao70161994/machikoro/actions/runs/41189002920)は18成功/2失敗・retry0・5.7分。844の第4送金は160ms/opacity1の後、次のRAFが終了600ms/opacity0で元の<500ms判定に失敗。1440建設はafterClose238msのpaused0から次が1610msのpaused0で、1500ms内の移動frameを観測できなかった。所有者非被覆の失敗ではない。320は4回ともowner/source非被覆・100×65アート・正本/再生guardの元assertを通過。新配置で描画待ちが解消したとは主張しない。

次の診断はテスト側だけでtimeout callbackの処理時間を最大100件記録し、フレーム間隔との区別を可能にする。caption生記録も元frame判定より前に保存し、失敗で証拠が欠けないようにする。製品の時間軸・元assert・6500/1500ms期限を変えず、同じ条件で処理コストを採る。通常Release/16画面の同版結果を待ち、無変更で成功するまで再実行はしない。

668ed718の通常Release [41189004547](https://github.com/nao70161994/machikoro/actions/runs/41189004547)は成功。16画面ジョブ41189004543は継続中。描画空白は原JS callbackの時間と同時刻のCPU/memory pressure・cgroup throttlingを診断専用ジョブで500ms毎に記録して切り分ける。Linux counterが読めない場合はnullを残し、同時1sample・callback最大100件・ファイル出力でメモリを制限。childコマンドのexit statusを維持することをローカルで終了code7のコマンドにより確認（3行のJSONL、ラッパーもcode7）。新規製品機能やテスト緩和ではない。通常Release/16画面の元実行が終わるまでPushを控え、途中取消を避ける。

668ed718の16画面/表示操作 [41189004543](https://github.com/nao70161994/machikoro/actions/runs/41189004543)も成功。通常Releaseと併せて結果確定。重点20件の2失敗は別に保持する。診断コードの独立レビューで、採取障害によるchild終了コード上書き・直接childだけへのsignal転送・100件以降の計測継続を指摘され、child結果優先・POSIX process groupへ転送・100件以降はnative timerへ戻すよう修正。終了code0/7とSIGTERM143のsmoke成功、構文/ESLint成功。観測負荷はゼロではないため、圧力/処理時間の相関だけで原因確定とはしない。
