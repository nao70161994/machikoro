# 品質改善の最新確認状況

対象: PR #19 / `feat/nightly-table-quality`。mainはPR #18の `a265ca7e`、マージ保留。商用品質への到達は未完了。過去の失敗・訂正・撤回案は[時系列記録](nightly-quality-history.md)、原mainの調査は[一次記録](nightly-table-quality-2026-10-23.md)を参照。

## 検証済みと確認中の範囲

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
