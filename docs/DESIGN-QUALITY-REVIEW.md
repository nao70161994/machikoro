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
