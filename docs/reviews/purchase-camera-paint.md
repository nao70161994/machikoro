# 購入後の中間描画の削減

## 問題と変更

cac364e3のNightly41855300869では1440pxの建設演出が初回失敗・retry成功となり、安定性検査が正しく失敗した。市場を閉じる際、卓の復元・俯瞰camera同期・購入カードの正面camera描画が連続していた。次の描画機会が約1.6秒来ない失敗を観測したが、採取したRAF callbackの短さだけでrenderer内部の根本原因を確定しない。

購入前に安定したcamera viewを保存し、有効な購入通知がある終了時だけ中間の俯瞰同期を省く。Backには購入前の意味的な視点を渡し、既存の成長時fit・カードanchor復元を利用する。通常終了、無効な通知、詳細表示からの復帰は従来経路を維持する。session/game/turn/actor、replay/hidden、通知ログの正当性を検査する。未mount、session不一致、resize anchor未復元、寸法未確定時には保存viewを利用しない。

ゲーム状態、480msの建設移動、元の観測期限、クリック方法、Reduced Motionは変更しない。cacheはv355。

## native比較

[run41862446714](https://github.com/nao70161994/machikoro/actions/runs/41862446714)で同じ1440px・DPR3・録画・元assertを前後各3回実行。

|処理|成功|最大採取frame gap|
|---|---:|---|
|旧|1/3|950 / 1116 / 1286ms|
|候補|3/3|923 / 947 / 987ms|

視点復帰・市場の即時再表示・購入Undo・保存再開等の既存8ケースも初回成功。独立ソースレビュー済み。追加で未復元anchor/sessionの保存を除外する安全条件を入れた。比較の候補は基本的なgeometry guardまでの6372c41cであり、安全条件を含む採用版全体はRelease/Nightlyで確認する。

[実測JSON](assets/nightly-quality/camera-637-summary.json)

約1秒の描画空白は残る。3回の成功を長期安定や根本解消と扱わず、採用版の全Nightlyと実UI対局を確認する。前後を固定順で行った小規模比較であり、外部負荷の影響は排除しきれていない。録画を止める別比較では空白が残ったため、録画設定は維持した。
