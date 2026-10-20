# 全体レビュー指摘への対応（2026-10-20）

## 対象

作業開始時 HEAD `c1fde1ec`、取得した最新 main `d29b1aa1`（PR #17）。既存 PR #18 の改善を維持し、全体レビューの5件を追加で修正する。mainへはマージしない。

## 再現済みの問題

- ChromiumでSocket.IOのscriptリクエストだけを保留するとdocument.readyStateがloading、GameManager/startGameNowがundefined。保留をabortすると起動する。
- にぎわい広場の拡大市場で「i」を押すと、市場はnative :modalのまま、カード詳細divはdisplay:flexだが背面、gameScreenがinertとなる。
- SW network-firstに待機期限がないこと、夕暮れの街の常設手番表示が人間全員を「あなた」に置き換えること、ビジュアルCIにlayout/art変更の条件がないことはコードで確認。

## 実装・検証記録

以下は実装・検証の時系列記録。最終CI・マージ結果はPR #18の完了記録に集約する。

## 検証上の区別

ローカルブラウザはAndroid/Termux上のChromium。物理スマートフォンでの指操作・Safari/WebKitでの確認とは区別する。画面幅エミュレーションを実機検証とは記載しない。

### PWA実測

実サーバーを中継し、Service Workerのinstall・activate・262資産のキャッシュ完了後、全JSへの応答を保留してページをreloadした。ChromiumでGameManagerが使用可能になるまで3,884ms。HTTP 200ヘッダーと未完の本文だけを送り、その後本文を保留する条件でも3,803msで起動した。後者は独立レビューで見つけた追加ケースで、本文受信完了まで同じ期限を適用した。

- 証拠：`artifacts/repository-review-network/headers-pending.json`
- 証拠：`artifacts/repository-review-network/body-pending.json`
- 初回installのキャッシュがない状態での通信停滞を解決するものではない。
- 期限到達後30秒は既存キャッシュを即時使用し、各scriptで3秒待つ連鎖を防ぐ。その後はネットワーク取得を再試行する。期限後の遅延応答による上書きを防ぐ。

### ローカル操作・回帰確認

- `repository-review.spec.js`：Chromium 6件成功（約1分、worker=1）。Socket.IO停滞中のローカル開始、市場詳細の表示/閉じる/Escape/市場復帰/同infoへのfocus復元/市場close後のinert解除、夕暮れの街の手番名・残高を320/390/844/1440pxで確認。通信失敗→復旧後は実際のルーム作成ボタンからSocket.IO再取得とルーム作成に成功した。
- 全体`npm test`は追加したstorage回帰1件が失敗。VMをまたぐPromiseの待機不足を調査し、期待値・製品コードを緩和せずsetImmediateでqueueの完了を待つfixtureへ修正した。修正後の`storage.test.js`は成功。
- 独立レビューで「オンラインUI再試行とloaderが未接続」「HTTP本文停滞が期限対象外」の2件を追加発見して修正した。
- 夕暮れの街は名前・残高を常設statusへ表示。他3テーマの表示方針は維持する。これは意図した画像変更であり、WebKit基準画像は変更内容を目視確認して更新する。
- CIの対象はcardTable*.jsとicons/**に加え、新しい起動・オンライン回帰が依存するmain/socket/online/storage/SWも含める。

### 追加の独立レビュー対応

- 市場内ランドマーク詳細中にDOMが再描画された場合、復帰先の検索でもlandmarkNameを照合するよう修正。
- 詳細中に次の人間手番が来た場合は、native市場の再表示より引渡し画面を優先し、市場を閉じてから引渡しを表示する。
- 追加ブラウザ回帰は1件成功（約8秒）。同じランドマークへの復帰、詳細中の手番交代、引渡し画面の操作とゲーム操作への復帰を確認した。
- 既存`cardboard-online-compat.spec.js`もChromiumで成功（約52秒）。4テーマ混在のルーム作成・参加、正本比較、建設・Undo、回転、途中テーマ切替、保存済み接続の再開と次手番同期を実通信で確認した。

### WebKit画像候補の確認と静的チェック

- 候補生成run `39404880379`は成功。16画像を画素比較し、変更は夕暮れの街4画像だけ。他12画像は画素単位で同じだった。
- 横持ちは手番名・残高、320pxも常設手番文字列の差分が中心。PC画像には従来の外部SVG参照から共有インラインアート準備完了への過渡状態の差もあった。見た目を確認した上で、ビジュアルfixtureは共有アートの準備完了を明示的に待ってからゲームを描画し、読み込み途中の画像を基準にしないよう修正した。
- 夕暮れの街の4基準画像のみ更新。他12画面を維持し、差分許容値は変更していない。
- CI初回の静的チェックは新しいbrowser global 2つのESLint宣言漏れで失敗。no-undefを緩和せず、SocketIoDeliveryとensureOnlineSocketReadyの依存宣言を追加。修正後のローカルlintは成功。型チェックはbaseとmain/UI/storage/onlineの全rootで成功した。
- 独立再レビュー完了：追加したランドマーク識別と手番引渡し優先の修正を確認し、追加の具体的問題なし。

### 最終CIの差分調査

- run `39405608560`のRelease CIは全job成功（ユニット/PWA/オンライン/リリース、CPU smoke、WebKit各shardの4テーマ互換・対局完走を含む）。
- run `39405608523`の16画面比較はクラシック844pxの1件だけ失敗。差分画像を取得して確認すると、中央の一時的な「街4のターン」通知を撮影していた。盤面の配置・色・文字の差ではなかった。
- この画面の基準画像は更新せず、全体盤面の静止基準を撮る前に実際のturnAnnouncerが閉じることを待つfixtureへ修正。固定sleep追加や差分許容値緩和ではなく、撮影対象の状態を明示した。イベント演出自体は別テストで確認する。


## 2026-10-21 再レビューの追加2件

PR先端 `44281336` の再点検で、次を追加確認した。

1. 詳細を開かずnative市場を表示したまま人間手番へ交代すると、handoffのdivが市場の背面に残る。Chromiumでmarket :modal=true、handoff display=flex、handoffOnTop=false、gameScreen inert=trueを再現した。
2. Socket.IOを保留し、保存再接続→新規作成を実UIで続けると、同じsocketからcreateRoom/rejoinRoomの両方を送る。保存状態はfixtureで用意した。最後の操作を優先する取消境界が別々だった。

### 修正

- 共通handoff表示の入口でnative市場と街詳細を閉じ、前席へのfocus/cue復元や詳細中の市場再開予約を解除してからhandoffを表示する。
- 保存再接続開始で既存のlobby待機世代を取り消し、作成/参加開始で保存再接続のtransport待機を取り消す。loader自体は共有し、最後の有効操作だけが使用する。reset/連打/ローカル開始の既存取消も維持する。
- globalsの型宣言とESLint宣言を同時更新。

### 検証計画と証拠

- Node：handoffのnative close→open順、詳細表示中のhandoff保留、create/join×保存再接続の両順序、連打を追加。
- ブラウザ：既存7件に加え、実際のCPUロール・建設・ターン終了から次の人間へ渡る市場表示ケース、4通りのオンライン操作順を追加。CPU手番への入口と保存セッションはfixtureで準備し、CPUの行動とオンライン操作は実ランタイムで確認する。
- ローカル実行はChromium 1 browser/worker=1。スクリーンショットは `artifacts/rereview-fix-2026-10-21/` に保存。
- 独立コード再レビューで追加の具体的問題なし。新規2件はこの確認を受けた上で一括検証する。
- 前回最終CI：Release `39407169163` とVisual `39407169161` は両方成功。今回の変更もPush後のCI成功を確認してから、今回の明示承認に従いPR #18をマージする。

### 追加修正のローカル結果

- ブラウザ12ケースのうち、既存7件とオンライン競合4条件は初回成功。CPUケースは固定の席名を期待して失敗し、ローカル対戦の席順シャッフルを調査した。実際のcpuPlayersとplayersの対応から次席名を求めるfixtureに直し、CPUの実行・次席handoff・市場close・accept後のroll操作まで成功した（約19秒）。
- `npm test`は以前のUI回帰の「市場closeが1回」という内部回数期待だけ失敗。詳細close時の後片付けと共通handoff入口のcloseという2つの明示した経路を反映し、正確に2回・市場再開0回・handoff表示を検証するよう修正。修正後のUI対象テストは成功。
- その他のunit失敗なし。ESLint globalsも宣言済みでlint成功。型チェックとPush後のCI結果はPRに集約する。
- ローカルbrowser終了後に型検査を実行し、重いブラウザプロセスの同時起動を抑えた。
