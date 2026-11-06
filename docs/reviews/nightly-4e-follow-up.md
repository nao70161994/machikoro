# 4e全体検証後の追跡

Goal未完了、PR #19はDraft・マージ保留。

## 確定した結果

- 通常Release [41330278049](https://github.com/nao70161994/machikoro/actions/runs/41330278049) 成功。browser重点5件・overview34件・勝利4幅の取得ログにretry/flakyなし。
- 16画面と操作 [41330278024](https://github.com/nao70161994/machikoro/actions/runs/41330278024) 成功。今回のhint採用に伴う基準画像更新なし。
- Nightly [41330282749](https://github.com/nao70161994/machikoro/actions/runs/41330282749) は全6shard完了・ID和集合一致。ただし349初回成功＋2再試行成功＋許可済skip1。緑だけで安定成功とは判定しない。shard所要時間7.8〜17.0分。
- 実UI [390/844](https://github.com/nao70161994/machikoro/actions/runs/41330347468)、[320/1440](https://github.com/nao70161994/machikoro/actions/runs/41330356275) はいずれも開始から勝利まで完走。通常設定CPU弱1500ms、非seed、人間席の自動UI操作。実機スマホ・人間による体感確認ではない。

## Nightlyの2 flakyと対応

両ケースとも45秒の全体期限で終了。初回失敗のtraceとPNGを取得し、最後の操作だけを原因とは扱わなかった。

1. 同一ゲームの市場5往復・20テーマ遷移：Before Hooks開始356635ms、5回目の市場close/focus確認400856ms、最後のテーマ4連続は402209msで完了、最終正本読み取り402377ms。個別のfocus/assert失敗ではなく、処理が全体45秒を越えた。1440×936でもiPhone13のDPR3/タッチ・UAを継承していた。PC用ケースをDesktop Safari設定に限定して修正。**5回の連続操作、20遷移、共有DOM・正本・focusの全assert、45秒期限を維持**。高DPRモバイル1440pxという旧組合せの保証はこのケースでは外れることを明記する。320/390/844や他1440ケースの設定は変更しない。描画hintの因果証明やモバイル演出テストのDPR変更ではない。
2. 終盤購入・演出・Undo・保存再開：Before Hooks開始517679ms、保存後reload/resumeの正本取得562063ms、最終cardboard復帰の属性確認564823ms。summaryのwaitは期限超過後で、永久にsummaryが存在しない証拠ではない。通常購入→テーマ切替→Undo→保存→reload→再開→元表示の正本照合を元ケースに残し、Reduced Motion購入/Undoとイベント競合購入/Undoを独立2ケースへ分割。同じ37施設の合法在庫fixtureと購入前observerを共有helperにし、全assertを移動。制限時間、移動時間、収支、非重複の条件は変更しない。

独立ソース監査ではassert消失・参照ミス・緩和なし。ネイティブ実行での成功は修正後に確認する。

## カバレッジ監査の追加

旧318件はWebKit316＋Chromium2。現4eの352件との対応は310同名＋8改名/分割、未対応0。[対応JSON](assets/nightly-quality/baseline-case-correspondence.json) は4e時点のdiscoveryで、修正後354件の実行証拠ではない。

拡大市場の既存操作ケースへ、有効カード集合＋正規在庫から期待施設名を算出する全件照合と、最後の施設詳細への通常click・Escape後のfocus復帰を追加。カード群の見た目だけでは市場全件へ到達できる証明にならなかった不足を補う。force click、assert削除、許容値緩和、想定外skipは追加しない。

任意の重点診断は元の発動2件・建設2件に上記市場/往復/購入3条件を加えた9件をretry0で実行する。通常Release/Nightlyの選択範囲を置き換えない。
