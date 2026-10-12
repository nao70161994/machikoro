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
