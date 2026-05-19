# Online Recovery Notes

作成日: 2026-05-19

## 対象

オンライン再接続、server restart restore、host migration、Undo 同期、ACK timeout 後の再同期を扱う保守メモです。詳細 schema は `docs/online-restore-schema.md`、実機手順は `docs/CANONICAL_MIRROR_MANUAL_TEST.md` を参照してください。

## cleanup 方針

`onlineSession` はタイトル画面の再接続導線です。これを削除する操作では、同じ room の復元 bundle も削除します。

削除対象:

- `onlineSession`
- `onlineGameStart`
- `onlineActionLog`
- `onlineStateSnapshot`
- `onlinePendingAction`

この方針により、ユーザーが再接続データを削除した後に古い restore bundle だけが残り、将来の復元条件変更やデバッグで誤候補になる状態を避けます。

## restore rank diagnostics

`restorePayloadRank()` は互換維持のため `{ hostEpoch, actionSeq }` を返します。調査や将来の hostless restore 設計では `restorePayloadRankDetails()` を使い、以下を確認します。

- `gameStartSeq`
- `snapshotSeq`
- `logSeq`
- `replayedActionSeq`
- `source`

`actionSeq` だけで採用判断を広げる変更は避け、canonical mirror replay と hash 診断を併用します。

## manual verification required

- 複数端末で再接続、Undo、host 移譲、server restart restore を確認する。
- ACK timeout 後に再同期が走り、二重 action や CPU 二重実行が起きないことを確認する。
- host が復元できない場合の表示と待機状態を確認する。
