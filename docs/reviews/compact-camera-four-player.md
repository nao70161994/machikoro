# 狭幅操作の改善と4人実UI対局

## 問題と実装

[4eの320px正面閲覧](assets/nightly-quality/ui-playthrough-320-midgame-opponent-upright-4e.png)では「戻る」が有効になると「自分」の右端が横scroll枠から出ていた。操作不能ではないが、普段使う視点の入口として発見しにくい。

候補2eb29fc8は既存max360pxの範囲だけ、補助メニューを44×44pxの「…」にし、視点操作内のgapを1pxにする。全体/戻る/市場/自分の既存40px下限、収支・メニュー・ガイドの44px、文字サイズ、盤面高さを維持。重要操作をメニュー内へ移していない。狭すぎる条件で横scrollできる既存機能も残す。

候補45e56561の重点10件は9成功/1失敗。`::before`の省略記号がaccessible nameへ入り、実値は「… メニュー」だった。assertの期待値を変えず、1471cedaでsummaryに `aria-label="メニュー"` を明示。修正版 [41335086020](https://github.com/nao70161994/machikoro/actions/runs/41335086020) は**10初回成功、retry0、3.2分**。通常のclick・focus・矩形包含・3点hit test、二段階Escape復帰等を維持。

[修正後の320px実画面](assets/nightly-quality/camera-controls-320-after-147.png)では、ガイドと戻るが同時に有効でも全視点操作が全文表示される。前後画像は異なる対局状態なので、盤面差をこのCSSの効果として扱わない。

## 基準画像の扱い

[候補生成41334654981](https://github.com/nao70161994/machikoro/actions/runs/41334654981) から16枚を取得、ZIP全CRC成功。独立画像レビューで320の更新を承認した。**更新するのはcardboard-phone-320の1枚だけ**。他15枚は元基準を保持し、差分許容値0.012は変えない。

新320基準には今回の操作メニューだけでなく、以前から製品へ採用済みの所有者札の席接頭辞除去・無効な戻る非表示・収支の固定位置も反映される。カード配置/アート/色/盤面高/下部操作に新しい崩れがないことを目視確認しており、基準更新だけを改善の証拠にはしない。生成45と147の製品差はaccessible nameの明示だけで、描画CSSは同じ。

## 元の全体CI

c4335aabの [Release](https://github.com/nao70161994/machikoro/actions/runs/41333500329)、[16画面/操作](https://github.com/nao70161994/machikoro/actions/runs/41333500338)、[全Nightly](https://github.com/nao70161994/machikoro/actions/runs/41333510157) は成功。[生summary](assets/nightly-quality/nightly-stable-c433.json)。Nightlyは354件中353初回成功＋許可済opt-in skip1、flakyなし。全ID和集合照合成功、6shardは8.7〜15.9分。最新の狭幅候補の全体CI成功に読み替えず、候補を反映後にまとめて再検証する。

## 実UI対局の人数指定

既存の任意実UI対局に `UI_PLAYTHROUGH_PLAYER_COUNT` を追加。既定2、整数2〜10だけを認める。人数変更は実際の＋ボタン、席0のhumanと残席weak設定も見えるUIで操作し、開始後の人数/human1/weak人数をassertする。乱数固定、GameManager状態の差し替え、CPU置換、期限緩和はない。25分上限・1200step・CPU1500msを維持する。

[4人390/844の実行41334659147](https://github.com/nao70161994/machikoro/actions/runs/41334659147) は45e56561の任意検証。390は開始から勝利まで完走、75turn index・85human actions・144click・18key・519651ms、CPU待機347291ms、pageErrors0。相手閲覧/戻る2clickで倍率/角度/正本を保持。844も99turn index・126human actions・195click・25key・836961ms、CPU待機551648ms、pageErrors0で完走。相手閲覧/戻る2clickで倍率/角度/正本保持。[集計](assets/nightly-quality/ui-four-player-45-summary.json)と画像の独立レビューを参照。これを全人数×全幅の自然対局や物理端末の体感検証とは扱わない。

Goal未完了・マージ保留。全景の細字、イベントの一時的被覆、公式作品との立体感・連鎖の一体感には引き続き品質差がある。

## 4人レビューで見つけたHUD名の追加修正

4人390画像では上部3CPU名がすべて「CPU（弱…」になり番号を読めなかった。9c17bb40で、短い末尾「・1」などをprefixと別spanにし、prefixだけをellipsis、番号は縮めない表示へ変更。名前・title・aria-labelの全文、escape、正本を保持し、CPU種類・判断・名前のデータは変更しない。通常名は従来表示のまま。

Node UIテスト・JS構文・ESLint・独立ソース監査が成功。browserでは320/390pxの4席について番号の文字Range包含と遮蔽なし、全文/accessible name/正本を検査する。任意重点はこの1件を追加した11件として [41336453178](https://github.com/nao70161994/machikoro/actions/runs/41336453178) は11初回成功/retry0・3.4分。完走45画像の旧名表示が直った証拠にはせず、候補の実画像/全体CIを別途確認する。

rootは9c17の320/390 PNGも目視し、4席すべての末尾番号と施設枚数/所持金/目標が区別できることを確認した。[390修正画像](assets/nightly-quality/roster-identifiers-390-9c17.png)。320ではprefixが「C…」になるが番号は全文露出し、完全な名前は盤上の所属札とaccessible nameに維持される。ソースは独立承認済みだが、この2画像の確認は実装者rootによるもの。
