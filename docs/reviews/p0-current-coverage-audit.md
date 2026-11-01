# P0現行テストの独立ソース監査

対象HEAD: `4e83cf7a`。元失敗分類JSON、達成確認表、関連browser specと `scripts/nightly-browser-coverage.js` を読んだ。元main比較基点は分類JSONの `a265ca7e`。追加テスト・ブラウザ起動・製品編集は実施していない。実行中の最新CI・実UI対局の成功を前提にしない。マージ保留。

|群|現行テストが実際に検査する契約|旧fixture修正の評価・不足|
|---|---|---|
|5/10席|`cardboard-market-regression.spec.js` の横卓2件は全席count、全indexと各3施設名、全header・市場購入・Skipのviewport包含、最終席の実クリック。適応盤面も全席countと最終席閲覧を検査。|3席だけという旧期待値から全席へ変更するのは表示仕様の変更に整合し、assertを強化している。全カード文字の判読・高密度自然対局全般は保証しない。|
|320カード70px|同specの適応盤面は320幅2/3/4/5/10人で席0を実クリックして正面閲覧へ移動後、最初のカード幅70px以上・詳細開閉・市場詳細・正本不変を検査。|数値70は維持。ただし俯瞰から正面閲覧後へ測定時点を移したため、**俯瞰で70px以上という旧契約の維持ではない**。操作して読む仕様としては合理的。全席・全カードの最小幅ではない。|
|disclosure排他|同specで絞込→目標→市場を閉じガイド→実メニューからログ→実市場起動と絞込、各open/hiddenを検査。4テーマ往復では正本一致も検査。|native dialogの背後を直接操作せず公開操作へ変更する修正は妥当。対象ケース単独には全組合せのfocus復帰assertはなく、分類JSONの記述をそのまま保証とは読まない。|
|回転カードの収支・休業|同specの上席fixtureで収支と休業文言、dice/name/dormant/activation矩形相互非重複、countも含む各要素の縦包含とscroll寸法を検査。|重なりassert追加は強化。ただしここは**文字Rangeではなく要素矩形**であり、分類JSONの「文字Range」表記は過大。横方向のカード包含、4方向全ての同条件はこの1件では保証しない。|
|4特殊収益|`cardboard-purple-results.spec.js` でスタジアム+3、TV+2、出版社+3、公園−21の実GameManager処理、receiptの施設/相手/街1、カードnet/count/activated、不要transferなしを検査。公園はdice文字Range縦包含と紫category表示も検査。|過去ログを除去し、非表示旧summaryから実receiptへ観測先を移すのは妥当。旧pseudo badge比較の代わりに独立category表示と文字fitを検査。**4テーマ往復ではなくplaza→cardboardの2テーマ**。対象選択もここではGameManagerへ直接与えており実UI全操作の証明ではない。|
|更新bannerと選択操作|`cardboard-state-combinations.spec.js` で844×390のSELECT_DICE/REROLL_CONFIRM/HARBOR_CHOICE、banner表示とログ、実メニューでログを閉じ、対象buttonがbanner上かつviewport内、実クリック後buildまで進行。reduce下TVも実クリック・コイン差額を検査。|CPUをhuman fixtureへ変更し既存CPU取消を維持するのはUI状態検証を安定させる修正として合理的。ただしCPU共存・実SW更新は対象外。ログを開いたまま操作できる契約でもない。|
|長名HUD|`cardboard-view.spec.js` の844×390、名前「参加者プレイヤーA」で全文text、scrollWidth≤clientWidth、コイン文言を検査。|元の文字列と幅assertは維持。文字Range、縦clip、他操作との非重複、任意の長名や全幅はこのケースでは保証しない。分類JSONの「操作領域」まで単独で担保するとは読まない。|
|市場clip/scroll|同specの12出目390/1440で駅を建て6+6を確定、対象の事前位置を測り、必要時scrollTop>0、対象カードの市場内包含・全clip祖先・viewport包含を検査。市場内部scrollの再描画保持はmarket回帰にもある。|**無条件scrollTop>0を条件付きへ変更**している。元から見えるdesktopカードに不要scrollを要求しない修正は妥当で、完全可視assertは強化。ただし必要scrollが必ず発生するかはfixture実測次第。市場UIをユーザーが手動scrollして探す全経路の証明ではない。|
|元318件と現coverage|coverage scriptは現行Playwright discoveryのproject付きIDを6shard和集合・実行reportと照合し、重複/欠落/未完了と想定外skipを拒否する。達成表には先行352件照合成功を記録。|**現行plan内の網羅性**は検証できる。一方、旧318件→現行の意味契約の保存をこのscriptだけでは証明できない。IDや件数の一致もassertの意味は検査しない。元23失敗の対応表と本表は限定的な意味監査で、全318件の差分監査ではない。最新4eの実行照合結果は別途必要。|

## 削除・緩和・強制操作の確認

この9群に関連する元mainからの差分では、70pxの検査時点変更と市場scrollの条件化が契約の変更に当たるため明示した。両者を「元assertが完全に同一」と説明しない。古い3席count、非表示summary、廃止pseudo badgeから現行の可視UI契約へ変更した部分は妥当だが、旧fixtureという分類自体が成功の証拠にはならない。

元main→現行 `tests/browser` の追加行検索では、新規 `force: true`、`test.skip`/`fixme`、timeout緩和は見当たらなかった。全assert差分の逐語的な完全監査ではない。テスト用タイマーhookの追加は存在するが、この9群の期限緩和を示すものではない。

分類JSONは当時の契約要約であり、現行ソースより広い「文字Range」「4テーマ」「操作領域」等の表現は上記の実検査範囲へ限定して扱う。過去の成功を最新HEADの成功や物理端末の体感品質へ読み替えない。

## 旧318件から現352件への対応調査

[ケース対応JSON](assets/nightly-quality/baseline-case-correspondence.json) に全件を保存した。`a265ca7e` の必要ファイルをtmpへ `git archive` で展開し、既存node_modulesをsymlinkした。旧・現とも同じインストール済みPlaywright、同じplatform shim、同じ `--project=mobile-webkit --project=chromium-desktop --list --reporter=json` でdiscoveryした。依存install、ブラウザ・サーバー起動、branch切替、commit/pushはしていない。

- 旧 **318件（WebKit316＋Chromium2）**を再現。現 **352件（350＋2）**。discovery errorは双方0。
- 旧のうち同project/file/titleが310件。残り8件は改名または幅別・回数別分割へ対応し、未対応0。元失敗分類23項目にも全て旧ケースと現ケースの対応がある。
- 8件は、5/10席名の改名2件、手番挨拶→4幅HUD通知、12出目→2幅、ランドマーク→3幅、建設通知→5条件、高速往復→10回、発動帯→2幅。旧ケースに対応付かなかった現行の新規ケースは14件。
- これは**選択ケースの系譜**の確認であり、旧318契約の意味が完全同一という証明ではない。現行coverage ID和集合照合の役割とも区別する。最新CIの実行完了はこのdiscoveryでは検証していない。

## 元23失敗以外のassert差分の追加監査

元mainからのbrowser spec削除行を列挙し、assert置換を含む周辺の追加行を確認した。既述の2項目以外にも、次の契約変更があり「全assert不変」とは説明できない。

|変更|評価と維持されない旧保証|
|---|---|
|高速市場往復：同じlandmarkへのfocus維持→native市場を閉じたlauncherへのfocus復帰|現UIの非表示landmarkをfocus対象にしない修正として合理的。ただしthemeをまたいでlandmark focusを保持する旧契約は削除。20回theme変更と市場ノード同一性・正本保存は分割して残る。|
|正面閲覧時の中央挨拶→HUD cue|旧中央通知の `display:flex` を `none` へ変更し、HUD cue開始、自然期限前の自動配置非取消、明示閲覧後の終了を4幅で検査。意図した通知仕様の変更であり同一assertではない。|
|readable倍率の固定0.95→0.95〜1.6|固定値の保証を外し、カード実幅下限とzoom in/out増減・上限を追加。読める倍率の適応仕様として合理的だが0.95固定を保持したとは言えない。|
|俯瞰市場の先頭16件固定→実columns×rows件|現在の可視行について四辺非clip・件数正を検査する一方、16件を同時可視にする保証は外れる。可視件数を製品自身の行列値から得るため、行数が意図せず減る退行への独立した下限検査にはならない。|
|広場初手ガイドの展開本文→閉じたsummary全文|初手本文が自動展開する旧契約を変更。説明全文がsummaryに含まれることと実開閉を追加しており、文章消失を許す変更ではない。|
|広場の共有receiptで席間支払outgoing→neutral|銀行支払outgoingを別の実収支−2 fixtureで検査し、席間3相手も全て検査。意味の明確化として合理的だが旧flow値とは異なる。|
|広場HUD44px→52px、夕暮れ施設枠23%→初期2枠38%|固定の意匠寸法を変更。HUD包含・44px操作下限、施設数2と実幅下限・縦横比・包含は残る。旧の寸法そのものの保証は維持しない。|
|レイアウトfixtureのhuman統一／CPU停止、通常gestureのSW block|既にruntime CPUを無効化していたfixtureとの整合、再描画競合排除として合理的。ただし同じケースでの自然CPU進行・実SW更新との同時性は保証しない。別のCPU/SWケースがあることは全組合せの代替証明ではない。|
|16枚のvisual snapshot基準更新|specの差分許容値緩和は見当たらず、静止状態のcue終了待ちを追加。PNG基準自体は全16枚が変更されているため、旧画像と同じ見た目の保持をsnapshot成功からは主張できない。個別ビジュアル承認は別証拠が必要。|

建設通知・ランドマーク・確認modal等のループ分割では、旧assertを追加先へ移しただけの削除も多い。建設のmoving期限1500ms・60〜400ms窓、送金のelapsed<500ms／opacity>0.5は現ケースにも残る。発動テストは計測をarmしてから操作する形へ変更されており、観測負荷や開始時点まで旧実装と同一とはしない。新しいRAF/timer hookは呼出しを転送して計測するもので、遅延値を短縮したりassertの期限を延長する差分は見当たらない。

上記の意味変更を隠して無条件に「旧全契約維持」とするのは不適切。今回は選択対応と削除assert周辺を重点監査したもので、全追加fixture・全画像の再承認ではない。新たな無根拠のforce click、意図しないskip追加、元期限の緩和は確認範囲では見当たらないが、可視件数など保証が変わった項目は要求との照合を残す。
