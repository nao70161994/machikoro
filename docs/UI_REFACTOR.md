# UI Refactor Notes

作成日: 2026-05-17

## 現状

UI は browser-global のまま維持する。大規模な framework 化や全面分割は行わず、既存テストで守れる単位で inline handler を delegated handler へ移す。

## 今回対応

- dice choice（駅のダイス数選択、電波塔の振り直し、港の +2 選択）を `data-action` ベースの delegated click handler へ移行した。
- Business Center のカード chip 選択を `data-action="selectBusinessCard"` に移行し、hidden input 更新は既存 helper で維持した。
- build menu のカード建設、ランドマーク建設、詳細表示、filter、Undo を `data-action` ベースの delegated click handler へ移行した。
- player panel のカード詳細表示を `data-action="showCardDetail"` へ移行した。
- pending menu の既存 delegated handler と同じ `actionButtonFromEvent()` helper を使うようにした。

## 残す方針

- card settings は、入力状態や既存 DOM id 依存が強いため、別 PR で targeted test を先に追加してから移す。
- render 分割は、HTML 生成 helper を増やす小さい変更に限定する。
- custom modal 方針は維持し、native confirm は戻さない。

## 次に触る順序

1. card / landmark toggle の delegated handler 化。
2. stats UI の inline handler 削減。
3. renderPending の pending 種別ごとの helper 分離。
