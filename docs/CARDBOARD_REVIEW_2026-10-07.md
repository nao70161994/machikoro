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
| 互換性・検証完了 | 読込順/SW/lint/checkJs/テストへ新境界を登録 | 構文・型・lint・静的ファイル成功。全体unitは修正版再実行で成功。旧保存rerollの独立指摘を修正してtargeted再成功。最新25件ブラウザ・最新CIは確認中、ソース独立再レビューの具体的指摘は解消済み |

## 証拠と制約

今回のローカルログはTermuxの一時領域の`cardboard-goal-*.log`、ブラウザ出力は
`artifacts/plaza-experience/native-playwright-final-results/`。成果物は生成物として扱う。
Native ChromiumはTermux向けtooling適応を使っており、WebKitの代替証拠とはしない。
過去HEADのCI成功を今回の完了根拠へ流用しない。

オンライン比較では端末別接続通知等の診断をゲーム状態と区別する既存の方針を維持。
実機の発話・聴感・触覚は自動ブラウザでは確認していない。通常の実機チェックをユーザーへ依頼しない。
