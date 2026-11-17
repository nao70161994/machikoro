# 中央市場の種類数と表示範囲

2026-11-16。にぎわい広場の中央市場へ「全N種」「青 N/M種」「建設可 N/M種」を追加した。共有の施設表示policyで有効セット内の在庫あり施設を数え、山札待機・売切れ・対象外・ランドマークは含めない。一覧のスクロール外も数える。新しいHUD行は追加しない。

横持ちの固定44px幅では件数captionが縦にはみ出したため、絞込は内容幅と折返しなしへ変更し、gridの対応trackも揃えた。目標の自然幅40pxには共通min-width44pxを適用。文字包含やクリックの検査基準は緩和していない。

## 検証

- 補助89af03cb、[WebKit検証43782573118](https://github.com/nao70161994/machikoro/actions/runs/43782573118)の市場caseが成功。320×568、390×844、844×390、1440×936で全件/青/建設可の12状態、一覧種類数、全文Range、目標非交差、native44px、通常クリック・フォーカス復帰・ゲーム正本不変を確認した。[原本計測](assets/market-context/market-context.json)。
- 関連Node2ファイル、編集JS構文検査、独立ソースレビューが成功。
- 4枚の原寸画像を実装担当以外がレビューし、新しい切れ・重なり・カード被覆なし。320/390、とくに844の俯瞰summaryの小ささは残る。全文fitだけで即読性や商用品質を証明しない。
- [320](assets/market-context/market-context-320.png)、[390](assets/market-context/market-context-390.png)、[844](assets/market-context/market-context-844.png)、[1440](assets/market-context/market-context-1440.png)。controlled fixtureであり、自然対局完走の画像とは区別する。同状態の改善前画像は未取得で、この画像だけで盤面全体の改善量は断定しない。

市場と独立して、同runのCPU演出はWebKitで失敗しChromiumで成功している。市場caseの成功でP2の未達を隠さない。主ブランチへ市場部分だけ取り込み、主版での全CIとサービスワーカー更新は残る変更とまとめて確認する。Goalは未完了、PR #19はDraft・マージ保留。
