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

## 完了判定の根拠と残差

- 元main3回のログは[失敗監査JSON](nightly-main-failure-audit.json)に記録。23種類と現行検証契約を対応付けている。assert削除・差分許容値の緩和・強制クリック・時間延長で失敗を隠さない。
- 元の318件は6分割と実行IDの和集合検証で保持し、追加回帰を含め現在347件。分割数やテスト数だけで安定性を証明しない。最新Release/Nightlyの初回結果と中断／許可済skipを確認する。
- 実対局と表示fixture、ローカルChromiumと固定WebKit、自動ブラウザと物理スマートフォンを区別する。物理端末は未確認。
- 公式の静止画・PV比較は[一次調査](nightly-table-quality-2026-10-23.md)と[追加履歴](nightly-quality-history.md)に記録。大きな発動カード、ライティング、キャラクター反応、連鎖演出の一体感には差が残る。既存作品の画像・キャラクターは使用していない。
- 俯瞰終盤の小字は自然な拡大閲覧と併せて評価する。勝利時の長い名称の組版、任意の所有構成のラベル順位付けにも改善余地がある。
- テスト成功だけで商用品質へ到達したとしない。最新実プレイの画像／操作記録と独立レビューを照合して判断する。

## 調査履歴

[追加調査の時系列記録](nightly-quality-history.md)には、過去の失敗・撤回案・訂正・close競合の再現を保存している。原main調査と設計は[一次記録](nightly-table-quality-2026-10-23.md)を参照。
