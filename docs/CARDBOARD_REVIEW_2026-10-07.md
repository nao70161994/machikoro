# カード盤面の再レビュー対応

基準: `c29c80d5`。テーマは端末ローカルで、ルール・snapshot・actionを複製しない。

## 対応と検証範囲

| 要求 | 実装 | 今回の証拠 / 残る確認 |
| --- | --- | --- |
| 5〜10人の相手補充 | `UiCardBoard.selectDetailIndices`。自分・手番・選択を優先し、固定席順で3人まで補充 | unitで5〜10人の役割全組合せ・安定性。390pxの10人初期表示と相手選択はChromium成功 |
| カテゴリ色・短い説明 | 淡色の面、濃色の名前・枚数。色名・記号とアクセシブルな発動条件を維持 | 描画unit成功。白文字コントラスト5.72〜6.47。320/390/1440pxの実寸4色確認がChromium成功 |
| rosterの色別チップ | 青・緑・赤・紫のラベルと枚数 | unit、390pxの10人ブラウザ成功。320/1440pxの4色比較もChromium成功 |
| 共有市場の境界 | `SharedMarketMount`。旧ownerの後片付け・元位置復帰・同じDOMの移設 | unitで30回往復・同一DOM/子ボタン/フォーカス/scroll。実ブラウザ20回高速往復も成功（一覧を開いて有効なボタンへ初期focusするfixture） |
| 共通ターン結果 | `UiTurnEvents.project` と `UiTurnReceipt.buildHtml`。旧APIは互換facade | 従来13ケース＋共有実装の同一性テスト成功。特殊送金は断定集計せず原文と未集計を保持 |
| 出目のpresentation identity | 任意のDICEログmetadataを`DicePresentation`で検証。ログ文言regexを撤去 | 10ケース成功。実GMの別文言reroll、旧snapshotのhydrate、新規roll、駅の途中選択、同出目、圧縮・replay・Undo等。実Engine遷移→新GM採用でも通常/振り直しを強調する回帰成功 |
| フォーカスと再描画 | ランドマーク移動時の復元、同じreceiptのHTML再生成を抑制 | receiptの開閉・focus回帰は修正後Chromium成功。高速往復もChromium成功 |
| 互換性・検証完了 | 読込順/SW/lint/checkJs/テストへ新境界を登録 | 構文・型・lint・静的ファイル成功。全体unitは修正版再実行で成功。旧保存rerollの独立指摘を修正してtargeted再成功。ブラウザ25件は24成功後、シャッフル由来のfixtureを修正した残り1件も成功。ac6cf4a1のrelease/CPU/WebKit CIは成功（WebKit151 passed、1 flaky）。通常配置テストへ更新バナーが混入した条件を修正し、f43d4805の後続CIで152件すべて成功、flakyなしを確認。ソース独立再レビューの具体的指摘は解消済み |

## 証拠と制約

今回のローカルログはTermuxの一時領域の`cardboard-goal-*.log`。
独立デザインレビューで確認した実寸画像は`artifacts/plaza-experience/cardboard-review-20261007/category-colors-{320,390,1440}.png`。
ブラウザの一時出力は後続のtargeted実行で上書きされるため、実行ごとのログと保存した画像を区別する。成果物は生成物として扱う。
Native ChromiumはTermux向けtooling適応を使っており、WebKitの代替証拠とはしない。
過去HEADのCI成功を今回の完了根拠へ流用しない。

オンライン比較では端末別接続通知等の診断をゲーム状態と区別する既存の方針を維持。
ゲーム状態と通常ログは厳密比較し、端末別の接続・切断・ホスト通知3種のみログ比較から除く。SYSTEM累積件数とUndo cacheは端末別診断とし、所有者のcacheがテーマ切替で不変であることと、実Undoが全員へ反映されることを別に確認する。
実機の発話・聴感・触覚は自動ブラウザでは確認していない。通常の実機チェックをユーザーへ依頼しない。

## PWA実ブラウザ確認

- `artifacts/product-pwa-browser/20261007-193701-6f27a9b2/result.json`: 対局中のv2待機、手動更新可能、バナー表示中の市場操作、タイトル復帰後の更新/reload、v1 cache削除、設定維持、サーバー停止後のタイトル/アート表示が成功。対象実装d27319e6、dirty=false。
- `artifacts/product-pwa-online-lobby/20261007-193902-5470b923/result.json`: UIから部屋作成、サーバー再起動後の更新保留、手動更新無効、旧版維持、再接続情報をUIで破棄した後の新版適用が成功。dirtyは検証補助の待ち方修正のみ。
- 検証補助がWebDriver同期scriptの30秒期限で更新promiseを待ち切れなかったため、`update()`を非同期開始し、既存の45秒期限でwaiting/installedを観測する方式へ修正。update拒否は捕捉して検証を失敗させる。アプリの更新コードや期限は変更していない。

## 最新CIと通常配置の試験条件

[CI 37609009076](https://github.com/nao70161994/machikoro/actions/runs/37609009076) は `ac6cf4a1` に対しrelease-test・cpu-difficulty-smoke・mobile-webkitが成功。カード盤面25ケースも成功した。
WebKit全体は151 passed・1 flaky。横844×390の通常広場配置が初回のみ失敗したため、成功だけで終了せず失敗画像とtraceを独立確認した。
更新バナー66pxが実際に現れ、予約領域により盤面が148pxとなり、バナーなし前提の220px超という条件に反した。HUD/操作/盤面の重なりではなかった。
`plaza-overview.spec.js` はPWA検証を含まないためService Workerをblockして通常配置条件を明示する。寸法・非重複assertと期限は維持し、実バナー併用のreceipt/PWA試験も維持する。修正後の[CI 37612469009](https://github.com/nao70161994/machikoro/actions/runs/37612469009)は`f43d4805`に対してrelease-test・cpu-difficulty-smoke・mobile-webkitがすべて成功。WebKitは152 passed（27.0分）、再試行なし。通常配置のローカル4ケースも成功。

## 完了監査

全8項目について上表の実装・unit・実ブラウザ・PWA結果と最新CIを照合した。5〜10人の補充、4色の実寸、20回市場往復、共通結果の同一性、旧保存と実Engine採用後の出目identity、4テーマ混在online・pending・Undo・再接続を確認。
実装担当以外による全範囲の最終レビューは追加具体指摘なし。最後に発見した通常配置のSW混入も、画像・traceで原因特定、独立レビュー、条件修正、ローカル4件、最新WebKit全件成功まで確認した。
対象実装・テストHEADは`f43d48052701db2b9c0615583b3f3a8447ae49e0`。以後のこの完了記録の更新は文書のみで、実装を変更しない。実発話・聴感・実機触覚など上記の未検証範囲は残す。
