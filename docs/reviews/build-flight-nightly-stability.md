# 建設飛行のNightly不安定性

2026-11-19。調査対象main d5882c17 / SW371。修復ブランチ `fix/build-flight-nightly-stability`。製品修正は未採用。テストfixture是正と検証を完了し、提出の最終確認を行う。

## 最新の方針

同一runnerのABBAでは、新候補の後に戻した旧版も同程度のframe間隔となり、body独立化の効果を分離できなかった。候補の製品変更は撤回し、Field/CSS/SWをmainと同じ内容へ戻した。以下の候補段落は調査履歴であり採用結果ではない。

採用する修正案は1440pxのPCケースのcontext設定のみ。project既定のiPhone相当DPR3/mobile/touchを継承せず、固定Playwrightの標準Desktop Safari（DPR2/mobile false/touch false）を使用する。320/390/844/320更新通知ありの4条件は元のiPhone設定を維持し、全条件の実UA・DPR・viewport・動き低減設定とcontextのmobile/touchをassert・原本へ保存する。480msの飛行、1500ms期限、60〜400msの途中観測、購入・到着順・通知・状態保存の検査は維持する。

これはPCを意図したfixtureの端末設定の是正であり、旧「1440pxをiPhone相当で表示する」負荷条件の性能問題の根絶や製品速度改善を意味しない。この検証契約の差を隠さない。実際に飛行追加を1件観測するassertも追加し、空配列のeveryで検査が通る穴を防ぐ。新設定の15回反復は全件初回成功。通常Release・Nightly全件集約とも成功。最終結果は末尾に記録する。

## 再発と実測

[11月18日44212258139](https://github.com/nao70161994/machikoro/actions/runs/44212258139)の1440px建設通知は初回失敗、再試行成功。厳密なcoverage verifierがflakyを拒否した。[翌日44429141113](https://github.com/nao70161994/machikoro/actions/runs/44429141113)は同コードで成功しており、修復の証拠にはならない。

|実行|閉じた後の観測RAF|途中観測|
|---|---|---|
|失敗|111ms → 1621ms|両方currentTime0/paused、1500ms期限超過|
|同run再試行|139ms → 1063ms → 1164ms|102ms/running|
|翌日成功|81ms → 756ms → 816ms|60ms/running|

[初回失敗原本](assets/build-flight-stability/failure-1440.json) / [再試行](assets/build-flight-stability/failure-retry-1440.json) / [翌日成功](assets/build-flight-stability/success-1440.json)。取消記録はなく、飛行の生成・同位置scroll保持は成功。製品のstageBuildFlightは2回のRAF後に480msの時計を開始するため、2回目のRAFが1500ms後へ遅れたことが直接の失敗条件。callback本体は短いが、ラッパーのstack生成コストやpaint/GPU/環境要因まで短いと証明するものではない。

## 切り分け（以下は実験の経過。採用結果は末尾）

製品を無変更のmainへ揃えた補助d4c1b893で[44488799178](https://github.com/nao70161994/machikoro/actions/runs/44488799178)を実行。固定Playwright1.61.1/nativeコンテナ、1worker、同じ1440px既存ケースをheadless/headedで各5回、retry0で比較する。変更は補助workflowのみ。480ms・1500ms・途中60〜400ms・表示/正本/scrollのassertは変更しない。主版全Release/Nightlyの代替とはしない。

初回RAFですぐ再生するだけでは、遅いpaint中に480msを消費する過去の問題を再導入する。時計の人為変更や期限延長は採用しない。描画方式比較とtraceを確認してから、製品の開始待機・テスト観測負荷・実行環境を区別して修復方針を決める。

headless対照5回は全初回成功。ただし描画間隔の最大値は888/664/683/643/642msと大きく、元失敗1510msの根因が解消したとはしない。[同じ検査での対照計測](assets/build-flight-stability/headless-baseline-summary.json)。headed対照の最終結果は次節に記録する。


### 描画方式対照の結果

44488799178はheadless5/5成功、headed0/5成功。headedの観測は概ね105→689→1244msで、2回目に再生しても次のframeまでに480msが終わり飛行が除去された。[headed原本由来の集計](assets/build-flight-stability/headed-baseline-summary.json)。画面ありへ切り替える案は棄却し、製品根因解消とも説明しない。

1440pxもproject既定のiPhone相当（DPR3/mobile/touch）を継承していた。補助f27edf91の[44489767705](https://github.com/nao70161994/machikoro/actions/runs/44489767705)ではDesktop SafariのDPR2/mobile false/touch falseを使用し、製品・480ms・1500ms・60〜400ms・全assertを変えず同じ1440ケースを5回比較する。これはprofile変更の影響調査であり、元の高DPIモバイル条件が直ったとの証拠にはしない。PC相当の仕様に直す場合も契約差を明記し、端末負荷の実装問題が残っていないか別に判断する。主版には未採用。


### 元の高DPI条件を保った描画分離候補

補助cdbbf96bの[44490133562](https://github.com/nao70161994/machikoro/actions/runs/44490133562)を開始。PC設定の比較とは独立して、元のiPhone相当DPR3/1440/headlessへ戻し、建設飛行だけをboard直下からbody固定レイヤーへ移す。画面座標・時計・2RAF・480ms・1500ms・全assertは不変。親依存の主CSSとhigh-contrast selectorを対応し、元のboard notice監視を残したままbody flightの実追加/削除も観測する。解除・現在手番・再生・非表示・Reduced Motionの既存guardは不変。

飛行は元から固定配置/will-change指定なので、描画分離が効果を持つかは未証明である。独立sourceレビューでも、frame停止そのものは解消しない可能性と、全体stacking順位・操作被覆・cleanupの再確認を指摘された。比較で明確な改善がなければ採用しない。主版には未移植。


### 採用候補の検証

PC設定対照44489767705は5/5成功。最大frame間隔489/339/349/341/324ms、途中観測641/489/514/489/478ms。[集計](assets/build-flight-stability/desktop-baseline-summary.json)。body独立候補44490133562も元DPR3条件で5/5成功、最大frame間隔705/547/556/515/496ms。[集計](assets/build-flight-stability/body-baseline-summary.json)。元headlessも5/5成功だったため、合格数だけでは採用根拠にしない。

runner差・順序を分けるため補助9a853946の[44490784599](https://github.com/nao70161994/machikoro/actions/runs/44490784599)で同一runner内の旧→新→新→旧を各3回比較中。製品変更はFieldと対応CSSのみ、同じ元DPR3/1440/480ms/1500ms/60〜400ms条件。実行順・失敗を残し、途中失敗でも後続比較を実施して最終exitへ伝播させる。

主修復ブランチの候補e63f2cf7（SW372）はbody独立描画と実DOM監視を移植した。実flightの追加が必ず1件あるassertを足し、空配列のeveryが成功する余地も閉じた。構文・Field/UI Node・全checkJs・対象lint・独立sourceレビューは成功。guard/cleanupは不変、全体z-indexの実画面確認は残る。PC profile変更は主版に採用しておらず、元の高DPI条件を保持する。

同候補の[44491072533](https://github.com/nao70161994/machikoro/actions/runs/44491072533)では320/390/844/1440＋320更新通知ありの元5条件を各3回、retry0で検証中。比較・反復・画像・全CIが完了するまでは候補として扱う。主ブランチへのPush・PR作成・全体Release/Nightlyは未実施、マージ保留。


### ABBA最終結果と候補撤回

[同一runner比較44490784599](https://github.com/nao70161994/machikoro/actions/runs/44490784599)は12/12成功。[全12件の集計](assets/build-flight-stability/abba-summary.json)：旧1回目867/655/667ms → 新632/631/649ms → 新616/628/636ms → 旧4回目624/617/633ms。後半の旧版が新候補と同等以下のため、前半との差を製品の描画分離効果と判断できない。初回・暖機順序の影響を除けず、根拠の弱い製品変更は戻した。

body候補の[4幅・更新通知の15回44491072533](https://github.com/nao70161994/machikoro/actions/runs/44491072533)は全成功し、1440画像の独立レビューでも新しい被覆/切れはなかった。しかし性能面の因果根拠にはならないため、その成功で候補を採用しない。

最終のテスト設定案は補助e5ef7cd5の[44492113119](https://github.com/nao70161994/machikoro/actions/runs/44492113119)で5条件各3回、retry0を検証中。実行製品はmainと同一。1440のみ標準Desktop Safari、他4条件は変更なし。実profile assertとattachment、診断JSONにもprofileを追加した。1440のタイトルへ「PC」を追記した1件の改名で、元5件を減らしていない。全体Nightlyのdiscoveryと実行集約で全件照合する。


### 採用設定の反復・profile・画像レビュー

[44492113119](https://github.com/nao70161994/machikoro/actions/runs/44492113119)は全15件初回成功、retry0。各4画面幅＋320更新通知ありを3回ずつ確認し、実UA/DPR/viewport/Reduced Motionとmobile/touchのassertも成功。[全15件のprofileと実frame集計](assets/build-flight-stability/final-repeat-summary.json)。1440PCの途中観測は659/763/779ms、DPR2/mobile false/touch false。モバイル4条件はDPR3/mobile true/touch trueのまま。飛行480ms・途中60〜400ms・1500ms期限は不変。

[修正前のiPhone相当1440](assets/build-flight-stability/before-mobile-profile-flight-1440.png) / [修正後のPC相当1440](assets/build-flight-stability/after-flight-1440.png)。同じ実購入の観測後画像だが、撮影時刻とDPRが異なるため画素差や滑らかさの比較とは扱わない。

修正後の建設通知：[320](assets/build-flight-stability/after-construction-320.png) / [390](assets/build-flight-stability/after-construction-390.png) / [844](assets/build-flight-stability/after-construction-844.png) / [1440PC](assets/build-flight-stability/after-construction-1440.png) / [320更新通知あり](assets/build-flight-stability/after-construction-320-update.png)。同フォルダへ飛行観測後画像も保存。実装者と別の視点で10枚を目視し、飛行アート・名称・通知・HUD・主要操作の重大な切れ/被覆なし。更新/閉じる/ターン終了も重ならない。正面閲覧の隣接カードの画面外への続きはあり、全盤面の常時判読性や実機性能を保証するレビューではない。

[旧新case対応](assets/build-flight-stability/case-correspondence.json)では旧387件のうち386 IDは不変、1440の1件だけ末尾PC追加で改名、総数387一意・WebKit384/Chromium3を確認した。これはdiscoveryの証拠であり、実行完了の証拠ではない。

主修正10f58762の[Release44492611510](https://github.com/nao70161994/machikoro/actions/runs/44492611510)は全ジョブ成功。[Nightly44492607320](https://github.com/nao70161994/machikoro/actions/runs/44492607320)は全ジョブと厳密な全件集約が成功。Nightlyに16画面の画像回帰を含めるため、同じ全体Visual検証は追加しない。Draft [PR #29](https://github.com/nao70161994/machikoro/pull/29)、マージ保留。

Nightly shard5の原本 `artifacts/report-5.json`（artifact14514805387）も確認した。64件すべてexpected、unexpected0/flaky0/skipped0。対象の844px・1440px PC・320px更新通知ありはいずれもpassed/retry0。残りshardと全件集約の成功を代替するものではない。

## 完了条件と証拠の照合

|条件|証拠・判定範囲|
|---|---|
|失敗/再試行/翌日成功の比較|上記3原本。直接条件は2回目RAFの期限超過。ブラウザ内部の根因は未確定|
|意味を保つ修正|1440PCのcontext是正、生成1件のassert強化。480/1500/60〜400ms、通常クリック、到着順、正本検査は維持|
|4幅・更新通知の実購入|44492113119の15件、全初回成功、実profile記録、飛行/通知10画像の独立レビュー|
|製品互換性|製品JS/CSS/SW/serverはmain差分なし。Release全成功。Nightly全件集約も成功|
|Reduced Motion・Undo・保存復元|Nightlyの `終盤の購入とUndoはReduced Motionで移動演出を作らない`、`購入とUndo・保存再開はカード盤面と既存ビューで共通の状態を使う` など。最終実行原本でpassedを確認|
|離脱・テーマ・オンライン|Nightlyの `テーマ離脱と勝利境界で建設の表示と演出を清掃する`、`4テーマ混在オンラインは途中切替と再接続でも同じ正本を保持する` など。最終実行原本でpassedを確認|
|全件網羅・安定性|387件のdiscovery対応を確認済み。6shard実行・strict集約成功。原本で387一意、386passed/任意1skip、retries0/stable trueを確認|
|提出|PR29 Draft、マージ保留。最終証拠と画像はこの文書と同じ提出コミットへまとめる|

既存のPC幅を非標準のiPhone profileで動かす条件の停滞解消は未証明。物理端末性能の検証、滑らかさの定量保証、将来一切flakyが出ない保証はしていない。

## 最終全体検証と判定

採用ソース `10f58762ccd5a651faedb7847e32711b87d25aea`：

- [通常Release44492611510](https://github.com/nao70161994/machikoro/actions/runs/44492611510)：全ジョブ成功。static/unit/PWA/online/release、CPU smoke、3系統seeded対局、WebKit互換性とカード卓を含む。
- [Nightly44492607320](https://github.com/nao70161994/machikoro/actions/runs/44492607320)：全11ジョブ成功。6 browser shard、Node/PWA/online/release、simulation、online-soak、inventory、strict全件集約を含む。
- [集約原本](assets/build-flight-stability/nightly-browser-coverage.json)（artifact14515026329）：387一意、WebKit384/Chromium3、386passed、失敗/timeout0、retries0、stable true。planの387IDと集合が完全一致。16画面の画像回帰も実行済み。
- 1skipは既存の任意実行 `ui-playthrough.spec.js`「人間席の実UI操作とCPU弱で開始から結果まで進める」。許可されたopt-in以外のskipなし。対象の実購入5条件は全てpassedであり、このskipで代替していない。
- 新設定の対象15反復とNightly対象5件は全初回成功。元の480ms/1500ms/60〜400ms制約と実購入を維持した。
- 最終独立ソース監査でも時間・クリック・到着順・正本assert維持、製品無差分、契約差と未検証範囲の記載を確認。修正後10画像に新たな重大な切れ/被覆なし。

結論：PCを意図した1440ケースのiPhone context継承というfixture不備を修正し、標準PCと従来mobile4条件の実購入・演出検査、および全体回帰は今回のnative環境で安定成功した。製品速度を改善した修正ではない。元の高DPIモバイル1440条件でRAFが長く停滞するブラウザ内部の根因は未特定で、同条件の性能修復を主張しない。効果を立証できなかった製品変更は採用せず、無関係な作り直しを避けた。

PR29はレビュー用、マージ保留。最終提出コミットは記録・画像だけで、上記10f58762から製品・テスト・workflowの内容を変えない。物理スマートフォンの実機確認ではなく、固定native GitHub Actions上のブラウザ検証である。
