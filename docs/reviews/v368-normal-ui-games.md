# v368の通常速度・実UI対局

2026-11-17 JST。主製品46371bf8をcheckoutで固定し、既存のUI完走テストを変更せずXvfb上のheaded WebKitで実行した。1席はブラウザの実ボタンを自動操作し、残りはCPU弱。出目・乱数は固定せず、CPU1500msの通常設定。物理端末・人による手操作とは区別する。

[実行43893969508](https://github.com/nao70161994/machikoro/actions/runs/43893969508)。1440pxの2人戦はiPhone相当DPR3のままPC幅へ広げた設定で25分上限に達し未完了。63turn/164判断/253clickまで進み、PageErrorsは空。標準デスクトップ設定での別検証はこれから行う。以下は完了した条件だけ。

|人数・幅|turn|実UI判断|click|実時間|結果|
|---|---:|---:|---:|---:|---|
|2人・320px|67|185|284|554603ms|勝利まで完走|
|4人・390px|66|77|128|559976ms|勝利まで完走|
|4人・844px|95|100|163|772690ms|勝利まで完走|

全条件PageErrorsなし。相手正面の閲覧→戻るは2clickで元の視点・正本へ復帰した。原本集計：[320](assets/automatic-results/normal-ui-2p-320-summary.json)・[390](assets/automatic-results/normal-ui-4p-390-summary.json)・[844](assets/automatic-results/normal-ui-4p-844-summary.json)。

各条件の初回建設・中盤・終盤・勝利の12画像を独立レビューし、所有者名/施設群/市場/ランドマーク/主要操作の重大な被覆・切れ・絵柄欠落なし。勝利名/6目標完成/再戦入口も明瞭。[390終盤](assets/automatic-results/normal-ui-4p-390-late.png)・[844終盤](assets/automatic-results/normal-ui-4p-844-late.png)。

密集終盤の細字と回転した文字は正面閲覧が必要。序盤・中盤の空白は残る。同状態のbeforeではなく、新演出による改善量や悪化と断定しない。静止画と完走ログだけで全演出の快適さ・物理端末の性能・公式作品との同等性を証明しない。演出の時系列は別の固定CPU回帰と合わせて評価する。

5/10人の自然対局完走は過去v362、今回の通常速度実UI完走は上の人数・幅に限る。新しい全件回帰では人数適応・4テーマ・保存・Undo・オンラインも維持して検証する。全人数×全幅の自然対局を完走したとは説明しない。

1440の未完了原本は[集計](assets/automatic-results/normal-ui-2p-1440-incomplete-summary.json)。各操作約2〜3秒、初回の5枚の出目撮影は合計約18秒を要した。DPR3が失敗原因と断定せず、高DPI条件の遅さとして残す。25分上限・通常速度・完走条件を緩和せず、PC幅だけDesktop Safariプロファイルへ変更し、実際のUA/DPR/touchを報告へ記録する。モバイル3幅のプロファイルは変更しない。

## 標準PCプロファイルでの追加完走（v369候補）

[43901516365](https://github.com/nao70161994/machikoro/actions/runs/43901516365)の1440×900px・2人戦は、通常CPU1500ms・固定seedなし・元の25分上限を保って勝利まで成功。最終観測turn65、結果画面66ターン、159判断・254click・33keyboard、772169ms。PageErrorsなし。相手正面→戻るは2clickで、元視点と正本を復元した。[原本](assets/automatic-results/normal-ui-2p-1440-desktop-summary.json)・[終盤](assets/automatic-results/normal-ui-2p-1440-desktop-late-game.png)・[勝利](assets/automatic-results/normal-ui-2p-1440-desktop-winner.png)。

実測はPlaywright標準Desktop SafariのUA・DPR2・touch0・screen1440×900。DPR1ではない。PC幅だけisMobile=falseの標準Desktop設定を指定し、モバイル3幅は既存iPhone設定を保持した。プロファイルのassertも成功。以前のDPR3/touchあり・PC幅の未完了は取り消さず残し、DPR差だけが原因だとは説明しない。

序盤建設・中盤・終盤・勝利の4原本画像を実装担当以外の視点で確認した。カード・市場・所有札・目標・操作の新たな重大な切れや被覆なし。完成6目標・勝者・再戦・全施設枚数を読める。序盤の左右余白と終盤俯瞰の細字は残り、対面カードを読むには正面閲覧が必要。初回dice画像採取は各実測約1.3秒を要して予定した短い間隔を満たさず、これをサイコロの滑らかな時系列の証拠とは扱わない。実時間演出の検証は別のCPU専用caseで区別する。

この対局の製品は経済帯追加済み・名札空間修正前。最終の名札変更は関連nativeと全件CIで別途確認する。4幅の通常速度完走が得られたが、全人数×全幅や物理端末を検証済みとはしない。
