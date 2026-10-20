# 全体レビュー指摘への対応（2026-10-20）

## 対象

作業開始時 HEAD `c1fde1ec`、取得した最新 main `d29b1aa1`（PR #17）。既存 PR #18 の改善を維持し、全体レビューの5件を追加で修正する。mainへはマージしない。

## 再現済みの問題

- ChromiumでSocket.IOのscriptリクエストだけを保留するとdocument.readyStateがloading、GameManager/startGameNowがundefined。保留をabortすると起動する。
- にぎわい広場の拡大市場で「i」を押すと、市場はnative :modalのまま、カード詳細divはdisplay:flexだが背面、gameScreenがinertとなる。
- SW network-firstに待機期限がないこと、夕暮れの街の常設手番表示が人間全員を「あなた」に置き換えること、ビジュアルCIにlayout/art変更の条件がないことはコードで確認。

## 実装・検証記録

作業中。修正、まとめた関連テスト、実ブラウザの4画面幅確認、独立再レビューの証拠を追記する。

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
