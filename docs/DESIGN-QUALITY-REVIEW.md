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
- 5〜10人戦では自分の席を残し、相手席の列だけを横スクロールできるようにする。
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
