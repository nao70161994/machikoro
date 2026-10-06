# 現在の状態

この文書は現在の構成・未完了事項・意図的な制約の入口です。過去の完了記録は各履歴文書へ残します。更新日: 2026-10-06。

## 最新コードと検証結果の確認

固定のHEADや「CI成功」の記述を最新状態として扱わず、次のコマンドで確認してください。

```sh
git status --short
git log -1 --oneline
gh run list -R nao70161994/machikoro --branch main --limit 3
```

CIは対象のコミットを確認し、`release-test`、`cpu-difficulty-smoke`、`mobile-webkit`の結果を読みます。ローカル変更には既存CIの結果を流用しません。

## 現在の構成

- バニラJavaScriptのbrowser-global構成です。`index.html`がクライアントの読み込み順を定義し、`tests/runtime-dependencies.test.js`が主要な依存と読み込み順を検証します。ルールは`GameManager`、実行状態はruntime adapter、描画はUI helperとcomposition rootに分かれています。
- オンラインの検証・アクション生成・replay・snapshot・再接続はクライアントと`server/`の専用モジュールが担当します。待機室の見た目を変える際も、サーバー上の席とプレイヤー対応を変えません。
- 見た目は`style.css`、施設・街の描画は`js/uiBuildMenu.js`、広場のカメラ・HUDは`js/plazaField.js`が中心です。既存テーマの切り替えを維持します。
- 静的検査は`npm run test:static`、通常の回帰テストは`npm test`。追加のオンライン・PWA・release・WebKit検証は変更の影響範囲に合わせて実行します。

## 今回の改善対象（実装済み・最終検証中）

1. 広場の全体表示でも発展度・都市の個性・ランドマーク・プレイヤーを判別できる街の表現。
2. 勝利画面で達成感を遮らず、引き続き利用できるPWA更新・システム通知。
3. 2～10人の参加者・席・準備状態を見渡せるゲームロビー。
4. 「育てた街」の複数建物と「×N」の総数表示による重複・重なりの解消。
5. 変更箇所の依存関係・CSS・テストを、実際の保守上の問題に応じて整理。

関連するユニットテスト・静的検査・Chromium画面確認・実装担当以外の再レビューは実施済みです。最新コミットに対するWebKitとオンライン/PWAを含むCIの結果を確認するまで、goalの完了とは扱いません。

## 意図的な制約

- 無料運用を優先します。`canonicalStateStore`にはnoop・memory・fileの実装がありますが、永続ボリュームのないホスティングでプロセスをまたぐ永続正本を保証するものではありません。無料運用を理由にDB導入を追加しません。
- CSPの運用状況と強制適用の条件は[運用手順](OPERATIONS.md)、復元の信頼境界は[オンライン同期](ONLINE_SYNC.md)を正本とします。
- ES Modulesやフレームワークへの全面移行、巨大ファイルの機械的な一括分割、CPUの新しい性格の追加は今回の前提にしません。
- 人間への定型的な実機確認依頼を避け、自動ブラウザ・CIを利用します。自動検証した画面を実機確認済みとは表現しません。未検証範囲は検証報告に残します。

## 履歴と詳細

- [保守項目と過去の対応](MAINTENANCE_BACKLOG.md)
- [アーキテクチャと移行判断](ARCHITECTURE_REFACTOR_PLAN.md)
- [引き継ぎ履歴](AI_HANDOFF.md)
- [実装の経過](IMPLEMENTATION_PROGRESS.md)

履歴の日付付き記述はその時点の根拠です。現在の未完了事項を追加・解消したら、まずこの短い文書を更新してください。
