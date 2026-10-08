# にぎわい広場の卓上盤面再設計（2026-10-08）

状態: 完了。実装HEAD `785f6fa2` の必要CI全成功と、担当外のsource/画像再レビューを確認済み。

## 要件と確認結果

| 要件 | 現在の証拠 |
| --- | --- |
| 横844×390 / PC1440、2〜4人の同時比較 | `cardboard-table.spec.js`の6卓。全席HUD・主要3施設・中央市場をviewportとoverflow祖先の両方で確認。担当外も6実画像を確認 |
| 専用小型市場・ルール共有 | `UiCompactMarket`は`UiBuildMenu`の購入可否/在庫/設定を共有。旧3ビューの`buildMenu`を移設しない。unit、購入/Undo/保存再開、混在online建設/Undoが成功 |
| 出目・色・枚数・休業の可読性 | 4色の面と色名、所有数、休業/収支を表示。横の短縮表記は詳細文をDOMにも保持。多種類所持の内部scrollと公園の3行出目を検証 |
| 出目・確定発動・実収支 | 共通`UiTurnEvents`/`UiTurnReceipt`、構造化dice identity、確認済み経路のみの送金。実GMの残高不足/0額/港/電波塔、紫4施設、pending、過去演出抑制/RMが成功 |
| 縦320/390・5〜10人適応 | adaptive追加12件、5/10人横2件、10人の回転/選択。所有/市場詳細の実クリック、roster末尾到達、正本不変を確認 |
| 4テーマ互換 | 混在onlineのserver dice/建設/Undo/途中切替/再接続、TV正本復元後承認action、4ビュー選択状態・保存・pending・高速往復・focusを確認 |
| ガイド/ログ/PWA併用 | 排他開閉、横更新通知＋駅/電波塔/港3件、ガイドON実購入4テーマ＋市場退出時ガイド復帰が成功 |
| 独立レビュー | 専用市場/状態境界のsource、横6卓と収支、縦/多人数/更新通知の画像sampling、紫/scroll/ガイドの担当外再レビューで具体的未対応指摘なし |
| 品質ゲート | ローカル全unit/static/types、変更JS構文が成功。実装HEAD `785f6fa2`のrelease/CPU/WebKit CIがすべて成功 |

横/PC2〜4人は一画面の卓、縦持ちと多人数は専用適応表示です。全人数全画像を網羅目視したとは扱いません。自動ブラウザの到達・配置検証と、担当外の実画像確認を区別します。

## 最終監査で修正した不具合

- テーマ変更前にfocusを捕捉し、切替で操作対象が失われる問題を修正。
- ガイド/ログ/市場内訳の排他、診断・Undo復旧等の表示中市場targetを修正。
- 横カードの休業・収支行クリップ、カテゴリの非色情報不足、公園の13と紫の重なりを修正。
- 紫施設のSPECIALログにoptional確定transfer metadataを追加。複数payerでも発動は1回、個別/合計ログは重複除外。公園は銀行と分配プールを区別し実deltaだけを使う。
- 端末通知の異なるlog.lengthを発動IDに使う不一致（7/4/2/0）を検出。共有カード位置/pending残数へ変更し、通知数/ログ切詰め回帰とstrictオンライン再試験が成功。
- テーマ往復時の内部scroll消失を修正。非表示化前に記録、新DOMへ一度だけ復帰、別sessionは破棄。unit2件と実4ビュー往復が成功。
- `96634cf8`のWebKit CIでPlaza初期ガイドによる市場タップ遮蔽を検出。市場探索中だけガイドを退避し、退出時に設定/展開状態を保持して復帰。実クリック4テーマが成功。

## 主な実行証拠

- `npm test`: 紫追加後の全unit成功。後続scrollは新unit2件とCIの全unitで検証。
- `npm run test:static`: scroll修正後も成功（静的資産、shell/Python構文、maintenance lint、全checkJs）。変更JSの`node --check`も成功。
- 基本6卓＋市場7件: 13件成功（47.5秒）。adaptive12件: 46.8秒。
- 混在オンライン建設/Undo/再接続: 28.5秒。選択状態/オンラインpending9件: 1.2分。
- 横更新通知＋選択3件: 15.6秒。紫4施設＋strictオンラインTV: 5件成功（1.9分）。
- テーマ往復scroll: 1件成功（11.9秒）。ガイドON実購入4テーマ＋復帰: 4件成功（17.4秒）。
- 通常配置はService Workerをblock。更新通知併用は別条件で確認し、実SW lifecycleの証拠はCIのPWA gateで確認する。
- ローカル画像は`artifacts/plaza-experience/card-table-review-evidence/`に保存。CI画像は対象runの`release-mobile-webkit-review` artifact。

旧HEADや旧CIのgreenを今回の完了証拠にしません。現HEADとrunは`git log -1`および`gh run list -R nao70161994/machikoro`で対応付けます。`785f6fa2`の[CI 37730974870](https://github.com/nao70161994/machikoro/actions/runs/37730974870)はrelease・CPU・WebKit全成功。WebKitは188件成功（30.0分）、再試行なし。静的検査・unit・PWA・オンライン/再接続・releaseの各gateも成功しました。以降の完了記録コミットは文書のみで、実装・テスト・CI設定に差分はありません。

## 境界・未検証範囲

- GameManager唯一のルール正本。表示でゲーム進行/残高反映を待たせず、テーマは端末ローカル。CPU/RL・save/reconnectの意味を変えない。
- CPU表示fixtureはCPU実行の証拠ではない。CPU実行はCI difficulty smokeで別途確認。
- 人間へ定型的な実機確認を依頼しない。実発話・実機聴感・触覚は未検証。Reduced Motionと設定尊重は自動検証とsourceで確認。
