# デザイン品質レビュー記録

## 2026-10-09 — 最新mainのタイトル・保存再開を再レビュー

### 確認した問題

最新mainを1440×900のChromiumで開くと、bodyの1120px上限によりタイトルと夜景が中央に閉じ、左右にテーマ色の余白が残っていた。保存世代を2件作って320/390px、844×390px、1440pxで再表示すると、390pxでは「続きから再開」が幅44px・高さ142pxに折り返され、削除ボタンは40px幅だった。844×390pxでも操作ボタンがviewport下端から約18pxはみ出していた。

- [修正前・1440pxタイトル画面](../artifacts/design-review/round-5/before-title-desktop.png)

### 実装した修正

- タイトル表示中だけbodyの最大幅・paddingを解除し、タイトルを100vwでレイアウト。
- タイトル背景をhtmlのviewport背景に置き、PWA案内でタイトル要素の高さが縮んでも背景が画面全体に残るようにした。
- 夜景canvasを100vw固定にし、描画バッファをviewport幅に合わせて最大1920pxに制限。回転時の再描画は既存resize経路を使う。
- 保存世代の文言を「再開する保存データ」に変更。480px以下では選択欄を独立行にし、再開/削除を横並びに固定。削除ボタンは44×44px以上。
- 高さ480px以下の横画面ではロゴ周辺の装飾を圧縮し、保存操作が画面内に入るようにした。
- `tests/browser/title-layout.spec.js` を追加し、4画面サイズで全幅・canvas幅・保存操作の当たり判定を確認してから、削除確認の取消と保存ゲーム再開を操作する。

### ブラウザでの再確認

TermuxのChromiumをCDPで操作し、2世代保存を復元して画面を確認した。320×844、390×844、844×390、1440×900の各条件で、body/タイトル/canvasはviewport幅と一致し、横はみ出しは0px。再開と削除は各幅で横書き・44px以上となり、中央タップ位置が画面内の実ボタンに当たった。844×390では両ボタンがviewport下端より98px以上上に入った。1440pxでは1120pxの操作コンテンツを中央に保ちつつ、背景・夜景は左右いっぱいに広がる。

保存UIの削除をChromiumのポインター入力で押し、確認ダイアログを開いた。キャンセル後に「続きから再開」を押すとタイトルが閉じ、保存した対局がroll phaseで開くことを確認した。PWA案内を表示したときも、背景のhtml gradientと固定canvasはviewport全体に残る。classic/cardboardは夜景、sunset/plazaは各テーマの背景色を保って全幅になることを確認した。これはブラウザエミュレーションであり、物理端末のsafe area確認ではない。

- [1440px・保存再開](../artifacts/design-review/round-5/title-saved-desktop-1440.png)
- [844×390・保存再開](../artifacts/design-review/round-5/title-saved-landscape-844x390.png)
- [390px・保存再開](../artifacts/design-review/round-5/title-saved-phone-390.png)
- [320px・保存再開](../artifacts/design-review/round-5/title-saved-phone-320.png)
- [390px・PWA案内表示中](../artifacts/design-review/round-5/title-saved-pwa-phone-390.png)

### 検証と残課題

- `node tests/city-skyline.test.js`: 成功。720px幅と3840px要求時の1920px上限、小幅描画を確認。
- `node tests/local-resume-effects.test.js`, `node tests/local-resume-view.test.js`, `node tests/storage.test.js`: 成功。
- `node tests/integration.test.js`: 成功。保存再開およびopener削除後のフォーカス復元を含む。
- `MACHIKORO_TEST_CONCURRENCY=1 npm test`: 実行完了。既存の `tests/main.test.js` がタイトル背景を `#titleScreen` に置く旧CSS前提で1件失敗した。新しいviewport背景と透明なタイトルの責務を検証するよう期待値を修正し、`node tests/main.test.js` を再実行して成功。
- `git diff --check`, `node --check tests/main.test.js`: 成功。
- Playwrightのbrowser specはこのTermux環境のAndroid platformで起動できない。今回追加したspecはCIでの実行が必要で、CDP手動確認をCI成功として扱わない。

今回の再レビュー対象はタイトルと保存再開で、にぎわい広場の中盤/終盤を含む4テーマ全体、オンライン再接続、5〜10人の実進行、物理スマートフォンは未達。品質目標は継続する。

## 2026-10-09 — にぎわい広場の横持ちHUDを再レビュー（継続中）

### 確認した問題

844×390pxの4人戦では、プレイヤーHUDが右側216pxに縦積みされ、街の表示幅が628pxに制限されていた。プレイヤー名・残高・施設数は11px程度で、画面下部の補助操作ラベルも縦に折り返されていた。

- [修正前・844×390pxの4人戦](../artifacts/design-review/round-6-plaza-landscape-before.png)

### 実装した変更

- 横持ちの2〜4人戦では、プレイヤーHUDを画面上部に横一列で配置。4人分の残高・施設色別枚数・ランドマーク進捗を約200px幅の席カードにまとめる。
- 後段の `display: contents` ルールが横HUDの相手列を0幅にしていたため、既定グリッドのルールを横画面ルールより前へ移動し、横画面では通常のflex列として同じ詳細度で上書きする。5〜10人戦では自分の席を残し、相手席の列だけを横スクロールできるようにする。
- 盤面ビューを横幅いっぱいに戻し、HUDの実測高さを盤面開始位置へ反映する。
- 横画面では空のイベント帯を隠し、出目や重要イベントが発生したときだけ表示する。
- 下部のダイス操作は全幅で使い、補助設定は右側の44pxターゲット内に短い見出しで置く。
- 街を選んだときの最大表示倍率を1.1に上げ、横幅を狭めたときは表示中の街が画面内へ収まるまでカメラを縮小して中心を保つ。
- PC幅では席カードのプレイヤー名を15px、残高を14pxへ拡大する。
- PWA更新通知も横持ちで画面幅を使えるようにする。

### 検証状況

- CDPでChromiumを実操作し、844×390pxの4人戦で4席が各203×56px、街の施設アートが53px、盤面ビューが844×188pxで表示されることを確認。横はみ出しは0px。
- 席3を実クリックして街の詳細を開き、閉じられることを確認。ダイスを実クリックすると空のイベント帯が出目レシートへ切り替わり、`出目 6`を表示した。
- 10人戦では相手HUDが629px幅・1859pxスクロール幅となり、横スクロール後に席10を選択して詳細を開いた。文書横はみ出しは0px。
- 同じ4人戦の状態で844×390から390×844へ回転すると街はx=8〜382px、幅374pxに収まる。320×844ではx=8〜312px、幅304pxに収まる。いずれも文書横はみ出し0px。縦画面はカメラを回転追従させたブラウザ表示で、実機センサーによる回転ではない。
- 1440×936pxではHUDのカード名15px・残高14px、席カード幅355px、盤面横幅1440pxで表示され、横はみ出しは0px。
- [修正前・844×390pxの4人戦](../artifacts/design-review/round-6-plaza-landscape-before.png)、[横持ち4人戦・修正後](../artifacts/design-review/round-6-plaza-landscape-final.png)、[出目レシート](../artifacts/design-review/round-6-plaza-landscape-roll.png)、[縦320px](../artifacts/design-review/round-6-plaza-portrait-320.png)、[縦390px](../artifacts/design-review/round-6-plaza-portrait-390.png)、[PC 1440px](../artifacts/design-review/round-6-plaza-desktop-1440.png)。すべてChromiumのviewport emulationで撮影しており、物理端末の実機確認ではない。
- `node tests/plaza-town-layout.test.js`, `node tests/ui-plaza-events.test.js`, `node tests/ui-plaza-feedback.test.js`: 成功。
- `node --check js/plazaField.js`, `node --check tests/browser/plaza-landscape-hud.spec.js`: 成功。
- `tests/browser/plaza-landscape-hud.spec.js` は横4人、2サイズへの回転、PC 1440px、10人の相手席スクロール・選択、空イベント帯と出目表示を確認する。TermuxのPlaywrightはAndroid platformをサポートせず起動できないため、このspecはCIでの実行が必要。ここでのブラウザ実操作はCDP経由で、Playwright成功と混同しない。

独立目視レビューでは、横HUD・街アート倍率・出目表示・各画面幅での収まりは改善した。一方、街の背景はまだ広い空き地が目立ち、施設数が増えた中盤/終盤の視覚密度、2人戦、全体盤面・市場への視線誘導、他テーマとの品質差、物理端末は未評価。この横画面サイクルは序盤4人戦について完了したが、タイトル修正と合わせたGoal全体は未完了。

## 2026-10-09 — 2人CPU対局の完走確認（未完了）

844×390pxのChromiumでにぎわい広場を選び、弱CPU同士の2人戦を実際のUIから開始した。CPU速度を最速の100msに設定し、同じ対局を継続観察した。

- 46ターンまで進み、両者の施設購入、収益、ランドマーク建設、港の選択を確認。観察時点で所持ランドマークは3個と2個で、勝敗には至っていない。
- 中盤にChromium rendererのRSSが約440MiBから約750MiBへ増え、後半にrendererがCPUを約113%使用し、CDPから画面状態を取得できなくなった。利用可能メモリは約4.3GiBだったが、ブラウザ操作不能のため同じブラウザを正常終了した。
- Chromium終了後は利用可能メモリが約4.9GiBに戻った。Termux/Chromium由来のログにはGoogle登録エンドポイント廃止やグラフィックスバックエンド関連のエラーもあった。これらとページ内CPU増加との因果関係は特定できていない。
- この試行は開始から勝利までの完走検証にはならない。終盤の描画・CPU負荷または自動手番処理を切り分ける必要があり、2人CPU対局完走は未検証として扱う。物理スマートフォンでの試験でもない。
- 別途、軽量なCPUシミュレーション `timeout 45 node scripts/selfplay.js --games 1 --max-steps 1200 --fast --lite weak weak --details` は3.3秒で完走し、68ターンで1Pが全6ランドマークを建設して勝利した。これはルール/CPUのシミュレーション確認であり、実ブラウザ対局の完走を代替しない。

## 2026-10-09 — 広場CPU対局の描画負荷を計測・修正、実ブラウザで完走

### 原因と修正

実ブラウザのCPUプロファイルでは、プレイヤー操作可能性を確認する診断が毎回画面全体のDOMを走査し、各ボタンのcomputed styleと祖先状態を調べていた。CPUの自動手番中も、手番アクション後のrender・毎秒のfreeze watchdog・各CPU checkpointで同様の全走査が行われていた。

- CPUが操作中のrender直後は、人間向けの操作性診断を行わない。次の人間手番では通常どおり診断する。
- watchdogは進行を軽量なゲーム/オンライン状態で監視し、状態が5秒以上停滞した場合だけ詳細DOM snapshotを取り、既存の復旧判定へ渡す。
- CPU通常進行・遅延・通信再試行のcheckpointは軽量snapshotを保存する。CPU処理エラー、no-progress、freeze、UI復旧では詳細DOMを残す。

### 実ブラウザ確認とプロファイル

保存した同じ弱CPU同士の対局を再開し、表示をclassicへ切り替えたときの進行を確認した後、plazaへ途中切替した。CPU対局は最終的に勝利画面まで完走した。操作上のテーマ切替でゲーム状態は維持され、plazaで勝利した。

- 修正前の約2.5秒CPU profile（約85ターン）では、`snapshotById`が約535ms、`isInteractiveElementUsable`が約585msのsampled self timeを占めた。
- 修正後の約2.5秒profile（同じ保存対局の終盤）では、それぞれ約75ms、約56ms。後者は施設がさらに増えた状態で取得した。CPU sampled timeの比較であり、物理端末の時間保証ではない。
- 修正前のcheckpointには弱CPUのrollが約9.5秒、harborChoiceが約8.3秒の処理時間として記録されていた。修正版を再開した直後の記録ではbuild約1.4秒、selectDice約1.0秒だった。step時間は選択・ゲーム適用・renderを含むためCPU思考時間だけではない。
- 終盤では両者の街に48枚と46枚の施設があり、勝者が6ランドマーク、相手が5ランドマークを建設。`GameManager`のturnCountは108、勝利結果UIには109ターンと表示された。
- [広場の終盤画面](../artifacts/design-review/round-7-plaza-endgame-before-watchdog-opt.png)、[ラウンド8変更前の勝利画面](../artifacts/design-review/round-7-plaza-cpu-victory-after-watchdog-opt.png)。844×390px Chromium emulationで撮影し、目視確認した。横持ちの勝利画面は後続のRound 8で再配置した。
- テスト中はChromiumを終了してから直列で `MACHIKORO_TEST_CONCURRENCY=1 npm test` を実行し、終了コード0。`tests/main.test.js`、`tests/app-shell-observation-runtime.test.js`、`tests/ui-watchdog-runtime.test.js`、`tests/ui-watchdog-recovery-runtime.test.js`、編集したJSの構文確認も通過。

## Round 8: 横持ちの勝利画面を再配置

844×390pxの実対局勝利スクリーンショットを再確認し、トロフィーと街が縦に並ぶため、結果操作が初期表示域から押し出される問題を優先した。

- 夕暮れの街・にぎわい広場の短い横画面に限り、勝者情報と街を左右2列に配置。最終統計、再戦、共有、タイトルへ戻るボタンを左列へ並べ、育てた街を右列で見せる。
- 終盤密度を模した勝利画面fixtureを844×390px Chromium headlessで表示・撮影し、見た目と要素位置を確認した。勝者名、統計、再戦、共有、タイトルへ戻るボタンはいずれも390px viewport内（タイトルへ戻るボタン下端386px）。街は上部の右列に収まり、詳細記録は下へスクロールして読める。
- このroundの撮影はCSSレイアウトを確認するfixtureであり、実対局DOMや物理スマートフォンの撮影ではない。実対局の勝利画面は修正前スクリーンショットでのみ確認済み。横持ちの新レイアウトを実対局データで再撮影する確認は未完了。
- ブラウザ回帰 `tests/browser/winner-notices.spec.js` に、plaza 844×390pxで実アプリの勝利描画を作り、街・統計・再戦・共有・タイトルへ戻る要素のviewport内配置を検証するケースを追加。TermuxのPlaywrightがAndroid platformで起動できない制約のため、このケースの実行はCIで未確認。

## Round 10: 横持ち勝利チェックをPR必須ブラウザ検証へ追加

- `test:browser-pr` に `winner-notices.spec.js --project=mobile-webkit --workers=1` を追加。勝利画面の横持ち配置を、混合テーマオンライン・対局完走シナリオと合わせてPR時のモバイルWebKit検証に含める。
- `release-test.yml` の説明を更新し、この画面チェックがPRブラウザセットに含まれることを明記した。
- package scriptの内容確認、`node --check tests/browser/winner-notices.spec.js`、`node scripts/check-static-files.js`（809 JavaScript、25 JSON）、`git diff --check` は成功。
- GitHub上には現ブランチのPRもworkflow実行もまだ無いため、WebKitでの実行結果は未取得。Termux上ではPlaywrightのAndroid platform起動制約があるためローカル実行していない。

## Round 11: 収益レシートへ送金経路を表示

任天堂の公式紹介では、出目ごとの収益表示や施設コンボの把握がデジタル版の体験要素として説明されている。[公式記事](https://www.nintendo.com/jp/topics/article/1408afb9-9061-4c0c-8a6a-816b5caeccde) 既存のplaza短縮レシートは施設と金額を出す一方、プレイヤー間送金の相手は詳細を開くまで省略されていた。

- 画面下部の短縮収益行に、施設名、席番号付きの送金元/先、金額、複数発動数をまとめて表示。席番号は上部HUDの同じ席番号と対応し、長い名前でも短いイベント帯を圧迫しにくい。詳細欄では「銀行」や参加者名を含む完全な送金経路を維持し、片側が銀行のケースも明示する。
- `tests/ui-plaza-events.test.js` で銀行からの収入とプレイヤー間送金経路を検証し、`tests/browser/plaza-event-receipts.spec.js` で短縮行の収益表示期待値を更新した。
- 同じ描画経路が毎回全ログを分類しないよう、同じログ配列の末尾追加位置と最新手番開始位置を `WeakMap` に保持し、追加されたログだけを調べて現手番を投影する。復元やリセット後の新配列は全体を一度走査し、その後の追記は追加分だけ走査する。250ターン相当の過去ログから始め、複数回の追記でも分類対象を最新手番に限定しつつ出目と収入の集計が変わらないことをテストした。カード盤面と送金演出が使う共通投影のテストも再実行した。
- 同receiptの4画面幅チェックを `test:browser-pr` のモバイルWebKit必須セットへ追加する。Round 10の勝利画面チェックと合わせ、実画面上の出目・複数発動・建設・目標達成をPR時に確認する。
- `node --check`（編集JSとbrowser spec）、`node tests/ui-plaza-events.test.js`、`node tests/ui-card-board.test.js`、`node tests/card-board-transfers.test.js`、`git diff --check` は成功。短縮行の変更後スクリーンショットはローカルPlaywrightが起動できないため未取得。次のPR CIで画面表示・折り返しとWebKit挙動を確認する。

## Round 9: 保存済み対局の中盤を再確認

- 前回のChromium CPU対局プロフィールにあった弱CPU同士の保存データを再開。新規ゲームは作らず、844×390pxで実画面を撮影した: [保存対局の中盤画面](../artifacts/design-review/round-9-plaza-resumed-midgame-844x390.png)。この時点はランドマークを対象にした保留選択中で、結果を返す対象を選ぶ状況だった。
- 実対局再開から数秒でChromiumの大きな子プロセスが約685MiB RSSとなり、CDPの状態取得も遅くなった。利用可能メモリは約3.1GiBだった。以前の長時間対局で操作不能になった兆候を避けるため、勝利まで自動進行を続けずChromiumを終了した。終了後は利用可能メモリ約3.8GiBへ戻った。
- 再開時の画面撮影は実対局の中盤確認であり、CPU対局の完走やRound 8勝利画面の実DOM再確認の証拠にはしない。中盤/終盤を通した低メモリ観察方法と、ランドマーク保留中のイベント説明・対象選択の読みやすさを次のレビュー対象に残す。

この改善でCPU対局の遅延とDOM診断負荷は大きく下がり、実ブラウザ勝利まで確認できた。一方、残高/施設数が極端に大きくなった対局のカード・盤面表現、勝利画面の横持ち新レイアウトを実対局DOMでの再撮影、他テーマ・オンライン対局・実機は引き続き確認が必要。

## Round 12: 最新CIで2人CPU対局の勝利画面を再レビュー

最新コミット `4e2f651c855ed7098c4d6a3464ff8756aa2dd6fd` に対して、GitHub Actions run [37885373506](https://github.com/nao70161994/machikoro/actions/runs/37885373506) の全3ジョブが成功した。リリース回帰、CPU難易度paired smoke、モバイルWebKitの各ジョブを確認した。

- モバイルWebKitで4テーマ混在オンラインの途中テーマ切替と再接続が1件成功。勝利通知のsunset 390px、classic 390px/1440px、plaza 844pxが4件成功。収益レシートの320/390/844/1440pxが4件成功。
- Chromium desktopで固定seedのplaza 2人弱CPU対局を実UIから開始し、勝者まで完走するテストが成功（88ターン）。CIのPlaywrightレポート画像を目視した。実ゲームの勝利画面で施設30枚・ランドマーク6個を含む街と再戦・共有・タイトルへの操作が表示され、横持ち配置と都市アートの両立は確認できた。
- 1440pxの勝利画像では紙吹雪が街の建物アートに重なり、街の細部と勝利結果の視線を一部遮る。祝福の雰囲気は出ているが、密度の高い終盤の街を主役として見せるには、紙吹雪の量/描画領域/時間を見直す余地がある。次の演出レビューで優先候補にする。
- この画像はGitHub Actions上のChromium desktop実行結果で、ローカル端末や物理スマートフォンで撮影したものではない。勝利画面の今回の目視は1440px条件のみであり、844×390pxの実対局勝利画面を実画像で見た証拠にはしない。
- 端末でローカルChromiumや大規模テストは実行していない。レビュー画像はCI artifactから取得し、作業ツリーはソース変更前にclean、空きメモリは3.7GiB以上を確認した。

このrunで直近のreceiptログ増分走査変更も含むrelease-testが成功し、Plaza receiptの4画面幅と混合テーマオンライン経路をブラウザで再確認した。Goal全体ではタイトル/保存再開、plaza序盤/中盤/終盤、勝利の実対局各画面を4テーマ・各画面幅で統合評価する作業、再接続以外のオンライン操作、物理端末での確認が残る。

## Round 13: 勝利時の紙吹雪を控えめにして街を見せる

Round 12の実対局勝利画像では、全画面に80個の紙吹雪が継続して再出現し、密度の高い街アートや結果へ重なっていた。祝福演出は残しつつ街の視認を優先するため、紙吹雪を48個に減らし、小型化・不透明度上限70%・上端からの一方向の落下へ変更した。画面下へ抜けた粒は戻さず、3.6秒で演出を終了する。

- `tests/confetti.test.js` に個数、寸法、不透明度、再出現しないこと、時間、既存のReduced Motion設定を検証する回帰を追加。全5件成功。
- `tests/browser/winner-notices.spec.js` はplaza 844×390pxの勝利画面で粒数と登場方向を確認し、目視用スクリーンショットをCIレポートへ添付する。Termux上ではブラウザを起動せず、最新CIでWebKitの描画と添付画像をレビューする。
- `node --check`（confetti.js、confetti unit/browser tests）、`node tests/confetti.test.js`、`git diff --check` は成功。変更後のブラウザ表示レビューは未完了。

Round 13の初回CIでは、WebKitの勝利画面テスト1件が落下開始済みの粒の現在位置を「上端から来た」条件と比較して失敗した。描画演出の失敗ではなく、アニメーション進行中の座標を起動位置と誤認したテスト条件だったため、粒に不変の生成位置 `launchY` を持たせて検証するよう修正した。`node tests/confetti.test.js` は再度成功。修正コミットでWebKitを再実行し、添付画像を目視するまでRound 13は未完了とする。

Round 13の2回目CIでは粒の生成位置チェックが成功し、スクリーンショット保存行まで到達したが、ブラウザテストがPlaywright fixture `testInfo` を引数で受け取っておらず失敗した。browser specのテスト引数を修正した。アプリ描画や紙吹雪の実行時エラーではない。再push後に同じCIで完走と画像レビューを確認する。

紙吹雪の修正はCI run [37886760668](https://github.com/nao70161994/machikoro/actions/runs/37886760668) で全ジョブ成功。2人CPU対局勝利までを再度確認し、1440pxの実対局画像では紙吹雪が以前より小さく薄くなり、終盤の街と結果が前より読み取りやすいことを目視した。Plaza 844×390pxの専用画像を `testInfo.attach` したが、browser scriptがPlaywrightを4プロセスに分けて起動し、後続のreport生成で上書きされるため、保存したのは最後の対局画像だけだった。今回のCIでその制約を発見したため、対象画像をrunner tempへ直接保存し、別途uploadするようworkflowを更新。横持ち実対局サイズの画像レビューを次のCIで行う。

4回目のCI run [37887441618](https://github.com/nao70161994/machikoro/actions/runs/37887441618) も全ジョブ成功し、独立成果物に844×390pxの勝利画面画像を保存できた。画像を目視すると48粒・最大不透明度70%では街に重なる紙吹雪がまだ多く、視線を遮っていた。改善量不足と判断し、32粒・最大不透明度40%へ再調整した。現在の値で再度画面画像をレビューする。

### 最終確認

- `32`粒・不透明度25〜40%の変更を含む最新コミット `c9b7f05480f3d765705f3804893aa325f8253d5b` のCI run [37888244650](https://github.com/nao70161994/machikoro/actions/runs/37888244650) はrelease-test、mobile-webkit、cpu-difficulty-smokeの全3ジョブ成功。混在4テーマオンライン/再接続1件、勝利画面4条件、receipt4画面幅、plaza 2人CPU browser match 1件が成功した。
- CI artifactにはplaza 844×390pxの勝利画面と、CPU対局完走後の実対局画像が別々に保存された。844×390pxの画像で32粒の演出を目視し、色と祝福感を残しながら48粒より街の施設と結果が読みやすくなったことを確認。これは勝利DOMをテスト内で作ったブラウザ画像で、物理スマートフォンではない。
- 実対局の完走画像はChromium desktopで、plaza 2人戦が83ターンで勝利し、施設39枚・ランドマーク6個まで育った状態を記録。実ブラウザ開始から勝利までの通し確認としては有効だが、画面幅844×390pxでの実対局完走を示すものではない。
- 端末のローカルでは `node tests/confetti.test.js`、編集ファイルの `node --check`、`node scripts/check-static-files.js`（809 JavaScript、25 JSON）、`git diff --check` を実行。全て成功。重いブラウザ検証はGitHub Actions上で行い、実機負荷を避けた。
- Round 13の紙吹雪改善はこのサイクルで完了。ただしGoal全体は継続する。残る大きな項目は、4テーマの各画面・幅でタイトルから終局まで実レビュー、施設密度の変化とカード詳細、市場/建設/保留選択の操作性、2〜4人戦の実対局幅違い、5〜10人戦、全オンライン操作/復旧、物理端末確認である。

## Round 14: タイトルと保存再開をCIの実ブラウザ確認へ追加

タイトル全幅背景・Canvas寸法・保存データ選択/削除・横書きの再開操作はローカル画面レビューで修正済みだったが、PR用Playwright経路では継続確認されていなかった。`test:browser-pr` に `title-layout.spec.js` のmobile WebKit実行を追加し、320px/390px縦、844×390横、1440×936 PCでレイアウト計測、削除確認のcancel、保存ゲーム再開まで操作する。各幅の画像をrunner tempへ保存し、Playwrightの後段実行がレポートを上書きしてもレビュー成果物へ残す。workflow説明も更新した。

- `node --check tests/browser/title-layout.spec.js`、package script確認、`node scripts/check-static-files.js`（809 JavaScript、25 JSON）、`git diff --check` は成功。
- CIの横持ち画面でタイトル/保存再開を4幅まとめて実行した結果と画像レビューは未確認。端末のBrowserテストは起動せず、次回CIに回す。

Round 14を含む最初のCIは他の2ジョブ成功、WebKitのタイトル4画面中3画面成功。844×390pxのみ、WebKitのbounding box `843.984375px` を整数844pxとの完全一致で比べたため落ちた。1px未満のCSSサブピクセル丸めであり、body幅・左端・横はみ出し条件は満たしているため、title/canvas幅のみ1px以内を許容するアサーションへ直し、画面外余白や横スクロールを許す緩和はしていない。再実行後に横画面の再開・削除操作と画像成果物を確認する。

Round 14の再実行では844px横持ちのtitle幅が許容内になった後、canvasのCSS表示幅も同じ `843.984375px` になり、CSS文字列の完全一致条件だけが失敗した。CSS表示幅も数値に変換して1px以内を許容する。Canvas描画バッファの幅は整数viewport幅のまま別アサートを残しており、表示そのものの縮小や横はみ出し許容ではない。

Round 14のスクリーンショット目視で、数値条件では拾えない2点（保存データselectの白背景に白い文字、44px削除ボタン内で「削除」が縦折り）が判明した。`style.css` でselectを濃紺背景/クリーム文字/暗色native controlに固定し、optionも同じ配色にする。削除ボタンは64px幅・nowrapに変更して横書きを保証する。ブラウザspecにcomputed color scheme / foreground / backgroundと削除ラベルnowrap/最小幅をassertする。次回CIで4画面幅、選択・削除確認・保存再開操作、4枚の目視画像を確認する。

Round 14の画面検証を最新コードで再実行したCI run [37890980288](https://github.com/nao70161994/machikoro/actions/runs/37890980288) は全3ジョブ成功。mobile WebKitではタイトル/保存再開の320、390、844×390、1440pxが4/4成功し、4画像を独立artifactへ保存した。削除確認をcancelしてから保存ゲームを再開する操作も各幅で通過。混在テーマオンライン/再接続、勝利4条件、receipt4幅、2人plaza CPUの開始から勝利も成功した。

- 320pxと844×390pxのタイトル画像を目視し、保存選択の文字が暗背景上で読め、「削除」が一行で表示されることを確認。背景は左右端まで続き、保存選択・再開・削除の横方向の配置も保っている。
- `style.css` のselect配色とdelete幅修正がユーザー視認上の不備を直した。CPU・オンラインのゲーム状態には変更なし。
- Round 14のタイトル/保存再開サイクルを完了。4テーマ共通の各モード画面や、にぎわい広場の2〜4人・5〜10人の開始/中盤/終盤/イベントにわたる実プレイ評価、物理端末は引き続き未完了。

## Round 15: plaza 4人戦の横持ちCPU完走シナリオを追加

2人のbrowser完走specを拡張し、テーマ・人数・viewportを環境指定できるようにした。既存シナリオの1440×900px 2人「カード卓」CPU matchを維持し、新たに844×390px・plaza・4人弱CPUのシナリオを `test:browser-pr` に加える。plazaではdice/収入/ランドマーク建設の構造化ログとreceiptの対局中表示を確認し、勝利時の街と結果操作を操作/撮影する。実際に送金が発生した場合は記録するが、毎回送金施設を建てるCPU対局とは限らないため、送金数を完走の必須条件にしない。viewport専用の完走画像と状態JSONをCI artifactへ出力する。

この追加に伴いRound 12〜14の一部記録を訂正する。従来の `seeded-browser-match.spec.js` は開始時にテーマを `cardboard` に固定していたため、「plaza 2人戦」と記述した実ブラウザ完走は、実際にはカード卓2人戦だった。スクリーンショットの表示/JSONが示すとおり、plazaの完走実証として扱わない。旧記録を訂正し、今回のplaza 4人横画面対局を開始から勝利まで検証して初めて、その範囲の証拠とする。

- `node --check tests/browser/seeded-browser-match.spec.js`、package scriptのparse、`git diff --check` を実行。実ブラウザ完走は最新CI待ち。

Round 15のCIでは2人CPU desktop完走と既存のタイトル/テーマ/receipt検証は通過した。新規4人plaza横画面も開始から勝利まで進み、出目/収益/送金/ランドマーク条件を満たしたが、終了時点の最新receiptはbuildログに切り替わっており、終了後にdice receiptが表示されるという誤ったassertだけが失敗した。Plaza画面が対局中にdice receiptを表示した時点をMutationObserverで計測し、実対局中の表示履歴として検証するよう直す。

Round 15の再試行では4人plaza横画面matchが勝利まで達し、receiptの対局中表示も確認されたが、送金数assertがflakyになった。カード卓専用DOM observerがplazaでも稼働し、plaza側の構造化ログ集計と重複・不一致のイベント数を混在させていた。observerをcardboard限定へ移し、plazaの送金は実際に起きた場合の観測値として記録し、ランダムなCPU編成で毎回の発生を完走条件にしない。収入とランドマーク、出目、receipt表示は実対局の継続条件として維持する。修正後は再び横画面matchとartifact画像を確認する。

Round 15の修正版CI run [37894107030](https://github.com/nao70161994/machikoro/actions/runs/37894107030) は全3ジョブ成功、WebKitの全シナリオもflakyなしで成功した。plaza 4人CPU対局は844×390pxのviewportで140 game turns、勝者「CPU（弱）・1」まで完走。構造化ログで出目19、収入/支払い148、送金6、ランドマーク建設4、画面に表示されたreceipt更新448回を記録し、施設32枚・ランドマーク6個の終盤街を勝利画面まで表示した。対局完走画像は[こちら](../artifacts/design-review/round-15-plaza-4p-landscape-winner.png)。これはGitHub Actions上のChromium viewport emulationで、物理端末ではない。

独立レビューでは、4席情報・勝者・再戦・共有とタイトル導線は844×390px内で読め、育った街もアートパネルで見える。施設32枚の終盤では各施設名は表示せずアート主体の小さな配置になるため、詳細を確認するには街の選択/拡大機能が必要。画面全体のバランスは前進したが、施設単体の存在感・イベント演出・異なる進行密度での見やすさを引き続き磨く。

Round 15はplaza 4人横画面の開始〜勝利サイクルを完了。Goal全体は継続し、2人plazaの複数サイズ、5〜10人、2〜4人中盤/イベント表示の実プレイ、4テーマのタイトル〜終局比較、オンラインの全操作/復旧、物理スマートフォン確認は未達。

## Round 16: 横画面の勝利画面で育った街を見やすくする

Round 15の実対局画像を独立レビューし、plaza 4人・844×390pxの勝利画面で、街アートの横幅に対して表示高が132pxで頭打ちになり、施設が小さく見える点を確認した。短い横画面のsunset/plaza勝利表示で街の最大高を180pxへ増やし、WebKit勝利画面検証にアート領域の最低高160pxを追加した。勝利画面全体のはみ出し検査と他3条件は維持する。

- 変更後のCI run [37895193709](https://github.com/nao70161994/machikoro/actions/runs/37895193709) はrelease-test、CPU difficulty smoke、mobile WebKitの全3 job成功。844×390pxでplaza勝利画面を含むWebKit検証が成功した。artifactの4人CPU対局結果は130ターン、収益/支払い135件、送金12件、ランドマーク演出7件。勝利画像では横長パネル内で育った街の施設アートが明瞭になり、操作導線も画面内に残る。Chromium viewport emulationによる画像で、物理端末確認ではない。
- 施設が少ない勝利時、別の横画面比率、sunset全条件、物理端末の確認は未実施。

## Round 17: Plaza visual fixtureでテーマ変更後のHUDを再描画する

Round 16の検証runでplazaの4 viewportだけ16画面回帰に失敗した。CI artifactのDOM snapshotでは `#plazaPlayerHud` が空で、テストが対局開始後にテーマを直接切り替えた後、テーマ固有UIを再描画していないことを確認した。これは実プレイ（テーマ変更時に通常renderが走る）と異なるfixture状態だった。テーマ切替後に `render()` を呼ぶようfixtureを修正し、plazaの4席HUDが揃うことをassertする。初回artifactで撮影されたHUD空の画像は実プレイ評価に使わない。

- 変更後の候補画像生成と目視確認は未実施。GitHub Actionsでベースライン候補を作り、plaza 4幅と他テーマの差分を目視してから扱う。
- 初回plaza visual runではplaza以外12条件成功、plaza 4幅が差分率5〜14%で失敗した。failure artifactはfixture不備の診断根拠として保存済みだが、基準画像を機械的に更新しない。

## Round 18: フォーカス街カードの席番号重複を解消する

Round 17のcandidate 16画像を目視した。再描画後は全4席HUDが表示され、plazaのviewport別配置も一貫した。選択中の街ではヘッダー内の席番号と、街の左上に固定された席フラグが重なって二重に見える。全体俯瞰時は各街を見分けるフラグが有効なので、`plaza-field-overview` 状態をフィールドへ付与し、俯瞰時だけフラグを表示する。通常の街/市場フォーカスではヘッダーの席番号に一本化する。overview browser testはselfフォーカスで非表示、全体表示で既存の席色・位置・大きさ検査を行う。

- Round 17 candidate generation CI run [37895928809](https://github.com/nao70161994/machikoro/actions/runs/37895928809) は成功し、16画像をartifactで取得。plazaの320/390 portrait、844×390 landscape、1440 desktopを確認。これはWebKit browser emulation。
- Round 18の表示変更後画像・操作確認は未実施。基準画像候補を再生成してから、俯瞰/フォーカス双方と4幅を再レビューする。

独立レビューの追加所見: focus-self画像では市場が隣接した世界座標に一部入り、320/390 portraitやdesktopで市場カードの端だけがフィールド端・アクションバーに切れて見える。街・市場・全体のタブがあるため、この断片的な市場表示は視覚ノイズとなり、カード操作対象も曖昧。次ラウンドでself focus中は市場を隠し、market/all focusでのみ表示する。世界配置寸法は保持するのでカメラ境界・市場サイズ計算を崩さず、専用の「市場」操作から常にアクセスできる状態を検証する。

## Round 19: フォーカス外の市場カード断片を隠す

Plaza self viewから市場が部分的に見切れていたため、`plaza-field-market` のフォーカス状態を追加し、市場パネルをmarketかall表示時だけ可視化する。施設の購入や詳細操作へは専用の「市場」カメラボタンで移動でき、all表示では街と市場を同時に確認できる。plaza overview browser testに各フォーカス時のvisibilityを追加する。ルール・市場在庫・ゲーム状態は変更しない。

- 変更後の候補画像/市場操作レビューは未実施。CSSはfixtureで確認した320/390/844×390/1440の条件で再生成し、self表示の余白とmarket/all表示のアクセスを確認する。

Round 19の市場画像レビューに向け、320/390幅ではカメラを縮小する代わりに市場パネル幅をviewportへ合わせて等倍で開き、カードグリッドを2列にする。844×390とPCは570pxパネルのまま。market focus時のパネル境界・幅・見出し・列数の検査と、320/390/1363/844の4 viewport screenshot artifactをoverview browser testへ追加した。これらの最新画面はCI未確認。

## Round 20: Plaza overview検証をPR CIへ接続する

`plaza-overview.spec.js`がPlaywright上にある一方、既存workflowのbrowserコマンドとpath filterのどちらにも含まれていないことを確認。Plaza visual review workflowに独立ステップとして追加し、320/390/844×390/1363幅のレイアウト、全体/市場/街フォーカス、4/10人の街配置、施設比較、キーボード復帰などをPR時に実行する。スクリーンショットattachmentは既存のtest-results artifactへ含める。candidate baseline生成runではこの通常レビューstepを実行しない。

- workflow変更後のCI実行・市場フォーカス画像確認は未実施。

Plaza overviewの初回CI [37898664545](https://github.com/nao70161994/machikoro/actions/runs/37898664545)でfixtureと重なりを区別した。市場見出しの完全一致失敗は装飾絵文字によるテスト期待値の誤り。844×390pxでは画面上部の手番帯・ナビ・HUDが領域を取り、フィールド高が220pxを下回っていたため製品側を変更する。短い横画面だけ手番帯を外し、現在手番のHUD強調へ集約し、HUDボタンを48pxにする。結果、最低220pxのフィールド条件を満たす余裕を確保する。

## Round 21: 横画面のフィールド表示領域を広げる

Plaza横画面の手番表示がHUDのアクティブ席情報と重複していたため、status帯を非表示にし、seat HUDの金色アクティブ枠へ手番を集約。HUDボタン高を56pxから48pxへ調整して画面高を盤面へ戻す。`plaza-overview`のフィールド高220px検査を維持し、操作ボタンの44px最低条件も維持する。施設見出しは共通の装飾アイコンを含むため部分一致で確認する。

- 844×390px変更後の画像と全viewportのCI結果は未確認。Release/Plaza workflowを最新SHAで再実行する。
- theme snapshot比較が失敗してもPlaza online/art reviewを走らせるよう同じworkflowの実行条件を独立化する。比較、盤面操作、オンライン/アート検証が同じrunからそれぞれ結果を返す。
- Release WebKitのplaza勝利通知はstatus帯をゲーム終了後にも隠す退行を検出。手番帯を消すCSSを対局中にだけ限定し、勝利画面の表示検査を維持する。

## Round 22: 多人数HUDと短い横画面の盤面を再レビュー

GitHub Actions上のPlaza screenshotを確認し、10人戦の席HUDが8席と2席の二段に分かれて操作列へ重なる状態を確認した。デスクトップでは席ボタンを一行の横スクロール帯にし、席番号・名前・残高・施設数・ランドマーク進捗が入る高さを確保。1363×936の10人終盤market画面では10席が同じ行に並び、カメラ操作と重ならないことをbrowser assertionで確認する。844×390は44px高の横スクロールHUDを維持し、10人fixtureを同じ幅へ切り替えた画像も追加した。

短い横画面の終盤市場は、844×390でフィールド高が210→214→218pxと変化した。CSS後段のmin-heightがイベント帯の指定を上書きしていたため、横画面の折りたたみ時だけ高さ24pxを適用し、広げたときの履歴表示と操作ボタン44px、安全領域は維持する。最新測定では220px超を通過したが、次のCI runで寸法と回転後の市場表示を再確認する。

履歴表示の操作も見直した。receiptが空で履歴が閉じている間はイベント領域を隠し、展開時も同じ条件で非表示になるCSSだったため、横画面の「出来事」操作後に履歴が表示される条件へ修正。320/390/PCでは別のログ操作を使うため、最近履歴の展開検証はトグルが表示される844×390に限定した。

- 10人のPC/横持ち画像はPlaywright/WebKitのviewport emulation。物理端末ではない。
- 10人のPC HUDと844×390の寸法検査は成功した一方、リサイズ直後の10人market画像で街と市場が画面外に残った。`plazaField`のResizeObserverによるカメラ再配置を待ち、市場が画面内へ戻ることを確認してから撮影するassertionを追加した。実際の最新runは未完了。
- 844×390フィールド高とイベント展開操作は成功。直近のWebKit runには別の非同期レイアウト/クリックタイムアウトが残るため、カメラ操作後に2 frame待つテスト補助を追加した。
- 16テーマ画面の既存ベースライン差分は引き続き10画面。変更画像を目視して採用判断するまで基準画像は更新しない。

## Round 23: 横画面市場カードと広場操作の再検証

Run [37923439916](https://github.com/nao70161994/machikoro/actions/runs/37923439916) の844×390 screenshotを目視し、カードのイラスト下に施設名と価格が表示されたことを確認。横画面では共有カードCSSの `min-height: 88px` が市場パネルの縦幅を圧迫していたため、plazaの短い横画面に限り、アート枠を48pxへ調整し、名前と価格に領域を渡す。4列の市場カードと施設アートは維持する。

同runの盤面 viewport/focus/market 検査は8件すべて成功。比較表を閉じた後に建設一覧も閉じているケースをfixtureで再現し、「建設候補を見る」から市場一覧を開いてからランドマーク/施設セクションへ移るよう操作を修正した。

出来事ログから関連する街を選ぶ操作はカメラを移動するため、画面撮影とパン/ズーム検査の後へ移し、同操作自体の安全性 assertion は残す。37923439916では、この操作が後続カメラassertionを不安定化し、plaza visual reviewが844px一件のみ失敗した。4人オンライン同期は成功。視覚ベースラインは更新せず、16画面中10画面の既存差分は継続して目視審査する。

- 37923439916の844×390画像はGitHub Actions上のWebKit viewport emulationで、物理端末の撮影ではない。
- Round 23のログ操作順変更後の再検証run [37924923394](https://github.com/nao70161994/machikoro/actions/runs/37924923394) は、Playwright依存セットアップに約24分を要し、25分のjob timeoutでbaseline比較開始直後に終了した。ブラウザ結果は得られなかった。

Run 37927610915ではbaseline比較の後、plaza field viewport/focus/marketと4人オンライン同期が成功。市場の名前/価格も画像で確認できた。visual-art側はカメラのパン/ピンチ後に出来事タブをクリックする操作で45秒 timeoutした。ジェスチャ状態と履歴クリックを同じケースに混ぜず、出来事→関連街フォーカスを独立した844×390 testへ分離して安全性を検証した。

Run [37929038545](https://github.com/nao70161994/machikoro/actions/runs/37929038545) では、分離した最近の出来事→関連する街の操作を含むplaza field viewport/focus/market全8検査と4人オンライン同期が成功。visual-art側では320pxと844pxの画面fixtureが開始後の実際のダイス/CPU進行を待っている間に45秒で止まり、自動復旧表示が出た。表示確認用の状態を開始直後に直接構成し、不要なCPU/ダイス待機を外す。再開後の購入操作は実UIで続ける。

## Round 25: 視覚fixtureの初期状態を決定的にする

320/390/844/1440の画像テストでは、開始時に実際のサイコロを振りCPUの進行を待ってから同じBuild状態をfixtureで作っていた。この待機は描画確認の目的には不要で、WebKitの320px/844pxで45秒のテストtimeoutと自動復旧状態を起こした。開始後ただちにCPU scheduleを止め、Build状態・コイン・ログを設定して画像/レイアウト確認へ進む。390pxの保存再開・市場から購入・ターン終了は通常のUI操作のまま維持する。

Run [37930715856](https://github.com/nao70161994/machikoro/actions/runs/37930715856) で visual-art-review、4人オンライン同期、plaza field viewport/focus/market の各stepが成功。全runは4テーマ基準画像10枚の既存差分によりfailureだが、Plaza関連stepはすべて成功した。開始後のBuild状態をfixtureで直接作る変更後、320/390/844/1440の描画と再開後の購入操作を確認した。

独立目視では、10人戦をPCから844×390へ切り替えたとき、市場パネルがviewport上端へ寄りカード列の見出し部分が切れていた。ResizeObserverは選択中の視点を保持して市場を再配置していなかったため、viewport寸法変更時に現在選択中の街/市場/全体へ再フォーカスし、viewport内に市場全体が収まるassertionへ強化する。

## Round 26: 画面回転後に選択中の盤面を再配置する

PlazaFieldのResizeObserverは、viewportの縮小後もカメラ中心と倍率を維持するだけだった。選択中の市場が新しい短い画面から切れるため、寸法が変わったときは現在のfocus targetでカメラを再配置し、対象サイズを新しいviewportに合わせ直す。10人終盤のPC→844×390 browser testは、visibility/交差だけでなく市場パネル全体がviewport内に収まることを確認する。

Run [37932248560](https://github.com/nao70161994/machikoro/actions/runs/37932248560) では回転後の市場全体がviewport内に入るassertionを含むplaza field検査が成功した。スクリーンショットを再確認すると、カード名と価格の下端が市場パネルからわずかに切れているため、短い横画面の市場アート枠を40pxへ調整し、回転後もカード名/価格が全体表示される条件を加える。

Release pseudo E2E [37932055149](https://github.com/nao70161994/machikoro/actions/runs/37932055149) は3 jobすべて成功。Static safety、unit、PWA、online sync/reconnect、release pseudo E2E、Mobile WebKit、CPU difficulty smokeを確認した。このworkflowのcheckoutは回転後カメラ修正前のcommitなので、回転後変更はPlaza visual runで別途検証する。

- 横画面市場アート縮小と回転後カード情報assertionはPlaza WebKit run [37933873646](https://github.com/nao70161994/machikoro/actions/runs/37933873646) で実施。visual-artは成功したが、10人市場の名前/価格 boundsが未達だった。

## Round 27: 回転後のカード情報と320pxの描画負荷

Run 37933873646ではPlaza online syncは成功し、visual-artの320px fixtureは開始後の進行監視で自動復旧状態になり45秒timeout、10人横持ち検査は市場カード情報のbounds assertionが失敗。10人PC→844×390画面ではviewportと市場panelは内側へ再配置されたため、カード情報側の位置を計測可能にし、アート枠を40pxへ短縮。回転後の失敗時にもスクリーンショットと実際のbounds値を残す。

320pxはプレイ画面表示fixtureを2人戦へ絞り、390/844/1440の4人戦と別のoverview 320px/4人戦検査で多人数表示を確認する。モード数ではなく低幅端末での自動復旧が再現する条件を切り分ける。

Run [37936184402](https://github.com/nao70161994/machikoro/actions/runs/37936184402) では320px用fixtureを2人にした後、Plaza visual-artと4人オンライン同期が成功。field view testは二箇所失敗した。1363×936では比較表を閉じた後に追加していた2 frame待ちがページevaluate timeoutを起こしたため削除。10人の844×390リサイズでは市場全体は入ったが、施設価格下端がmarket panelを1.8px越えていた。回転後の画像とboundsをログへ残し、art枠を36pxへ詰めて再検証する。

## Round 28: 短い横画面のカード価格を収める

市場パネルを新しいviewportへ再フォーカスした後、10人終盤のカード名はpanel内、価格の下端だけが1.8px外側という計測値になった。短い横画面のart枠を36pxへ調整し、回転後の画像をassertion前に保存してレビューする。また1363×936の比較表操作に不要な固定frame待ちを外し、Playwrightの可視性/フォーカス待ちへ委ねる。

- Run [37938067726](https://github.com/nao70161994/machikoro/actions/runs/37938067726) では、WebKitのplaza visual/art確認と4人オンライン同期が成功。16画面の既存theme baseline比較は差分で失敗し、基準画像は更新していない。viewport/focus/market検査は実行途中でcancelledとなり、成功扱いにはできない。Playwright依存導入に約17分かかった。
- 未完了検査の再実行 [37941318602](https://github.com/nao70161994/machikoro/actions/runs/37941318602) は、browser導入に約21分、baseline比較に約3分を使い、既存16画面の差分で比較stepが失敗した。基準画像は更新していない。plaza visual/artとオンライン同期、market viewportの後続stepは起動したが、旧25分job上限が迫るため全検査結果は未確定。
- run 37938067726のviewport/focus/market検査が開始後cancelledになった原因は、run全体が25分job timeoutに達したことと確認。browser導入だけで17〜21分かかるため、Plaza review workflowのtimeoutを45分へ拡張した（commit `f47d9904`）。この設定の再実行は [37944311727](https://github.com/nao70161994/machikoro/actions/runs/37944311727) で進行中。端末側ではブラウザ/テストを実行していない。

## Round 29: 新レイアウトの実画面レビュー

Run [37944311727](https://github.com/nao70161994/machikoro/actions/runs/37944311727) でplaza visual/art、4人オンライン同期、field viewport/focus/marketの3 stepが成功。1440px全体表示、390px縦、844×390px横、320pxの市場/勝利、390pxの購入後画面をWebKit screenshotで確認した（物理端末ではない）。横画面市場の施設絵・名称・価格は読み取れ、回転後の市場とカード情報boundsも通過。320pxでも市場カード絵・出目・名前・値段・説明ボタンを確認できた。844px勝利画面では勝者、残高、街の発展、再戦/共有/タイトル導線が一枚に整理されている。

theme baselineは16枚中6枚pass、10枚fail。差分は `classic-landscape-844`, `classic-desktop-1440`, `sunset-phone-320`, `sunset-phone-390`, `sunset-landscape-844`, `sunset-desktop-1440`, `plaza-phone-320`, `plaza-phone-390`, `plaza-landscape-844`, `plaza-desktop-1440`。Plaza 390pxと844pxのexpected/actualを目視し、新画面では手番HUD、複数プレイヤー残高、dice action、建設操作が追加/再配置され、旧baselineはこれらを含まない旧画面だった。classic landscape、sunset 320px/1440pxも確認し、現行の操作とカード表示は崩れていない。差分は現行機能と旧画面の構造差で説明できるが、全16枚の品質確認と残る差分の独立再レビューが終わるまではbaselineを更新しない。

残課題として、Plazaの1440px「全体」画面はカメラが盤面全域を収めるため街カードが小さくなり、左右の緑地が広く見える。全体overviewの縮尺/街間隔と、個別の街・市場focusを比較して改善する。実画面レビューの成果と未解決点は引き続き設計反復に使う。

## Round 30: 少人数overviewの盤面密度

Round 29で見つかった1440px全体表示の余白を減らすため、2〜4人用の町/市場配置を固定1680×1380px以上の空領域から、各街と市場の実測幅/高さを元にしたカードナル配置へ変更した。北側の街、市場、左右の街、自分の街の間隔と外周paddingだけを残し、5〜10人用grid layoutは従来の間隔と配置を保つ。`node --check js/plazaTownLayout.js` と `node tests/plaza-town-layout.test.js` は成功（2〜10人の配置/境界/非重複、compact少人数、10人gridの12項目）。

変更後run [37946202053](https://github.com/nao70161994/machikoro/actions/runs/37946202053) でplaza visual/art、4人同期、viewport/focus/marketの全stepが成功。4人/10人および回転後marketに退行なし。1440px 4人overview画像では表示クラスタの見た目の拡大は小さく、少人数時の空き席削減に狙いを絞る必要があるため、2人overviewを追加撮影し、実DOMのworld幅/高さが旧固定領域より縮むことを確認するassertionを `plaza-overview.spec.js` に追加した。

16画面baselineはこのrunでも差分比較が失敗。旧UI期待値との違いが残るため、未確認の画面を含む基準画像更新は行わず、独立レビューを続ける。

2人overview検証 [37947711272](https://github.com/nao70161994/machikoro/actions/runs/37947711272) では、compact world寸法と2/4/10人の境界/非重複、plaza visual/art、4人オンライン同期、viewport/focus/marketの全stepが成功。2人・施設48枚/人のhigh-density screenshotでも街2つと市場が盤面内に収まり、重なりはない。whole-boardでは詳細カードが小さくなるが、これは全領域表示のoverviewであり、個別focusで街/市場を拡大する操作経路は維持されている。画像はWebKit emulationで、物理端末確認ではない。baselineは引き続き16枚中10枚fail/6枚passで、旧期待画像との構造差を目視レビュー後に更新する。

## Round 31: 短い横画面で手番プレイヤーに集中

baselineのclassic/sunset landscape actual/expectedを比較し、844×390pxでは非手番の街詳細が全て展開されてプレイヤー列を占めるため、手番街/サイコロ/市場が押し下げられている実課題を確認。`ui.js` はmax-height 600pxのlandscapeで非手番をsummaryへ折りたたみ、classic/sunsetの4人landscapeでは3つがcompactになるbrowser assertionを追加した。`node --check` と `node tests/ui-player-display.test.js` は成功。変更後のPlaza review workflowで再撮影し、縦320/390px、844×390px、1440px、既存online/market検査とbaseline差分を見直す。

Run [37949665650](https://github.com/nao70161994/machikoro/actions/runs/37949665650) ではlandscape compaction assertion、plaza visual/art、4人online同期、viewport/focus/marketが成功。classic landscape snapshotはpassへ戻り、9枚の旧画像差分が残った。差分のある9枚のexpected/actualを目視比較し、HUD、街詳細、market可視領域の現行レイアウトが意図した変更であることを確認した。workflow `refresh_baselines=true` のcandidate run [37951006261](https://github.com/nao70161994/machikoro/actions/runs/37951006261) が出力した全16枚と追跡baselineをchecksum比較し、異なる9枚のみをレビュー後に更新。他7枚は同一なので保持した。次の通常Plaza runで全16 snapshotの再現性を確認する。

通常run [37951761321](https://github.com/nao70161994/machikoro/actions/runs/37951761321) は更新後の16/16 baseline比較、plaza visual/art、4人online同期、field viewport/focus/marketの全stepが成功。これでbaselineの再現性を確認できた。次の独立レビューでは他の非Plaza画面とイベント演出に範囲を広げる。

## Round 32: latest HEADのPlaza画面を再確認

HEAD `1792c3d8` でPlaza visual reviewを再実行。run [37953056688](https://github.com/nao70161994/machikoro/actions/runs/37953056688) は16画面baseline、Plazaのアート/終盤補助操作、4人オンライン同期、盤面viewport/focus/market検査がすべて成功した。端末上ではなくGitHub ActionsのWebKit/Chromiumで実行。

artifactの320×844px画像では、中央市場は2列の大型アートカードで、施設名・出目・価格を読める。4人終盤の市場フォーカスでは全員の残高と色別施設数が上部HUDにあり、左右の街とカード市場が同時に見える。10人横画面では上部プレイヤー要約と市場フォーカスを使う構成を確認。狭い320pxではCPU名が省略されるが、プレイヤー識別と席番号は残る。今回の対象画像ではカード切れ/操作ボタンの画面外逸脱は見つからなかった。

勝利artifactは1ターンのテスト状態で、街が疎な画像は通常対局の終局品質を証明しない。固定状態fixtureの目視だけではGoal 7の完走条件を満たさないため、次にrelease-test workflowのmobile WebKit job（seeded browser matchを含む）を最新HEADで実行し、実進行から終局したPlaza局の画像と操作結果を確認する。物理端末での確認は未実施。

## Round 33: 実プレイ完走後の勝利画面をレビュー

`release-test.yml` をHEAD `1da8c5af` でdispatchしたrun [37954311955](https://github.com/nao70161994/machikoro/actions/runs/37954311955) は、release-test、CPU難易度smoke、mobile WebKitの全jobが成功。mobile WebKitではタイトル/操作ケースとseeded CPU対局が通り、固定勝利fixtureではない実局結果を保存した。2人クラシックは87ターンで、街は41/38施設。Plaza 4人戦は124ターンで、街は26/29/25/30施設。画像と結果JSONは `/data/data/com.termux/files/usr/tmp/machikoro-release-review-37954311955/release-mobile-webkit-review/_temp/machikoro-review/` に取得した。

1440pxの2人対局終局画面は街の施設アートが盤面の主役になり、勝者、コイン、再戦/共有/タイトル導線が同時に見える。844×390pxの4人Plazaでは勝者と育った街を左右に分け、施設26枚とランドマーク6個の街が表示され、主要操作も画面内に収まる。スクリーンショットの誤った短期fixture評価を実局確認で解消した。CPU対局と横画面の終局について重大な崩れは確認しなかった。これはCI上のPlaywright/WebKit確認であり、物理スマートフォンでの実機確認ではない。次は対局中のカード連鎖/コイン移動の視覚理解と、タイトル保存データ画面を最新artifact上で続けてレビューする。

## Round 34: 横持ちタイトルの上端クリップを修正

Round 33のCI title-landscape画像を確認し、844×390pxでページ内容が長い場合にタイトルの先頭がscrollport上端から押し出される状態を発見した。短い横画面のタイトルコンテンツからblock方向のauto marginを外し、`title-layout.spec.js` で320/390縦、844横、1440 desktopのタイトル見出しが上端より上に出ないことを検査。レビューworkflowにもこの4幅の保存再開/削除操作テストを追加した。変更は `7cedb59b`。

run [37956025398](https://github.com/nao70161994/machikoro/actions/runs/37956025398) の初回ではtitle/saved-game responsive E2E、16画面baseline、Plazaアート、4人オンラインが成功。盤面テストの市場を閉じた後のbuild heading focus assertionだけが失敗したため、期待値を緩和せず同一runを再実行した。GitHubのrerunは成功済みstepを再実行しなかった。2回目ではPlazaのonline/field/focusを含む後段が成功し、focus failureは再現しなかった。一方、baseline比較で`plaza-phone-390`のみ差分0.03（閾値0.012）が再発。actual/expected/diffを取得して確認し、基準画像は更新していない。横画面タイトルの変更とは対象幅・CSS条件とも別であり、ビジュアルfixture/描画安定性の独立した調査項目として残す。run全体は成功扱いにしない。

## Round 35: タイトルとPlaza回帰を再検証

Plazaの施設セクション移動でフォーカスしたh4が、同じクリック処理内で親detailsを閉じた時に失われうる順序を修正。detailsを閉じた後の次フレームで、接続中の市場見出しへフォーカスする。変更 `8d1b8502`。再試行run [37959744306](https://github.com/nao70161994/machikoro/actions/runs/37959744306) は全step成功し、16画面baseline（plaza-phone-390を含む）、タイトル/保存再開4幅E2E、Plazaアート/終盤補助操作、4人オンライン、盤面focus/viewport/marketを通過した。

同runの844×390pxタイトル画像を目視し、上端にタイトルを残したまま中断ゲーム、保存セレクター、再開/削除、CPUクイック開始が読めることを確認。画面全高より内容が長い場合は縦スクロールする構成。物理スマートフォンではなくCI WebKitでの確認。Round 34で記録した390px差分はこのrunでは再現せず、baselineの変更は不要だった。


## Round 36: 出目・建設レシートの実操作と独立レビュー

出目レシート確認を内部状態の直接変更から実際の「サイコロを振る」ボタン操作へ移した。最初の実装ではGameManagerインスタンスのメソッドを差し替えてもUIの遅延アクションに届かず、320/390/1440pxで期待した出目にならなかった。CIログを確認し、ブラウザの乱数APIだけを一時固定してUI経路は実動作させる形に変更。320/390/844×390/1440pxの出目・収支・複数発動確認はrun [38111588012](https://github.com/nao70161994/machikoro/actions/runs/38111588012) で成功した。

同じ長いテストに続けていた建設fixtureはRelease WebKitで1440pxの同期ページ評価が45秒で止まったため、出目と建設/ランドマークを独立テストへ分割し、両方をrelease browser-prとPlaza workflowの対象にした。建設レシートは4幅で検査し、レシート確認の目的と関係しない建設済み街の選択クリックは外した。GitHub APIによるファイル更新で閉じ括弧が欠ける不備も静的ゲートが検出したため、実ブランチ内容を再取得して構文を修正した。期待値・ベースラインは緩和していない。

最新run [38114215316](https://github.com/nao70161994/machikoro/actions/runs/38114215316) は16画面baseline、タイトル/保存操作、出目・建設レシート8ケース、Plazaアート/補助操作、4人オンライン、盤面viewport/focus/marketが全て成功。Release run [38114215352](https://github.com/nao70161994/machikoro/actions/runs/38114215352) もStatic、Unit、PWA、オンライン同期/再接続、Release E2E、Mobile WebKit、CPU難易度smokeの全jobが成功。以前のPlaza runで844px視覚fixtureのtimeoutが一度あったが、最新runでは同じ視覚fixtureが成功し再現しなかった。

これはGitHub Actions上のWebKit/Chromiumブラウザ検証であり、物理スマートフォンの確認ではない。最新runの画像artifactは保存済みだが、このラウンドでは新しい外観コード変更はなく、直前までの画面レビューを継続している。商用ゲーム品質のGoalは未完了で、設定/待機/ヘルプ/エラー復旧など全画面の独立レビュー、複数人数の実プレイ再レビュー、スクリーンショットの追加目視が残る。

## Round 37: 2人戦の画面方向に合わせた広場配置

にぎわい広場の2人戦は縦画面で相手・市場・自分を縦に、横画面で相手・市場・自分を横に並べるよう配置し、道路も中央軸に合わせた。市場と街の座標は測定サイズから計算し、2〜10人の既存配置単体テストは維持。変更は `f2e1425a` 相当の2人盤面配置コミット。GitHubブランチ反映時にスタイルシートのAPI転送が出力上限で欠落したことをSHA照合で検知し、完全なファイル内容へ修復した（`95d42f84`）。作業ブランチはリモートと同期し、5ファイルのblob hashを確認した。

初回ブラウザ検証では2人戦の4幅テスト中3ケースが失敗。ログから、テストがDOM内の `offsetLeft/offsetTop` を盤面座標として使っていたこと、異なる大きさの街の上端/左端を揃える前提が実際の中央揃えと違うことを確認。テストをPlazaFieldが設定した盤面座標と街の中心点で測るよう修正した。製品コードの幾何条件や画像baselineは緩和していない。

再実行run [38116307065](https://github.com/nao70161994/machikoro/actions/runs/38116307065) では320×844、390×844、844×390、1440×936の2人戦盤面viewport/focus/market検証を含むPlaza field viewport stepが成功。2〜10人レイアウト単体テストも成功。Release run [38116306970](https://github.com/nao70161994/machikoro/actions/runs/38116306970) はStatic、Unit、PWA、Online/Reconnect、Release E2E、Mobile WebKit、CPU smokeの全jobが成功。

ただし同Plaza runの既存4テーマ画面baselineで `plaza-phone-390` のみ6745 pixels（約3%）の差があり、比較stepはfailure。320px、844px横、1440px、その他テーマは通過。変更した2人用縦画面の道路/盤面と関連する差分の可能性があるが、artifactのactual/diff画像を目視で確認できていないため原因確定・baseline更新はしていない。最新画面artifactは保存済み。これはWebKit/ChromiumのCI結果であり、物理スマートフォンでの確認ではない。Goalは未完了。

## Round 38: 2人席の識別と操作テストの独立再確認

Round 37のPlaza WebKit失敗ログでは、ゲーム開始後の自分の席が常にindex 0とは限らず、1440pxで街順のassertionが誤った相手を選んでいた。また、1363pxの操作テストは比較モーダルを閉じた直後のカメラ移動中に建設ショートカットを押し、Playwrightの安定待ちが45秒でtimeoutした。テストは `.player-box-self` から自分の街を取得するようにし、ショートカットの実操作を盤面全体表示から市場へ移る独立操作として前に移動した。UI動作の期待を緩めず、CIで再検証した。

最新run [38118020099](https://github.com/nao70161994/machikoro/actions/runs/38118020099) はPlaza visual review全step成功。16画面baseline（390px含む）、タイトル/保存操作、出目/建設レシート、Plaza art、4人オンライン、2人戦を含む盤面 viewport/focus/market が成功した。Release run [38118020118](https://github.com/nao70161994/machikoro/actions/runs/38118020118) もStatic、Unit、PWA、オンライン同期/再接続、Release E2E、Mobile WebKit、CPU難易度smokeの全job成功。以前の390px差分は同じrunの失敗job再実行で16画面すべて通過し、再現しなかった。baselineは更新していない。

これはCI上の操作・画像比較結果で、今回のartifact画像自体は直接目視できていない。物理スマートフォン検証も未実施。したがって画像の美しさを成功したCIだけから推定せず、目視レビューと全画面の再設計は未完了として継続する。

## Round 39: 4人戦の既存画面画像を独立目視

リポジトリにあるPlazaの4幅Playwright基準画像を開き、最新成功run [38118020099](https://github.com/nao70161994/machikoro/actions/runs/38118020099) が同じ16画面画像を比較して成功したことと照合した。画像を直接目視した結果、390pxでは育てた街が中央の小さな範囲にとどまり、周囲の芝地が大きく空く。施設アートも小さく左側へ寄り、中央の縦道路/光の柱が街より目立つ。320pxでもゲーム情報と操作ボタンは読み取れるが、建設施設の存在感が弱い。844×390pxと1440pxは相手HUDと操作帯が安定して見える一方、街は画面幅の一部しか使わず、広い空き地が画面の主役になる。

これは序盤の4人戦・自分の街フォーカス画像なので、施設が少ない状態の証拠に限られる。中盤/終盤の新画像や直近実行artifactの目視とは区別する。次のデザイン改善ではPlazaFieldの自分の街focus倍率が現在最大1.1に固定されている点を調べ、viewportの幅と高さに応じて街・施設アートを大きく見せながら盤面全体を追える挙動を設計する。PCで不必要に小さくならないこと、844×390pxや縦持ちでランドマーク/カードが切れないことを新しいbrowser assertionsで確認し、意図的な画像差分もactual画像を目視して評価する。現時点では当該倍率は未変更で、Goalは未完了。

## Round 40: 自分の街のフォーカスをviewportに適応

`PlazaField.focusTarget('self')` の固定110%上限をやめ、街の実測幅/高さとviewport寸法に応じてフォーカス倍率を計算する。320/390pxの縦画面では幅に合わせ、PCでは高さに収めながら従来より大きく表示する。短い844×390px横画面は現行の110%上限を維持し、パン/ズームで詳細を見る操作を残す。市場focus、全体focus、共通ゲーム状態は変更しない。

新しい4幅browser reviewは self town の幅とPC拡大、縦画面/PCの表示領域内boundsを検査し、各幅でfocus screenshotをartifactに保存する。長いPlaza操作ケースでカメラメニュー操作がtimeoutしたため、施設/ランドマークナビゲーションを状態管理を止めた独立UI testへ分離した。既存テストの期待値を弱めず、2〜10人配置の単体テストも通過した。

Plaza run [38120234366](https://github.com/nao70161994/machikoro/actions/runs/38120234366) は16画面baseline、タイトル/保存操作、出目/建設レシート、Plazaアート/オンライン、4幅focus screenshot、2〜10人終盤配置を含む全step成功。Release run [38120234461](https://github.com/nao70161994/machikoro/actions/runs/38120234461) はStatic、Unit、PWA、Online/Reconnect、Release E2E、Mobile WebKit、CPU smokeが全job成功。画像artifactには新しいfocus screenshotを保存したが、この実行の画像そのものは直接目視していない。CI browser検証であり実機確認ではない。全画面品質と中盤/終盤の直接画像レビューは未完了。

## Round 41: 実画面で街の施設密度を再評価

施設rowを中央配置する初回修正はPlazaの複数viewport確認で成功。Release run [38121826804](https://github.com/nao70161994/machikoro/actions/runs/38121826804) はUnit gateを含むrelease-testとCPU smokeが成功した。Plaza run [38121486320](https://github.com/nao70161994/machikoro/actions/runs/38121486320) の完了ログから390px/2人/2施設のWebKit画像を抽出し直接確認した。

画像では横方向の偏りは直った一方、施設rowは街幅の約半分に収まり、上下の空地が大きく見えた。中央寄せだけでは施設アートの存在感を改善できないと判断し、1行あたりのlot数に合わせて幅を可変にした。2lotは各38%、3lotは30%、4lotは23%、単独rowは48%。各rowの中央とstreet内boundsを保ち、2/4人と390/1440pxのbrowser assertionでadaptive widthを検査する。施設art test、UI test、構文確認が成功。CIへ大量のbase64を残す一時診断ログは画像を取得後に削除した。

更新したadaptive widthのPlaza/WebKit画像はrun [38123095506](https://github.com/nao70161994/machikoro/actions/runs/38123095506) から直接取得して目視した。2施設rowは画面幅の約8割まで広がり、前画像より施設を認識しやすい。一方で縦方向の空地と中央道路が強く、施設群が広い背景に浮いて見えたため、施設行数に応じて街景の高さを変え、施設全体を縦方向に中央配置する調整を追加した。これは今回の作業バッチで次にまとめて確認する。

テストは既存16画面ビジュアル回帰を維持し、この変更に固有の確認を390px/2人と1440px/4人の2画面へ絞った。単体では2施設/5施設の区画座標と街景aspectを検証する。調査用画像ログおよび重複UI assertionは削除し、既存テスト群をまとめて一度実行する。今回直接確認できたのは序盤2施設の390px画像だけで、縦320px、横持ち、中盤/終盤、イベント、物理端末の品質証拠はまだない。Goalは未完了。

## Round 42: タイトル背景のsafe-area幅を修正

タイトル画面の `width: 100vw` と左右safe-area paddingはcontent-boxのままだと幅が加算され、切り欠きのある端末でviewportを越える可能性があった。`width: 100%` と `box-sizing: border-box` に揃え、small/dynamic viewport単位の高さを順に指定した。既存の `tests/main.test.js` にこのCSS契約を追加し、同suite 162件成功、`node --check tests/main.test.js`、`git diff --check` が成功。

Termux/Androidのローカル環境ではPlaywrightが `Unsupported platform: android` で起動できず、実ブラウザ画面は今回撮影できていない。その後、変更はcommit `c0bcb87a` として作業branchへpushし、GitHub Actionsでtitle/save、Plaza、Release検証を開始した。タイトルのsafe-area表示はWebKit画像で再確認が必要。これはタイトルの表示幅の修正であり、保存データ画面、4テーマ全画面、実プレイ完走、Plazaのカード存在感/イベント演出の完了証拠ではない。Goalは未完了。

## Round 43: 小型縦画面でPlazaの街を読める大きさに保つ

Commit `c0bcb87a` のCIではrelease-testとCPU smokeが成功。Plazaの実ブラウザ画像比較では既知の `sunset-phone-390` と `plaza-landscape-844` の差分が再発し、Actual/expected/diffを確認した。どちらも以前の街レイアウト更新による差分であり、このタイトルCSS変更からは生じていない。baselineは更新しない。

同runの320×844px・2人overview検査は街幅146.97pxで150px基準に届かず失敗。画像上でも全体表示は街2面、市場、操作帯を縦に縮小して並べ、街の施設アートは小さくなっていた。原因はPlaza field内の街景高さを常に320pxに固定し、行数由来のaspect比を無視していたこと。Plaza fieldではheightをautoへ戻し、既存の行数aspect比とmin-heightを使うようにした。これで縦画面のworld総高を減らしてoverview時の縮小率を上げる狙い。既存のplaza-overview 4 viewport testが150px幅条件を持つため、検査数は増やさずCIで再確認する。修正後画像・CI結果は未確認。タイトル画像の該当caseも次runで併せて確認。Goalは未完了。

## Round 44: 変更後の街景を画像で再確認

Plaza run [38127436672](https://github.com/nao70161994/machikoro/actions/runs/38127436672) ではPlazaアート、4人オンライン同期、2人/4人のviewport・focus・market検査が成功。320px overviewの150px幅条件も成功し、artifactの画像では2つの街、市場、操作帯が縮小される中でも街の施設アートが以前より大きく読める。これはCI WebKit画像で、実機ではない。

このrunの16画面比較で残った差分は `sunset-phone-390` と `plaza-landscape-844` の2枚のみ。expectedとlatest actualを並べて確認した。390px夕暮れ画面は建物2種が左側に小さく固まっていた旧画像に比べ、街と施設アートが横方向へ広がり中央に配置される。844×390px Plazaは新しい街景aspectと施設配置が中央viewportを使い、旧画像の左上に小さく寄った街より認識しやすい。両差分とも最近の街景変更による意図した改善と判定し、actualの2枚だけをsnapshotへ採用。他14枚は変更していない。次runで16枚全体の再現性を確認する。物理端末、中盤/終盤、イベント/連鎖画面の評価は未完了。

## Round 45: 縦画面Plazaも新しい街高へ同期

最新16画面run [38128402085](https://github.com/nao70161994/machikoro/actions/runs/38128402085) で `plaza-phone-320` と `plaza-phone-390` のみが各3%差分。実際のActual/expectedを比較したところ、height:autoにより市街アートが旧固定320px高の画像より大きくなっている。320pxでは施設2種が周囲の街に埋もれず、390pxでも街scene内のアートが拡大して認識しやすい。プレイヤー名と施設chips、HUD、ダイス操作は残り、Plaza viewport/focus/market検査とRelease/Mobile WebKit/CPU smokeは成功した。

この2枚は新しい縦画面レイアウトの意図した差分としてActualをsnapshotへ採用。他12枚は維持。次CIで16枚すべての再現性を確認する。ここでの画面評価はCI WebKit emulationで、物理端末ではない。商用品質全体、4テーマ全画面、中盤/終盤イベント、複数発動、Undo/再接続中の演出誤再生は未完了。

## Round 46: 更新バナーのブラウザfixtureを実際の表示経路に合わせる

320pxの出目レシートartifactでは更新バナーの説明文が縦に折り返されていた。原因を追うと、製品コードは `display: block` を設定してCSS Gridへ切り替えるのに対し、レシート用browser fixtureだけが `display: flex` を直接指定し、実際の表示状態を再現していなかった。CSSを場当たり的に変更せず、fixtureを製品と同じ `block` に修正し、320pxでcomputed displayがgrid、説明文とバナーに十分な幅があることを検査する。ローカルではPlaywright/WebKitを実行できないため、修正後の実画面とレシート画像は次のCIで再確認する。今回の原因判定はartifactとアプリのバナー表示処理の照合によるもので、スマートフォン実機の評価ではない。

## Round 47: 画面高に合わせた街景のbaselineを再確認

CI [38130524088](https://github.com/nao70161994/machikoro/actions/runs/38130524088) のexpected/actualを目視比較し、`plaza-landscape-844` と `plaza-desktop-1440` の差分を調査した。844×390pxは街景内の道路・施設群が上下に中央寄せされ、1440×936pxは育てた街と施設アートが旧画像より大きく画面中央に表示される。どちらも直近のPlaza街景レイアウト変更による意図した改善と判断し、この2枚だけ実画像で置き換え、他14枚は維持した。同CIでは16画面比較にこの2差分があり、Plaza viewport/focus/market試験も1363pxで一件timeout、出目レシート確認はbaseline failureのためskipされた。実際の更新バナー確認は次のCIで必ず行い、timeoutが再発する場合はfixture/操作原因を調べる。Release E2EとMobile WebKitは成功したが、Plaza workflow全体は成功扱いにしない。

## Round 48: 広場のプレイヤー詳細を施設カード一覧へ変更

プレイヤー詳細パネルは施設名と所有数を文字列だけで並べ、市場や街景のアートと連動していなかった。既存の施設SVG、カード分類色、発動出目、所有数、休業枚数を使うカードグリッドへ変更し、ランドマークも同じアートで建設済み状態を表示する。施設を出目順に並べ、終盤も発動タイミングから探しやすくする。カードを押す従来の詳細モーダル操作、プレイヤー残高と状態は維持する。所有枚数が増えても詳細パネル内をスクロールし、320pxでは2列、広い詳細パネルでは自動で列数を増やす設計。発動出目をラベル付きで表示し、所有枚数をバッジ化した。キーボードフォーカス表示、休業バッジ、Reduced Motion、高コントラスト対応を加え、パネルをdialogとして読み上げ、Tab移動を内部に閉じてEscapeと閉じるボタンで元のHUDへ戻すようにした。safe-areaを避け、横画面では操作ツール列と重ならないよう詳細パネルを配置する。関連する既存unit testは新しい表示契約へ更新したが、ユーザー指示に合わせ、現在はテスト・pushを保留して実装変更をまとめている。ブラウザでのカードサイズ・スクロール・操作確認は最後の一括検証で実施する。

### Review note

この変更はソース上のレイアウト・アクセシビリティ改善であり、実画面でのカード幅、長い施設名、終盤の大量施設スクロールはまだ評価していない。詳細パネルのフォーカストラップ、フォーカス復帰、safe-areaからの距離も実ブラウザで確認が必要。実装一括後に320px縦、844×390px横、PC幅でレビューし、既存16画面比較とは別にプレイヤー詳細の実状態を操作して撮影する。

## Round 49: 手番中プレイヤーをHUDで明示

横持ち時は共通status帯を隠すレイアウトのため、現在プレイヤーの金色枠だけで手番を識別する状態だった。該当席に「手番」バッジを表示し、aria-labelにも同じ情報を含めた。844×390px HUDブラウザ検査へactive席/非active席のバッジ確認を追加したが、ユーザー指示に合わせてまだテストは実行していない。スクリーンショットでバッジが名前やコイン表示を圧迫しないことを後段の一括確認で評価する。

## Round 50: 建設結果にも施設アートを表示

施設建設時のフィードバックは、施設名と「建設した街を見る」ボタンだけで、カードを街へ加える瞬間にその施設を視覚的に結びつけにくかった。既存の施設アートSVGと分類テーマをレシートへ出し、ランドマークは専用モチーフと金色の枠で強調する。既存の街へ移動する操作、購入パルス、勝利時の別演出条件は維持し、高コントラスト表示も追加した。狭い横持ちではイベント帯を閉じると建設レシートが隠れる既存設計なので、イベントを展開した場合の高さ・折返しとReduced Motion時の理解しやすさを一括ブラウザレビューで確認する。テストと実画面確認は未実施。

## Round 51: 全員比較表にも施設アートを共有

全員の施設比較は所有枚数を見比べられる一方、文字だけで各行の施設を認識する必要があった。市場・街景・プレイヤー詳細と同じ既存SVGを施設行/ランドマーク行へ追加し、stickyな行見出しの中に小さく収める。比較を開くと見出しへフォーカスし、Escapeまたは閉じる操作で比較ボタンへ戻す。ルール情報は比較表のまま共有し、ゲーム状態やカード効果は変更しない。320px、390px、844×390px、1363pxの既存比較パネル操作検査で表示と横スクロールをまとめて確認する。ブラウザ検査はまだ実行していない。

## Round 52: 長い比較表の読み位置を保つ

比較パネルを開いたままゲームが進むと、毎回table全体を再生成する既存処理で縦横スクロールが先頭へ戻る可能性があった。カード/休業・ランドマーク・役所状態の軽量signatureが変わらない限りDOM生成を省き、内容更新時も比較表と詳細カード一覧のスクロール位置を復元する。手番以外の変更で大きな表を作り直さず、終盤のプレイヤー詳細を読み進めた位置も維持する狙い。20種の施設を持つ4人戦で追加後の縦横位置を確認するブラウザ検査を追加した。実画面確認とテスト実行はまだ。

## Round 53: 中断対局の概要に人数を追加

保存選択では市場とターン数は見えるが、対戦人数を判断できず複数の保存データを選ぶ手掛かりが少なかった。保存状態にplayers配列がある場合だけ「2人対戦」のように付け、旧データに人数がない場合は従来表示を保つ。通常市場/公式10種類市場どちらにも適用し、タイトル画面の保存一覧検査で2人戦表示を確認するよう更新した。関連unit/browserテストは追加更新したが未実行。既存の最新/過去保存選択、再開、削除操作は維持する。

## Round 54: 詳細カードの動きをReduced Motionで止める

カードタイルのhover反応は通常時に軽く浮かせるが、Reduced Motion設定では変形も無効にする。アートサイズ・出目順と合わせて、詳細パネルのスクロール状態を保ったままでも操作できるようにした。Reduced Motion中のhover transformを`none`とするブラウザ検査を追加した。表示/操作確認とテストは後段で実施する。

## Round 55: PWA通知の高コントラスト表示

PWA更新/インストール通知は高コントラスト切替時も通常のグラデーションや半透明ボタン色が残る可能性があった。黒背景・白枠・白文字と黄色い更新ボタンに固定し、暗い dismiss ボタンも白枠で区別する。320px縦持ちで主要色を確認するブラウザ検査を追加した。検査未実行。

## Round 56: 保存CPUの準備状態を平易に伝える

保存対局のRL CPUデータを準備している間、「モデル読み込み中」では利用者が何を待つのか分かりにくかった。再開ボタンを「対戦相手を準備中…」とし、無効状態に加えて`aria-busy`を同期する。待機中の小さなリングを表示し、OSまたはアプリ内Reduced Motionでは静的な印にする。操作状態と通常/Reduced Motionの疑似要素アニメーションを確認するブラウザ検査、LocalResume unit契約を更新したが未実行。

## Round 57: 発動した施設を街の中でも識別

にぎわい広場では発動施設が収支レシート内にのみ出るため、プレイヤーの街と出来事を視線で結びにくかった。既存の共通ターンレシート投影をゲーム状態オブジェクトごとに軽くキャッシュし、所有者が確認できる施設発動を街の同名施設に対応付ける。発動回数と確認済みの収支を小さなラベルで表示し、金色の輪郭で街上でも見つけやすくする。施設所有者の照合ができない古いログは強調せず、ルール状態や他テーマの街描画は変更しない。対象所有者、金額、発動回数、描画の非変更をunit契約へ追加した。ブラウザでの発動画面とテストは未確認。

## 商用品質の参照メモ（2026-10-11）

[公式Steamストアページ](https://store.steampowered.com/app/1969860/__MACHI_KORO/?l=japanese)は、ダイスを振る期待感と、少ない操作でオンライン/オフラインの対戦へ入れる点を前面に出し、2〜4人対戦を案内している。この比較目標から、街コロでは発動カードと収支の因果が盤面上でも見え、主要アクションへ迷わず進めることを優先する。今回の発動施設表示は前者へのコード上の一歩。Steamページの公式スクリーンショット/実際のゲームプレイと本アプリの同条件比較は、ブラウザでの画面確認と合わせて後段で行う。

## Round 58: にぎわい広場のカードアートを拡大

重点対象の`cardboard`テーマは、中央市場の施設絵が34px、所有カードも一部の表示幅では77px幅・36px以下の絵に制限されていた。市場カードの絵を48px、カード最小幅を96pxにし、名前を12pxへ上げる。所有カードは標準表示の絵を46pxにし、横向きの上下席ではカード幅を88pxへ広げて横スクロールで残りを見られるようにする。狭い横画面では既存の市場1列スクロールとカード選択動作を保つ。320/390px縦、844×390px横、1440pxのブラウザ検査に市場カード幅と絵の高さを加えたが未実行。画面上で密度・操作性の均衡は未確認。

## Round 59: 5〜10人のロスターで自分と手番を視認

5人以上のカード盤面は全員をロスターに残し、選択した相手の街を切り替える。ロスターは選択状態とARIAの現在手番を持っていたが、`aria-current`だけでは画面上で手番が分からず、自分の印も名前に含まれて目立たなかった。席名を省略可能な部分と役割バッジに分け、「あなた」「手番」を常時表示する。ロスターの選択背景は既存どおり維持し、座席インデックス、色別カード数、コイン、目標進捗の並びは変えない。5〜10人のunit/browser契約を追加したが未実行。

## Round 60: 自分の街を盤面でも見分ける

カード盤面で複数の街が並ぶ際、手番プレイヤーは金色の上辺で分かる一方、自分の街は並び順以外に明確な視覚マークがなかった。自分のプレイヤーパネルとロスター席に青い輪郭を足し、手番の金色表示と重ねても双方の役割が残るようにする。高コントラスト設定では輪郭を白へ切り替える。多人数ブラウザ検査に標準表示での自分の街の色を加えたが未実行。

## Round 61: カード盤面の再描画でログ投影を再利用

カード盤面は表示更新ごとに最大1000件の施設発動・収支を全ログから投影していた。ゲーム状態オブジェクトを弱参照キーにし、手番・フェーズ・ログ長・末尾4件・再生状態が一致する間は読み取り専用の投影結果を再利用する。Undoや新しいログ末尾では再計算するため、演出の実行条件やゲーム正本には手を加えない。10人戦や長時間ゲームの描画コストを抑える狙いだが、実行時間と実対局での更新正確性はブラウザ検証で確認していない。

## Round 62: カード盤面全体の高コントラスト対応

Cardboard独自のCSS色がアクセシビリティ高コントラスト設定後も残り、市場やカードの一部に低コントラストな文字色があった。盤面、ロスター、所有カード、市場、収支、主要操作を黒地/白字と明確な枠へ切り替える。選択中は黄色の下線、自分は白い輪郭、手番は黄色の目印で意味を保つ。施設アートとカテゴリ名は残す。390pxブラウザ検査に市場・カード・操作面の計算済み色を追加したが未実行。

## Round 63: 高コントラスト市場で購入可否を形でも表示

市場を黒白に統一すると、購入可能状態を背景色だけで区別していた既存表現が消える。購入可能カードに黄色い輪郭、残高不足などで購入不可のカードに破線を付け、アクションボタンもdisabled時は破線にする。実際の`disabled`属性や購入判定は変更しない。0コインの建設フェーズで不足カードのcomputed border styleを確認するbrowser assertionを追加したが未実行。

## Round 64: ランドマークを絵で識別

カード盤面のランドマークは名前と建設状態だけの小さな文字チップで、施設カードと比べて街の目標が印象に残りにくかった。各ランドマークにも既存の施設アート資産を使い、通常画面では横並びの小型タイル、短い横画面では幅を抑えたアートにする。購入状態や建設完了アニメーション、ルール状態は変えない。browser specにアートの表示確認を追加したが、Playwright実行と目視レビューはまとめて後で行う。

## Round 65: 保存選択と再開操作を別段に整理

復旧世代を選べる保存状態では、選択ラベルと再開/削除ボタンが同じflex行に並び、狭い幅でボタン文言が圧縮され得た。また「世代」より「何回前の保存データ」かを直接示す方が操作を理解しやすい。保存選択を操作ボタンの上段へ独立させ、ボタンは320px幅でも再開と削除を横並びで保つ2列グリッドにする。選択肢を「最新の保存データ」「1回前の保存データ」とし、320/390px、横持ち、PCのタイトル browser specで選択肢・列数・段順を確認する。実画面での折返し・タップ領域確認は一括検証時に行う。

## Round 66: 収支レシートで支払い方向を即時に区別

強調レシートは席番号と金額を出していたが、手番プレイヤーから見た支払い/受け取りは経路と符号を読み解く必要があった。レシートに入出方向の属性を持たせ、共有CSSで矢印・境界色を付ける。支払う/受け取るの文言はARIAラベルにも含め、色以外の情報も保つ。plaza/cardboardの共通レシートへ展開し、既存の金額・送金経路テキストは維持する。カードボードの高コントラストでは方向表示を含め黒白へ統一し、矢印を黄色で残す。受取/支払の属性と読み上げラベルをbrowser specに追加したが未実行。

## Round 67: 高コントラスト勝利画面を追加

カード盤面の高コントラスト対応は対局中の市場・カードが中心で、ゲームの締めくくりになる勝利画面の統計や再戦ボタンには専用表現がなかった。勝利画面を黒地白枠、タイトルと強調統計を黄色、本文を白にし、操作のfocus-visibleを黄色で示す。祝福アートと街の描画は維持する。既存の勝利画面browser specへ高コントラスト時の色確認を追加したが未実行。

## Round 68: 施設カードの読み上げ名に状態をまとめる

カードの押下要素は複数の装飾・ラベル要素を含み、出目、分類、所有枚数、休業枚数、今回の発動収支が明確な順番で読み上げられる保証がなかった。各カードボタンへ明示的なARIA名を付け、施設名→分類と発動条件→出目→所有/休業→今回の確認済み収支→詳細操作の順に伝える。絵と重複した出目表現は装飾扱いにする。unit testへ通常・休業・発動時のラベルを加えたが未実行。

## Round 69: レシートの全件再読み上げを抑える

カードボードの収支レシートは描画ごとにHTMLを置換する一方、領域全体が`aria-live="polite"`だったため、同じ出目の詳細を開閉したり状態を更新した際にも収支全体を読み上げ直し得た。専用の出目・手番・コイン変化アナウンサーを残し、内訳は名前付きregionから利用者が確認する形にする。region/live属性のbrowser assertionを追加したが、支援技術を用いた手動確認は未実施。

## Round 70: オンライン再接続欄の長文と操作幅を安定

中断したオンライン対局の再接続欄は操作列がインラインflexで、名前やルームIDが長い場合の折返しと削除ボタンの幅を画面スタイル側で保ちにくかった。説明文を単語途中でも折り返せるブロックにし、再接続/削除を最小タップ高44pxの2列へ移す。320px幅で長い名前とルームIDを置くbrowser specを追加したが未実行。

## Round 71: カード詳細モーダルからのフォーカス復帰を補う

詳細モーダルは共通フォーカス管理で起動元へ戻るが、開いている間に対局描画が進んで起動ボタンが置換されると、復帰先DOMが切断済みになる。カード/ランドマーク詳細の起動要素が切断された場合に限って、同じdata-actionと対象名を持つ表示中ボタンを探してフォーカスを戻す。モーダルがまだ開いている場合や元要素が残る場合は介入しない。カード詳細中に描画更新して閉じるbrowser specを追加したが未実行。

## Round 72: オンライン再接続先をregionとして識別

保存済みオンライン対局の再接続UIはタイトル上に現れるが、見出しとランドマークがなく画面リーダーの領域移動で識別しづらかった。セクションへ「中断したオンライン対局」のアクセシブル名を与え、表示上は従来のコンパクトな説明と操作だけを保つ。長文320pxテストでregion名も確認するが、実際のスクリーンリーダーでの読み上げ確認は後段に残る。

## Round 73: 終盤の横スクロール列に位置の手掛かりを残す

カード種類が増えた対局では上/下席の横スクロール列を使うが、短い横画面ではスクロールバーを隠しており、続きがあることを視覚的に示しにくかった。列を近接スナップさせてカード単位で止まりやすくし、細いスクロールバーを残す。カードとランドマークのキーボードフォーカスを明確な輪郭で囲い、高コントラストでは黄色へ切り替える。中盤/終盤の既存browser specにスナップとフォーカス輪郭の確認を追加したが未実行。

## Round 74: 通常画面の施設アートを拡大

カードの役割と読みやすさを整えた後も、通常の縦画面・PCでは所有カードの施設アートが46px、市場カードが48pxで、名前や数値に対して絵の面積が小さかった。通常表示を56pxへ広げ、短い横画面用の既存上限は維持する。縦320/390pxとPCで所有/市場アートの寸法を確認するbrowser assertionを調整したが、密度と視覚バランスの目視確認は未実施。

## Round 75: 全幅対局にsafe-area余白を戻す

カードボードの全幅盤面は画面端に寄る一方、対局中にbodyのpaddingをゼロにしていたため、ノッチやジェスチャーバーのある端末で操作UIの安全余白を失い得た。画面背景と盤面幅は維持し、ゲーム画面の内側paddingへ各safe-area insetの最小値を反映する。PWAバナー表示時の下端余白にも同じ下限を適用する。ブラウザの標準viewportだけでは物理ノッチ環境を再現できないため、実機確認は未実施。

## Round 76: 市場のランドマーク候補にも施設アートを表示

所有後のランドマークタイルには絵がある一方、市場の建設候補は文字と価格だけで、購入前後に見た目がつながっていなかった。市場にも共通のランドマークアートを表示し、既存の購入可否・詳細ボタン・価格を維持する。横並び候補と展開時のグリッド双方でアート高を確保し、全4 viewportのbrowser specで候補アートを開いて寸法確認するが未実行。

## Round 77: にぎわい広場にも全プレイヤー施設比較を追加

10人戦では選択した少数の街だけを大きく表示するため、購入候補を相手全員の所有数と照らし合わせるには席を切り替える必要があった。既存のにぎわい広場用比較表をカード盤面からも開けるようにし、名前付きモーダルとして扱い、Escape操作で起動ボタンへフォーカスを戻す。比較は表示状態だけを変え、ゲーム状態には触れない。390pxの10人戦で全席列数、横スクロール、フォーカス復帰、状態不変を確認するブラウザ検査を追加した。自動検査・画面撮影・目視レビューは後段でまとめて実施する。

## Round 78: 施設比較に未建設の購入候補も並べる

比較表は既存プレイヤーが1枚以上持っているカードだけを表示していたため、誰も買っていない候補の所有数が分からなかった。現在有効なカード種を出目順に並べ、未所有は各席0枚と表示する。既存施設の行には出目も添え、購入価格は市場側で確認する流れを保つ。10人ブラウザ検査に全席の0枚表示を加えた。実行とレイアウト目視は最後の一括検証に回す。

## Round 79: 施設比較表で自分と手番を追跡

席数が多い比較表は名前と数だけでは自分の列や現在手番を見失いやすい。列見出しへ「あなた」「手番」を示し、比較カードのセルにも自分の列を淡く塗り、手番列を輪郭で強調する。高コントラスト時は黒白と黄色へ置き換える。施設数やゲーム状態は変更しない。10人ブラウザ検査に自分/手番見出しの確認を加えたが、実行と目視はまとめて行う。

## Round 80: 多人数比較で長い名前の列幅を制限

オンライン対戦では長い表示名が比較表の列幅を押し広げ、10人分の横スクロール量を大きくし得る。比較表上は名前を省略表示し、完全な名前はDOMのテキストとtitleに残して列幅の上限を設ける。390pxの10人ブラウザ検査に長い名前と列幅の確認を足した。スクリーンリーダー/実ブラウザでの確認は一括レビュー時に行う。

## Round 81: 施設比較の背面操作を遮断

比較画面は`aria-modal`とフォーカストラップを持つ一方、カード盤面テーマでは暗い影の外側が実際にはクリック可能だった。比較を全画面レイヤーと中のスクロール可能パネルへ分け、余白クリックは背面へ通さず閉じる操作として扱う。夕暮れの広場も同じ全画面構造にし、safe area内にパネルを収める。テーマ切替や勝利時は比較を閉じ、PWA通知がモーダルの前面へ割り込まないよう一時的に隠す。ブラウザ検査には背景クリック・テーマ切替で閉じ、フォーカスとゲーム状態を保つ確認を追加したが未実行。

## Round 82: テーマ切替後のフォーカス先を選び直す

比較中にクラシック/夕暮れの街へ切り替えると、そのテーマには施設比較トグルがなく、隠れた操作へフォーカスを返す可能性があった。切替先がにぎわい広場/夕暮れの広場なら表示中の比較トグル、それ以外は表示中のテーマ選択へ戻す。夕暮れの広場へ切り替えた後のフォーカス先をbrowser specに加えたが未実行。

## Round 83: 10人戦の収支演出をロスターへ接続

多人数カード盤面は詳細席を最大3つだけ描画するため、残りの席が支払元/受取先の場合にWAAPI移動演出の端点がなく、文字summaryだけに落ちていた。詳細席が見つからない場合はロスター席を端点に使い、横スクロール外や盤面外の座標を盤面端へクランプして、画面外へ消える移動を防ぐ。Reduced Motionでは既存通り静的な経路summaryだけを使う。非表示席からの移動方向をfake DOMで確認するunit testを追加したが未実行。

## Round 84: 発動カードへ短い視覚アクセント

出目確定後は発動カードを輪郭で識別できるが、他の収支演出と並行したときに視線を誘導する変化が弱かった。発動カードだけに760msの短い輪郭パルスを付け、既存のReduced Motion全体設定で抑止する。出目演出のブラウザ確認へカードのanimation-name確認を足したが未実行。

## Round 85: 新しい施設カードの登場を街上で示す

施設購入は街のカードを置き換えるだけで、ランドマーク完成に比べて建設した実感が弱かった。ログが同じ対局・同じ手番で安全に追記されたときだけ新規カード建設行を検出し、購入した施設カードを860msで登場させる。ログ全件の複製を避けて直近4行だけを照合する。Undo/復元・再接続・別テーマ中の建設・Reduced Motionでは過去の登場演出を出さない。購入とUndoを含む既存browser specに演出クラス確認を足したが未実行。

## Round 86: 出目後に発動施設を盤面内へ導く

カードが横スクロール外にあると発動輪郭パルスが見えず、レシートと残高だけを追ってカード連鎖を把握しにくかった。新しい出目を確認した描画に限り、表示中の各プレイヤー列で最初に発動したカードをスクロール領域へ収める。発動していない席や通常の再描画では利用者のスクロール位置を保ち、復元・Undo時の過去イベントも追いかけない。新設カードの表示にも同じ境界計算を共用した。ブラウザでの複数発動・スクロール位置・テーマ切替確認は最終検証に回す。

## Round 87: 保存データの再開先を手番名で識別

保存世代の選択肢は「最新」「1回前」の順序情報だけなので、複数世代から戻す際に進行内容を見分ける手掛かりが少なかった。保存状態のプレイヤー配列と有効な現在プレイヤーindexがある場合、既存の市場・人数・ターン要約に次の手番プレイヤー名を追加する。古い形式や不正なindexでは従来の表示を保つ。表示先はtextContentなので名前をHTMLとして解釈しない。表示確認はタイトルの保存世代切替を含む最終ブラウザ確認に回す。

## Round 88: 複数のコイン移動を順に読み取れるようにする

複数の相手間で収支が起きた時、最大8本のコイン表示が同時に動いて出発点と到着点を追いにくかった。ログ順を保ったまま各移動の開始を70msずつ短くずらし、最後の移動も約1.4秒で終わる範囲に収める。Reduced Motionは引き続き静止した送金一覧を表示する。既存transfer unit testにdelay順の期待値を加えたが、未実行。

## Round 89: 市場を盤面から独立して大きく閲覧

短い中央領域では施設カードのアートや効果を市場横断で見比べにくかった。にぎわい広場の共有市場を複製せず、同じDOMをsafe area対応のネイティブモーダルダイアログへ一時移動し、広いカードグリッドで閲覧・購入できるようにする。ブラウザ標準のモーダルフォーカス制御とEscapeを使い、戻るボタン・背景クリック・テーマ切替・画面離脱・勝利で市場を元の場所へ戻す。起動ボタンの`aria-expanded`は開閉時と市場再描画時に同期する。市場の在庫、フィルタ、ルール状態は変えない。スマホ/横画面/PCでの目視、フォーカス、購入後の市場状態確認は未実施。

## Round 90: 購入後も拡大市場内で次の操作へ進む

市場を拡大して購入した際、買い切ったカードのボタンが再描画で無効になると、フォーカスを同じDOMへ戻せずモーダル内の操作位置を失う可能性があった。購入ボタンが消失/無効化した時は、同じ種類の次の有効な建設ボタンへ移り、それもなければ拡大市場内の「盤面へ戻る」へフォーカスを保つ。購入後もモーダルが開き、市場・所有施設が共通状態で更新されるbrowser assertionを追加したが未実行。

## Round 91: 0コイン経路で送金演出を待たせない

送金表示をログ順にずらす際、0コインや端点のない経路もdelay番号に含めていたため、実際に動くコインが1本でも後ろの順番なら不必要な開始待ちが出る。再生可能な経路だけを連番にし、演出なし経路の後でも最初の実移動は即時に開始する。回帰unit assertionは追加したが未実行。

## Round 92: PWAに改善後の画面資産を確実に配布

今回変更したindex/CSS/JSはService Workerの静的キャッシュ対象に含まれていたが、キャッシュ世代番号が同じままだと更新済みアプリを確実に取得できない。Service Workerのキャッシュ名をv141へ進め、配布時に既存v140キャッシュを入れ替える。PWA更新プロンプトと実際のreload確認は一括検証に残す。

## Round 93: 長い保存手番名によるタイトル幅の破綻を防ぐ

再開欄へ手番プレイヤー名を追加したため、空白のない長い名前が市場/ターン情報の1行幅を押し広げる可能性があった。保存概要のflex子要素へ`min-width:0`と`overflow-wrap:anywhere`を設定し、320pxのタイトルで長い手番名を再開情報に出すbrowser assertionを追加した。実ブラウザ測定と撮影は未実施。

## Round 94: 建設不可の手番でも市場施設を詳細確認

建設フェーズ以外に拡大市場を開くと購入ボタンは無効だが、施設詳細は引き続き読める。初期フォーカスを有効な購入ボタン、次に詳細ボタン、最後に閉じる操作の順で選び、詳細閲覧の入口を逃さないようにする。通常の初期手番で最初の詳細ボタンへフォーカスするbrowser assertionを加えたが未実行。

## Round 95: Reduced Motionでも新設カードを静的に強調

動きを抑える設定では建設カードの到着演出クラス自体を付けず、視線が購入先へ移ったことを輪郭で示せなかった。カードを自動表示した後、標準設定では既存の短い到着演出、Reduced Motionでは約1.2秒の静的な内側輪郭を使う。高コントラストでは黄色輪郭へ切り替え、タイマー・animationend・画面離脱時にクラスとlistenerを解除する。Reduced Motion購入時のブラウザassertionを追加したが未実行。

## Round 96: 横画面の上下席でも手番を文字で識別

横画面の省スペース表示で上下席の手番ラベルが1pxへ縮小され、現在手番が枠色だけに頼っていた。現在手番の席だけ短い「手番」バッジをHUDへ戻し、非手番席は従来どおり省スペースに保つ。844×390のブラウザ確認へ表示内容と幅のassertionを追加したが未実行。

## Round 97: 横画面カードの重複レイアウト指定を整理

上下席カードの横画面CSSに、後続のカード全体グリッドで上書きされる旧flex配置・旧アート高さ指定が残っていた。重複宣言を削除し、通常カードと発動/休業情報付きカードで実際に使うグリッド定義を一箇所に追いやすくした。見た目の意図は維持し、レイアウト挙動の最終確認は一括ブラウザ確認で行う。

## Round 98: 再接続エラーから内部用語を除く

参加者同士で異なる保存時点を提出した場合の「世代不一致」は内部実装用語で、ユーザーが次に何をすべきか分かりにくかった。保存データが残っていることと、全員が同じ対局データを選び直すことを短いエラー案内へ明示し、ホストレス復元と共通エラー文言を揃えた。既存の分岐 assertion の期待文も合わせたが、関連テストは未実行。

## Round 99: 通常盤面の施設アートを大きく表示

広い通常盤面でも施設アートの高さが56pxに留まり、カード名・分類情報に比べて絵の比重が弱かった。通常カードの共通アート領域を64pxに広げる。横持ち上下席には個別の密度制約があるため、そのコンパクト配置は保つ。狭い端末で終盤のカードが収まるかを含め、実画面の確認は一括レビューで行う。

## Round 100: ランドマーク名を2行で読めるようにする

ランドマークボタンでは長い名前が一行の省略記号に置き換わり、盤面上で候補を見分けにくかった。アートと名前/状態を分離したコピー領域を作り、名前は2行まで折り返して状態表示を残す。横持ちではカード幅を維持しつつ文字を少し縮める。描画マークアップの回帰assertionを追加したが、ブラウザでの実幅確認は一括レビュー時に行う。

## Round 101: にぎわい広場のカード詳細に施設アートを表示

にぎわい広場のカード詳細モーダルは、他の新しい表示テーマと違って施設アートを省略していた。共有の施設アート描画器を詳細画面にも接続し、既存の色分類・効果・サイコロ表示を保ったまま、施設とランドマークの拡大イラストを加える。SVGアートは既存の夕暮れ系詳細表示と同じアセットを使い、画面テーマ専用のゲームロジックは追加しない。pure/browser assertionを追加したが未実行。

## Round 102: 詳細モーダルをにぎわい広場の盤面色へ統一

拡大アートを表示すると汎用の濃紺モーダルに切り替わり、紙色のカード卓から別アプリのように見えていた。カード詳細だけを盤面と同じ紙色・深緑文字・金色アクセントへ揃え、背景幕・閉じるボタン・費用/効果パネルも同じ配色にする。他テーマの共通モーダルには影響させない。実画面確認は一括レビュー時に行う。

## Round 103: カード詳細の高コントラストを保護

詳細モーダルへ紙色テーマを追加したため、高コントラスト設定でもカード卓の配色が残る可能性があった。高コントラスト時は詳細の面を黒、文字を白、閉じる操作の輪郭を黄色へ明示的に戻し、browser assertionを追加する。実画面でのキーボード操作と支援機能確認は一括レビューに残す。

## Round 104: ランドマークの詳細操作を読み上げる

ランドマークカードはクリックで詳細を開くが、スクリーンリーダーには名前と状態だけで操作結果が伝わりにくかった。各ボタンのaccessible nameへ「詳細を表示」を加え、視覚上のレイアウトは増やさず操作目的を伝える。ユニット回帰assertionを追加したが未実行。

## Round 105: 連鎖した施設発動回数を結果欄へ表示

出目後の短い結果欄には代表的な収支経路しか出ず、詳細を開くまで施設が何回連鎖したか分からなかった。詳細内訳は維持しつつ、結果欄の先頭へ集計済みの施設発動回数を置く。個別の発動回数も含めて合計し、複数施設の稼働規模をすぐ把握できるようにする。ブラウザ回帰assertionを追加したが未実行。

## Round 106: 出目の確定結果を読み上げる

にぎわい広場の結果レシートは意図的に`aria-live="off"`のため、出目や収支が更新されてもスクリーンリーダーへ伝わらなかった。新しい解決ログが届いた時だけ、専用の既存ライブ領域へ手番プレイヤー・出目・施設発動回数・代表収支経路を短く知らせる。復元やUndoの過去ログは`takeResultLogs()`の既存ガードで再通知しない。結果読み上げのブラウザ確認を追加したが未実行。

## Round 107: 横持ち左右席の施設カードを広げる

左右席カードは幅を取れるのに48pxの高さへ押し込み、施設アートと名前が小さく空白も多かった。横画面の左右カードを64px以上へ広げ、アート28px・出目/名前/所有数を拡大し、発動/休業情報は追加行で保持する。844×390のブラウザ確認に左右席のアート/名前assertionを加えたが未実行。

## Round 108: 席色を盤面と一覧で共有

多数人戦では名前と残高以外にプレイヤーごとの視覚的な識別がなく、視線をカード列とロスターの間で移す際に席を追いにくかった。席番号に固定した10色のアクセントをプレイヤー盤面とロスターの縁へ同時に適用し、自分/手番の青・金表示と重なる場合も席色の縁を残す。色だけに頼らない席番号・名前・自分/手番ラベルは維持し、高コントラスト時は白縁へ置換する。4人戦での色差assertionを追加したが未実行。

## Round 109: 公式品質基準を再確認

公式商品ページではダウンロード版をオフライン1〜4名・オンライン2〜4名・約30分の対局として案内しているため、最優先UIは4人までの読み取りやすさ、短い判断導線、イベント結果の即時理解に置く。[公式商品ページ](https://m-machikoro.g-rounding.com/) [Steamストア](https://store.steampowered.com/app/1969860/MACHI_KORO_With_Everyone/?l=japanese)。この確認ではページ内の商品説明は読めたが、公式スクリーンショット画像本体は閲覧環境の取得キャッシュになく、レイアウトの直接比較は未実施。今後の最終レビューでは自作のブラウザ画像と公式表示を並べる確認を行い、未確認の視覚比較を完了扱いにしない。

## Round 110: 市場購入名に出目と在庫を含める

市場カードのボタンに明示的な`aria-label`があるため、内部の出目・在庫テキストがスクリーンリーダーから隠れ、価格と効果だけで建設を判断する状態だった。ボタン名へ施設名、発動出目、価格、残り枚数、効果の順で含め、在庫切れの無効ボタンも0枚と読み上げる。市場描画のユニットassertionを追加したが未実行。

## Round 111: 短い横画面で上下席のカードを広げる

844×390px級の横画面では、4方向に全プレイヤーの街を固定表示すると、中央の市場・ダイス操作と各席のカードアートが共に窮屈になる。2〜4人戦では盤面構造を上部の席ロスター、左側の選択プレイヤーの大きな街、右側のダイス/収益/市場レーンへ組み替える。席ロスターには全員の残高・目標進捗・カード色別枚数を保ち、タップで表示する街を切り替え、手番が移ると現在手番の街へ自動フォーカスする。選択された街では104px以上のカード幅と64pxのアートを使い、全施設とランドマークをスクロールで確認できる。実ブラウザでの2〜4人戦と操作確認は後段の一括検証に回す。

## Round 112: にぎわい広場の共通ダイアログを盤面色へ統一

カード詳細と市場は紙色・深緑の盤面に合わせていたが、ルール説明、カード/ランドマーク選択、確認ダイアログ、ホットシート交代画面、特殊効果の選択レイヤー、クラッシュ復旧画面は共通の濃紺UIのままだった。これらの外枠・見出し・本文・選択状態を盤面と同じ紙/草色の配色へ揃え、カード選択の補助文や無効状態の文字も明るい面上で読める色へ変更。カード詳細の既存デザインは維持し、高コントラストでは白黒と黄色へ切り替える。実画面確認は後段の一括レビューに含める。

## Round 113: タイトルと部屋設定をカード卓テーマへ接続

にぎわい広場を選んだ状態でもタイトル背景・設定タブ・ロビー要約が従来の夜景/濃紺配色を保ち、対局開始時に世界観が切り替わっていた。タイトルを緑の広場背景へ切り替え、ブランド面、タブ、テーマ/プレイヤー選択、クイック対戦、ローカル設定、保存再開、ルームコード、準備状況、ホスト操作を紙色・深緑・金のパレットへ統一してカード卓ロゴを表示。幅380px以下ではブランドマークと見出しを縮めて横はみ出しを防ぎ、既存の縦積みとsafe-area余白を維持。高コントラストモードではテーマ配色を上書きしない。ブラウザでのタイトル/保存/オンライン待機室の実画面確認は後段で行う。

## Round 114: PWA通知をカード卓テーマへ統一

PWAインストール/更新通知だけが濃紺の狭いバナーのまま残り、紙色のタイトルやカード卓から浮いていた。両通知を紙色の面・深緑文字・緑の主操作へ揃え、広い画面では最大幅760pxとして本文と操作の間隔を確保。狭幅用の既存1列配置、44px操作領域、safe-area位置、高コントラスト配色は維持する。タイトル/対局中それぞれの重なりと更新操作は後段のブラウザ確認で評価する。

## Round 115: 2〜4人の短い横画面を選択プレイヤー中心へ再構成

ランドマークカードにも同じhover/押下応答を適用し、建設完了アニメーション中はhover変形を抑制して達成演出を優先する。

施設カードにはマウスhover時の小さな浮き上がりと押下時の短い沈み込みを追加する。hoverは実際にhover可能な端末に限定し、タッチ端末で状態が張り付かないようにする。アニメーションは動作を待たせず、Reduced Motion設定で共通のスタイル規則から抑制する。

街を手動/自動で切り替えた時は160msの短いフェードを付け、選択先を視線で追いやすくする。OSまたはアプリのReduced Motion設定では既存の共通ルールでアニメーションを無効化する。

縦持ち320/390pxでも同じ2〜4人のフォーカス方式を適用する。席ロスターは2列、選択した街は高さ44dvhまでのカードスクロール領域、操作レーンはその後に続ける。横持ちと共通の席選択/ターン追従状態を使い、重複したゲーム状態を持たない。実ブラウザの縦持ち2〜4人戦確認は後段に残す。

画面高390pxで上下カードを単純に広げると、市場・出目・手番操作が中央レーンから押し出され、盤面全体が縦スクロールになってしまう。そこで2〜4人戦の横画面では4方向固定配置をやめ、全員のコイン/目標/色別施設数が並ぶ席ロスターと、選択プレイヤーの大きな街、ダイス・収益・市場の操作レーンに再構成する。ロスター選択で街を切り替え、ターンが移ると現在手番へ自動フォーカスする。表示モード専用のUI状態のみを追加し、ゲーム状態・ルール・オンライン同期には触れない。実ブラウザで2/3/4人の対局操作と施設増加後のスクロールを確認する工程は後段に残す。

## Round 116: 非表示の街で起きた施設発動をロスターから追えるようにする

選択プレイヤーを大きく見せる盤面では、他の街の施設が連鎖発動してもカード自体は画面外になりうる。現在ターンの構造化イベント投影から所有者ごとの発動回数を集計し、該当ロスター席に「施設 n回」と金色の視覚強調を表示する。ロスターを押せば従来通りその街へ切り替わるため、ゲーム状態やイベント再生は変えない。復帰時の古い動きを自動再生せず、視覚表示の静的な記録として扱う。実画面での見え方は後段の一括ブラウザ確認に含める。

## Round 117: コイン移動の方向を飛ぶ表示でも識別

収益のレシートには送金元・受取先が出る一方、盤面上を移動するコイン自体は金額だけだった。銀行からの獲得は「＋」、銀行への支払いは「−」、プレイヤー間移動は「↔」と色を分け、移動先まで追わなくても大まかな方向が分かるようにする。詳細な送金先は既存のライブ要約とレシートに残す。Reduced Motionでは従来どおり軌道アニメーションを行わず、強コントラスト配色も追加。アニメーションと各テーマの実表示確認は一括検証で行う。

## Round 118: 連鎖発動の要約に相手の施設も含める

短い常時表示レシートは手番プレイヤーが関わった発動だけを抜き出していたため、相手の赤/青施設を経由する連鎖が要約から欠けていた。全プレイヤーの施設発動をログ順に最大3件まで示し、所有者が構造化イベントで確定できる場合は席番号と施設名を併記する。複数の送金先へ分かれる同一発動は要約の回数に重複計上せず、送金経路の全件は詳細内訳に残す。銀行との収支は＋/−、プレイヤー間の移動は→で示す。実際の狭幅での収まりは一括ブラウザ確認で評価する。

## Round 119: 送金経路数と施設発動回数を分離

同じ施設発動から複数人へコインを送る場合、経路ごとのレコード数をそのまま発動回数として足すとロスターとレシートが過大表示になる。構造化された発動IDごとに最大の繰り返し数を一度だけ数える。旧形式ログは所有者と共通発動IDを持たないため、経路ごとの記録として表示し、発動回数へ推定加算しない。詳細の送金経路数と発動回数は分けて扱う。回帰ケースの実行は最後の一括テストに回す。

## Round 120: にぎわい広場の勝利画面で完成した街を主役にする

勝利画面は共通の暗色パネルが中心で、にぎわい広場の紙/草色の盤面とつながりにくかった。勝者名・達成情報・最終コイン・再戦操作を保ったまま、カード卓の紙色と深緑/金へ揃え、既存の街アートを区画道路付きの大きな完成風景として再配置する。ランドマークと施設の絵は共有アートを再利用し、ゲームルールや勝利判定には触れない。短い演出を加えるがReduced Motionでは停止し、高コントラストでは白黒表示とする。縦横の実ブラウザ表示、操作、長いプレイヤー名での確認は最終一括レビューに残す。

最終コイン表と折りたたみ式の対戦レビューも同じ紙色・緑系の面へ揃える。勝利時の施設登場演出はアプリ内Reduced Motion設定に加え、OSの`prefers-reduced-motion`にも従う。高コントラスト時は装飾背景と道路線を外し、街と勝利情報の境界を明確にする。

## Round 121: にぎわい広場でCPU/オンラインの建設音を補う

人間が同じ端末で建設した時は既存の操作処理が音を鳴らすが、にぎわい広場ではCPUやオンライン相手の施設/ランドマーク完成時に視覚演出だけだった。盤面側で新規建設を一度だけ検出し、非勝利時にCPUまたは自分以外のオンライン席の建設なら既存のbuild音を鳴らす。自分のオンライン建設は操作処理側の音だけにし、勝利手では勝利音を優先する。音量/効果音設定は共通の`playSound`を通して保つ。再接続・Undo・テーマ切替の誤再生確認は一括検証に含める。

## Round 122: 5〜10人戦の小画面もロスター＋街フォーカスへ

5〜10人戦では短い画面でも3つの街を同時表示していたため、2〜4人向けに改善したカードの大きさと操作レーンを使えていなかった。小画面では選択席の街を1つ大きく表示し、全員の席ロスターは横スクロールで残高/目標を確認できる形へ拡張する。席カードのスナップ位置と細いスクロールバーで横操作を示し、現在手番の席がロスター外にある場合は手番移動時にそこまでスクロールして見失わないようにする。長い名前はボタンの読み上げ名とホバータイトルで全文を参照できる。高コントラストではスクロール表示も白黒へ切り替える。通常の広い画面の既存複数席表示とゲーム状態は変えない。320/390px縦、844×390横、5人/10人のブラウザ操作確認は最終一括レビューで行う。

## Round 123: 保存データを再開前に見分ける

中断ゲーム欄は市場・人数・ターン・手番だけで、対戦相手や保存時点の進行度を判別しにくかった。保存状態から参加者名、手番プレイヤーのコイン/施設数/有効ランドマーク進捗を要約し、5人以上では参加者名を先頭3人＋残人数に抑える。古い保存に有効ランドマーク一覧がなければ誤った目標分母を作らず、建設済み件数だけ示す。世代選択・再開・削除操作すべてに保存概要を説明テキストとして関連付け、世代変更や読込エラーはライブステータスで通知する。オンライン状態や復元データ自体は変更しない。世代選択・長い名前・壊れた保存の画面確認と回帰テストは一括検証で行う。

## Round 124: OSの動き低減設定を全テーマのCSS演出へ適用

勝利トロフィーの浮遊、プレイヤー強調、カード遷移など、OSが動きの低減を要求しても残るCSSアニメーションがあった。既存のアプリ設定と同等の短縮ルールを`prefers-reduced-motion: reduce`にも適用し、各テーマの装飾的な全体CSS演出を抑制する。ダイス/コインのWeb Animations APIと紙吹雪は既存のJS側判定を使う。見た目の状態説明は個別CSSの静的強調に残す。OS設定の4テーマ確認は最終ブラウザレビューに含める。

## Round 125: 出目結果の読み上げでも施設名と送金元を知らせる

スクリーンリーダー向け結果通知は施設発動回数と送金経路だけで、どのカードが発動したかが抜けていた。また一つの構造化発動から複数の受取先へ送金すると、経路数を発動回数として重複計上していた。通知では発動IDごとに一度数え、所有者が確定していれば席名と施設名、代表送金では施設名・送金元・送金先・金額を伝える。旧ログは推定回数にせず記録件数として読む。聴覚読み上げの回帰確認は一括テストへ回す。

## Round 126: にぎわい広場のタイトルに既存の街アートを接続

にぎわい広場はタイトルでも夜景キャンバスを隠していたため、対局前後でブランドの連続性が途切れていた。既存の夕暮れの街アートを、カード卓の紙・芝パレットに合う細いシーンパネルとして表示し、画面端まで続くタイトル背景と中央の操作UIの役割を保つ。狭い画面では高さを抑え、画面内の設定導線を押し下げすぎない。高コントラストでは白黒の境界と文字を明示する。画像の実寸・トリミング・各画面幅での確認は最終一括ブラウザレビューで行う。

## Round 127: Undo後のイベント領収書を最新ログから再投影

にぎわい広場は同じゲーム管理インスタンスのログから結果をキャッシュしていたため、同じ長さのログをUndo/復元で書き換えたとき、手番境界と今回の出目・収支が古いまま残る可能性があった。描画ごとに履歴末尾から最新のターン境界を取り直し、UI側の二次キャッシュも外して、ルール状態や保存ログは変えずに表示を正本のログへ追従させる。同じ配列を同じ長さで書き換える回帰ケースを追加したが未実行。CPU連続ターン時の性能とUndo/再接続を含む操作確認は最終一括検証に残す。

## Round 128: 席ロスターの表示切替を初見にも伝える

カード盤面では席ロスターのタップで大きな街表示を切り替えるが、その操作説明が省スペースのため隠され、初見では席ボタンが情報表示か選択操作か分かりづらかった。ロスターの直前へ短い説明を表示し、ナビゲーション名にも反映する。縦持ちは案内を表示し、低い横画面ではロスターの44pxレーンを圧迫しないよう案内だけを隠す。高コントラスト時の文字色も指定する。目視レイアウトと操作確認は最終一括ブラウザ確認に残す。

## Round 129: 中央市場の購入可否を読み上げで区別

市場の購入ボタンは名前・出目・価格・在庫・効果を読み上げる一方、狭い盤面で視覚的に省くカード色/分類を読み上げず、無効理由も一律に価格案内だけだった。読み上げ名へ色と分類を加え、資金不足、重複する紫施設、行動上の購入不可を区別する。通常の購入判定と市場在庫を変えず、既存の描画判定から理由を説明する。関連する文字列回帰assertionを追加したが未実行。

## Round 130: 建設できないカードを色以外でも識別

市場のカード色は分類を伝える一方、資金や手番の条件で選べないカードの状態も色の薄さだけに依存していた。購入可能カードは分類色の実線枠を保ち、購入不可は中立色の破線枠を加える。ランドマーク完成済みは既存の金色状態を維持し、未完成で建設不可のときだけ破線にする。市場の品揃えや共通購入判定は変更しない。高コントラストと狭いカード幅での見え方は最終ブラウザ確認に残す。

## Round 131: PC大画面でも街カードを主役にする

1000px以上の広い画面では従来の上/下/左/右配置が続き、上下席のカード画像と文字が他のスペースより小さいままだった。高さに余裕のあるPCでは全席の残高/手番/施設色を上部ロスターへまとめ、選択した街を大きなカード面、出目/市場/操作を隣のレーンへ分ける。席変更は表示だけを切り替え、ゲーム状態は変えない。2人戦・4人戦の実画面とカード寸法、状態不変性のブラウザ回帰を追加したが未実行。320/390px、844×390pxの既存ビューへの影響確認も最終一括レビューに残す。

## Round 132: PCオンライン時の通信欄と盤面高を協調

PCの盤面は画面高から固定58pxを引いていたため、オンライン通信欄が表示されると通信欄と盤面が合計で画面を超える可能性があった。大画面ではゲーム画面をビューポート高のフレックス列とし、手番、カード卓パレットに合わせた通信状態、残り高の盤面の順に積む。通信表示が出ても市場と街が利用できる高さを保持し、勝利画面のスクロールは既存挙動を使う。PWAバナー表示時にはゲーム領域を安全域込みで縮める。オンライン通信欄があるPC画面での重なり/画面下端のブラウザ確認を追加したが未実行。

## Round 133: オンライン建設の効果音を一度だけ再生

建設操作側は自分のオンライン建設が確定した時にも音を鳴らし、盤面側はオンライン建設を席に関係なく鳴らしていたため、にぎわい広場で二重再生され得た。盤面側の再生対象をCPU席または自分以外のオンライン席に限定し、自分の建設は操作音、勝利手は勝利音に任せる。受信側での相手建設とCPU建設の再生、Undo/再接続時の再生抑制は最終ブラウザ確認で見る。

## Round 134: 3〜4人戦でも手番席をロスター内へ追従

小さな画面では3〜4人戦の席ロスターも横スクロールするが、手番移動時の自動スクロールは5人以上に限定されていた。フォーカス盤面を使う2〜10人戦すべてで現在手番の席を見える位置へ移し、Reduced Motion時は瞬間移動にする。選択中の街・ゲーム状態は既存の手番更新だけで切り替える。3人/4人スマホの連続ターンと手動席選択を最終ブラウザ確認に含める。

## Round 135: 通信欄が不要な時はPC盤面の高さを使い切る

通信欄は実行時に`display: grid`で表示、`display: none`で非表示になるが、大画面用CSSが無条件に`display: grid !important`を指定し、未使用時にも空の欄と余白を盤面へ足していた。また専用テーマスタイルの表示条件が実際の`grid`状態と合っていなかった。可視状態だけを盤面列へ含め、テーマ/高コントラストの見た目も実際の表示状態へ合わせる。オンライン表示あり/なし両方の高さと重なりを一括ブラウザ確認に残す。

## Round 136: 横持ちスマホの市場一覧を3段へ拡張

844×390px向けの横持ちレイアウトはカード市場を高さ88pxの横長ツールバーに押し込み、選択肢を一覧で比べにくくしていた。市場領域を3段（132px）へ広げ、購入候補を複数行見渡せるようにする。フィルター/目標と拡大/Undoの44px操作領域は維持し、盤面に収まりきらない候補は市場内スクロールと拡大ダイアログで扱う。横持ちで街カード領域・操作・市場が互いに隠れないことを最終ブラウザ確認に含める。

## Round 137: プレイヤー間のコイン移動方向を矢印で示す

プレイヤー間の送金アニメーションは送金元から送金先へ一方向に移動する一方、コイン表示には双方向を連想させる`↔`を使っていた。銀行からの受取は`+`、銀行への支払いは`−`を維持し、プレイヤー間は移動方向を示す`→`にする。到着席と金額の把握は常時表示の送金概要でも補える。色・動き・Reduced Motion時の読み上げは変えない。

## Round 138: 送金サマリーが盤面を覆わないよう要約

複数プレイヤーへの送金と長いプレイヤー名が重なると、短時間表示のサマリーが盤面下部を大きく覆う可能性があった。目視行数を3経路までに抑え、それ以上は内訳を案内し、全経路名はライブ通知のアクセシブル名に残す。表示は3行相当に制限し、詳細な収支は既存の出目領収書で確認できる。大人数・長い名前・高コントラストでも隠れや読上げ欠落がないか最終確認する。

## Round 139: OSの動き低減時もランドマーク完成を視覚化

アプリ内の動き低減設定ではランドマーク完成に静的な輪郭を残すが、OSの`prefers-reduced-motion`だけを使う人には短いアニメーションを止めるだけで完成の強調が残らなかった。OS設定でも同じ金色の静的輪郭を表示する。通常設定の完成アニメーションやゲーム状態は変えず、アプリ内設定/OS設定/高コントラストの組合せを最終確認する。

## Round 140: ランドマーク完成の強調を演出終了後に解除

完成時のCSSアニメーションは`both`で最終フレームを保持する一方、ランドマークの演出クラスを外す終了処理がなかったため、完成カードが光ったまま残る可能性があった。カード建設と同様に`animationend`と短いタイマーの両方でクラスを解除し、Reduced Motionでイベントが発生しない場合もタイマーで静的強調を終える。Undo/復元/テーマ切替時には関連するタイマーとリスナーも破棄する。ブラウザ回帰へ演出後のクラス解除を加えたが未実行。

## Round 141: 施設比較ダイアログの入口を明示

[公式Steam製品ページ](https://store.steampowered.com/app/1969860/MACHI_KORO_With_Everyone/?l=japanese)の遊び方説明は、候補施設が限られる中で相手の所有施設を考慮して選ぶ点を戦略の中心に置いている。大きく表示した街と全員ロスターのほかに比較表も用意しているため、その入口が本当にダイアログを開くこと、比較対象が全員の施設カードであることを4テーマ共通のボタン名に付加する。画面上の短い「施設比較」ラベルとボタン動作は維持する。比較ダイアログのフォーカス移動、Escape、狭い幅での表スクロールは既存のブラウザ回帰で再確認する。

## Round 142: タイトルの縦持ち・横持ちを実ブラウザで確認

Playwrightの通常起動はTermux上のNodeが`android` platformとして検出されるため失敗した。代替としてローカルChromiumのheadless screenshotを使い、390×844と844×390のタイトルを目視した。両方で背景が左右端まで届き、操作パネルは画面内に収まる。横持ちではルール入口とクイック対戦が見え、ガイドは下側へ続くためページスクロールで読む構成になっている。これはブラウザ表示確認であり、タッチ操作や物理端末のsafe-area確認ではない。中断セーブあり、にぎわい広場の盤面、ゲーム途中の操作は一括ブラウザ検証で引き続き確認する。

## Round 143: にぎわい広場のガイドをスマホでは折りたたむ

390×844の実画面で、初心者ガイドが街の表示へ約120px重なり、序盤から盤面の見える面積を削っていた。縦持ちと高さ600px以下の横持ちでは、ガイド本文を44pxの開閉式へまとめ、必要な時に展開して読めるようにする。PCなど縦方向に余裕がある画面では従来の常時表示を保つ。開いた本文には最大42dvhを割り当ててスクロール可能にし、アクション欄より上へ置く。変更後にheadless Chromiumの390×844で初手画面と出目1の画面を表示・撮影し、折り畳みが44px、領収書と操作領域に重ならないこと、サイコロ操作後に収支レシートが盤面下へ現れることを確認した。物理端末の操作・safe-area確認と、横持ちの変更後画像確認は一括検証に残る。

## Round 144: 横持ちタイトルで中断対局の操作を見える位置へ

844×390で中断データがありPWAインストール案内が出たタイトルを確認すると、説明と保存選択が縦に続き、再開/削除操作が初期表示の下へ押し出されていた。短い横画面ではブランドヘッダーを詰め、中断情報と操作を2列にして初期画面で再開・削除へ届くようにする。参加者などの長い概要だけを独立スクロール可能にし、ボタン自体は見える領域に置く。変更後のheadless Chromium画像では、2列の保存欄、保存世代選択、再開・削除ボタンが表示され、縦スクロールを始める前に操作が見える。操作列の下端はタイトル表示領域の下端より6px上、画面下端のインストール案内より40px上だった。追加したブラウザ回帰では同じ境界を測る。Playwright実行と物理端末のinstall prompt状態での確認は一括検証に残る。

## Round 145: カード卓の横持ちで隠れたバナー余白と空の列を解消

844×390のカード卓で、install bannerはCSSで対局中に隠れるのに`pwa-banner-open`が残り、画面高262pxだけをゲームへ割り当てていた。さらに、座席がない場合の3列グリッド指定がフォーカス盤面にも適用され、選択中の街が93px幅、左右に空のレール、中央市場が38px高になっていた。対局中は隠れているinstall bannerをPWA余白状態の判定から除外し、更新バナーは引き続き余白対象とする。欠席席向けのグリッド補正を通常盤面だけへ限定する。変更後はheadless Chromiumで本番PWA controller経由のバナー状態更新を操作し、bodyの予約クラスが消え、盤面332px・街レーン約386px・市場140pxへ広がることを撮影確認した。Playwright回帰に余白解除と街幅の下限を加えたが、実行は一括テスト時に行う。

## Round 146: 横持ちの上部操作を短いラベルへ整理

修正後の844×390カード卓では、終了/ログ/施設比較に続くツール群に「画面デザイン」「ガイド設定」「対局データ・問題報告」の長い見出しが並び、小さい字で詰まっていた。狭い横持ちだけ、画面上は「画面」「ヒント」「データ」と短く表示し、詳細名は各summaryの`aria-label`で補う。44pxの押せる面積は維持する。画面ラベルの見た目とアクセシブル名は既存の横持ちブラウザ回帰に含めたが未実行。

## Round 147: 10人横持ち盤面の空白行を除去

10人戦を844×390で表示すると、空席向けの行補正がフォーカス盤面へ残り、上段に約235pxの空白を作って街/市場を79pxに押し下げていた。フォーカス盤面では空席向けの行補正を適用せず、ロスターの下へ選択中の街と市場を配置する。headless Chromiumで10席のロスター、10施設の街、市場を表示し、盤面332px、街レーン266pxで空白行が消えたことを確認。ブラウザ回帰には街レーンの最小高さと下端を加えたが未実行。

## Round 148: 縦持ち操作ドック案を実画面で評価

390×844の4人戦で市場表示中の手番操作へ届きやすくするため画面下固定ドックを試した。headless Chromium画像で初期表示の市場カードにドックが重なり、一覧を隠すことを確認した。固定ドックは採用せず、既存の通常フローに戻す。スクロール後も手番ボタンが市場より上に残るため、画面を覆う常時固定操作へ変える利点が小さい。画面遷移の長い終盤状態での操作位置は一括ブラウザ検証で再確認する。

## Round 149: 縦持ち市場の見出しと拡大操作を整理

390px幅では「中央市場」が44px列に押し込まれて二段に折れ、拡大ボタンが市場幅の大半を占めていた。縦持ちだけ市場ヘッダーを見出し+拡大+Undoの一列に戻し、見出しは一行、操作ボタンは内容に合わせた幅で44pxの高さを確保する。拡大ボタンはカード卓の紙/金色パレットに合わせる。市場カード一覧やフィルター操作は変更しない。headless Chromiumの390×844初期画面・市場位置の画像で一行見出し、52px幅の拡大操作、市場直前に残るサイコロボタンを確認した。ボタン色の変更、物理端末、追加幅は一括確認に残す。

## Round 150: 大きな受取額を収支アニメーションで目立たせる

プレイヤー間/銀行間のコイン移動は額にかかわらず同じ大きさだったため、まとまった収益も通常の精算に埋もれていた。受取側がある5コイン以上の経路だけを大収益として金色の枠・明るい背景・大きめの金額で示す。支払いだけの経路は強調せず、Reduced Motion時は従来どおりアニメーションを抑える。表示属性の境界と実ゲーム上の印象は一括ブラウザ確認に残す。

## Round 151: 広場テーマの収支レシートにも大収益を共有

前回の強調は移動アニメーションがあるカード卓だけに適用され、同じ出目レシートを表示する夕暮れの広場では収益の大小が伝わらなかった。共通レシートHTMLで受取先があり5コイン以上の経路に同じ`data-large`状態を付け、両テーマの既存色調を保ちながら金枠で目立たせる。受取と支払の境界を既存テストへ加えたが、実行は最後の一括テスト時に行う。

## Round 152: 横持ち市場を一列で横スワイプ可能にする

844×390の10人fixtureでは標準市場の44施設が描画される一方、スクロール領域は縦66pxで最初の1行しか見えず、スクロールしづらい小さな窓になっていた。短い横画面ではカードを220px幅の一列棚にして横方向へスナップし、薄いスクロールバーを表示する。市場拡大ダイアログは引き続き複数列表示。headless Chromium画像では38施設の棚が横幅8473px、表示幅275px、縦66pxで、先頭カードと次カードの端が見えた。既存のブラウザ回帰期待値を縦高から横スクロール幅/方向/カード数へ置き換えたが、実行は最後の一括確認に回す。

## Round 153: 横棚の続きを端のフェードで示す

短い横画面ではスクロールバーだけではカード棚の続きが見つけにくい端末があるため、横スクロール領域の右端を短くフェードさせ、次のカードが続くことを示す。操作対象やスクロール幅は変えず、高コントラスト設定ではマスクを外してカードの輪郭を保つ。変更後画像の端末差と高コントラスト表示は一括ブラウザ確認に残す。

## Round 154: 大収益施設そのものも盤面で強調

大きな収入はコイン移動ラベルと共通レシートで金色にしたが、所有街では発動カード全体に同じ通常強調が使われていた。確認済み純収支が5コイン以上の発動カードへ追加の金色輪郭と明るい発動ラベルを付け、支払側/負の純収支は通常表示に保つ。高コントラストでは黄色輪郭にし、動きを増やさず視覚的な爽快感を足す。受取/支払の境界assertionを追加したが一括テスト前で未実行。

## Round 155: 無効なゲーム操作の文字を読める濃さにする

共通の無効ボタンがopacity 0.3で、盤面/市場の出目条件選択や購入不可理由がほぼ読めなくなっていた。対局操作・市場・pending選択・モーダル内の無効ボタンをopacity .8と彩度低下で区別し、読める文字色を残す。高コントラストでは不透明な黒地・白文字・破線境界を全テーマ共通で使う。テーマ共通UIテストへ代表的な無効市場操作のCSS状態assertionを加えたが未実行。

## Round 156: 横画面の市場棚をキーボードで移動

短い横画面のカード市場は横スワイプと細いスクロールバーで移動できるが、キーボード利用者にはスクロール操作が見つけづらかった。施設一覧を名前付きフォーカス可能領域にし、フォーカス中の左右矢印でカード幅単位に送れるようにする。Reduced Motion時は滑らかな移動を止め、通常のテーマ・縦画面では既存の市場表示を変えない。横持ち棚のフォーカス輪郭も追加した。キーボード実操作とモーション設定は一括ブラウザ確認へ回す。

## Round 157: 10人横持ちで所有カードの行高を保つ

844×390pxの10人実画面では選択中プレイヤーの所有カードが縦につぶれ、イラスト・施設名・所有枚数が次の行と重なっていた。上段/下段席向けの均等行高が、拡大表示した街のカード一覧にも継承されていたため、選択中の街では各行をカード内容に合わせる。カード列自体のスクロールは維持し、多数の施設が画面を押し広げない。変更後に同じ10人ゲームfixtureをChromiumで再撮影し、カード3列それぞれの高さ132px、一覧の表示高152px/内容高544px、縦スクロールを確認した。カード情報は重ならず、2段目以降は一覧内で読める。市場の左右矢印もChromium入力で操作し、scrollLeftが1pxから224pxへ移動した。画像は[10人横持ち・修正後](../artifacts/design-review/round-157-cardboard-ten-landscape.png)に保存した。ブラウザfixtureであり、物理端末ではない。

## Round 158: 横画面の市場カードを比較しやすくする

10人横持ちの修正後画像では、市場フィルター/目標が縦列を占有し、カード棚が市場幅の一部に狭まっていた。横画面では4つの市場操作を一列にまとめ、施設棚を全幅に広げる。いったん幅260px/高さ78pxの一列棚にしたが、4人戦画像で下部に大きな空白が残り、画面上で比較できる施設数が少ないと分かった。そこで市場棚を2段の横送りグリッドに変更し、幅210pxのカードを4枚見渡せる構成へ調整。各カードは74px高、アート幅50pxとし、カード情報と候補数を両立する。カード拡大/Undo、フィルター、目標の操作は残し、ダイアログは既存の全件一覧を維持する。変更後の10人/4人・844×390実画面で市場は幅419px、高さ202pxとなり、154px高の棚に2段×2列を表示した。全38施設は一覧内横スクロールで維持（scrollWidth 4046px）し、左右矢印でも移動した。棚はサイコロ操作と重ならず、操作タイルは上段に並ぶ。[10人横持ち](../artifacts/design-review/round-158-cardboard-market-landscape.png)、[4人横持ち](../artifacts/design-review/round-158-cardboard-market-four-player-landscape.png)。Chromiumブラウザfixtureでの確認であり、物理端末ではない。

## Round 159: 市場操作の間に領域名を置く

2段棚へ変更後、フィルター/目標と市場拡大操作の間に大きな空きが生じ、何の領域かがタイトルだけでは直ちに分からなかった。横画面のその余白へ「中央市場」の見出しを置き、カード一覧と操作ボタンを一つの市場領域としてまとめる。高コントラストでも見出しを白で表示する。他の画面サイズでは既存のコンパクト表示を保つ。4人・844×390のChromium再撮影で見出しがボタンの間に水平配置され、2段カード棚やゲーム操作との重なりがないことを目視した。[4人戦の市場見出し](../artifacts/design-review/round-159-cardboard-market-title.png)。物理端末の確認ではない。

## Round 160: 10種類市場の状態と補充履歴を横画面に収める

標準市場の棚配置だけを確認していたため、任意ルールの10種類市場が出す在庫状況/補充履歴のDOMが、新しい明示グリッドで自動配置されて余分な行や重なりを作る可能性があった。10種類市場の状態を見出し位置へ収め、山札ゲージと短い補充履歴操作を表示する。履歴を開いた時は画面中央のスクロールパネルにし、更新可能な履歴全体を保つ。高コントラスト時は状態表示・ゲージ・履歴の文字色を白黒/黄色へ切り替える。844×390のChromium fixtureでは、ゲーム開始時に`GameSelectionState`から10種類市場を選び、実際に初期化された10施設/山札202枚を表示した。市場は419×202px、棚は419×154pxで、状態表示と10カード棚が上段/下段に収まる。さらに補充履歴1件をfixtureの供給状態へ設定して「履歴」を操作し、履歴が盤面を押し広げず中央360×65pxの固定パネル内に開くことを確認した。履歴1件自体は表示fixture用データで、実対局の補充操作を行った確認とは区別する。高コントラストへ切り替えたブラウザ画像でも、状態表示・山札ゲージ・履歴が白黒の面と白/黄色の文字で読める。[10種類市場・初期表示](../artifacts/design-review/round-160-cardboard-ten-type-market.png)、[補充履歴を開いた状態](../artifacts/design-review/round-160-cardboard-refill-history-open.png)、[高コントラスト表示](../artifacts/design-review/round-160-cardboard-ten-type-high-contrast.png)。Chromiumのブラウザfixtureで、物理端末ではない。

## Round 161: 横持ち市場のCSS配置指定を整理

短い横画面の市場は、過去の一列ツールバー/3行グリッドと、現在の全幅2段棚の両方のCSSが重なっており、後段ルールで前段を打ち消していた。現在使うグリッド、操作、カード寸法を横画面用ルールへ一本化し、上書きされていた古い列・行・絶対配置を取り除く。再撮影した10種類市場で通常表示と高コントラスト表示を見比べ、棚・操作・状態欄の位置が維持されることを確認した。標準市場の通常/横画面への回帰確認は一括ブラウザレビューに残す。

## Round 162: ゲーム内の動き低減設定を市場操作にも適用

市場棚の左右キー操作はOSの`prefers-reduced-motion`だけを参照していたため、ゲーム内の「動きを減らす」を個別設定した人には滑らかなスクロールが残っていた。街カードの自動移動や建設演出と共有している`reducedMotionEnabled()`判定へ統一し、どちらの設定経路でも矢印移動を即時化する。通常時の滑らかな移動は維持する。OS設定/アプリ設定それぞれで実際のscrollLeft変化と動作条件をブラウザ一括レビューに加える。

## Round 163: 320pxタイトル画面の再レビュー

現行CSSを320×844pxのChromium viewportで再撮影した。ロゴ/ルール、4タブ、クイックCPU対戦、同端末設定、折りたたみガイドが横書きで収まり、意図しない横はみ出しやボタンの押しつぶれは見られない。ガイドより下の内容はページスクロールで続く構成を維持する。[320pxタイトル](../artifacts/design-review/round-163-title-320-current.png)。Chromium viewportでの確認で、物理スマートフォンではない。

## Round 164: 市場カードに購入不足額を表示

市場カードは購入不可状態を破線で示し、読み上げラベルには理由があったが、画面上では価格だけが見え、所持コインとの差額は分からなかった。所持コイン不足時は施設/ランドマークの価格欄へ不足額と価格を併記し、既に所有して購入不可の紫施設は所有済みと価格を表示する。横画面の狭い価格欄では「不足額/価格」の短縮表示へ切り替え、通常のカード寸法と在庫表示を保つ。高コントラストでは不足額を黄色と下線で示し、読み上げラベルには理由とコイン単位を残す。各テーマの購入可否と高コントラスト表示は一括ブラウザ確認で再レビューする。

## Round 165: 発動施設数をプレイヤー一覧へ接続

ロスター側にはプレイヤー別の施設発動回数を表示する描画処理があったが、盤面描画から今回イベントを渡しておらず、実ゲームでは常に空表示になるデータ接続漏れを確認した。共通のターンイベント投影をロスターにも渡し、発動したプレイヤーの一覧カードに回数バッジ・強調枠・読み上げ情報が反映されるようにする。Undo/再接続で古いイベントが残らないこと、複数の送金経路を一施設発動として数えることは一括テスト/ブラウザ検証に回す。

## Round 166: にぎわい広場全体で動きを減らす設定を尊重

OSのReduced Motionは盤面全体を静止させる一方、アプリ内の「動きを減らす」設定は建設カードとランドマークの演出だけを止め、選択プレイヤー切替やトランジションを止めていなかった。設定クラスが有効な間は盤面と疑似要素のアニメーション/遷移/滑らかなスクロールを無効化し、建設完了カードには輪郭を残して状態変化を伝える。画面表示を更新し、実際の設定切替とOS設定の両方を一括ブラウザ確認で検証する。

## Round 167: 横画面の不足額と価格を短く表示

844×390の実画面で市場カードを撮影し、購入不足額と価格の説明文がカード内の価格欄に収まらず在庫表示へ重なる懸念を確認した。横画面だけ不足額と価格を単位付きで短縮し、詳しい文言はボタンの読み上げラベルへ残す。のちに1桁価格の撮影で末尾の単位が欠けるケースを見つけたため、価格欄を「不足Nコ」「価格Cコ」の2行に分ける表示へ修正した。Selenium/ChromiumのCSS viewport 844×390で通常価格と200コインの表示用ストレスfixtureを撮影し、幅88pxの価格枠内に金額・単位が収まり、在庫表示と区別できることを目視した。[横画面の市場価格表示](../artifacts/design-review/round-171-cardboard-market-status.png)、[200コイン表示fixture](../artifacts/design-review/round-171-cardboard-market-status-maximum-cost-fixture.png)。fixtureはブラウザ内の表示確認用で、ゲームルールの価格変更ではない。Chromium表示であり物理端末確認ではない。

## Round 168: 終盤の街カード一覧にスクロール位置を示す

10人横持ちの既存画像では、施設が増えた選択中プレイヤーの次のカード行が盤面下端に切れて見える一方、内側の縦スクロールが分かりづらかった。選択中の街カード一覧にテーマ色の細い縦横スクロールバーを出し、追加カードへ移動できる領域を示す。10人/16施設の844×390横持ちDOM実測ではカード一覧の表示高167→152px/内容高816pxとなり、縦スクロールが必要な密度を確認した。高コントラストでは白いバーと黒いレールへ変わる。再撮影で共通`playerNavigation`がロスターと重複して盤面下に58px残り、ゲーム画面全体が456px高になっていた。描画JSが同ナビへインラインで`display:flex`を設定していたため、カード卓ではCSSの`!important`でナビを抑止した。最終画面は`gameScreen`がビューポート全高390pxに収まり、documentのscrollHeight/scrollWidthも844×390px、共通ナビは非表示、施設一覧は816px内容を内側スクロールできる。通常と高コントラストを撮影し目視した。[10人横持ち](../artifacts/design-review/round-168-cardboard-ten-player-scroll.png)、[高コントラスト](../artifacts/design-review/round-168-cardboard-ten-player-scroll-high-contrast.png)。Selenium/Chromiumのブラウザ表示で、物理端末ではない。自動テストは未実行。

## Round 169: Undo/復元後に古い読み上げ結果を残さない

施設収支の結果は`turnStatusAnnouncer`へ読み上げられるが、同じ領域は手番交代/勝利の案内にも使われる。Undoや再接続で結果演出を無効化しても文章が残り、画面状態と読み上げ状態がずれる可能性があった。盤面が設定した結果文だけを記録し、フィードバック無効化時に現在も同じ文が残っている場合だけ消す。手番や勝利の案内が後から置き換わっていれば触らない。Undo・再接続・新しいロール・勝利案内の順序は一括テストで確認する。

## Round 170: 保存ゲームありのタイトル再開画面を再確認

保存ゲームなしのタイトル画像だけでは再開/削除UIとPWAバナーの重なりを評価できないため、CPU対戦を開始して実際の保存経路で中断データを作り、320×844と390×844のCSS viewportで撮影した。再開・削除は横並びの44px高で、320pxでも横はみ出しはなく、390pxでは再開ボタン228px/削除64pxを確保。保存データの市場/参加者/手番概要はカード内で折り返して表示され、同時に出ているPWAインストールバナーも再開操作へ重ならない。[320px](../artifacts/design-review/round-170-title-resume-320.png)、[390px](../artifacts/design-review/round-170-title-resume-390.png)。Selenium/Chromiumのブラウザ表示で、物理端末ではない。複数世代選択と復旧データの破損表示は別条件として一括レビューに残す。

## Round 171: 横画面市場価格の桁数上限を確認

横画面の価格表示を「不足額」「価格」の独立2行にし、単位まで欠けずに読めるようにした。CSS viewportをCDPで正確に844×390pxへ固定し、ブラウザ内fixtureで施設価格を200コイン、所持金を0にして表示限界を確認した。価格枠は88×37px、2行は各約9.9px高で枠内に収まり、在庫表示とも重ならず、documentも844×390px内だった。[200コイン表示fixture](../artifacts/design-review/round-171-cardboard-market-status-maximum-cost-fixture.png)。fixtureは表示だけの確認で価格やゲームルールは変更していない。Chromiumのブラウザ表示であり物理端末ではない。自動テストとPushはユーザー指示により後段へまとめる。

## Round 172: 横画面価格の文字を読みやすくする

最大桁表示の目視再レビューで、9pxは枠内に収まってもゲーム中に読むには小さいと判断した。価格2行を10pxへ上げて、844×390pxの実画面で200コインfixtureを再撮影。各行84px幅、10px高で価格枠内に収まり、最後の行と在庫の間に約0.9pxの隙間を確保した。11px案では在庫行と接触したため採用せず、10pxに留めた。[10px価格表示](../artifacts/design-review/round-172-cardboard-market-status-10px.png)。数値はCSS/DOM計測、物理スマートフォンではない。

## Round 173: 多人数ロスターで席番号を常に見せる

10人戦の844×390px画面では複数のCPUが「CPU（普通）」という似た名前になり、幅の狭いロスターで名前の先頭まで省略されるケースがあった。席番号とプレイヤー名を別要素に分け、名前が省略されても席番号を残す。ブラウザ表示で先頭5席すべてに「席1」〜「席5」が表示され、完全なプレイヤー名はtitle/aria-labelに維持されることを確認した。[10人ロスター](../artifacts/design-review/round-173-cardboard-ten-player-seat-identity.png)。

## Round 174: 短い横画面で進行状況を盤面外へ押し出さない

10人戦のCPU思考中に共通の通信/進行状況パネルが通常フローへ高さ42pxを追加し、390pxビューポートの盤面下へはみ出していた。カード卓の短い横画面では進行状況を上部HUD内の小さなステータス枠へ重ね、対局画面をビューポート高へ固定して盤面を確保する。プレイヤー席のロスター行は既存の横スクロール内で維持し、CPU思考中も現在の状態を表示する。CSS viewport 844×390pxの10人CPU対局で画面・文書とも844×390px、進行状況パネルはHUD内へ配置されることをDOM計測とスクリーンショットで確認した。[10人横画面・CPU処理中](../artifacts/design-review/round-174-cardboard-ten-player-height.png)。サーバー上の待機/再接続表示やPWAバナー併用、別幅の確認は最後の一括検証に残す。

## Round 175: デスクトップ勝利画面で街と再戦導線を同時に見せる

1440×900pxで勝利状態fixtureを撮影し、街の成長絵が縦積みになって再戦/結果操作が画面下へ流れていた。広いデスクトップでは勝者・順位・再戦操作を左列、街の完成アートを右列に並べ、対戦記録はその下へ続ける。ランドマーク6個の街を含むfixtureで、勝利画面・主要操作・街全体が1440×900px内に収まり、横はみ出しがないことを確認した。[カード卓の勝利画面](../artifacts/design-review/round-175-cardboard-winner-1440.png)。このfixtureはブラウザ内でランドマーク状態を完成扱いにして描画したレイアウト確認で、開始から勝利までの実対局検証ではない。物理端末ではない。

## Round 176: 横持ち勝利画面に再戦・共有操作を収める

844×390pxではデスクトップ用2列の条件に入らず、勝者の街・順位・操作が縦一列で約1200pxまで伸びていた。短い横画面では街の完成絵を右、勝者・4人の最終コイン・再戦・共有・タイトル戻りを左へ配置する。タイトルを一行に縮め、順位を2列へ組み、街アートの余白を詰めて、844×390pxのブラウザfixtureで再戦/共有/タイトル戻りが390pxの表示内に見えることを確認した。街絵は右列に保ち、記録など続きの内容だけページスクロールへ送る。[844×390横持ち勝利画面](../artifacts/design-review/round-176-cardboard-winner-844x390.png)。同じ勝利状態を390×844pxと320×844pxでも再撮影し、単列レイアウト、名前の自然な折り返し、画面幅を越えないことを確認した。[390×844](../artifacts/design-review/round-176-cardboard-winner-390x844.png)、[320×844](../artifacts/design-review/round-176-cardboard-winner-320x844.png)。勝利状態はブラウザfixtureで作成しており実対局ではない。高コントラスト表示は最後の一括画面レビューに残す。

## Round 177: 高コントラスト勝利画面でも街と操作を保つ

高コントラスト設定では勝利カードの色は黒白へ変わるものの、横持ち2列の配置条件が通常配色だけに限定されていた。1440×900pxと844×390pxの両方で順位/再戦・共有操作を左列、街の絵を右列へ配置し、黒背景・白枠・黄の勝者強調を維持する。844×390pxでは再戦・共有・タイトル戻りの各ボタンが画面内に収まり、1440×900pxでは対戦記録の開閉欄まで確認できた。[高コントラスト1440px](../artifacts/design-review/round-177-cardboard-winner-high-contrast-1440.png)、[高コントラスト横持ち](../artifacts/design-review/round-177-cardboard-winner-high-contrast-844x390.png)。CSS viewportのブラウザfixtureであり、物理端末/実対局ではない。

## Round 178: 狭い画面のオンライン対戦条件を読みやすくする

320px幅ではオンライン設定の折りたたみ概要が説明文・条件・開閉アイコンを一列に押し込んでいた。スマホ幅でタイトルと補足条件を上下2段にし、条件を11pxの左揃えで表示する。Selenium/ChromiumでCSS viewportを320×844px/390×844pxに固定し、概要の高さがそれぞれ89px/74pxとなること、条件文が折り返されても横はみ出しがないことを確認した。「ルームを作る」主要ボタンも両画面でviewport内に表示され、下部のPWAバナーと重ならない。[320px](../artifacts/design-review/round-178-online-320.png)、[390px](../artifacts/design-review/round-178-online-390.png)。ブラウザ表示であり物理端末ではない。

## Round 179: 320pxのオンライン参加フォームを確認

オンラインの「ルームに参加」へ切り替え、320×844pxのCSS viewportでルームID入力欄と参加ボタンを撮影した。ルームID欄は横幅273px、参加ボタンは274×44pxで、documentの幅は320pxのまま。PWAバナーより上に参加ボタンが表示される。画面確認のみで、実際のルーム参加やネットワーク接続は行っていない。[オンライン参加画面](../artifacts/design-review/round-179-online-join-320.png)。Chromiumブラウザ表示であり物理端末ではない。

## Round 180: コイン移動がない発動で重複ポップアップを出さない

0コインの施設発動は出目レシートに表示される一方、送金オーバーレイにも0コインの移動先が出て、実際に通貨が動いたように見える重複があった。残高が変わる経路だけ送金演出へ渡し、0コインの発動は既存の施設レシートに残す。復元イベントに参加者名がない場合は「undefined」ではなく席番号を表示する。途中復元でnull/不正な発動レコードや配列以外のactivation値が入っても描画処理が中断しないよう無視する。回帰assertionを更新したが、自動テストはユーザー指示により最後の一括実行まで保留。今回のコードレビュー修正は、出目・収支のブラウザ一括撮影時に画面でも確認する。

## Round 181: 共有レシートでも欠損したプレイヤー名を補う

送金アニメーションには席番号の代替表示を用意したが、全テーマで共有するイベントレシートはプレイヤー名の欠損時に空欄を描画していた。送金元/先を同じ席番号で表示するフォールバックを追加し、構造化発動イベントを使った回帰assertionを足した。自動テストと4テーマの実画面確認は最終一括実施まで保留。

## Round 182: 共通イベント投影でプレイヤー名を一度正規化

レシート側の個別fallbackだけでは、ロスター・送金・読み上げへ渡す元データの名前が不揃いなまま残る。ターンイベント投影で空名を席番号へ置き換え、手番名・送金残高・参加者名を同じ値から生成する。回帰assertionを追加したが未実行。対局内で表示名が空の保存状態を作るfixtureは、最終ブラウザ一括確認へ追加する。

## Round 183: カード卓のプレイヤーロスターに人/CPUの視覚的な区別を加える

任天堂の公式紹介画面では、カード卓のプレイヤーごとにキャラクター表示があり、手番/収益カードと合わせて誰の街が動いたかを追いやすい。[公式画面](https://www.nintendo.com/jp/topics/article/1408afb9-9061-4c0c-8a6a-816b5caeccde)。にぎわい広場のロスターは席色と名前が中心で、人間とCPUの違いが文字情報に寄っていた。夕暮れの街/広場で共用している人・CPU SVGアイコンとCPU難易度表示をロスターへ受け渡し、読み上げラベルにも種別を加える。ゲーム設定/ルール状態は参照のみで変更しない。10人の幅、長い名前、ハイコントラストは最後のブラウザ一括レビューで再確認する。

## Round 184: 横画面レシートの旧2段配置上書きを整理

短い横画面用レシートは最終表示を1段にしているのに、同じブレークポイント内に2段グリッド・2行の出目配置・収支行を表示する宣言が残り、直後に1段化で上書きされていた。最終の44px一段構成を最初の定義へ統合し、収支行の非表示も一度だけ指定する。詳細ボタンの配置範囲も実際の1行に合わせ、暗黙の余分なグリッド行を作らない。通常時の見た目は意図せず変えず、横持ちイベント画面の目視確認は最後の一括レビューに含める。

## Round 185: 選択中の大きな街にもプレイヤー種別を表示

プレイヤー一覧では人/CPUを区別できても、選択後に大きく表示する街の見出しには名前しかなく、ロスターから街へ視線を移すと所有者の種別が消えていた。ロスターと同じ共有設定・SVG描画を使い、拡大中の街にも人/CPUアイコンを表示し、読み上げ見出しには種別を残す。CPUレベルの短縮表示はロスターに限定し、街見出しの名前幅を確保する。画面幅・長い名前での実見え方は一括ブラウザレビューで確認する。

## Round 186: プレイヤー種別アイコンを席色へ結び付ける

共通の人/CPUアイコンを全プレイヤーで同じ色にすると、席番号やカード領域へ視線を移したとき同一プレイヤーの情報を追いにくい。ロスターと選択街のアイコン枠へ、各席に既に割り当てているアクセント色を適用する。識別用の色面は既存の白/黒コントラスト面を保つ。5〜10人分の色区別と高コントラストは一括画面レビューに残す。

## Round 187: カード卓が隠す共通プレイヤーUIの重複宣言を整理

にぎわい広場は独自ロスターを使うため、共通プレイヤー一覧と手番タイムラインを常に隠す。同じ要素を通常の`display:none`グループと後段の個別`!important`で重ねて定義していた。共通グループから外し、必要な優先度を保った一つのルールへ統合する。表示結果とゲーム処理は変えず、CSS内でどのテーマのどの部品が非表示なのか追いやすくする。

## Round 188: 名前が重複した復元ログでも現在手番の席を保持

ターンログ内の表示名が重複または欠損すると、イベント投影が発動者の席を`null`にし、カード連鎖の所有者情報を失う場合がある。ログ名で一意に解決できないときだけ、同じ投影へ渡された現在手番indexを使う。明確に一致する名前は従来どおり採用し、ゲーム状態は読み取り専用のまま。回帰assertionを追加したが未実行。空名/同名が保存された状態は最終ブラウザ確認で扱う。

## Round 189: 広場の視点切替を短いカメラ移動でつなぐ

街・市場・全体表示を切り替えると盤面変形が即時に変わり、焦点の移動先を視線で追いにくい。広場の表示専用カメラに260msの短い移動を追加し、市場と街の盤面内位置も同じ時間で追従させる。市場の幅/高さ自体はレイアウト再計測を連続発生させないよう即時に切り替える。移動中にドラッグを始めた場合やタブが非表示になった場合は遷移を止める。アプリ内/OSのReduced Motionとテーマ離脱でも遷移を無効化/解除する。ルールや保存状態は変更しない。Service Worker cacheをv188へ更新。スクリーンショット/操作確認と関連テストは最後の一括確認で行う。

## Round 190: 多人数ロスターで現在手番の席を強調

カード卓ロスターでは現在手番を小さな「手番」バッジとARIA状態で示していたが、5〜10人戦で席が横に並ぶと現手番を視覚的に拾いにくい。現手番席に背景色と内側輪郭を追加し、選択中の自分の席では既存の青い選択背景を保ちつつ金色の手番境界を残す。ゲーム状態や選択操作は変更しない。Service Worker cacheをv189へ更新。高コントラストでの最終見え方を一括画面レビューに含める。

## Round 191: 夕暮れの広場のロスターでも手番の視認性を上げる

夕暮れの広場のHUDは現手番に「手番」バッジと金色の境界を付けていたが、他席と背景色がほぼ同じで一覧から素早く見つけづらい。現手番カードに落ち着いた明るい背景と薄い金色の内側/外側強調を加える。自分の席の緑色背景は既存の優先順位で維持し、手番リングは残す。表示のみの変更で、状態・選択・他テーマへ影響させない。Service Worker cacheをv190へ更新。

## Round 192: カード卓ロスターの読み上げに「自分/手番」を含める

ロスター席は視覚上「あなた」「手番」バッジと`aria-current`で示していたが、ボタンの明示的な読み上げ名には役割が含まれず、支援技術の組み合わせによっては他プレイヤーとの区別が伝わりにくい。席名の後に「あなた」「現在の手番」を含め、CPU/人間種別・残高・目標進捗も従来どおり読み上げる。操作やゲーム状態は変えない。Service Worker cacheをv191へ更新。

## Round 193: 発動明細に施設の所有者を加える

イベントレシートの短い要約では「席Nの施設」と示していた一方、詳細を開いた送金行では送金元/先と施設名だけが表示され、施設の所有者が省かれていた。構造化ログに所有者がある場合は、明細にも「席Nの施設」と表示し、誰の街の施設が発動したか追えるようにする。所有者情報のない旧ログは既存表示のままとし、収支計算は変更しない。Service Worker cacheをv192へ更新。

## Round 194: PWAユニットfixtureの初期画面を実DOMへ合わせる

一括ユニット実行でPWAインストール案内のbody class assertionが失敗した。製品コードは対局画面が可視ならインストール案内用の余白を予約しないが、main runtime fixtureの`gameScreen`は実画面の初期状態と違って`display`未設定だった。fixtureをタイトル初期状態と同じ`display:none`にし、検査の前提を実DOMへ揃える。期待値の緩和や製品コード変更ではない。このケースとPWA groupを最後の回帰検証で再実行する。


## Round 195: 横持ち対局のHUDと街を同じ画面上段へ再配置

844×390の実ブラウザ確認では、夕暮れ表示の横持ち盤面で接続状態・手順タイムラインが初期表示の下方へ流れ、街と操作も期待位置に並ばなかった。760px以上かつ高さ500px以下の夕暮れ/広場レイアウトをテーマ別に上書きし、接続状態と手順をコンパクトなHUD行へ、操作と街を左右の列へ配置する。街の列は残り高さでスクロールできる。ゲーム状態・ルールは変更しない。Service Worker cacheをv193へ更新。変更後の844×390実画面では、接続状態/タイムラインが操作・街の上段に並び、操作列が街列の左側にあることをスクリーンショットで確認した。既存の二端末スモークは市場レビューまで進み、オンライン再接続後の実対局ループ中にWebDriver timeoutで終了したため、完走/勝利確認は未達として最後の一括検証へ持ち越す。端末エミュレーションのブラウザ確認であり物理スマートフォン確認ではない。


## Round 196: PC幅の街と市場に面積を配分

にぎわい広場を1440×936で直接描画すると、選択した街が盤面の約57%を占める一方、序盤の街カードは左上の一部に集まり、空白が目立った。1200px以上・高さ481px以上のフォーカス盤面で街列の比率を下げ、中央市場に最低560pxを確保する。横持ち短画面とスマートフォンのレイアウトには適用しない。Service Worker cacheをv194へ更新。変更後の1440px実画面で街/市場のバランスとカード可読性を再確認し、最終テストはまとめて行う。


## Round 197: 広い市場で施設カードを大きく保つ

1440pxの市場は既定の96px最小列幅により7列となり、名前やイラストがカードゲームの一覧として小さく見えた。PC幅の市場カードを172px以上にし、4列前後へ抑えて各施設のアート幅も58pxに拡大する。844px横持ち以下と縦画面の市場には適用しない。Service Worker cacheをv195へ更新。1440×936ではカードが4列・約181px幅、施設アート58pxとなり、市場内部スクロールで全カードへ届くことを実画面で確認した。844×390の盤面ではこのPC専用ルールは適用されず、2列の横持ちレイアウトを維持する。


## Round 198: 序盤の所有カードをPC盤面で大きく見せる

市場の列数を抑えて読みやすくした後の独立確認で、PCのフォーカス街列では所有カードが3列に並び、街の広い面積に対して序盤カードが小さく残ることを確認した。1000px以上のフォーカス街カードの最小幅を230pxへ引き上げ、2列を基本にして施設アート・効果名の存在感を増やす。スマホと短い横持ちのカード密度には変更を加えない。Service Worker cacheをv196へ更新。1440×936を再撮影し、選択中の施設カードが295px幅・アート88pxで表示されることを実ブラウザで確認した。320×844/390×844は変更前の撮影で横幅はviewport内に収まり縦スクロールとなった。変更CSSはPC幅・高さのみ。

## Round 199: 広場の実操作・勝利画面を記録

headless Chromiumの実ブラウザ操作で出目3を確定し、パン屋の銀行収益、カフェから席1→席2への支払い、2件のコイン移動表示までを撮影した。別対局では通常CPU同士の2人戦を完走し、施設を麦畑/パン屋、ランドマークを駅に限定した再現用設定で1ターン勝利画面を確認した。PC/縦/横の広場盤面とタイトル画像を `docs/design-quality-review/evidence/2026-10-13/` に記録した。乱数固定のイベント画面とCPU速度100ms、限定セットの短縮CPU対局であり、標準セットの対局完走や実機操作を証明するものではない。物理スマートフォンではなくTermux上のChromium headlessで撮影。

## Round 200: 保存ゲームのタイトル導線を実画面で確認

夕暮れテーマの390×844で2人対局を保存APIから保存し、保存済みゲームの参加者、手番、コイン、施設、ランドマーク進捗を含むタイトル画面を撮影した。「続きから再開」238×44px、「削除」64×44pxで横並び、画面幅の横はみ出しなし。PWA案内表示中も再開セクションが読め、画面は縦方向にスクロールできる。スクリーンショットを同日のevidenceフォルダに追加。物理端末上ではなくheadless Chromiumでの表示確認。

## Round 201: 市場見出しの折り返しと拡大ボタン幅を修正

1440×936のカード卓画像を独立して見直すと、市場見出しが縮み、拡大ボタンが市場幅いっぱいを占めていた。共通の全幅ボタン指定が市場ヘッダーへ漏れていたため、拡大/Undoボタンを内容幅に戻し、見出しへ一行表示と可変幅を指定する。844×390の短い横画面では盤面専用の「中央市場」見出しにも折り返しを禁止し、重複する小見出しは視覚上隠す。1440pxと844pxの両方に、見出しの一行表示・ボタンとの非重複を確認するブラウザassertionを追加し、PRのブラウザ検証へ限定2画面のケースを含める。Service Worker cacheをv197へ更新。変更後スクリーンショットとPR CIの結果は次の確認で記録する。

## Round 202: PR静的ゲートのDOM型を整合

PRの静的ゲートは、DOM型を絞った後にESLintで`HTMLElement`/`HTMLDetailsElement`を宣言する必要も検出した。市場ダイアログを`HTMLDialogElement`として扱い、フォーカス可能な要素を`HTMLElement`へ限定し、詳細メニューは`HTMLDetailsElement`判定後に開く。カード卓で使う`UiPlayerDisplay`の型付きブラウザglobal宣言も追加した。`npm run test:types`はcomposition root 4系統を含め成功。ESLint global宣言の追加確認とPR CI再確認は継続中。

## Round 203: 手番境界がない収益ログを今回の演出から除外

PR unit gateで、helperを宣言前に使うテストfixtureのTDZエラーと、手番index/手番境界のない古い収益ログが「今回の収支」短縮欄へ出るケースを検出した。fixtureの共通helperを先に定義する。収益の詳細ログは事実として残し、現在の手番が特定できたときだけ常時表示の短縮イベント欄へ集約する`turnContextKnown`を追加した。`tests/ui-plaza-events.test.js`の対象スイート全件が成功。最新PRでの一括unit/browser再確認は継続中。

## Round 204: コントラストテストのCSSセレクタ照合を厳密化

unit gateで、`.crash-btn-primary`の共通スタイルを検証するテストが、先に書かれたカード卓テーマ固有の複合selectorを誤って拾っていた。CSSテスト補助の一致を行頭selector単位に限定し、共通の白文字/赤背景コントラスト契約を実際の共通ルールで検証する。コントラスト閾値や期待背景色は緩めず、`node tests/ui-color-contrast.test.js`は全件成功。最新PRでの一括再確認を継続する。

## Round 205: 横持ち盤面で選択した街へ幅を配分

短い横持ち画面は席ロスターでプレイヤーを切り替える盤面構造になっているが、街と市場の列比率は市場側へわずかに広く配分されていた。施設カードを盤面の主役として見せるため、街列を約58%、市場列を約42%へ変更し、市場には280pxの操作可能な最小幅を確保する。選択した街のカードは最小120px幅にして、施設名とアートの視認性を上げる。縦画面と広いPC表示には適用しない。実画面と複数人数での崩れは最終ブラウザ確認で評価する。Service Worker cacheをv198へ更新。

## Round 206: タイトル保存選択のWebKit検証を安定化

PRのWebKit確認では、select要素全体のテキスト集約とCSS Grid itemの`display`計算値がChromiumと異なり、実際のUI要件を満たしていてもassertionが失敗した。保存世代の個々のoption文字列を検査し、再開ボタンは計算済みの`inline-flex`値ではなく内容の縦横中央配置を検査するよう変更した。挙動期待値は維持する。対象テストはCIでまとめて実行する。

## Round 207: 施設連鎖を発動順で見せる

サイコロ直後は一致した全施設が同時に光り、構造化ログにある発動順を視覚から読み取れなかった。カードイベント投影で最初に確認された発動順を保持し、先頭5段階まで70ms間隔でカードを強調する。最大の遅延を含めてもアニメーションが完了するよう新出目の強調クラスを1100ms維持する。結果集計・コイン移動・再生条件は変更しない。OS/アプリのReduced Motionは既存の一括停止規則に従う。Service Worker cacheをv198へ更新。ブラウザでのイベント中表示とログ順の対応は一括確認で評価する。

## Round 208: 同一出目の再描画で演出を再生しない

出目後のレシートやプレイヤー選択の再描画で、カードDOMが作り直されると同じ発動演出が先頭から再生される経路があった。最初の描画だけサイコロ/連鎖アニメーションを許可し、同じ出目の後続描画では`cardboard-roll-reviewed`を付けて演出を抑える。feedbackが無効化された復元・Undo・再接続経路では既存の`clearFeedback()`から強調クラスも消す。ログの強調表示と収益情報は残す。発動順に対応するカード段階classの回帰assertionを追加し、検証は一括ブラウザ確認へ含める。

## Round 209: 保存再開とオンライン再接続の操作寸法を固定

タイトル画面の再開/削除と再接続/削除は、狭い幅で共通ボタン規則が縮小や日本語の縦折り返しを許す余地があった。4つの操作に44px以上の高さ、幅制約内での横書き、折り返し禁止を共通適用する。保存世代の選択欄は既存の独立行を維持する。各幅での押しやすさと切れを最終ブラウザ確認へ加える。

## Round 210: PC序盤の単独施設カードを街の中央へ配置

1440×936の序盤画面を目視すると、選択街に施設が1種類だけあるためカードが左端へ寄り、街パネルの余白が左右非対称に見えた。大画面のフォーカス街ではカード幅を230〜280pxに揃え、空き列を伸ばさず中央配置する。施設が増えた後は中央揃えの複数列となり、縦スクロールで全カードを閲覧できる。横持ち・縦画面のフォーカス街には適用しない。中盤/終盤の列数と市場とのバランスは最終再撮影で確認する。

## Round 211: 縦画面の単独施設カードも中央へ配置

320×844の既存ブラウザ画像でも、1種類だけの街カードが左列に張り付き、同じ高さの右側が空いていた。縦画面のフォーカス街カードを最大160px幅にし、余った列幅を中央配置する。2列以上を作れる幅ではカード群を並べ、狭い画面では一枚ずつ縦に続けて見せる。施設アートとカード高は縮めず、各幅での見え方は最終撮影で確認する。

## Round 212: 収益経路をレシート内に置いて盤面の重なりを解消

844×390の出目画像では、画面下部へ固定した「誰から誰へ」の収益summaryがランドマーク欄と重なっていた。コイン移動アニメーションは盤面上の独立overlayに残し、経路テキストは同じ状態から生成して出目レシート内へ移す。短い横画面ではレシートをイベント中だけ一段広げ、market shelfの操作可能領域を残す。復元/Undo時の既存cleanupでsummaryも消去し、描画状態へ収益を重複計上しない。配置と読める高さは最終ブラウザ画面で確認する。

## Round 213: 終盤のランドマーク横スクロールを見つけやすくする

320pxの既存盤面では、ランドマークが横にはみ出してもスクロールバーが端末設定で見えず、残りの施設へ移動できる手掛かりが弱かった。見出しに横移動の短い案内を加え、ランドマーク列へスクロールスナップと細い配色バーを追加する。ハイコントラスト用に案内文字・バーの色も明示する。建設状態や選択動作は変えない。最大数のランドマークを持つ終盤でのタップ領域と横移動をブラウザ確認に含める。

## Round 214: 長いプレイヤー名が共通盤面の高さを押し広げないよう制限

クラシック/夕暮れテーマのプレイヤー名は保存データやオンライン復帰で入力欄上限を超える可能性があり、10人戦のコンパクト行を複数行に押し広げる余地があった。共通表示は2行までにし、全名はtitle属性とDOM文字列に保持する。夕暮れの広場固有CSSが`overflow:visible`へ戻していた指定も2行制限に揃える。4テーマのプレイヤー状態・表示名自体は変更しない。

## Round 215: 横持ちの上下席カードに読みやすさと詳細の手掛かりを追加

844×390前後の横持ちでは上下席のカードが横幅88px、施設名11pxで、イラストと名称を認識するにはまだ小さかった。横スクロールを前提にカード幅を100pxへ広げ、名称を12pxにする。カードのtitleには施設名・分類・出目・所有数・休業・今回の収支を含め、見切れる情報もポインター環境では読めるようにする。スクリーンリーダー向けの完全なカード説明とタップで開く詳細は維持する。Service Worker cacheをv199へ更新。異なるプレイヤー数で一度に何枚見えるかとタッチ操作は最終ブラウザ確認にまとめる。

## Round 216: オンライン待機室で長い名前が席カードを押し広げないようにする

オンライン待機室は5〜10席で一覧が長くなり、小画面では長い名前や再接続残り時間が席カードの高さを押し広げる。名前は2行までで表示し、完全な名前・再接続表示はDOMとtitleに残す。席順、状態ラベル、ホスト操作、再接続カウントダウンの値や更新処理には触れない。さまざまな席数と長名の表示確認を最終ブラウザ検証にまとめる。

## Round 217: 待機室で準備状態を色とラベル形状から識別

カード卓テーマの待機室では「準備完了」「準備中」「再接続待ち」「空席」「CPU」が同じ見た目の文字列で並び、待機中に席の状況を走査しづらかった。状態バッジにテーマ内の色分けを追加し、文字ラベルも残して色だけに依存しない。ハイコントラストは共通の明暗コントラスト規則を適用する。状態遷移や自動開始条件には変更を加えない。Service Worker cacheをv200へ更新。

## Round 218: 収益結果の音声読み上げを一度にまとめる

コイン移動欄と専用の手番結果アナウンサーが同時にlive regionとなり、同じ収支を二重に読み上げる可能性があった。視覚用収支欄は通常テキストとして残し、専用アナウンサーから集約済みの移動経路を最大3件読み上げ、それ以上は件数と画面上の確認先を案内する。コイン移動演出と集計値は変更しない。Service Worker cacheをv201へ更新。

## Round 219: 施設建設とランドマーク完成を読み上げる

建設済みカードとランドマークには視覚的な到着演出があるが、スクリーンリーダー利用者へ成功を直接伝える専用通知がなかった。新しいpolite status領域に、席名・施設名またはランドマーク名を一度だけ通知する。既存のログや勝利判定・サウンド・建設状態は変更しない。Undo/再接続などのreplay中は既存のmilestone検出が抑止され、別セッション移行では通知をクリアする。Service Worker cacheをv202へ更新。

## Round 220: コイン移動の収支欄を読める時間だけ残す

複数経路を示す収支欄は、アニメーションの終了直後に消える1600ms制限では読み切りにくい。コインの飛行は約1.4秒以内に終わるため、アニメーションを止めず、経路テキストだけは結果から3200ms表示する。次の結果・画面復帰・Undoでは既存の`clear()`がすぐ消去する。Service Worker cacheをv203へ更新。

## 比較基準メモ: 公式紹介が前面に出すプレイ感

[Steam公式ストアの紹介](https://store.steampowered.com/app/1969860/MACHI_KORO_With_Everyone/?l=japanese)は、サイコロを振る期待感と簡単な操作でオンライン/オフラインの対戦を始めやすい点を強調している。ダイスシティ側では、単に演出を足すより、誰が振り、何が発動し、どこへコインが移ったかを一続きで理解できることを比較軸にする。同ストア内の画像ファイルはこの環境から取得できなかったため、この確認は公式紹介文に基づくプレイ体験の基準であり、実ゲーム画面のビジュアル同等性を確認した証拠ではない。

## Round 221: 5〜10人戦の建設結果へ盤面の焦点を移す

5人以上では盤面が手番プレイヤー・自分・選択席の詳細に絞られる。別の席を確認中に現在プレイヤーが施設やランドマークを建設すると、建設カードは非選択の隠れた詳細パネルに入り、到着演出が見えないことがあった。建設イベント時は建設した席を選択し、横スクロールのロスターでもその席を表示する。市場やカード棚の閲覧位置、小人数盤面の配置は変えない。Reduced Motionでは即時スクロールを使う。Service Worker cacheをv204へ更新。

## Round 222: 多人数戦の出目後に発動カードへ焦点を移す

5人以上では自分・現在手番・選択席の3人だけ詳細表示するため、出目に反応した施設がその外側のプレイヤーにあると発動カードの連鎖強調が見えなかった。新しい出目または振り直し/港選択後に確定した最初の施設発動所有者を一時選択し、そのロスター席を見える範囲へ移す。発動カードも横スクロール棚の可視範囲へ移す。所有者indexがない旧ログではカード強調と同じく受取人、次に支払人を使って解決する。発動順と収支表示は共通イベント投影を使い、ルール・状態・カード効果を変更しない。イベント表示以外の再描画、Undo、復帰時にはフォーカスを奪わない。Reduced Motionでは即時スクロールを使う。Service Worker cacheをv207へ更新。

## Round 223: 多人数盤面のイベント席選択を純粋ヘルパーへ集約

施設発動/建設イベントから焦点席を決める規則が`cardBoardField`に複数の条件分岐として残っていた。多人数専用の`UiCardBoard.eventFocusSeatIndex`へまとめ、建設席を優先し、発動ログではowner、受取人、支払人の順でseat indexを解決する。イベント投影、selected roster更新、スクロールは呼び出し側に残し、ルール状態を持たない。Service Worker cacheをv208へ更新。

## Round 224: にぎわい広場のHUDへ現在フェーズを表示

カード卓では共有の4段階タイムラインを非表示にしているため、盤面を見ても「サイコロ」「効果解決」「建設」「手番終了」のどこにいるかが一目で分かりにくかった。手番名/残高のHUDへ現在段階を小さなバッジで表示し、選択中の詳細（振り直し確認、港の選択など）はaccessible labelとtitleに保持する。長い名前はHUD内で省略し、段階バッジの領域を確保する。既存の操作ボタン・共通タイムライン計算・他テーマの表示には触れない。ハイコントラスト時の配色も追加し、Service Worker cacheをv209へ更新。

## Round 225: 拡大市場で建設後の操作位置を維持

にぎわい広場で市場ダイアログを開いたまま施設を建設すると、共通のフォーカス復元処理が画面外に移動した従来の市場要素だけを検索し、実際に操作している拡大市場のカードへ戻れない場合があった。フォーカス対象検索へカード卓側の市場も加え、戻した操作対象を表示領域内へスクロールする。建設によって選択カードが消える/選べなくなる場合も、ダイアログ内の次の購入可能カード、詳細ボタン、閉じるボタンの順でフォーカスを保つ。建設後も市場を閉じず、残数・建設可否を更新した市場から次の選択へ進める。ルールや市場状態の正本は変更しない。Service Worker cacheをv210へ更新。

## Round 226: 施設連鎖の発動順を最後まで見せる

複数施設が連続発動する場面で、従来は4番目までしか段階的な発光タイミングがなく、5枚目以降が同時に強調されて連鎖の順序を追いにくかった。発動ログの順序から最大8段階の遅延をカードへ渡し、各カードの強調が収支の解決順に続くようにする。アニメーション総時間やゲーム進行、ログ再生の条件は変更せず、既存の復帰/Undo抑制とReduced Motionを維持する。Service Worker cacheをv211へ更新。

## Round 227: 最後の発動強調まで表示状態を維持

最大8段階の連鎖強調は最後のカードが最大560ms遅れて760msの発光を行うため、盤面の新規出目クラスを1100msで外す既存タイマーでは後半が途中で切れていた。表示状態を1400ms維持し、最大遅延のアニメーションが終わる時間を確保する。出目の基礎アニメーション、ゲーム進行、Reduced Motion、復帰/Undo時の消去条件は変えない。Service Worker cacheをv212へ更新。

## Round 228: 多人数盤面で選択中の街を明示

5人以上では街の詳細を一人ずつ切り替えるが、ロスターの選択状態は背景色と`aria-pressed`に依存し、手番/自分のバッジと区別しづらかった。選択中の席には「詳細表示中」を表示し、読み上げラベルにも含める。2〜4人戦は全員の街が同時表示されるため、この追加表示を行わない。ハイコントラスト配色も用意し、ゲーム状態・席の切替・スクロール挙動は変えない。Service Worker cacheをv213へ更新。

## Round 229: 終盤の施設棚に種類数と総枚数を表示

施設カードが増えると、棚を見ただけでは何種類の施設があるか、同じ施設を何枚持っているかを把握しづらかった。各プレイヤーの施設棚に種類数/総枚数を示し、スクリーンリーダーにもプレイヤー名と枚数を含むグループ名を付ける。カードそのもののグルーピング、スクロール、購入/効果ルールは変えず、短い上下席では見出しを抑え、選択した詳細盤面では表示する。Service Worker cacheをv214へ更新。

## Round 230: 拡大市場で施設アートをカードの主役に戻す

拡大市場はカード幅を広げても施設イラストが56px高のまま、幅広いカードに細い絵が置かれた印象になっていた。ダイアログ内の施設カードを縦型に戻し、画面高に応じてアートを72〜128pxへ拡大し、出目・分類・施設名も一段読みやすくする。通常盤面のコンパクト市場には適用せず、ランドマークにもダイアログ用の大きなアート領域を設ける。Service Worker cacheをv215へ更新。

## Round 231: 建設可能状態とキーボード位置を明示

ダイアログ内の購入可否は色とhoverが中心で、タッチ利用者には建設可能な施設を見分けにくかった。購入可能カード/ランドマークの価格欄に「建設可」チップを表示し、キーボード操作中は購入ボタンと詳細ボタンのフォーカスを二重の輪郭で示す。ハイコントラスト配色も追加する。購入可否判定とARIAラベルは共通の建設ポリシーを使い、ゲームルールは変えない。Service Worker cacheをv216へ更新。

## Round 232: 拡大カードの詳細操作をアート端へ移動

詳細ボタンは狭い市場向けの固定位置で、ダイアログでは分類/イラストの境界を覆っていた。施設カードの拡大時だけボタンをイラスト右上へずらし、名前・価格・出目ラベルを遮らない。ランドマーク詳細と通常市場は従来の配置を保つ。Service Worker cacheをv217へ更新。

## Round 233: 勝利画面の再描画で紙吹雪を再始動しない

勝利状態の描画関数は再描画のたびに呼ばれ、紙吹雪開始も毎回実行されていた。勝利画面が更新されると3.6秒の紙吹雪タイマーが再起動し、画面上の変更によって祝福演出が繰り返される可能性がある。初回の勝利提示時だけ紙吹雪を開始し、再描画/復元では再生しない。初回演出、Reduced Motion、保存/オンライン終了処理は維持する。Service Worker cacheをv218へ更新。

## Round 234: 勝利演出を高密度画面と回転後も鮮明に保つ

紙吹雪canvasは初期画面寸法だけで描かれるため、勝利画面中に端末を回転すると表示が欠け、Retina画面では低解像度になっていた。表示中のresizeで紙片の位置を新しいviewportへ追従させ、最大2倍のpixel ratioで描画する。終了時にはresize listenerを解除し、Reduced Motion設定時は既存演出が残っていれば停止する。紙片の数/不透明度/再出現しない挙動/3.6秒の寿命は維持する。Service Worker cacheをv219へ更新。

## Round 235: 非表示タブと動作設定変更で祝福演出を停止

紙吹雪はページが背面へ移動した後もタイマーが続き、OS側でReduced Motionへ変えた場合も現在の再生が残る。ページが非表示になった時点、または`prefers-reduced-motion`が有効へ変わった時点で停止し、戻った時に再開しない。停止時はvisibility/media query listenerも解除し、繰り返し開始時の重複listenerを防ぐ。Service Worker cacheをv220へ更新。

## Round 236: 待機室を狭い画面と大人数の両方に適応

5〜10席の待機室は、横幅がある端末で人数に応じて3〜5列の卓配置になり、席カードの幅が狭く名前・準備状態・ホスト操作が詰まっていた。5席以上では中央の卓案内の下に2列の名簿を置く。420px以下では少人数でも席カードを1列にして、名前と準備状態の表示幅を確保する。Service Worker cacheをv221へ更新。

## Round 237: 横持ちの選択中カードを大きく読み取れるようにする

844×390相当の横持ち画面では、選択中の街だけを拡大表示しても施設アートが64px高で、カード名と発動情報が小さかった。選択中カードのアートを76px、カード名を13px、分類/発動表示を11pxへ上げ、カード高も確保する。縦持ちの選択中カードもアート72px・カード名13pxにして存在感を揃える。横持ちブラウザ回帰へ寸法期待値を追加し、Service Worker cacheをv222へ更新。

## Round 238: Canvas非対応時の勝利演出を安全に省略

一部WebView/端末で`canvas.getContext('2d')`が`null`を返すと、紙吹雪タイマー内で例外になり勝利画面の他の操作まで阻害する可能性があった。描画contextを取得できない場合はcanvasを隠して演出だけ省略し、タイマーを開始しない。停止処理もcontext未取得に耐える。対象環境を想定した回帰ケースを追加し、Service Worker cacheをv223へ更新。

## Round 239: 横持ちの発動レシートを横スクロールで読めるようにする

短い横画面では複数施設の発動要約が44pxのレシート列内で単純に省略され、後半の収益経路を画面上から辿れなかった。施設発動数と収支チップを横スクロールできる一列にし、細いスクロールバーで続きがあることを示す。重要イベント見出しの既存優先表示、詳しい内訳、他テーマ共通のレシート生成は保つ。844×390のブラウザ回帰に横スクロール挙動を追加し、Service Worker cacheをv224へ更新。

## Round 240: カード盤面の空き地へ控えめな卓上テクスチャを加える

横持ち盤面の再レビュー記録では、序盤にカードが少ないと平坦な緑の余白が広く、仮のWebパネルが並んだ印象になっていた。盤面背景に淡い紙目と斜めの柔らかい織り目、縁の細い輪郭を加え、カード・市場のコントラストを邪魔せず卓上としてのまとまりを持たせる。プレイヤー配置や盤面寸法は変えない。視覚的な効果は次の実画面スクリーンショットで確認する。Service Worker cacheをv225へ更新。

## Round 241: 縦画面の選択中カードを横送りで拡大

320〜760pxの縦画面で選択中プレイヤーのカードが2列に分かれ、各カードが細くアートも72pxに制限されていた。施設を一度に並べ切る前提をやめ、カード棚を横スクロールのスナップ列にしてカード幅176px以上・アート96pxへ拡大する。カード種類が複数あるときだけ横送りの案内を出し、操作を発見しやすくする。街の概要/ランドマークは維持し、カードの詳細は横送りで閲覧できる。縦画面の選択中街の領域は最大48dvhへ広げ、上下スクロールで市場・操作へ移動できる。カード棚のスクロール位置保存と Reduced Motion のルールは維持する。ブラウザ回帰の期待値を更新し、Service Worker cacheをv227へ更新。縦390pxと844pxの手動画像をRound 241–242目視メモに記録した。

## Round 242: 最小縦画面で席一覧の高さを圧縮

320×568の4人ブラウザ画像では、2段の席一覧が選択中の街を画面下へ押し出していた。2〜10人戦すべてで縦画面の席を横スクロール一列にし、320pxでもおよそ2席を表示しながら縦方向の領域を選択中の街へ戻す。現在の手番席をロスター内へスクロールする既存処理と連動させる。回帰では席一覧が一列で横スクロールできることを追加確認する。Service Worker cacheをv228へ更新。

### Round 241–242 ブラウザ目視メモ

- Termux上のChromiumを使い、Playwrightのプラットフォーム判定を一時的にLinuxとして扱う手動スクリプトで実画面を描画した。これはブラウザ表示の確認で、物理スマートフォンの実機確認ではない。自動テストはまだ実行していない。
- 2人戦、施設を8種類持つ状態の390×844px画像 [round-241-cardboard-portrait-390x844.png](../artifacts/design-review/round-241-cardboard-portrait-390x844.png) では、棚の横幅345pxに対し内容幅1447px、カード幅176px、アート高96pxを確認。市場・操作もページを縦にスクロールして到達できた。
- 320×568pxの4人戦画像 [round-242-cardboard-portrait-320x568.png](../artifacts/design-review/round-242-cardboard-portrait-320x568.png) では、席一覧が2段から一列へ変わり、選択中の街の上端は画面y=262px、カード棚はy=343pxから始まる。変更前画像より約145px上がり、カードアートが初期画面へ現れる。ランドマークと市場は続けて縦スクロールする必要があり、まだ全体を一画面で見渡せない。
- 4人用のカード状態を設定した844×390px画像 [round-241-cardboard-landscape-844x390.png](../artifacts/design-review/round-241-cardboard-landscape-844x390.png) では、document幅は844px、盤面は832×332px、選択中の街は467×264pxで横はみ出しなし。主役の街と市場を並べて表示できる一方、カード棚・市場の詳細を初見で発見できるかは引き続き操作評価が必要。
- 最小縦画面でも、上部のタイトル/HUD/操作領域が大きく、カード全体は初期画面に入りきらない。縦スクロールで補えるが、続けてHUDとコントロールの高さ、2〜4人ロスターの初期視認性を見直す。

## Round 243: にぎわい広場の上部設定を折りたたむ

縦320px画像では、常時操作ボタンの下にテーマ・ガイド・データ関連の各設定が横へ折り返され、初期画面の縦領域を使っていた。盤面の常時操作を「終了」「ログ」「施設比較」「その他」に絞り、テーマ切替・ガイド設定・対局データ/問題報告のツールバーを「その他」のネイティブdetails内へまとめる。設定機能とテーマ切替は維持し、通常時のHUD/市場/街の視線階層を整理する。開いた設定内容は盤面上へ重ね、内側の各設定を開いたときも画面外へ切れずスクロールできるようにする。初回の開いた状態は左へ73pxはみ出したため、狭い縦画面ではviewport中央へ固定して修正する。ハイコントラスト配色を追加し、モードを離れる際の共通ツールバー復帰は既存の移動元markerで保つ。Service Worker cacheをv229へ更新。

## Round 244: 選択中カードをランドマーク欄に押し潰させない

320×568pxの実画面で、選択中の街カード棚の高さがランドマーク欄とのflex縮小で足りず、大きくしたカードアートが途中で切れていた。カード棚に184pxの表示高を確保し、選択中街パネルは内容に合わせて伸ばす。画面全体は引き続き縦スクロールできるので、市場へ進める操作も残る。Service Worker cacheをv230へ更新。

### Round 243–244 ブラウザ目視メモ

- 320×568pxの設定メニュー画像 [round-244-cardboard-menu-320x568.png](../artifacts/design-review/round-244-cardboard-menu-320x568.png) で、テーマ設定を開いた状態のパネルはx=10〜310、y=124〜352pxに収まり、選択欄も操作可能だった。最初のパネルは左へはみ出したのでviewport中央へ配置し直している。これは手動Chromium確認で、物理端末ではない。
- 320×568pxの通常盤面 [round-244-cardboard-portrait-320x568.png](../artifacts/design-review/round-244-cardboard-portrait-320x568.png) では、カード名・アート・所有数が一枚分のカード内に収まり、隣のカードも横送りの続きを示す。ランドマークと市場は縦スクロールで閲覧する。
- 390×844px [round-244-cardboard-portrait-390x844.png](../artifacts/design-review/round-244-cardboard-portrait-390x844.png) では、カード2枚、ランドマーク、サイコロ操作、市場の先頭を同時に見られた。844×390px [round-244-cardboard-landscape-844x390.png](../artifacts/design-review/round-244-cardboard-landscape-844x390.png) では、選択中の街と市場が並び、document幅844pxのまま。設定は「その他」から利用できる。
- 縦320pxは初期画面に市場全体を出す余裕がなく、スクロールが必要。設定をまとめてカードの見える範囲を増やせたが、PC 1440px・縦320/390pxのタイトル/中断データ、実プレイ中の序盤・終盤・イベント画面、CPU完走は未確認。

## Round 245: 短い端末でも中断ゲームの再開操作を初期表示

中断データを含むタイトル画面を複数幅で撮影したところ、320×568pxでは再開ボタンがy=616pxと画面外にあり、上部のブランド装飾と説明文が復帰操作を押し下げていた。高さ640px以下・幅380px以下ではヒーロー/ルール領域を控えめにし、保存説明の補助文をたたみ、要約を2行で読み取れる形にする。再開/削除は44pxタッチ高、保存世代選択は維持する。縦書きや操作ボタンの縮小はしない。Service Worker cacheをv231へ更新。

## Round 246: 横持ちタイトルの再開パネルを右カラムへ収める

844×390pxでは短い landscape 規則とにぎわい広場のタイトル幅制限が衝突し、中断ゲームのボタンが画面下y=430pxへ押し出され、見出しが一文字ずつ折り返されていた。短い横画面は左にブランド、右にモードタブと選択中コンテンツを置く二列構成へ整理し、中断カードを単一列にして説明・保存世代・操作を読みやすく並べる。テーマ/オンライン等の別タブ、詳細ガイド、PWA操作は下へスクロールして引き続き利用できる。

### Round 245–246 ブラウザ目視メモ

- Chromiumで保存を2世代作り、再読み込み後の実画面を320×568 / 320×844 / 390×844 / 844×390 / 1440×936で撮影した。Termux上のブラウザ表示であり物理スマートフォンではない。
- 320×568pxでは再開ボタンと削除がともにy=523〜567pxに入り、世代選択がy=449pxから表示された。旧画面の再開ボタンy=616pxから画面内へ移動し、viewport幅320pxを保った。画像: [short-phone saved title](../artifacts/design-review/round-246-title-resume-320x568.png)。
- 最初の844×390px改善では保存見出しが縦に折り返され、ボタンy=232pxでも説明の配置が不自然だった。その画像を見て保存情報を横幅いっぱいの単一列に変えた。最終画像 [landscape saved title](../artifacts/design-review/round-248-title-resume-844x390.png) では見出しが横書き、世代選択と44pxの再開/削除がy=218〜262px。layout計測はタイトルcontent x=12, 幅820px、doc幅844px、縦スクロールは620pxで、横はみ出しはない。
- 390×844px [390px saved title](../artifacts/design-review/round-246-title-resume-390x844.png) と1440×936px [desktop saved title](../artifacts/design-review/round-246-title-resume-1440x936.png) も撮影した。ボタンはともにviewport内だが、PCではタイトル本体より下の情報が縦に続く。今回の更新は短い画面の保存再開を優先したもので、全タイトルタブ・オンライン再接続の手動操作確認と自動回帰テストは未実施。

## Round 249: 待機室の少人数・満席表示を実画面で確認

オンライン待機室のHTMLを実ブラウザで描画し、320×568px/390×844pxの4席、844×390px/1440×936pxの10席を目視した。スマホ縦持ちは1列の席カードで長い名前を読め、準備中・準備完了・再接続待ち・ホスト席・退出操作も区別できる。横持ちとPCは2列ロスターで10席を保ち、表示幅のはみ出しはない。縦画面では卓案内の後に席が続くためスクロールが必要で、320pxでは画面内に1席目の一部までしか入らない。待機室の実通信・ボタン操作・再接続処理を検証した画像ではなく、HTML fixtureを使ったレイアウト確認である。

- [320×568px・4席](../artifacts/design-review/round-249-lobby-320x568-4p.png)
- [390×844px・4席](../artifacts/design-review/round-249-lobby-390x844-4p.png)
- [844×390px・10席](../artifacts/design-review/round-249-lobby-844x390-10p.png)
- [1440×936px・10席](../artifacts/design-review/round-249-lobby-1440x936-10p.png)

## Round 250–253: 実対局のカード棚とスマホ席表示を再調整

ローカルCPU対戦をブラウザ上で開始し、390×844pxの実際のゲーム画面を撮影した。にぎわい広場では中央市場と選択中の街が連続して表示され、カードアートは96px高で見える一方、席名が「あなた」「手番」バッジに挟まれてほぼ省略され、ランドマーク名も狭い棚で不自然に折り返していた。スマホ縦画面の席札を64px高の2段表示にし、名前を独立した行へ移動。ランドマークカードは122px幅・56px高、アート32pxに拡大し、名前を最大2行で読む構成にした。横スクロール、選択プレイヤーの詳細表示、ゲーム状態は維持する。Service Worker cacheをv232へ更新。

- 変更前の実対局画面 [round-251-live-cardboard-390x844.png](../artifacts/design-review/round-251-live-cardboard-390x844.png) と、席名を広げた中間画像 [round-252-live-cardboard-390x844.png](../artifacts/design-review/round-252-live-cardboard-390x844.png) を比較し、ランドマーク棚の読みにくさも追加修正した。
- 最終画像 [round-253-live-cardboard-390x844.png](../artifacts/design-review/round-253-live-cardboard-390x844.png) では施設カード2枚のアート・名前・所有数、ランドマーク名3枚分が読める。残りのランドマークと中央市場はそれぞれ横/縦スクロールで閲覧する。ロスターの各札は64px、名称幅154pxを確保し、人数が増えたときも横送りにする。
- これはTermux上のChromiumで開始したローカルCPU対局の画面で、物理端末ではない。開始後の画面を目視したもので、CPU対戦完走、オンライン通信、勝利画面、全イベントのプレイ確認は未完了。自動テストとPushも依頼どおり後段にまとめる。

## Round 254–258: 実際の出目・収益・拡大市場を修正

844×390pxでローカルCPU対局を開始し、手番中に実際にサイコロを振った。出目3からパン屋が発動して1コインを得るログ、街カードの発動枠、コイン通知、建設フェーズへの移行を確認した ([round-254-live-cardboard-roll-844x390.png](../artifacts/design-review/round-254-live-cardboard-roll-844x390.png))。この確認は短い横画面での1回の出目で、試合完走や全効果の再生確認ではない。

同じ対局で市場の「拡大」を開くと、横画面用のコンパクト市場配置が拡大ダイアログにも残り、804pxの利用可能幅に対してカード棚が200px幅の1列に縮んでいた。さらにカード購入欄には74px固定高が残り、施設名と価格を隠していた。拡大ダイアログ内では棚を全幅へ伸ばし、カードの固定高を解除して、アート・名称・価格が縦に読めるようにする。Service Worker cacheをv235へ更新。

- 不具合状態 [round-255-live-cardboard-market-844x390.png](../artifacts/design-review/round-255-live-cardboard-market-844x390.png) と横幅修正後 [round-256-live-cardboard-market-844x390.png](../artifacts/design-review/round-256-live-cardboard-market-844x390.png) を比較。最終 [round-258-live-cardboard-market-844x390.png](../artifacts/design-review/round-258-live-cardboard-market-844x390.png) ではカード棚が804px、3列、各カード約139px高。施設アート・名前・価格を表示し、在庫はカード内に残す。縦方向に続く施設はダイアログ内でスクロールする。
- 表示中にゲーム状態を変えず、ダイアログを閉じる既存導線も維持する。横幅/高さはChromium上の目視とDOM寸法で確認した。自動テスト、PWA更新実機、Undo後のフォーカス復元確認は後段にまとめる。

## Round 259–263: 実建設・Undo・テーマ切替と横カード全体表示

844×390pxのにぎわい広場で実際に「麦畑」を購入したところ、街のカード枚数とコインが更新され、段階は手番終了へ進んだ。市場のUndoを押すと確認ダイアログに取消対象が表示されるため「はい」を押し、施設枚数が購入前の2枚へ戻ることを確認した。続けて表示テーマをクラシックへ切り替え、にぎわい広場へ戻してもプレイヤー/CPUの街カードが表示された。画像 [round-259-live-cardboard-build-844x390.png](../artifacts/design-review/round-259-live-cardboard-build-844x390.png) と [round-261-live-undo-theme-return-844x390.png](../artifacts/design-review/round-261-live-undo-theme-return-844x390.png)。これは短いローカル操作確認で、オンライン共有やセーブ復元を含む互換性の証明ではない。

ランドマーク名を広げた結果、短い横画面では選択中のカード棚が122pxに縮み、高さ152pxのカードの「所有数」が棚外へ切れていた。カードを主役にするため、横向き761〜600px高では選択中のカード棚を154px確保し、カード全体を横送りで表示。Chromium計測は844×390pxで棚154px、カード152px、所有数表示の下端323pxが棚下端329px内に入り、表示可能を確認した。ランドマーク棚の一部は盤面内を縦に送って見る。画像 [round-263-cardboard-landscape-card-844x390.png](../artifacts/design-review/round-263-cardboard-landscape-card-844x390.png)。

## Round 264: 4人戦を320×568pxで実際に開始

タイトルの人数設定から4人対戦を作り、にぎわい広場でゲーム開始した。320×568pxで席数4、盤面幅308px、文書幅320pxを確認。最初の2席が横スクロール棚に表示され、選択した街にはカードアート2枚とランドマーク先頭が現れる。席名は実際のシャッフル後の順で全4名分DOMにあり、現在手番へスクロール位置を合わせる。画像 [round-264-four-player-live-320x568.png](../artifacts/design-review/round-264-four-player-live-320x568.png)。小画面では街詳細の続きと市場へ縦スクロールが必要で、4人分の街カードを同時一覧する画面ではない。これは対局開始直後のブラウザ表示確認であり、4人戦の完走・端末間オンライン・5〜10人戦は未確認。

## Round 265: 商用品質の公式基準を再確認

任天堂の公式紹介（2024-07-05）では、体験の中心を「サイコロ→対象施設の収益→新施設の建設」と説明し、青/緑/赤/紫の効果の違い、同種施設を重ねた収益、出目別の収益表、条件付きコンボを取り上げている。Steam製品ページはCPU戦、2〜4人ローカル、オンライン対戦を案内している。カードを大きくするだけでは足りず、「出目が自分/相手の街へどう届き、何コインを生み、次の投資判断につながったか」を途切れず読めるかを評価軸に加える。これは公式説明からの設計上の推論で、固有画面の模写ではない。

参照: [任天堂公式紹介](https://www.nintendo.com/jp/topics/article/1408afb9-9061-4c0c-8a6a-816b5caeccde)、[Steam製品ページ](https://store.steampowered.com/app/1969860/_/?l=japanese)。ページ本文と仕様は確認したが、公式スクリーンショットの画像取得はWeb取得側のcache missとなり、今回のブラウザ画面との直接の横並び目視はできていない。よって商用品質の同等性は未判定。

## Round 266: 10人戦の横持ち盤面を実際に開始

設定画面で10人を選び、にぎわい広場を844×390pxで実際に開始した。全10席のロスターが生成され、レール幅818pxに対して内容幅1749pxとなり、先頭5席を初期表示、残りは横送りで閲覧する。選択中の街と市場を2カラムで保ち、document幅は844pxのまま。カード2種類のアート・所有数と市場操作が表示される。画像 [round-266-ten-player-live-844x390.png](../artifacts/design-review/round-266-ten-player-live-844x390.png)。大人数時のスクロール操作/10人CPU完走はまだ確認しておらず、PC幅で同状態を比較するレビューも残る。

## Round 267–268: 大画面10人戦の余白と市場カードを再レビュー

前画像 [round-267-ten-player-live-1440x936.png](../artifacts/design-review/round-267-ten-player-live-1440x936.png) では、10席中7席が横並びで見える一方、選択中の街カードが左上に寄り、広い盤面の下半分が空いていた。施設数が少ない局面では選択中プレイヤーのカード棚を縦方向中央へ置き、所有施設を街の焦点として目に留まりやすくした。PC市場は4列の細いアートから3列へ変え、施設アートをカード幅いっぱい・高さ84pxで表示し、名称/価格/在庫もカード内に置く。Service Worker cacheをv237へ更新。

- 最終画像 [round-268-ten-player-live-1440x936.png](../artifacts/design-review/round-268-ten-player-live-1440x936.png) で、選択中カードは棚内中央（棚y=185px、カードy=419px）、市場は758px幅・3列（各カード84px高のアート）、画面幅1440pxを保つことを確認。市場の続きと10人分の席はそれぞれスクロールできる。
- 目視上、市場カードのアートは明確に大きくなり、名前・価格も読みやすい。2種類の所有カードは中央にまとまり、上部の空きも均衡した。ただし大画面で他プレイヤーの街を一目で比べるには席の横送りが必要で、比較モーダルを開く導線を初見で発見できるかは未確認。5〜10人 CPU戦、10人戦の完走とオンラインは後段の操作検証に残す。

## Round 269–272: 大人数ロスターで選択席を表示し続ける

10人戦の1440px画面で末尾の席を横送りして選ぶと、選択中の街は切り替わるが再描画で席レールが先頭へ戻り、選択席が画面外になる問題を発見。席選択直前にロスターのスクロール位置を保存し、街の再描画後に復元する。Service Worker cacheをv238へ更新。

- 最終ブラウザ画像 [round-272-ten-player-last-seat-1440x936.png](../artifacts/design-review/round-272-ten-player-last-seat-1440x936.png) では、レールを横送りした状態（scrollLeft=666px）で席10をクリック後も同じ位置を維持。席10の札はx=1223〜1423pxでレール内に表示され、選択街の見出しも「席10」へ更新された。文書幅1440pxのまま。
- この確認はChromium上の手動ポインター操作で、オンライン/再接続時や自動回帰テストは未確認。10人戦のCPU完走も引き続き未確認。

## Round 273: にぎわい広場のオンライン待機室を街の画面へ接続

待機室は他テーマの暗い設定パネルを継承していたため、にぎわい広場の明るい卓上と世界観が切れていた。待機室全体をクリーム色の卓札パネルにし、参加席を独立カードとして表示する。自分の席、空席、準備中、準備完了、再接続待ちを状態別の背景/文字色で区別し、ID共有・準備完了・ホスト開始・退出のタッチ高を46pxへ揃える。高コントラスト設定では白黒配色を維持する。通信・入退室ロジックは触れず、Service Worker cacheをv239へ更新。

- これは待機室のデザイン実装段階で、実ブラウザのオンライン接続・再接続操作や4テーマ混在の対戦はまだ確認していない。次のまとめ検証で通常/高コントラスト、320px/390px/横持ち/PCを一括確認する。

## Round 274: 待機室では参加に不要な作成フォームを隠す

画面構造を比べると、夕暮れの街/広場はオンライン待機中に作成・参加フォームとタブを隠す一方、にぎわい広場だけ残っていた。待機室表示中はそれらと中断セッション案内を隠し、タイトルヘッダーを一列へ縮め、待機室に最大1040pxの幅を使う。退出時は待機室がなくなり、元の設定画面がそのまま戻る条件付きCSSとする。Service Worker cacheをv240へ更新。

- 入室・退出の実通信を伴う画面遷移は後段の一括ブラウザ検証に残す。現時点では他テーマと同じDOM状態条件をにぎわい広場にも適用した実装レビューのみ。

## Round 275: PCの所有施設カードを主役サイズへ拡大

Round 268の1440×936px画面では、2種類のカードが選択中街パネルに横並びとなり、盤面の上下に大きな空白が残った。PCの選択街ではカード幅を300〜360px、アート高112px、カード最小高230pxへ増やす。2〜3種類なら広いカードで縦に読み、施設が増えたら街パネル内を縦スクロールできる。画面幅761px未満のスマホ横持ちと縦持ちのカード寸法は変えない。Service Worker cacheをv241へ更新。

- CSS条件はPC向け1000px以上の盤面ルール内に限定した。Round 268の同じ1440px状態と、施設が多い終盤の縦スクロールは次のブラウザ一括レビューで再撮影して判断する。

## Round 276: 大画面カード棚の操作案内を縦スクロールへ合わせる

カードを縦並びにするPC幅でも、棚見出しには縦画面用の「横に送る →」が残っていた。1000px以上かつ高さ601px以上では、同じスクロール案内を「縦にスクロール ↓」へCSSで切り替える。スマホ/横持ちでは横送り表示を維持する。画面読み上げに重複する疑似要素を伝えないよう案内は既存のaria-hidden表示のまま。Service Worker cacheをv242へ更新。

ブラウザ回帰fixtureは同種4枚の初期状態では複数種類の案内が出ないため、麦畑・パン屋の2種類を明示して確認する構成に更新した。実行結果は後段の一括確認で取得する。

## Round 277: 収益経路に発動施設名を結びつける

出目レシートは発動施設の一覧と送金経路を別々に読み上げており、同じ送受信者間で複数施設がコインを動かすと、どの施設がその送金を起こしたか対応を追いづらかった。収支投影の集約単位を送信元/送信先/施設にし、各経路を「麦畑：街A → 街B：3コイン」のように表示する。同じ施設から同じ相手への複数記録は引き続き合算する。ゲーム状態や確定ログは変更しない。Service Worker cacheをv243へ更新。

回帰期待値には、同じ2人間の麦畑/パン屋の支払いを分け、同施設の重複記録のみ合算するケースを追加した。テストは後段でまとめて実行する。なお、Reduced Motion設定適用時の紙吹雪停止は既存の`js/storage.js`が呼び出しており、追加監視は不要と確認したため加えていない。

## Round 278: 横持ち市場の送り方向を見出しで示す

844×390pxの短い横画面では中央市場カードを横送りにしているが、操作の手掛かりは右端の薄いフェードだけだった。横向きかつ高さ480px以下の市場見出しを「中央市場 · 横送り ↔」へ変更し、スクロール方向を明示する。この指定は短い横画面専用で、縦画面やPCの縦スクロール市場は変えない。既存ブラウザ期待値も見出し全文へ更新し、Service Worker cacheをv244へ更新。

## Round 279: 移動演出にも施設名を付ける

収支欄では施設名と経路を結びつけたが、画面を横切るコインバッジには移動方向と金額しか出ていなかった。発動施設名を短いラベルとしてコインバッジにも添え、施設の強調表示から受取先まで追えるようにする。バッジは引き続き読み上げ対象外で、テキスト経路欄が音声読み上げと詳細な送金情報を担う。移動中バッジに施設名が含まれるassertionを追加し、Service Worker cacheをv245へ更新。

## Round 280: 待機室の高コントラストを最後まで維持

通常配色の参加タグ/席番号/状態札/操作ボタンは待機室を読みやすくする一方、高コントラストを有効にしても一部の明色チップと緑ボタンが残る可能性があった。待機室内の各操作を黒地・白枠・白文字へ統一し、席役割・番号・準備状態の札には黒地と黄色文字を使う。装飾用テーブルアートは隠して、文字情報と席の輪郭を優先する。390pxの高コントラストブラウザケースを追加した。Service Worker cacheをv246へ更新。検証は実装をまとめた後に実施する。

## Round 281: 動きを減らす設定を紙吹雪へ即時反映

勝利演出の開始時だけでなく、紙吹雪の再生中にアプリ内の「動きを減らす」を有効にした場合も、その場で演出を停止してcanvasを片付ける。bodyのclass属性だけを短時間監視し、紙吹雪停止時に監視を解除する。OS側のReduced Motion変更とタブ非表示時の停止も維持する。Service Worker cacheをv247へ更新。テストは一括検証時に実行する。

## Round 282: コイン移動ラベルの長文を狭い画面で収める

施設名付きのコイン移動バッジは演出層で表示されるため、極端に長い施設名で横幅を押し広げる可能性がある。バッジ幅を画面幅に応じて制限し、ラベル内で省略して、詳細な施設名と送金先は出目レシートの経路欄に残す。320px幅のブラウザ回帰ケースを追加。Service Worker cacheをv248へ更新。テストは一括検証時に実行する。

## Round 283: 再生中のコイン演出も動き低減へ追従

Reduced Motionが有効な状態で演出を始めたときは静止した収支summaryを表示するが、飛行中に設定を切り替えた場合はWAAPI演出が継続していた。アプリ内設定またはOS設定が動き低減へ変化した時点で飛行だけを停止し、読み取り用の送金summaryは表示時間の間残す。停止・再描画時にOS監視とclass監視を解除する。切替経路のユニット回帰ケースを追加し、Service Worker cacheをv249へ更新。テスト実行は一括検証時に行う。

## Round 284: コイン飛行に送金元と受取先を表示

コインバッジは施設名と金額だけだったため、重なった盤面では出発側と到着側を空間位置だけで判断する必要があった。移動ラベルに送金元と受取先を含める。長い参加者名で省略表示になっても金額を読み取れるよう、金額を先頭に置き、完全な経路はtitleと収支summaryに保持する。ユニット期待値を更新し、Service Worker cacheをv250へ更新。テスト実行は一括検証時に行う。

## Round 285: 短い縦画面で盤面メニューの下端を保護

スマホ縦持ちの「その他」メニューはsafe areaの下に固定するが、高さの上限を画面高の70%だけで決めていたため、短い端末では画面下へはみ出す可能性があった。上端の固定位置と下safe areaから使える高さを計算し、その範囲内でメニュー自体をスクロールさせる。320×568pxの回帰ケースを追加。Service Worker cacheをv251へ更新。検証は実装後にまとめて行う。

## Round 286: その他メニューをEscape・外側操作で閉じる

ドロップダウン操作後に他の盤面へ移るとメニューが開いたまま残り、Escapeでも閉じられず、キーボード利用者が現在位置を見失う可能性があった。Escapeで閉じてサマリーへフォーカスを戻し、外側クリック・メニュー内アクション・テーマ変更でも閉じる。390pxの操作ケースを追加。Service Worker cacheをv252へ更新。テストは後段でまとめて実行する。

## Round 287: 高解像度で紙吹雪canvasのメモリを抑える

紙吹雪canvasは端末のdevicePixelRatioを最大2倍で使っていたため、4K画面では約33百万pixelのbacking storeを確保し得た。描画密度に8百万pixelの上限を加え、CSS上の表示寸法と紙片数は維持する。3840×2160・DPR2のメモリ上限回帰ケースを追加。Service Worker cacheをv253へ更新。テストは一括検証に含める。

## Round 288: 分配プールの送金色と収益強調を正しく区別

移動先判定が`null`銀行のみを見ていたため、`pool`を送金元にする収入がプレイヤー間移動色になり、`pool`への支払いが受取側扱いの大収益強調になり得た。銀行と分配プールを共通の非プレイヤー端点として扱い、獲得/支払い色と大収益強調を正す。プール両方向のunit回帰ケースを追加。Service Worker cacheをv254へ更新。テストは一括検証時に実施する。

## Round 289: 2〜4人戦でもイベント発生元の街へ焦点を移す

PCの2〜4人盤面も街詳細を一つずつ拡大する一方、自動イベントフォーカスは5人以上に限られていた。選択中の街と発動/建設した街が別の場合に重要イベントが拡大表示へ出ないため、すべての有効な人数で発動施設の所有者または建設した街へ焦点を移す。2人/4人の発動・建設ケースを追加。Service Worker cacheをv255へ更新。検証はまとめて実施する。

## Round 290: 2〜4人戦の自動焦点と席レールを同期

イベント焦点を2〜4人戦にも広げたが、小画面では人数分の席札を横送りするため、選択した街だけ切り替わって席札が画面外に残る場合があった。自動焦点時の席レールスクロールを全人数へ適用し、320px幅で相手の施設発動・拡大詳細・選択席が同期するケースを追加。Service Worker cacheをv256へ更新。テストは後段でまとめて実行する。

## Round 291: 再描画後も自動フォーカスした席を見失わない

Round 290でイベント発生席へ席レールを送った後、別の状態更新でロスターHTMLが再生成されると、内側の横スクロール位置が失われて選択中の席が画面外へ戻る経路を修正した。`replaceHtml`でロスターの縦横スクロール位置を保持し、4人戦320px幅で相手の発動後に無関係な残高更新が入っても席札が見える回帰ケースを追加。席選択後の詳細パネルへのスクロールも最小限の移動に限定し、動きを減らす設定に追従させた。Service Worker cacheをv257へ更新。テストは最後の一括実行に含める。

## Round 292: 複数の送金経路を金額ごとに読み取れるようにする

収益summaryを経路ごとの改行表示にし、金額を先頭へ出す。読み上げ用の`role=status`/`aria-live=polite`を付け、経路は最大8件まで読み上げて残り件数を案内する。大量発動時にも読み上げが長大にならないようにしつつ、出目の詳細欄から全明細へ移れる。カード卓の狭い画面でも送金元・受取先・施設名・金額を行単位で追いやすくする。Service Worker cacheをv258へ更新。テストは最後の一括実行に含める。

## Round 293: 待機室退出後に再参加欄へフォーカスを戻す

退出フローはルームIDを参加欄に保持し、オンライン参加タブを開いていたが、キーボード/支援技術のフォーカスは退出ボタンが消えた位置に残る可能性があった。確認完了後に参加タブのルームID入力へ`preventScroll`でフォーカスを移す。Online DOM effectsに共通フォーカス処理を加え、退出フローの回帰ケースでフォーカス先とスクロール抑制を確認する。Service Worker cacheをv259へ更新。テストは最後の一括実行に含める。

## Round 294: 待機室の非ボタン操作と開閉状態を再描画後も保持

参加者更新で待機室HTMLを再生成すると、ボタン以外のルームID表示や設定開閉見出しからフォーカスが失われ、開いていた詳細も閉じていた。安定キーを追加して対象要素へのフォーカスを復元し、対戦設定と施設一覧の`details.open`状態を保持する。表示中QRは同じルームIDの更新で維持し、別ルームのQRを誤表示しない。回帰ケースは開いた設定見出しと同一/別ルームQRを更新する条件を含む。Service Worker cacheをv260へ更新。テストは最後の一括実行に含める。

## Round 295: 320×568縦画面で待機席を初期表示へ近づける

既存の320×568待機室画像では、ルームIDとコピー操作が縦積みになり、卓イラストも大きいため、最初の参加席が画面下端近くまで押し出されていた。にぎわい広場の380px以下縦画面では、IDとコピー操作を横一列へ配置し、卓アートと余白を縮める。タッチ操作サイズは保ちながら、4席の最初の札がより早く見えるようにする。320×568のPlaywright撮影・横はみ出し・初期席位置の回帰条件を追加。Service Worker cacheをv261へ更新。テストは最後の一括実行に含める。

## Round 296: 横持ち市場はカードを一枚ずつ大きく比較

844×390の実画面では、中央市場の二段配置により施設アートと価格が小さく、端のカード名も途中で切れていた。短い横画面の市場を一段の横送りにし、約210×154pxの施設カードとして出目・分類・イラスト・名称・価格・在庫を独立表示する。全カードを同時に縮小せず、次のカードが横に続くことをスクロール案内と端の見切れで示す。既存の拡大市場と他画面幅は維持し、844×390のカード寸法・分類・アート・価格・在庫行をブラウザ回帰で確認する。Service Worker cacheをv262へ更新。テストは最後の一括実行に含める。

## Round 297: 横持ちの手番名に十分な表示幅を確保

844×390の既存画面で、手番表示が「プレイヤー1のタ…」のように途中で省略されていた。上部の操作列が使う幅より大きな余白を右側に予約していたため、横幅に応じた予約幅へ変更し、操作列との重なりを避けつつ手番名の領域を広げた。長めのプレイヤー名を表示し、文字が領域内で切れないブラウザ回帰条件を追加。Service Worker cacheをv263へ更新。テストは最後の一括実行に含める。

## Round 298: PC終盤の施設棚は先頭から読めるようにする

施設が棚の表示高を超えるPC向け盤面で、カードの行を上下中央へ配置すると先頭行がスクロール領域より上に出る可能性があった。選択中の施設棚は上端から行を並べ、棚自体の縦スクロールで全カードへ到達できるようにする。1440×900の終盤fixtureに12種類の施設を置き、先頭カードが見え、棚にスクロール余地がある条件を追加。Service Worker cacheをv264へ更新。テストは最後の一括実行に含める。

## Round 299: PC詳細盤面で施設アートをさらに大きく見せる

1440pxの保存画面では、選択した街に広い領域があってもカードアートは112px高に留まり、盤面の主役として弱かった。PCの詳細盤面に限り、カード高を画面高に応じ260〜320px、施設アートを136〜168pxへ拡大する。スクロール棚、カード情報、狭い画面のカード寸法は維持し、終盤カードfixtureでカードとアートの表示サイズを確認する。Service Worker cacheをv265へ更新。テストは最後の一括実行に含める。

## Round 300: PC多人数ロスターで街の名前を読みやすくする

1440×936の10人戦画像では、席レールのプレイヤー名が横一行で省略され、4色の施設数チップも狭い席に密集していた。PCの5〜10人ロスターは名前を2行まで折り返し、色別枚数チップは選択した街の詳細で確認できるため席札から外す。代わりに席札の縦寸法を確保し、残高とランドマーク進捗は維持する。長い名前が切れず、色チップがロスターから退く条件を追加。スマホと2〜4人表示は変更しない。Service Worker cacheをv266へ更新。テストは最後の一括実行に含める。

## Round 301: 極端に長い名前でも席札の高さを保つ

PC多人数ロスターの名前を折り返すと、非常に長い入力名が何行にも伸びて周囲の席情報を押し出す可能性がある。表示名は最大2行に収め、全文は既存のボタン`title`と`aria-label`で確認できる状態を維持する。長名fixtureで行数上限と全文ラベルを回帰条件にする。Service Worker cacheをv267へ更新。テストは最後の一括実行に含める。

## Round 302: 保存データがある短い縦画面は再開操作を優先

320×568の保存タイトル画像では、ブランドと街のヒーロー絵が縦領域を使い、再開/削除ボタンが下端へ詰まっていた。保存データがある320〜380px幅/高さ640px以下の画面ではヒーロー絵を畳み、タイトルとブランドを残して操作カードの位置を上げる。通常のタイトル表示と他画面幅のヒーローは維持する。タイトルの画面幅回帰に320×568を追加し、保存操作が押せることとヒーローの条件表示を確認する。Service Worker cacheをv268へ更新。テストは最後の一括実行に含める。

## Round 303: 勝利の紙吹雪へ形と落下の変化を加える

既存の紙吹雪は32個の小さな矩形がほぼ同じ動きで落ち、街を隠しにくいものの勝利の特別感が弱かった。粒を42個へ抑えつつ短い帯状の形を混ぜ、透明度は最大0.4を維持して勝者名と街を読みやすくする。横流れと緩い加速を加え、8Mピクセル上限、3.6秒での終了、Reduced Motion、背景タブでの停止を維持する。個数・形状・濃度と画面外へ抜けた粒の非再出現を回帰条件に更新。Service Worker cacheをv270へ更新。テストは最後の一括実行に含める。

## Round 304: PC多人数席札と選択中の街の重なりを防ぐ

PC5〜10人ロスターの席札を80px高へ広げた結果、親盤面の先頭グリッド行が64pxのまま残り、ロスターが選択中の街へはみ出し得る。多人数時だけ先頭行を112pxに広げ、席名/残高を読みやすくした分の高さを盤面に反映する。1440px多人数回帰でロスター領域の下端と街の上端が重ならない条件を追加。Service Worker cacheをv271へ更新。テストは最後の一括実行に含める。

## Round 305: 多人数ロスターの拡張を余裕のある大画面に限定

112pxの多人数ロスター行は1440×936では収まるが、1024×768などでは盤面を不必要に狭める。二行の長名表示と高い席札は1200×760以上に限定し、中画面PCは既存のコンパクトロスターを使う。1024×768と1440×936の多人数盤面で、どちらもロスターと選択中の街が重ならない条件を追加。Service Worker cacheをv272へ更新。テストは最後の一括実行に含める。

## Round 306: 施設棚を出目順に並べる

所有施設を購入順に並べると、サイコロの出目と照合する際に棚全体を探す必要があった。同じ施設の所有枚数集約を維持し、表示上のカード群を出目列の昇順で安定ソートする。複数出目は番号ごとに比較し、順序が同じ場合は従来の取得順を保つ。実ゲーム配列は変更せず、発動順は既存のイベント順データを使う。表示順と配列不変条件の回帰ケースを追加。Service Worker cacheをv273へ更新。テストは最後の一括実行に含める。

## Round 307: 大画面のランドマークを街の成長として見せる

選択中の街では施設カードの絵を大きく見せられる一方、ランドマークは施設カードに比べて小さなステータス札に見え、建設目標の存在感が弱かった。既存の選択街タイル規則へ画面幅に応じたサイズ変化を統合し、広い盤面では幅132〜148px、アート最大42pxへ拡大する。狭い画面や他テーマの寸法を変えず、重複する後置ルールは作らない。Service Worker cacheをv274へ更新。ブラウザ寸法とタップ確認は最終一括レビューに含める。

## Round 308: 施設が少ない街の余白をカード棚へ配分

1440×936の10人戦スクリーンショット（`round-272-ten-player-last-seat-1440x936.png`）を見直すと、選択中の街が2施設しか持たない局面でカードが棚の上端へ寄り、棚下部に大きな空白が残っていた。選択街のカード棚を`safe center`にし、カードが収まる局面では空き高さを上下へ配分、内容が棚からあふれる終盤では安全配置により先頭からスクロールできるようにする。既存の1440px終盤ケースは先頭位置を確認し、新しく10人戦の2施設ケースで垂直中央を確認する。これらのブラウザ確認は未実行で、テスト実行は最後にまとめる。

## Round 309: 多人数の席レールに実際の横送り状態を案内

10人戦の320px画面では席レールの一部だけが見える。既存見出しは席選択しか案内せず、横へ送れることが伝わらない。固定人数の条件だけで案内を出すと、広いPC幅で全席が収まる場合にもスクロールを促してしまうため、描画後と画面リサイズ時に実際の`scrollWidth`を測り、はみ出す場合に限って「他の席を見るには横へ」と表示する。スクリーンリーダー向けラベルにも、席が隠れた場合の操作を含める。10人モバイルの案内内容と席選択、サイズ変更時の状態をブラウザで確認するケースを準備する。テストは最後にまとめて実行する。

## Round 310: 手番HUDの名前・残高・フェーズを分離

844×390の出目画面では手番名・残高・段階が一つの文字列となり、名前が長いと所持コインまで一緒に省略される構造だった。カード盤面の表示モデルから手番名と残高を別々に渡し、名前は幅に応じて縮み、コイン残高と現在フェーズは独立して読める表示へ変更する。共通の文字列statusとゲーム状態は維持し、カードテーマの画面表示だけ分ける。長い名前でもHUD名が切れず残高が残る確認を追加。自動テスト・ブラウザ撮影は最後にまとめる。

## Round 311: 建設候補を今回の出目に結び付ける

実対局の出目4・建設画面では発動結果の確認後も中央市場の全カードが同じ見た目で並び、プレイヤーが発動数字を候補カードと照合する必要があった。共通のゲーム状態が建設段階にある間だけ、現在の出目に一致する市場カードへ金色の枠と「今回」バッジを付け、読み上げ名にも一致を加える。建設済みや他フェーズでは消し、在庫・購入可否・市場正本は変更しない。高コントラストでも識別できる枠とバッジを追加し、対象カードと不一致カードを1つの回帰ケースで確認する。テスト実行とスクリーンショット撮影は後段でまとめる。

## Round 312: 大きな出目の候補カードを市場内へ案内

出目一致カードを強調しても、特に12など市場一覧の下方に並ぶ候補は初期表示から見えないことがある。自分の手番に新しい出目結果（通常ロールまたは選択効果の確定）が建設段階へ到達した場合だけ、最初の一致カードが市場のスクロール領域に入るよう送る。画面描画順を確認すると盤面のdraw後に市場HTMLが再生成されるため、候補スクロールは市場更新後へ延期し、古い市場DOMを参照しない。相手の手番、市場外へ出ている自分の手番、再生復元・Undo・テーマ切替・通常の再描画では自動移動しない。12の出目で先頭一致カードが見える位置になるブラウザケースを追加。実行は最後にまとめる。

## Round 313: 短い横画面の街スクロールを明示

844×390の実対局資料では、施設カードの大きさを保った結果、選択中の街の下端にあるランドマーク列が部分的に隠れる。選択中パネルの実際の縦オーバーフローを描画後と画面リサイズ時に測り、横画面で必要なときだけランドマーク見出しに「縦にスクロール」を表示する。細いスクロールバーと端末内でのスクロール連鎖抑制を加え、カード寸法は変えない。短い横画面の2施設ケースで状態判定と案内を確認するブラウザケースを追加。実機での撮影・検証は行っていない。

## Round 314: 縦画面でも街のスクロール位置を案内

選択中の街は施設数や端末の高さによって縦方向にはみ出すため、短い横画面だけでなく幅760px以下のスマホにも実オーバーフロー条件を使った案内を追加する。ランドマーク見出しに下方向の操作ヒントを出し、細いスクロールバーとスクロール連鎖の抑制を設定。高コントラスト表示にも配色を追加し、施設カードの寸法とゲーム状態は変更しない。ブラウザ再確認は最終一括検証に含める。Service Worker cacheをv281へ更新。

## Round 315: 施設連鎖の発動順をカードに表示

複数施設が反応したときのカード強調はログ順の遅延アニメーションで伝えていたが、静止後のカードを見比べても順序が分からなかった。カードの収支行と短縮表示に連鎖内の順番を加え、読み上げラベルにも含める。重複する同一activation記録は順番の重複として数えず、既存のログ位置を用いたアニメーション遅延はそのまま保つ。ゲーム状態やルールの発火順は変更しない。既存UI assertionを新しい文言に合わせ、Service Worker cacheをv282へ更新。検証は最後の一括実行に含める。

## Round 316: 広い盤面で連鎖順をカード札にする

広い画面ではカードを複数同時に見られるため、収支文を読む前に各カードの発動順を見分けられる小さな番号札を追加する。761px未満では札を重ねず、スマホのカード名や出目を塞がない。高コントラスト用の札も定義し、既存の連鎖順 assertionへ属性確認を加える。Service Worker cacheをv283へ更新。スクリーンショット確認と一括テストは後段にまとめる。

## Round 317: 選択中の街に薄い区画地を敷く

PC多人数戦の2施設局面ではカード棚の余白が大きく、白い管理パネルのように見えて街の盤面らしさが弱かった。カード自体の視認性を保つ低コントラストの道路格子を選択中の街だけに敷き、カードのない区画も街の余地として読めるようにする。クラシック等の他テーマやゲーム状態には影響せず、高コントラストでは黒地と白枠へ切り替える。背景テクスチャの目視比較は最終一括ブラウザレビューに含める。Service Worker cacheをv284へ更新。

## Round 318: 結果帯の高さを制限して盤面を確保

収益ルートが多いと、出目・施設結果とコイン移動の説明が中央盤面を押し下げ、市場カードの見える範囲を減らし得る。にぎわい広場のフォーカス盤面では結果帯を最大82〜144pxの独立したスクロール領域にし、内訳詳細を開いた場合のみ広げる。領域をキーボードでフォーカス可能にし、スクロールバーと高コントラスト配色を加える。既存の短い横画面の固定高は維持し、イベント内容自体を削らない。実画面での市場可視範囲は最終ブラウザ確認に含める。Service Worker cacheをv285へ更新。

## Round 319: 新しい結果で収支欄を先頭へ戻す

収支欄を独立スクロールにしたため、前回の詳細を下まで読んだ状態で次の出目へ進むと、新しい出目表示が隠れる可能性がある。ターン/出目が変わった場合、または同じ出目に後続の結果ログが確定した場合は結果帯を先頭へ戻す。同じ結果の通常再描画ではスクロール位置と開閉済み内訳を維持する。最終ブラウザ操作検証で連続ターンと同一ターン内の追加結果を確認する。Service Worker cacheをv286へ更新。

## Round 320: スマホ縦画面の主要操作を下部へ固定

320×568pxの対局画面では選択街が市場と操作パネルより先に並ぶため、プレイヤーは主操作を見つけるまでページを送る必要がある。幅760px以下の縦画面では、現在有効なボタンがあるときだけゲーム操作パネルをsafe area内の固定ドックとして表示する。CPU手番など操作不能な間は通常の盤面配置を保ち、PWAバナー表示中はドックをバナーの上へ移す。街のカード棚と市場棚にはドック分のスクロール余地を追加し、終端項目を隠さない。高コントラスト配色を定義し、テーマ変更やゲーム状態には触れない。320/390pxの実ブラウザ操作とタップ位置確認は最後の一括レビューで行う。Service Worker cacheをv287へ更新。

## Round 321: 固定操作ドックの主ボタンを強調

下部ドックへ移った後も操作ボタンが通常配置と同じ寸法だったため、固定操作面の中で主手段を目立たせる。実行可能な通常アクションを48px以上・14pxにし、長い日本語ラベルは自然に折り返す。ダイス選択肢も48pxを確保するが、文字は選択肢の密度を保つ13pxにする。PWAバナー表示時はゲーム画面が確保する128pxの領域とsafe areaに合わせてドック位置を統一する。ドック外の全画面ボタン寸法は変えない。Service Worker cacheをv290へ更新し、タップしやすさと長文の折返しは最後のスマホブラウザ確認で見る。

## Round 322: 小画面の街スクロール規則をまとめる

街パネルの縦スクロール案内が短い横画面と幅760px以下で別々に定義され、幅境界や高コントラストの調整を重複して保つ状態だった。幅760px以下の案内、細いスクロールバー、スクロール連鎖抑制を既存の同幅メディアブロックへ移し、短い横画面向け規則とは条件を分けて一元化する。挙動は維持し、スタイル定義の重複だけ整理する。Service Worker cacheをv289へ更新。実画面差異は最後の一括ブラウザ確認で見る。
## Round 323: 施設棚のスクロール案内を実際のはみ出しに合わせる

施設種類数や画面幅だけで横/縦スクロール案内を出していたため、カードが収まる場合にもヒントが表示され、PCでは案内方向がCSSの画面幅規則に依存していた。描画後に選択中の施設棚の実寸を読み、横または縦へ実際にはみ出す場合のみ対応する案内を表示する。カード寸法・配列・ルールは変更せず、Service Worker cacheをv291へ更新。複数幅でのヒント表示とスクロール操作の確認は最終ブラウザ一括検証に含める。

## Round 324: キーボードで席を移動し街を切り替える

5〜10人戦では席レールが横に長く、キーボード利用者が各プレイヤーの街を切り替える際に複数ボタンをTab移動する必要があった。席ボタンへフォーカスした状態で左右矢印を押すと隣席へ移り、Home/Endで先頭/末尾へ移動してその街を表示する。ロスターのアクセシブル名でもキー操作を案内する。既存ボタンのTab順・クリック操作は維持し、選択状態は表示だけに適用する。Service Worker cacheをv292へ更新。マウス・タッチ・キーボードの確認は最終一括ブラウザ検証に含める。

## Round 325: ランドマーク列のスクロール案内を実寸で制御

ランドマーク列も項目数に関わらず常に横スクロールを案内していた。施設棚と同じ描画後の実寸判定を使い、列が実際にはみ出すときだけヒントを表示する。Service Worker cacheをv293へ更新。複数幅での表示と横スクロール操作は最終ブラウザ一括検証に含める。

## Round 326: 収支の短縮表示から正しい詳細へ案内

コイン移動の短縮表示と読み上げ文は、表示件数を超えた内容を「出目の内訳」と案内していたが、全ルートを確認できる既存disclosureの名称は「発動・支払いの内訳」だった。省略分と未集計記録の案内を実際の詳細ラベルへ揃え、既存の全経路表示をそのまま使う。Service Worker cacheをv294へ更新。多人数・連鎖時の読み上げと操作は最後の一括確認に含める。

## Round 327: 手番HUDを一列にまとめ盤面の縦幅を確保

320px縦画面の既存対局画像では、手番名・残高・フェーズが別々の要素で折り返され、HUDが複数行となっていた。カードテーマの手番HUDを横一列のflex配置にし、コインとフェーズを固定幅、名前だけを省略可能にする。名前の完全表記はtitleとアクセシブル名に保持し、絵文字付きの表示ラベルから読み上げ用ラベルを分離する。勝利画面には適用せず、Service Worker cacheをv296へ更新。320/390px縦と844×390px横で行数・名前・残高・フェーズの確認は最終一括ブラウザ検証に含める。

## Round 328: 施設連鎖のコイン移動をプレイヤー間で集約

同じプレイヤー間で複数施設がコインを動かすと、施設名ごとの飛び表示が重なり、誰から誰へ合計いくら移ったかを捉えにくかった。アニメーション層だけを出発/到着プレイヤーごとに集約し、金額の大きい経路から最大8件を移動表示する。各施設の収支は既存の内訳レシートに残し、共有ゲーム状態・ログ・ルールは変えない。Reduced Motionと復元時の再生抑止は既存境界を維持し、Service Worker cacheをv297へ更新。複数経路の見え方は最終ブラウザ一括確認に含める。

## Round 329: 縦スクロール中も選択中の街の手番情報を固定

施設やランドマークが多い局面では、選択中プレイヤーの詳細パネル自体を縦スクロールするため、下方を見ている間に街の所有者と残高が画面外へ消える。フォーカス盤面の選択中プレイヤー見出しを詳細パネル内でstickyにし、名前・残高・目標進捗を見失わないようにする。高コントラストでは黒背景・白境界へ切り替える。カード棚と市場のスクロール領域には手を加えず、Service Worker cacheをv298へ更新。終盤の長い街を複数画面幅で確認する作業は最終一括ブラウザレビューに含める。

## Round 330: スマホ縦持ちの街をひとつの縦スクロール領域にする

選択中の街パネルと内部の施設棚が別々に縦スクロールすると、タッチ操作でどちらが動くかが一定せず、固定アクションドックが街の末尾を覆う可能性もある。スマホ縦持ちでは施設棚を内容高にし、選択中の街パネルを縦スクロールの主領域にする。有効な操作ドックが出る間だけ、ドック最大高・safe areaを含む下端余白を街全体へ移し、施設棚内の重複余白を除く。CPU手番の空き余白は増やさない。市場棚の横スクロールと短い横画面のカード列は維持する。Service Worker cacheをv299へ更新。320/390px縦で終盤の施設・ランドマーク末尾まで操作できるかは最終一括ブラウザ確認に含める。

## Round 331: にぎわい広場の特殊効果選択にも施設アートを使う

にぎわい広場は施設アートを共通カード詳細などで利用している一方、清掃業・引越し屋・改装屋・ビジネスセンターの選択UIでは他テーマ限定の分岐によりカード名中心の表示が残っていた。既存の施設描画関数を再利用し、特殊効果の選択肢へ施設アート・名称・選択理由を配置する。ビジネスセンターでは交換候補を小さなカードとして見比べられるようにし、紙色・緑・真鍮色のにぎわい広場配色に合わせる。高コントラスト時は文字と枠の判読性を優先する。ビジネスセンターの候補には分類色の細い縁を残して種類も見分けやすくし、ライブ経路以外の共通renderer呼び出しも同じ表示設定へ揃える。テーマ限定SVGの標準寸法が適用されないカード卓でも、pending見出し/コイン記号の寸法を明示して拡大崩れを防ぐ。選択操作・ゲームルールは変更しない。Service Worker cacheをv300へ更新。ブラウザで各pending効果を実際に開く確認と狭幅での操作確認は最後の一括検証に含める。

## Round 332: 特殊効果の相手選択にプレイヤー情報を添える

テレビ局と引越し屋では対象のプレイヤー名が通常ボタンの文章中に埋もれ、テレビ局では所持コインも一続きで表示されていた。イラストを使うテーマでは席番号バッジ、名前、選択内容/残高を縦階層に分け、タップ領域を最低60pxにする。にぎわい広場は紙色と緑を使い、高コントラストでは黒地と白枠にする。ルール上のプレイヤーindexとデータ属性、選択アクションは維持する。旧テーマの文章型選択表示も保ち、CSSの重複していた市場棚定義をまとめる。Service Worker cacheをv302へ更新。長い名前を含む320/390px画面での折り返し、誤選択防止、読み上げ確認は最終一括ブラウザ検証に含める。

## Round 333: 多人数ロスターをひとつのTab位置から操作する

5〜10人戦では席レールの全ボタンがTab順に並ぶため、キーボードだけで街を切り替えるときの移動量が人数分増えていた。選択中の席（未選択時は現手番、次に先頭席）だけをTab順へ置き、左右矢印/Home/Endで他の席へ移動する既存操作に roving tabindex を加える。各席は通常ボタンのままなのでポインター/タッチと読み上げ名は維持する。Service Worker cacheをv303へ更新。2〜4人と5〜10人のTab順・矢印移動・選択街へのフォーカス保持は最終一括ブラウザ確認に含める。

## Round 334: ローカル/オンライン設定に席の識別を通す

開始前の人間/CPU設定と対局中の席番号が視覚的に結び付かず、オンライン設定でも各プレイヤーが同じ見た目のフォームになっていた。ローカル/オンライン両方のプレイヤー設定に席番号と一貫した席色のアクセントを付け、カード卓のプレイヤーレールと同じ色順を使う。設定値、人数選択、CPU/AIモデル、名前入力、フォーカス復元は変えず、スマホでは識別子を先にした縦配置、高コントラストでは白枠/黄色文字にする。Service Worker cacheをv304へ更新。ローカル/オンラインの2人・10人設定とAIモデル選択は最後の一括ブラウザ操作確認に含める。

## Round 335: 施設連鎖の発動順を収支レシートへ表示

複数施設が同じ出目で続けて反応すると、カード面の発動順は見えても、収支レシート内の経路には順番が出ず、同一施設の複数送金も別出来事のように読める。ログ上の施設発動identityごとに順番を一度割り当て、同じ発動から分岐した複数の送金経路には同じ番号を表示する。レシートの要約と詳細の両方で番号を読み上げ可能にし、既存ログ順・金額集計・ゲーム状態は変更しない。Service Worker cacheをv305へ更新。連鎖/複数経路/従来ログのレシート表示は最後の一括ブラウザ確認で見る。

## Round 336: カード詳細の発動出目を数値カードで示す

カード詳細では発動出目が「[2, 3]」のような本文表記のため、施設アートを見た後に発動条件を探すと文字列から数値を拾う必要があった。各出目を小さな数値タイルに分け、折り返し可能にして10以上の出目も読めるようにする。読み上げラベルには元の出目列を保持し、クラシック/夕暮れ系/にぎわい広場でテーマ配色を使い、高コントラスト時は白枠・黄色数字へ切り替える。カード定義と発動ルールは変更しない。Service Worker cacheをv306へ更新。詳細モーダルの狭幅・高コントラスト表示は最後の一括ブラウザ確認に含める。

## Round 337: ルール説明の冒頭を手番の3段階に整理

ルールモーダルは勝利条件から始まり、その後の箇条書きも「振る→発動→建設」というプレイの流れを視覚的に示していなかった。冒頭に番号付き3ステップを置き、続けて勝利条件を強調してから市場・発動順・カード色・用語・ランドマーク詳細へ読める順にする。紫カードの所有制限は補足として残す。狭い縦画面では一列、広い表示では3列、高コントラストとにぎわい広場の紙色にも対応する。ゲームルール文の意味は維持する。Service Worker cacheをv307へ更新。320px/390pxと844×390pxのスクロール・読了性は最後の一括ブラウザ確認に含める。

## Round 338: カード詳細に色ごとの発動条件を添える

詳細モーダルでは出目と分類名を見られるが、色が示す手番条件・収入元を覚えていない初見プレイヤーは、さらにルール説明を探す必要があった。分類色/施設カテゴリのすぐ下に、青・緑・赤・紫それぞれの発動タイミングと収入の流れを短く表示する。カード固有の効果文はその下に残し、テーマの本文色/高コントラストを適用する。ルール・カード定義は変更しない。ルール説明の「振る」項目には駅建設後の1/2個選択を明記し、発動段階は獲得と支払いの両方が伝わる表現にする。Service Worker cacheをv309へ更新。カード4分類と駅保有時の詳細表示は最後の一括ブラウザ確認に含める。

## Round 339: 狭いカード詳細で分類名を折り返す

長い施設カテゴリや分類名がカード詳細の右側からはみ出さないよう、値側の最小幅を許し、右揃えで折り返す。カテゴリバッジも右端に揃えて複数行表示できるようにする。内容やカード定義は変更しない。Service Worker cacheをv310へ更新。狭幅・高コントラストでの見た目は最後の一括ブラウザ確認に含める。

## Round 340: 収支の要約をプレイヤー向けの言葉にする

ターン結果の詳細に「ログ確認分」「施設差引」と実装側の言い回しが出ていたため、「受け取り」「支払い」「施設効果」に置き換える。常時見える各プレイヤーの合計にも「今回の収支」を付け、獲得・支払い・差引なしを色とともに読み分けられるようにする。収支ラベルはスクリーンリーダーにプラス/マイナスとコイン単位まで伝える。未集計ログがある場合は、要約にも「確認分」と明示し内訳の開き方を案内する。ゲーム状態や収益計算は変えない。Service Worker cacheをv313へ更新。PCとスマホ横持ちで長い名前や10人分の折返しを最後の一括ブラウザ確認に含める。

## Round 341: 赤カードの支払い先まで詳細に示す

カード詳細の赤分類は「振った人が支払う」だけを示し、支払いを受け取る施設所有者が明示されていなかった。発動条件を「振った人から持ち主へ」として、取引の両端が短文だけで分かるようにする。ルール処理は変更しない。Service Worker cacheをv314へ更新。4色の説明が効果本文と矛盾しないか最後の一括ブラウザ確認に含める。

## Round 342: 320px保存画面の削除ボタン幅を保つ

Playwrightの320×568px保存画面と844×390px横持ちで、削除操作の列が60pxへ縮み、44px以上の高さは保っても文字と周囲の余白が窮屈になることを実測した。どちらのresponsive ruleも幅を64px、間隔を6pxに揃える。タイトルと本文のフル幅はそのままにする。画面検査はにぎわい広場固有の紙色selectと夜景canvas非表示を明示し、本文・タイトルの全幅と横はみ出しなしを引き続き測る。Service Worker cacheをv316へ更新。320/390縦持ち・844×390横持ちの保存あり状態を一括ブラウザ確認する。

## Round 343: 縦のカード棚と横の収支チップを実画面に合わせる

Chromiumの実ブラウザで320/390px縦、844×390px横、1440pxの盤面を操作した。縦画面ではひとつの大きな街詳細と横送りの席ロスターが主役で、複数のカードを横へ送れる。fixtureが麦畑4枚を1枚へ集約していたため、追加の異種施設を用意してカード棚スクロールを検証する。10人縦画面は全員の詳細カードを同時に出さず、選択中の街と10席ロスターを使う設計なので、テストは全席の選択ボタンと選択街の表示を検査する。844×390pxでは詳細度の高い共通overflow指定が収支チップの横スクロールを隠していた。重要イベントだけに省略指定を分け、発動チップを横へ送れるようにする。高コントラストでは「建設しない」ボタンだけ通常の紙色が残っていたため、黒地白文字へ揃える。色検査は完全一致ではなく、黒地と7:1以上の文字コントラストを検証する。Service Worker cacheをv318へ更新。画面画像は[タイトル320×568](../artifacts/design-review-round-342-title-320x568.png)、[タイトル390×844](../artifacts/design-review-round-342-title-390x844.png)、[タイトル844×390](../artifacts/design-review-round-342-title-844x390.png)、[10人盤面390×844](../artifacts/design-review-round-343-10p-390x844.png)、[高コントラスト盤面](../artifacts/design-review-round-343-high-contrast.png)。

## 作業方針更新（2026-10-13）

ユーザーの時間効率・メモリ使用量に関する指示に合わせ、関連する実装修正をまとめ、構文確認・関連回帰テスト・ブラウザ確認・Pushは実装バッチの区切りで実施する。小変更ごとの全体テストは繰り返さない。独立レビューは範囲を限定したサブエージェント1名から開始し、ブラウザは同時1本とする。今回の確認時点で利用可能メモリは約4GB、swap使用量は約3.3GBであり、大量のブラウザ・テスト並列化は避ける。

前回の5ケース再検証は実行セッションと一時設定が失われており、完了結果を回収できていない。成功とは扱わず、最後の関連ケース検証に含める。高コントラスト盤面のRound343画像は修正前の記録であり、修正後画像の検証証拠ではない。

## 一括検証と独立レビュー（2026-10-13）

- 変更した全クライアントJSとService Workerの構文確認に成功。静的ファイル検査は809 JavaScript / 25 JSONに成功。
- 1ワーカーのシステムChromiumで、4テーマ混在オンライン・途中切替・再接続のブラウザケースが成功（`artifacts/final-browser-batch.log`）。同バッチの盤面5ケースは失敗し、原因を調査した。
- 異種施設追加後の所有枚数locatorが複数カードへ一致する問題は、麦畑を明示して×4の厳密検証を維持する。横持ちのアート検査は非表示の旧上下席ではなく表示中の選択街を検査する。10人戦は選択街の金枠と自分の席色を区別し、自分→相手への実クリック往復を検証する。boundingBoxに存在しないbottom参照はy+heightへ修正する。
- 高コントラストで購入不可カードの点線枠が消える原因は、共通`:is()`内のIDによる詳細度だった。購入不可ルールに市場IDを加えて意図した点線を復元。Service Worker cacheはv319。
- サブエージェントによる限定コードレビューを2範囲で実施。収支投影・コイン演出、盤面選択・市場フォーカス・スクロール保持には重大な欠陥の指摘なし。実プレイ・画面品質の独立レビューを代替するものではない。

### 公式画像との比較で残る品質差

[公式サイト](https://m-machikoro.g-rounding.com/)の`images/about_01.webp`を閲覧し、手元の390px・10人盤面画像、今回の844×390px発動後画面と比較した。公式画像は発動施設の大きな中央カード・金額・コンボ表示に視線を集め、周辺カードとキャラクターを一体の卓として描いている。ダイスシティの選択街は施設アートと所有数を大きく読める一方、発動の主役が小さな収支チップへ分散し、プレイヤーの個性は席色・記号中心に留まる。施設1種類の序盤では街の空白も目立つ。縦画面の市場は下端操作ドックの背後へ続くため、拡大操作とスクロールの実操作を引き続き評価する。静止画だけから演出テンポ・楽しさ・商用品質到達は断定しない。

公式画像は比較資料としてignoredなartifactsへ取得しただけで、配布資産には含めない。現環境のブラウザ検証はChromiumであり、WebKit・物理スマートフォン検証として報告しない。

### 実装修正後の回収結果

2人CPU対局は95手番進行後に勝利へ到達し、ブラウザ例外なし。出目・施設発動・送金・ランドマーク完成の表示遷移がそれぞれ観測された。観測カウントはDOM更新回数を含み、ゲームイベントの固有件数とは同一視しない。結果JSONは`artifacts/final-design-review/seeded-match-2p-cardboard-desktop-result.json`。

独立した320/390px画像レビューで、施設出目の上端切れ・移動中の長い経路ラベル・操作ドックの密度を指摘された。縦持ちカード棚に残っていた184px固定高を内容高へ変更し、出目と発動情報を切らずに表示する。飛行中ラベルは金額だけにし、施設・移動元・移動先はtitleと静止収支欄に保持する。縦持ち建設フェーズは無効なサイコロ操作を隠し、建設・終了操作の幅を確保する。Service Worker cacheはv320。

その後のブラウザ3ケース（320/390pxの4テーマ切替・共有市場、10人戦の席往復・画面回転・状態不変性）は全成功、横持ち844pxは直前の検証で成功。高コントラストとCPU完走は直前バッチで成功しているが、今回の最終縦持ち修正後の全体再実行は行っていない。コイン移動単体テストは全成功。旧単体期待値は金額先頭の表示順・大額経路を先に表示する仕様へ厳密に更新し、金額と移動先の検証を維持した。

変更後の[320px](design-review/2026-10-13/board-320.png)、[390px](design-review/2026-10-13/board-390.png)、[横844px](design-review/2026-10-13/board-844.png)、[CPU完走時の勝利画面](design-review/2026-10-13/winner-desktop.png)をリポジトリ内に保存。390pxの出目上端切れ解消と、勝利画面の街・結果・再戦導線を目視した。844px画像は飛行ラベル短縮前の記録。最新origin/mainをfetchし、現在ブランチに未取り込みのmainコミットがないことを確認した。

未達・未確認：今回のheadに対する全Unit/CI・WebKit16画面回帰、4人CPU完走、5〜10人終盤、全主要画面・特殊効果の実操作、物理端末、3回の独立した実画面改善サイクルの十分な証拠。商用品質到達とは判定しない。

## 終盤盤面の実画面レビュー・改善（2026-10-13）

4人・10人に各24種類/48枚、ランドマーク5/6を用意し、320/390px縦、844×390px横、1440pxでカード詳細・市場拡大・相手選択を操作した。8条件でページ横はみ出し・ブラウザ例外なし、表示操作前後のゲーム状態一致を確認した（fixtureによる局面であり実進行の完走とは区別）。

重大な問題：844pxの所有棚が複数行になる一方、縦overflowがhiddenで下の施設へタッチ到達できなかった。棚を内容高・一列の横送りへ変更し、修正前のscrollHeight1248/clientHeight152から、修正後は156/156、scrollWidth4416へ改善。PCは同じアート寸法を保って2列へ変更し、24種類の縦長さを6668pxから3332pxへ減らした。横持ち24種類の最終カード到達と状態不変性を回帰検証に追加した。

独立画像レビュー2回目で、横持ちのランドマーク列が画面下へ隠れること、長い名前の名簿上下の切れ、収益比較に詳細を開く手間が指摘された。横持ちランドマーク列をstickyにし、縦名簿の高さを増やす。所有カードへ共通のgetEffectTextから効果を表示し、詳細・ルールとの文言重複定義を避ける。長文は2行で表示し、全文はカードの読み上げ名・title・詳細に保持する。これらの最終画像と操作検証は回収中。

CIで発見した不整合：release-testは紙吹雪のMutationObserverブラウザ宣言不足でESLint停止。宣言を補完した。mobile-webkitは紙吹雪数を旧32個で期待し、製品・単体テストの42個と不一致。ブラウザ期待値も厳密な42へ揃えた。CIのタイトル10件・異テーマオンライン1件・他の勝利画面3件は成功したが、後続は未実行。基準画像更新や検査の緩和は行っていない。

### 終盤レビューの最終結果

追加の独立画像レビューで、stickyランドマークがカードの効果を覆う問題とランドマーク名の省略を指摘された。横持ちはランドマーク列を施設棚の上へ配置し、カードを覆わず名称を折り返す。街に縦overflowがあるときは横・縦の送り方を併記する。最終撮影は送り方の補助文を追加する直前。名簿の上下欠け解消、共通効果表示、重なりのないランドマーク配置を目視確認した。終盤は街の縦送りも必要であり、全情報が常時一画面に見える設計ではない。

[4人横持ち終盤](design-review/2026-10-13/late-4p-844.png) / [4人PC終盤](design-review/2026-10-13/late-4p-desktop.png) / [10人390px終盤](design-review/2026-10-13/late-10p-390.png)。[8条件の操作・状態不変性記録](design-review/2026-10-13/late-review-results.json)に結果を保存した。4人CPUは108手番進行後に勝利へ到達し、出目・発動・送金・ランドマーク完成を観測、ブラウザ例外なし。[勝利画像](design-review/2026-10-13/winner-4p-landscape.png)。このCPU検証は同バッチの効果文・名簿・ランドマーク再配置より前にロードした表示コードで実行している。

集約したブラウザ回帰5件（844/1440px切替、横/PC終盤棚、10人席切替）が成功。その後のランドマーク再配置は8条件の操作と画像で確認し、同じ回帰5件は再実行していない。所有カード単体は14件成功・2件失敗（後のCIで未反映の期待値と判明）、紙吹雪単体8件が成功し、対象3JSのESLintも成功。今回追加したテストは終盤24種類の横送りと共通効果文の安全な描画に限定した。全Unit/CIは次のPushに対する結果待ち。

独立コードレビューと画像レビューを複数回行い、具体的な欠陥を修正したが、公式作品との演出・個性・テンポの差、全主要画面の実操作、物理端末、最新CI/16画面回帰などの完成証拠は引き続き不足している。Goalは継続する。

## 特殊効果・ガイド・保存復帰の確認（2026-10-13）

最新release CIは型検査で停止した。盤面overflow検出のDOM戻り値をHTMLElementとして指定し、getEffectTextをui.jsから盤面へ注入する形へ変更した。`npm run test:types`はmain/ui/storage/onlineの各composition rootを含め成功。型検査のスコープや厳密性は変更していない。

特殊効果6種類（テレビ局、施設交換、清掃、引越し、改装、IT積立）を320px縦・844×390px横の12条件で表示・撮影・選択した。全条件で選択後にpending値が0/falseへ進み、横はみ出し・ブラウザ例外なし。局面準備はfixtureで行い、効果解決ボタンは実クリックした。オンライン同期や全効果の自然発生をこの記録だけで検証したとは扱わない。[12条件の記録](design-review/2026-10-13/pending-review-results.json)。

独立した画像レビューで、施設交換の施設アートが非表示、手順説明が紙色背景上で白文字になる問題を確認。既存の全体CSSと競合していたSVGのdisplayと説明文色をテーマ内で明示し、狭幅の候補を2列へ変更した。[修正後の交換選択320px](design-review/2026-10-13/business-320.png) / [テレビ局横持ち](design-review/2026-10-13/tv-choice-844.png)。説明文色・SVG可視性・同じ行に2候補が並ぶことを限定回帰で検証した。12条件の画像撮影後に説明文色の最後の!important競合を解消し、その状態は320px回帰画像で確認した。

一括ブラウザ検証では施設交換と4テーマのガイド経由購入の5件が成功。購入・Undo・保存再開のケースで、短い建設演出の観測タイミングと、カード棚のスクロールsnapが購入カードを一部隠す問題を発見した。演出は発生時のMutationObserverで厳密に観測するようにし、購入カードのスクロールは先頭へ合わせてsnap戻りを防ぐ。出目1同士では寿司屋の次に麦畑が並ぶため、購入カードへの送りが必要である。最終再検証結果は別記する。Service Worker cacheはv322。

最終再検証で、購入→異テーマ切替→Undo→Reduced Motionで再購入→Undo→保存→reload→夕暮れの街で再開→にぎわい広場へ切替、のブラウザケースが成功した。購入カードが棚内へ収まり、状態が一致することを確認。保存fixtureは市場在庫を消費せず施設を増やしていたため、正しく在庫を減らし有効カードだけを使うよう修正し、保存直後に既存validatorで成功することも厳密に確認した。ルール・保存検証の緩和は行っていない。独立コードレビューでも表示依存注入・スクロール修正・fixtureの整合に重大な指摘なし。

検証はシステムChromium・単一ワーカー。全体スイートは繰り返さず、失敗した購入/復帰ケースだけ原因別に再実行した。最新headの全CI/WebKit16画面・物理端末確認は未完了のため、Goalは完了扱いにしない。次の優先事項はCI結果回収と、非表示の相手パネルも描画することによるDOM/メモリ負荷の確認、初見操作・演出テンポの評価。

## 選択街の描画軽量化とCI単体の整合（2026-10-13）

終盤8条件でDOMを計測したところ、CSSで隠した相手の詳細も描画していた。フォーカス盤面では選択街1つだけを描画し、全員の残高・進捗・分類枚数は名簿、全員の施設比較は既存比較画面に維持する。削除前に各街のスクロール位置を保存し、戻ったときに復元する。削除対象にキーボードフォーカスがある場合だけ選択先の名簿へ移す。実際の手番変更では既存のホットシート引き渡しが優先されるため、その導線は変更しない。

[変更前後の計測](design-review/2026-10-13/focus-render-measurements.json)：4人戦は所有欄のDOMノード2124→1065、施設アート96→24。10人戦は1771→1065、72→24。8条件で詳細・市場・席切替が操作でき、表示前後の状態一致・例外なしを確認した。これはDOM量の削減であり、端末全体のRAM削減率やフレームレート改善を証明した数値ではない。

関連ブラウザ7ケースのうち、発動街の選択・10人席切替・テーマ往復のスクロール保持3件が成功。残る3幅の切替は名簿4色の検査を残しながら再実行して成功。席往復・棚位置復元・削除カードのフォーカス移動も限定再実行で成功。新しい1街描画は単体17件すべて成功、型検査4構成ルート・対象JSのESLint・構文・diff検査も成功。CPU完走の全再実行は今回は省略した。

CI head39043ffcは単体8件で失敗。動的HTML生成、VM間オブジェクト、発動順・説明追加、紙吹雪の誤再生防止、出目タイルなどについて古い期待値を厳密な現仕様へ更新した。軽量DOMには実際の親子・兄弟移動を再現するinsertBeforeを実装した。独立エージェントが6ファイルを修正し、main/online/ui-card-board/ui-plaza-events/ui-winner-effects/ui/integrationの7ファイルを一括実行してすべて成功。検査条件や製品ルールは緩和していない。以前の所有カード単体記録は成功分だけを記載していたため、残っていた2件の失敗も上記履歴へ追記した。

最新headの全CI・WebKit16画面・物理端末・初見の実操作と演出テンポの評価は引き続き不足。Goalは継続する。

## タイトルからの初見操作レビュー（2026-10-13）

390px縦・844×390px横・1440pxで、ルールを開く→CPUとすぐ遊ぶ→人間のサイコロ→建設候補→麦畑購入→reload→続きから再開を、実UIから操作した。ゲーム状態や出目を直接作るfixtureは使用せず、にぎわい広場の表示設定だけ初期化した。3条件とも初期麦畑1枚から2枚へ増え、再開後も2枚を保持し、横はみ出し・ブラウザ例外なし。[操作結果](design-review/2026-10-13/first-play-results.json)。CPUを含む完全な1ゲームのUI操作を確認した記録ではない。

独立画像レビューで、844pxは市場価格が画面下へ続き、建設ボタンも非表示のため購入導線を見落とす問題が指摘された。無効なサイコロ操作を隠して建設候補ボタンを表示し、にぎわい広場では拡大市場を開くよう改善。aria-controls/haspopupも実際のダイアログへ合わせる。購入後に元の起動ボタンが隠れた場合は、盤面の市場拡大操作へフォーカスを戻す。建設ボタンが認識できることは改善後の独立レビューで確認した。[横持ち実ロール後](design-review/2026-10-13/first-roll-844.png) / [390px実購入後](design-review/2026-10-13/first-purchase-390.png)。

市場の「今回」バッジを「出目一致」とし、該当カードの読み上げにも今建設しても現在の出目では発動しないことを明記した。ルールの紫施設上限は「同じ名前の紫色施設は、1人につき1枚まで」とし、施設全体で1枚という誤読を防ぐ。GameManagerのcardId別重複判定と一致する説明で、ルール自体は変更しない。[ルール390px](design-review/2026-10-13/rules-390.png)はサーバー再起動後の最新HTMLで撮影・文言一致を確認した。初回撮影は確認用サーバーが起動時HTMLを保持していたため旧文面だったことも記録する。

一括確認：市場単体7件、建設起動/購入後フォーカスと既存の市場開閉ブラウザ2件、型検査4構成ルート、静的ファイル検査、構文とdiff検査が成功。Service Worker cacheはv324。最新CI・16画面回帰の結果回収、実際の中盤/終盤イベントの最新画像、端末性能・物理操作・演出テンポの評価は継続する。

## CI回収中の検証証拠追加（2026-10-13）

head05972605のRelease gate（3分19秒）とCPU difficulty smokeが成功。Mobile WebKitとPlaza16画面比較は実行中。既存のCPU完走ブラウザ検証へ、実進行のランドマーク進捗に応じた中盤・終盤のスクリーンショットと局面メタデータの保存を追加した。新しい対局ケースは増やさず、既存5秒監視の中で最大2回だけ撮影し、勝利後は中盤/終盤として撮影しない。撮影時にアニメーションを無効化せず、実際の表示を記録する。

既存2人CPU対局が79手番で勝利まで完走し、9手番目（ランドマーク1/3）・65手番目（2/3）の画像とメタデータを取得・目視した。追加撮影を含む既存ケースは成功（4分18秒）。中盤画像でhidden属性の「選択へ戻る」がPCで表示されるCSS競合を発見し、テーマ内でhiddenを優先する修正を実装。1440pxの既存操作回帰1件が成功した。取得画像はこの修正前であり、修正後画像として扱わない。

独立画像レビューでPC名簿名の省略と収支の詰まりを指摘。2〜4人のPC名簿に余裕ある幅を配分し、収支をプレイヤー単位のチップとして分離する修正を実装した。これらは次のまとまった検証対象。Service Worker cacheはv325。

CIの16画面比較は9件差分、Plazaの実操作・境界検査にも失敗がある。4人オンライン同期は成功したが、CI全体は失敗。期待値を更新する前に、実際のはみ出し・操作遮蔽と意図したデザイン変更を分けて調査する。Pushと全体再検証は修正をまとめてから実施する。Goalは継続中。

中盤・終盤の実進行証拠：[9手番目（修正前）](design-review/2026-10-13/seeded-match-2p-cardboard-desktop-mid.png) / [65手番目](design-review/2026-10-13/seeded-match-2p-cardboard-desktop-late.png) / [完走結果](design-review/2026-10-13/seeded-match-2p-cardboard-desktop-result.json)。DOM演出カウンタは再描画を含むため、固有ゲームイベント数とは扱わない。

独立調査で、夕暮れの街の短い横画面向けCSSが夕暮れの広場にも適用され、固定盤面・操作配置を上書きしていた原因を特定し、適用対象を夕暮れの街へ限定した。縦持ち市場のはみ出しは別件として調査中。Mobile WebKitの収支4件は表示集約の単位が「回」から「件」に変わった古い期待値であり、金額・ルート・発動回数の厳密な検査を残して期待文言1箇所を整合した。修正後の一括検証は未実施。

### カメラ位置と横持ち配置の原因修正（実装先行）

縦持ち市場の右端385/420pxについて、単なる撮影タイミングではなく製品側にも根因を特定した。arrangeTownsが市場位置を書き換えた直後、CSSのleft/top補間中のoffsetLeft/Topでカメラ中心を計算していたため、移動完了後も約73pxずれる。配置先のinline座標を使って中心を計算するよう修正した。中間フレームを最終配置として検査しない待機整合も別途必要。

夕暮れの街844pxのCI画像では、player-areaのgrid-column/row:autoが名前付き領域を解除し、サイコロ操作が画面下に落ちていた。短い横画面の既存ルールでplayers/actionsのgrid-areaを明示し、暗黙配置を解消した。独立レビュー担当はplaza固有修正、主担当はsunset配置とcardboardの収支/名簿を並行で実装した。追加ブラウザ・全体テスト・Pushはまだ行っていない。

既存ブラウザ検査はカメラ移動クラスの解除を待ってから境界・ドラッグ開始位置を確認するよう整合。HUDは追加済み施設比較を含む7操作について、個別の表示と44px以上・画面内の条件を保持した。回転後は市場だけでなくカード名/価格が収まるまでpollする。新規ケース・基準画像更新・閾値緩和なし。編集したplazaField.jsの構文確認のみ成功し、ブラウザ一括再検証は次の区切りで行う。

### まとめた修正の限定検証

初回バッチ9件はPCにぎわい1件成功・広場8件失敗。縦持ち市場の境界は通過し、比較表の施設名に出目が加わった古いth完全一致locatorが次に失敗したため、直接の施設名span完全一致＋行1件検査へ整合。横844pxの市場は価格下端が切れたので外側paddingを8→4pxへ変更し、アート/文字サイズを維持した。

森林の青施設ログは現在legacy形式で6件を集約する一方、typed施設発動バッジは要求できない。全員分の実発動なら6+2+2+2で12回であり、古い6回期待は不正確だった。legacyバッジ不存在と4人の収支+6/+2/+2/+2完全一致へ整合。typed紫施設は既存単体で複数payerでも施設発動1回・バッジ1個の検査を追加し、単体ファイルは成功。正本ログの変更・テスト閾値緩和は行っていない。失敗8件を一括再確認中。

最終の限定再確認8件はすべて成功（58.3秒、単一Chromium）。初回のにぎわいPC成功1件と合わせ、市場/比較/収支の対象9件が成功した。型検査4構成ルート、対象JS構文、diff確認、紫収支単体も成功。16画面WebKit全体を再実行した記録ではない。

[にぎわいPC収支・名簿](design-review/2026-10-13/cardboard-receipt-fixed-1440.png)、[広場市場320](design-review/2026-10-13/plaza-market-fixed-320.png)、[広場市場844](design-review/2026-10-13/plaza-market-fixed-844.png)。[夕暮れの街844](design-review/2026-10-13/sunset-layout-844.png)は4人ローカルの実UIで開始し、サイコロの画面内境界とtrialクリック到達を確認、画像も目視した。初回CPUスケジュールを止めたfixtureで停止復旧通知が出たため、全員人間のローカル開始へ変更し撮り直した。実ロール/CPU完走はこの短い配置確認には含まない。

### 建設結果とイベントの読みやすさ（実装中）

独立した静止画レビューで、PCの少数施設が中央に浮いて大きな空白になることと、購入通知が小さい1行で手応えに乏しいことを確認。PC棚を上寄せし、既存の静的建設履歴へ施設アート・施設名・現在所有枚数、ランドマークは完成進捗を追加した。通知から既存詳細を開ける。イベント検知・タイマー・ゲーム状態を追加せず、再開やUndoで新たな演出を再生しない。

明るい盤面に夕暮れ用半透明の送金チップを流用して文字コントラストが弱かったため、にぎわい専用の不透明な配色へ変更した。高コントラスト設定は維持。SW cacheはv326。変更後ブラウザ・型検査は未実施。

head145c9a9eのCIはCPU smoke成功、Release gate内PWA testが失敗。原因は全CSSからsunset専用selectorを禁止する古いassertであり、共通アート/操作/アクセシビリティの検査を維持しつつ、独自盤面配置の分離を明示検査する形に整合した。最新WebKit/16画面は結果回収中。

建設通知の一括確認：購入/Undo/保存再開・ランドマーク新規演出の既存ブラウザ2件成功（26.6秒）。タイトルから実ロール→麦畑購入→通知から詳細を開閉→reload→再開を390/844/1440pxで操作し、所有2枚を保持、例外/横はみ出しなし。通知のクリック委譲先が未接続だった点を発見し、mainUiEventRuntimeの既存player actionへ接続した。

[通知390](design-review/2026-10-13/construction-receipt-390.png) / [横844](design-review/2026-10-13/construction-receipt-844.png) / [PC1440](design-review/2026-10-13/construction-receipt-1440.png) / [実操作結果](design-review/2026-10-13/construction-first-play-results.json)。独立画像レビューで全幅のアート・施設名・枚数と収支配色を確認。詳細操作を発見しやすくする矢印をレビュー後に追加し、画像は矢印追加前である。

カード盤面/テーマの関連単体、型検査4構成ルート、編集JS構文が成功。施設/ランドマーク通知のescape・所有枚数・未所有非表示・状態不変を1単体ケースで追加検査。16画面比較は引き続き差分があり、最新CI全体の完了と画像比較レビューを待って次のPushをまとめる。

### WebKitのPWA通知fixture整合

head145c9a9eのMobile WebKitはにぎわい844pxのinstall通知検査1件で失敗。直接style/classを書き換えるfixtureが、同時表示され得るSW更新通知を考慮せず余白classの消失を要求していた。同時表示が実際の失敗原因であるかはartifactの確認待ち。更新通知中にclassを維持するのは正しい仕様。公開setPwaBannerVisibleで更新通知を閉じてinstall単独表示を設定し、ゲーム中のinstall CSS非表示と余白classなしの両方を厳密に検査する形へ整合した。製品の通知処理は変更していない。

Plaza CIは16画面比較と一部操作レビューが失敗し、盤面検査がまだ実行中。終端とartifactを確認して追加の製品退行を分類する。今回のinstall fixture限定再確認は単一Chromiumで成功（10.7秒）。WebKit成功とは扱わない。

### エラー復旧と空イベント欄の改善

独立コード監査でcrash-boxの高さ上限/スクロール不足を発見し、safe-areaを除いた最大高さと縦スクロールを設定した。[横844](design-review/2026-10-13/crash-layout-844.png) / [縦320](design-review/2026-10-13/crash-layout-320.png) / [境界・ボタン到達記録](design-review/2026-10-13/crash-layout-results.json)。有効な保存を作成してから長いエラーを実表示し、2ボタンをtrialクリックして到達を確認。初回は保存がなく正当に非表示の再開ボタンもクリック対象にしていたため失敗し、保存ありの条件へ修正した。

head145c9a9eのCI画像で更新通知の同時表示を確認し、install単独fixtureの整合根拠を補強した。Plazaは16画面9差分、視覚操作2件、盤面操作4件が失敗。関連5件のローカル再確認は4成功/320HUD1失敗で、出目も収支もない序盤に空receiptのラベルだけがイベント欄を占有している製品問題を発見した。空イベント欄を描画しないことで盤面領域を回復し、既存の高さ/タッチ寸法条件を維持する。関連単体と320の再確認結果は追記する。

WebKitのdragPointは移動クラス解除後でも最終描画が遅れる可能性があるため、実際に市場外のドラッグ可能面が現れるまでpollし、非nullと実マウス移動によるカメラ変化を検査する。市場幅も元の厳密な境界/569pxをpollで維持。portraitは出来事ボタンが横持ち専用なので6操作の可視と出来事の非表示を検査する。起動待機は同期script実行済みのDOMContentLoadedへ合わせ、ゲーム外の外部loadを待たず、45秒の上限は維持。SW cacheはv327。

追加の独立画像レビューはサブエージェントの利用上限で中断。基準画像は更新しておらず、残る9差分を美的に承認したとは扱わない。

空receipt単体と320HUDの限定再確認は成功（7.2秒）。先の関連5件中4成功と合わせて対象5件の修正後成功を確認した。Chromiumによる証拠でありWebKit全体成功とは扱わない。画像差分9件は未承認のまま、今回の製品修正/fixture整合を一括Pushして最新CIで確認する。

### 基準画像差分の目視と名簿の内容高さ

head145c9a9eのWebKit actualと保存基準画像を主担当で比較した。夕暮れの街844pxの左右配置は、操作を画面内へ戻した意図した変更。広場PCの街が旧画像より小さい差には、空receiptによる盤面高さ減少が含まれ、132791d4で解消対象となった。にぎわい320/844/PCは一街フォーカスと施設アート拡大の意図した構造変更だが、旧actualに名簿の上下見切れと横棚への縦送り案内を確認し、これらを承認せず追加修正した。まだ9差分すべての承認には至っていない。

分類チップが折り返す狭幅で名簿の固定84pxが不足し、親の高さだけ増やしても内容が見切れた。portraitの名簿と席を内容に合わせた高さへ変更し、上下の全席境界と縦overflowなしを既存320ケースへ厳密追加。最終の320切替は成功（9.4秒）、10人席選択も成功（9.0秒）。[最終320画像](design-review/2026-10-13/cardboard-roster-auto-320.png)で席番号・名前・分類チップの見切れ解消を目視した。途中の固定高さ案は新assertで失敗したため採用していない。

カード棚の案内はscrollHeightだけでなく実際のoverflow設定も考慮し、hidden/clipの方向を案内しない。縦横の両方が操作可能な場合は両方向を示す。カード/文字を縮小せず、誤案内を解消する。対象JS構文とdiff確認、型検査4構成ルートが成功。SW cacheはv328。最新head132791d4のRelease gateとCPU smokeは成功、Mobile WebKit/Plazaは実行中。サブエージェントは利用上限につき今回の追加画像レビュー未実施。

### 既存WebKit差分の採否整理（主担当レビュー）

145c9a9eのactualを再確認。sunset横844は操作左/街右への配置修正。plaza縦320/390は相手残高の列と手番バッジ追加、PC/横は街を見せる範囲とイベント欄高さの変更を確認した。相手情報が増える意図は妥当だが、空receiptによる高さ減少も含まれるため古いactualは採用しない。cardboardの320/390/844/1440は施設アート拡大・一街フォーカス・市場の大きなカード化という意図した構造変更であり、旧配置を基準に戻す判断はしない。一方、旧actualの名簿見切れ・空欄・PC中央の空白はそれぞれ追加修正済みで、最新画像を待って確認する。

このレビューは主担当の目視判断。独立再レビューの代替とは扱わず、最新9差分の承認/基準画像更新もまだ行わない。head132791d4はRelease gate/CPU smoke成功、Mobile WebKitとPlazaの実行中ゲートを確認した。Plaza視覚操作レビューにはまだ失敗があり、終端後のログ/画像で原因を調査する。

head132791d4のRelease pseudo E2E run38391067116は全体成功。release-test・mobile-webkit・cpu-difficulty-smokeの3ジョブすべて成功をAPIで確認した。install単独fixtureもWebKitゲートで通過した。Plaza専用run38391067043は引き続き実行中/画像差分ありで、全CI成功とは扱わない。ローカルb3cb79f9の名簿/案内修正はまだこのCIに含まれない。

### 最新完走画像から発見した広場カメラの成長追従

head132791d4のRelease成果物を取得し、2人にぎわいは内部turnCount91、4人plaza横持ちは93で勝利まで完走したことを確認した。画面上のターン番号は内部値+1。[CI記録](design-review/2026-10-13/ci-132791d4-match-summary.json)。CPU対局は同ジョブ内のChromiumであり、物理端末やWebKitでの完走ではない。[2人終盤](design-review/2026-10-13/ci-132791d4-seeded-match-2p-cardboard-desktop-late.png)と[勝利](design-review/2026-10-13/ci-132791d4-seeded-match-2p-cardboard-desktop-winner.png)では、アート/建設通知/収支/完成街を確認。

一方、[4人終盤の修正前画像](design-review/2026-10-13/ci-132791d4-seeded-match-4p-plaza-plaza-landscape-late.png)では、対局が完走しても街が画面外へずれていた。成長で町の配置が変わり、CPU全員の観戦ではselfIndexも手番で変わるが、カメラが旧座標を保持していた。選択した街/市場/全体の位置・サイズ・viewportが変わったときだけ、静かに追従するよう修正。手動ドラッグ/ピンチ/ホイール/ズーム/キーボードで移した視点は再描画で取り戻さず、再び街/市場を選んだときに追従を再開する。端末ローカルのカメラだけの変更で、ゲーム状態/送信/保存は変更しない。

4人の育った街とCPU手番変更を準備した短い表示fixtureで、現手番の町が横464px/縦222px見えること、手動pan後のrenderでtransformが保持されることを確認した。[修正後844](design-review/2026-10-13/plaza-camera-growth-844.png) / [測定](design-review/2026-10-13/plaza-camera-growth-results.json)。新たなCPU完走は重複実行せず、既存市場/320・844panとこの成長回帰の4ケースをまとめ、全成功（33.8秒）。型検査4構成ルートも成功。

Plaza専用CI132791d4は7画像差分・視覚レビュー2タイムアウト・overview3タイムアウト。以前のpan nullや市場/portrait境界失敗は通過したが、全体は失敗。固定カメラ画面の最後の撮影がfullPage=trueでWebKitのviewport変更を誘発し得るため、見える盤面の撮影へ整合。タイムアウトや閾値は拡大しない。次に失敗した場合の原因追跡のため、既存の失敗trace.zipもCI成果物へ残す。基準画像は未更新。SW cacheはv329。

### 参照作品との残差の再評価

保存済み公式参照画像（https://m-machikoro.g-rounding.com/images/about_01.webp）と最新にぎわい終盤/勝利画像を目視比較した。施設アートの存在感・色分類・建設結果・完成街の見せ方は改善している。残る差として、参照画像は収益額が大きな視覚的主役になる一方、本作の大収益は移動ラベル16pxと小さい内訳が中心で、収益確定の見せ場が弱い。個性は席色/人間・CPU識別に留まり、参照のキャラクターほど強くはない。これらは未達として保持し、画像基準の更新やテスト成功で商用品質達成とは判定しない。参照画像は評価用artifactのみで製品資産には含めない。

最新f037d182の2CI run38411623403/38411623749は実行中をAPIで確認。ローカルブラウザの重複実行は行わず、失敗が出た場合は保存traceから調査する。

### 確定した施設収支を主役にする

にぎわいの確定手番で施設純増が5コイン以上あるとき、既存receiptへ大きな金額・プレイヤー名・コイン印を表示する。単一送金額や受取総額を利益として扱わず、共通投影のfacilityNetを使う。未集計・手番不明・他プレイヤー・小収益/赤字では強調しない。建設や特別イベントの見出しを優先する。新しいタイマーやイベント正本はなく、保存再開/テーマ往復/再描画では静的な前回結果として表示する。

森林6枚の表示fixtureを準備し、UIから出目5を確定して+6を確認。実ゲームの自然な出目を観察した記録ではない。[390](design-review/2026-10-13/cardboard-income-390.png) / [横844](design-review/2026-10-13/cardboard-income-844.png) / [PC](design-review/2026-10-13/cardboard-income-1440.png)。1ケース内で3幅を確認し、金額が枠内、Reduced Motionで静的、テーマ往復後に移動演出を誤再生しないことを検査した（9.8秒）。単体は受取10/支払4から施設純増6を強調し、escape・不変性・未確定等の非表示を厳密検査。型検査4構成ルートと編集JS構文も成功。

横持ちでは棚自体が横方向だけに動き、街全体が縦に動く場合がある。実際の親パネルの縦overflowも案内し、下部の所有枚数・効果へスクロール到達できることを同ケースで確認。[縦送り後](design-review/2026-10-13/cardboard-income-844-scrolled.png)。施設アートや文字サイズを縮小していない。主担当による画像確認のみで、サブエージェント利用上限のため今回の独立画像再レビューは未実施。SW cacheはv330。

f037d182のRelease pseudo E2Eは成功を確認。Plaza専用は画像比較と視覚レビューが失敗し、盤面ゲートは実行中。最新trace取得後の原因分類と、意図した画像差分の最終承認は残っている。

### カメラ修正後の実対局画像

f037d182のRelease成果物で、2人にぎわい内部turnCount83、4人plaza104の勝利完走を確認。[記録](design-review/2026-10-13/ci-f037d182-match-summary.json)。[4人終盤画像](design-review/2026-10-13/ci-f037d182-plaza-late.png)では街が盤面内へ戻り、短い表示fixtureだけでなく実進行でも追従の改善を確認した。前回の修正前画像と同一局面ではなく、pixel一致の比較ではない。手番通知が中央に出ている瞬間の画像であり、演出なしの定常画面とは区別する。収益強調2c95e32aはまだこのCIに含まれない。

Plaza専用run38411623749は完了・失敗。16画面の差分は5件（sunset844とcardboard4幅）へ減り、操作は視覚レビュー3/overview2が45秒内に完了しなかった。閾値や上限を緩和せず、追加保存したtraceの取得後に待ち時間を分類する。

### trace負荷の切り分けと最終画像候補

f037d182失敗traceを取得・解析。844市場クリックは約17秒のうち、scroll/action/input snapshotで複数秒ずつ消費し、遮蔽/不安定要素のリトライではなかった。同じChromiumの844市場・比較テストをvideo/screencastなし・DOM snapshotsありで実行すると38.4秒、snapshotsも外してAPI/source traceにすると9.8秒で成功した。両者の検査内容・45秒上限は同一で、この比較では製品CSSも同一。製品操作の38秒と断定せず、テスト記録負荷を明示的に分離した。

広場操作・視覚・16画面比較は、明示PNG・失敗時error-context DOM・API時刻/source traceを維持し、毎操作の大きなSVG盤面複製と二重映像記録を避ける。同じ画面/ゲーム状態/クリック/境界/フォーカスassertを保持。画像閾値やタイムアウトの拡大はしない。WebKitでの改善量は次のCI待ち。

製品CSSでは、camera内の市場/比較のSVGへ追加していたCSS drop-shadowと市場フィルタのbackdrop blurを整理。SVG内部の絵・影は維持し、フィルタ背景は不透明色で読みやすくした。市場と比較の操作検証は成功。ゲームのFPS改善はまだ測定していない。SW cacheはv331。

現時点の基準画像差分5件は、sunset横持ち配置とcardboard全4幅の大きな意図的変更。PRの全体CIを何度も起動する前に、PRを持たない候補用ブランチで既存のbaseline生成workflowだけを実行し、16候補を目視してから必要な基準画像を同じ実装バッチへ含める。製品問題を基準更新で隠さない。

### 2026-10-14：16画面の最終候補を目視して採用

候補専用run38417507245は成功（実装82496062）。PRへの全体CIを重ねず16画面生成のみ実行。候補16枚を主担当が目視し、既存画像とのバイト比較で11枚は完全一致を確認。にぎわい4幅と夕暮れの街844の5枚だけ基準へ採用した。

にぎわい横844は従来の上下左右の小さなカードから、固定名簿と選択街/市場へ変更し、麦畑・パン屋のアートと名称が大きくなった。320/390は現在の手番と自分の街を名簿内に表示し、所有カードの効果・枚数も読める。横スクロール案内を保ち、棚端で次カードが一部見える表示はスクロール可能性を示す。PCでは所有カードと市場を独立して比較できる。夕暮れ横844は共通レイアウト整理による操作左・プレイヤー右とフェーズ表示で、以前の異なる並びを基準へ固定し続けない。

画像だけで盤面の全カード到達・クリックを証明せず、これまでの実操作検査と次の通常CIで確認する。序盤PCの選択街にはカード2枚の下に広い余白があり、街の成長余地として使われるが完成された賑わいの証明ではない。プレイヤーの個性、夕暮れの街の序盤アート配置、クラシックの情報画面としての印象は商用比較で残る評価点。今回の採用は退行検出の基準確定であり、Goal完了や商用品質の認定ではない。サブエージェント上限のため最終16候補の独立レビューは未実施。

### 最終候補への独立再レビューと追加改善

57aec950のRelease run38418508567はrelease-test/mobile-webkit/cpu-difficulty-smokeすべて成功。Plaza run38418508621は16画面比較成功、オンライン成功、視覚5/6・overview22/23成功。以前の45秒タイムアウトは解消し、残る2件は320pxの描画座標assertだった。閾値は緩和せず、カメラclass除去だけでなく実際の最終境界をpollする。2人序盤レイアウトの失敗画像ではCPUが既に出目1を処理中で、序盤を測るつもりの検査へ収支HUDが割り込んでいた。このケースだけ既存の制御fixtureと同様にCPUスケジュールを止め、人間のROLL局面を固定した。CPU実進行/完走検査は別ケースで維持する。

サブエージェントの独立画像レビューが再実行でき、主要カードの新たな見切れはない一方、市場が購入不可時に薄すぎることとPC序盤の余白を指摘。市場はグローバルdisabledのopacity/saturateから独立させ、色・価格・名前・絵の濃さを保った。disabled属性・破線枠・購入不可価格表示は維持し、クリック可否は変えない。

PC1000×760以上に限り、1〜2施設種類/合計4枚以下の選択街へ既存renderTownHtmlの実所有施設を使った静的な風景を添えた。表示用renderer注入がないスマホでは景観SVG自体を生成せず、3種類/5枚以上では生成しない。カードサイズや終盤スクロールを変えず、独立unit19件で境界/非注入/不変性成功。初回の実画像独立レビューで景観上部の帯状背景が不自然と指摘されたため、背面の空/成長シルエットを外し、道路・実所有施設へ絞った。最終WebKit候補で外観を再確認する。

限定ブラウザ検査は、市場844と広場320の2件をまとめて3ケース成功（1.5分）、景観1440と固定した2人序盤320の2ケース成功（50.6秒）。最初の市場検査は横持ちの名前も白文字と誤って仮定して失敗し、既存の淡色横レイアウト上の濃色文字とPCの白文字を分けて厳密確認した。景観から成長シルエットを外す最後のCSS整理は、このローカル画像撮影後なので、最終候補で確認する。SW cacheはv332。全テスト/Pushはここまでの変更をまとめて行う。

画像候補run38435644965は16ケース成功したが、アップロードされた16枚が既存基準と完全一致しており最新修正の目視資料にならなかった。CLI helpで--update-snapshotsの既定がchangedと確認。許容差内なら旧基準を残すため、候補生成だけ--update-snapshots=allとして現在の実描画を必ず保存する。通常回帰の許容値は維持。にぎわいのdisabled opacity/filterとPC景観2施設/背景非表示を16ケース内で直接assertし、画像比較だけに改善確認を依存しない。旧候補を最新画像と誤認して承認しない。

候補専用run38436815385は16件成功。市場のopacity1/filter none、PC景観2施設・成長シルエット非表示を直接確認し、--update-snapshots=allで保存した実画像を取得。主担当は320/390/844/1440の4枚を目視し、市場の濃さとPC景観の帯除去を確認、新たな見切れなし。にぎわい4枚だけ基準へ反映し、他テーマは維持。独立画像再レビューと完了監査は継続中であり、主担当の採用を独立承認とは記さない。製品改善と基準画像をまとめてPRへPushして通常CIも並行する。新たな重大指摘があればその時点で対応する。

最終4候補の独立画像レビューも完了。重大な見切れ・読みにくさ・不自然な景観なし、市場の情報色とPCの実所有2施設の景観を確認。320の棚端表示は横送り案内と整合。画像だけのレビューであり、操作の到達性は別のブラウザ検査の証拠を使う。

別担当による完了監査は未完了と判定。商用比較でプレイヤーの個性・街の賑わい・演出の豊かさが残り、CPU完走だけでは人間がUIで意思決定を続けた場合の迷い/テンポ/楽しさの裏付けにならない。最新通常CIもまだ確定していない。次はUIクリックで人間1席+CPUを開始から勝利まで進める検証方法を調べ、正本を直接書き換えたfixtureと区別する。

画像反映dbe80a75のPRへのPushはGitHub DNS解決エラーで2回失敗。候補生成CIの成功は確認済みだが、この未PushコミットがPR/CIへ反映済みとは記さない。
