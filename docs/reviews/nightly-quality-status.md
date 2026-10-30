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
|同16画面・操作|dedc82d2 / [41107097606](https://github.com/nao70161994/machikoro/actions/runs/41107097606)|確認中|
|同全Nightly|dedc82d2 / [41107113418](https://github.com/nao70161994/machikoro/actions/runs/41107113418)|348件・6分割58件ずつ。確認中|

次候補は勝利ランドマークの語単位表示・PC一列配置。ローカル単体・4幅ブラウザ・main/UI型・ESLint成功、固定環境は未確認。前commitの成功を追加変更の成功と混同しない。

## P0の原因と修正

- 元mainの3回は318件（WebKit316、Chromium2）を1 workerで実行し35分で未完了。[23種類と現在の検証契約](nightly-main-failure-audit.json)を対応付け、case単位6分割とID和集合照合で欠落/重複/未実行/中断を検出する。
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

## 残課題と完了判定

- 最新候補の固定環境を確認し、再試行/skip/中断を区別する。347件の初回成功が揃った後も過去の別失敗を調査し、未確定事項を隠さない。
- 320終盤の任意構成でowner名の末尾配置/省略が残る。建設の一時通知が自分の施設を覆う場合もあり、操作は覆わないが視線誘導の改善余地がある。
- 公式の静止画・PVとの比較で、大きな発動カード、卓面の光、プレイヤー反応、連鎖演出の一体感には差が残る。公式の画像・キャラクターを製品へ取り込まない。
- 俯瞰終盤の細字は自然な拡大閲覧と併せて評価する。物理スマートフォンは未確認。
- テスト成功・画像一致だけで商用品質へ到達したとはしない。実プレイ・比較画像・独立レビュー・重大問題の解消を照合して判定する。
