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

- 横画面市場アート縮小と回転後カード情報assertionはPlaza WebKit run [37933873646](https://github.com/nao70161994/machikoro/actions/runs/37933873646) で進行中。
