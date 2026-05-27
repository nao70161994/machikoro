# Ads Plan

## 目的

街コロに本物の広告 SDK を入れる前段階として、画面レイアウトに影響が出にくい placeholder 枠だけを用意する。AdSense 審査中は placeholder-only を維持し、対戦中の判断や操作を邪魔せず、審査後に将来 AdSense / AdMob / TWA 経由の広告に差し替えやすい場所と helper を固定する。

## 現在の配置

- `title-bottom`: タイトル画面の設定タブ群の下。ゲーム開始ボタンや再接続ボタンの直下ではなく、画面末尾の補助領域として表示する。
- `rules-bottom`: ルールモーダル本文の最後。説明本文を読んだ後にだけ見える位置に置く。公開用の `rules.html` には広告 placeholder を配置しない。
- `result-bottom`: 勝利リザルトの統計表示の下。対戦終了後だけ表示し、ゲーム中のサイコロ・建設・Undo 操作には近づけない。
- `privacy.html` は広告の説明だけを置く静的ページで、広告 placeholder や AdSense loader は配置しない。

## 実装方針

- 広告枠の HTML は `js/adSlots.js` の `renderAdSlot(location)` で生成する。
- 静的 DOM の枠は `data-ad-slot-host` を付け、`mountStaticAdSlots()` が DOMContentLoaded 後に placeholder を差し込む。
- リザルト画面は `js/ui.js` の勝利画面描画時に `renderAdSlot('result-bottom')` を呼ぶ。
- 未知の location は空文字を返す。広告 helper が失敗してもリザルト描画は止めない。
- `sw.js` は `js/adSlots.js` を cache 対象に含める。PWA offline 起動でも placeholder helper が欠落しないようにする。

## AdSense 審査中の禁止事項

- 広告計画は `AdSense Review Change Policy` の例外ではない。審査中は広告関連であっても UI 大改修、PWA 挙動変更、URL変更、ルール変更、大規模リファクタを行わない。
- AdSense 審査中は新しい広告 slot、SDK adapter、広告位置変更、広告拡張を追加しない。実広告ユニット (`<ins class="adsbygoogle">`, `data-ad-client`, `data-ad-slot`, ad unit id) も追加しない。審査中の変更は `docs/OPERATIONS.md` の `AdSense Review Change Policy` を優先する。

## 審査後に SDK を入れるときの注意

- 本物の SDK 読み込みは `renderAdSlot` の呼び出し側へ漏らさず、`js/adSlots.js` 内で adapter 化する。
- SDK 読み込み失敗時は placeholder か空枠に戻し、ゲーム進行を止めない。
- ゲーム中の主要操作、pending modal、建設メニュー、サイコロ操作、オンライン再接続操作の近くには広告を置かない。
- 誤タップ誘導に見える文言、ボタン風 UI、報酬示唆は置かない。
- モバイルでは広告枠の高さを固定しすぎず、`max-width: 480px` の既存画面幅に収まることを確認する。

## 確認項目

- タイトル画面下部に `title-bottom` が表示される。
- ルールモーダル本文末尾に `rules-bottom` が表示される。
- 勝利リザルト統計の下に `result-bottom` が表示される。
- 対戦中の `#gameScreen` 操作パネル、建設メニュー、pending modal 周辺には広告枠がない。
- AdSense 審査中の placeholder-only 状態では、SDK 未導入でも console error なしで起動する。
- `npm run test:static`, `npm run test:smoke`, `npm test` が通る。
