# PR #19 品質改善の報告

対象製品：`439f82a9` / SW v371。PRはDraft・マージ保留。既知不具合と回帰修復の全体確認は完了。商用同等の品質目標と未確認範囲は末尾に分けて記す。

## 修正と原因

- 夜間の単一長時間実行を6分割へ変更し、同じproject付きIDの和集合を照合する。欠落・重複・未完了・想定外skip・flakyを成功扱いにしない。
- 5/10人表示は旧3席期待を全席へ更新。カード俯瞰と正面閲覧の契約を分け、320pxでも正面カード幅70pxと実詳細操作を維持した。
- 市場・絞込・目標・ガイド・ログの公開操作と排他、回転カードの休業/収支、特殊施設の実収益、更新通知中の選択操作、長名HUD、市場のclipと必要時scrollを修復・検証した。
- 密集配置は候補列数と実寸を比較し、名札は同距離の浮動小数誤差とWebKit描画座標の丸めを原因別に修正。所属・非重複の許容値は拡大しない。
- 通常カードの基本効果は共通説明から表示し、旧発動badgeが所有枚数を覆う問題を修復。アートと名前の領域を保ち、効果を下帯へ分離した。
- 自動送金は同一frameの重複寸法読取を整理し、全affected ownerの正負/0を表示。600ms・7経路・可視2地点・全文・非被覆・完了の検査を維持した。headless WebKitのframe停滞の根絶や実機60fpsまでは証明していない。
- 実対局後の独立レビューで、勝利画面へbody収益札が残る不具合を発見。最終盤面再描画後に既存の演出解除を呼び、実収益→勝利の同期遷移と4幅画像で解消を確認した。

古い期待値の修正と製品修復は区別した。70pxの測定時点、市場の同時可視件数、focus復帰など旧契約から変更した項目も[P0監査](p0-current-coverage-audit.md)に明記している。全旧assertが同一とは説明しない。

## 確認結果

|対象|証拠と範囲|
|---|---|
|通常Release|[v371全ジョブ成功](https://github.com/nao70161994/machikoro/actions/runs/44004485329)。静的/型/unit/PWA/オンライン/release/CPU/ブラウザを含む。|
|画像回帰・操作|[v371成功](https://github.com/nao70161994/machikoro/actions/runs/44004485367)。勝利修正に伴う基準更新や差分許容値変更なし。|
|夜間|直前0a/99版が連続成功。99集約は387一意・386 passed＋許可済み任意1 skipped・retry0。v371も[全成功](https://github.com/nao70161994/machikoro/actions/runs/44004494382)。[原本](assets/card-economy/v371-winner/nightly-browser-coverage.json)は387一意・386 passed＋許可済み1 skipped・retry0・stable=true。|
|自然進行|v370（勝利札修正前）で2人320/1440、4人390/844をCPU1500msで開始→勝利まで実UI操作。v371の勝利遷移は別fixture4幅で再確認。全てPageErrorsなし。相手正面→復帰は2クリック、視点と正本を復元。|
|画像目視|自然進行4条件×序盤/中盤/終盤/勝利の16枚と修復後勝利4枚を独立レビュー。重大な新しい切れ・所有者混同・主要操作被覆なし。|
|多人数|最新の2〜10人適応配置と実クリックを回帰。5/10人の通し対局は以前の100ms確認であり、最新通常速度の全人数×全幅完走ではない。|
|互換性|共有ルールの正本、CPU判断、オンライン/再接続、保存、Undo、4テーマ切替を既存回帰で確認。全機能の全状態組合せを証明するものではない。|

## 画像

[320変更前](assets/card-economy/before-phone-320.png) / [変更後](assets/card-economy/after-phone-320.png)、[PC変更前](assets/card-economy/before-desktop-1440.png) / [変更後](assets/card-economy/after-desktop-1440.png)。

最新自然対局の[320終盤](assets/card-economy/v370-normal-games/late-320.png) / [390終盤](assets/card-economy/v370-normal-games/late-390.png) / [844終盤](assets/card-economy/v370-normal-games/late-844.png)。勝利収益札の[修正前PC](assets/card-economy/v370-normal-games/winner-before-cleanup-1440.png) / [修正後PC](assets/card-economy/v371-winner/cardboard-winner-1440.png)。勝利の前後は自然対局とfixtureで所有構成が異なり、同一状態の画素比較ではない。

## 公式作品との残る差・未確認

全員のカードと中央市場を囲む4方向の卓を維持し、経済効果・枚数・所有者の対応を改善した。一方、密集俯瞰の細字や側面/逆向きカードは正面閲覧が必要で、844序盤の左右余白も残る。公式に比べ立体感やプレイヤー反応は控えめで、演出の手応え・初見の理解速度まで同等以上と断定する根拠はない。

これは自動ブラウザの実UI対局であり、物理スマートフォン/Safari実機・実機音響・初見人間の体験評価ではない。静止画とテスト成功を商用同等の証明として扱わない。詳しい失敗履歴・実測・制限は[原因記録](card-economy-overview.md)と[達成確認表](quality-completion-audit.md)を参照。
