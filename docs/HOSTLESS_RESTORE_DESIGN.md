# Hostless Restore Design

作成日: 2026-05-19

Status: Deferred design sketch. `docs/IMPLEMENTATION_DECISIONS.md` and `docs/ADR_RESTORE_TRUST_BOUNDARY.md` are now the authoritative decision records. Do not use this sketch to implement non-host canonical replacement unless server-persisted canonical state exists, or the project explicitly accepts a provisional quorum-based lower-trust mode.

## 背景

サーバー再起動後の room 復元は、現在も原則として host の restore bundle を正本候補にします。これは host が online action を生成する設計と整合していますが、旧 host 端末が戻らない場合、非 host が十分な `onlineGameStart` / `onlineStateSnapshot` / `onlineActionLog` を持っていても自動復元できません。

## 現状の安全境界

- host bundle は reconnect token、payload size、schema、mirror replay で検証する。
- 復元済み room の置換は `hostEpoch` と replay-backed rank で判定する。freshness は `stateSnapshot.actionSeq + replayable actionLog count` を使い、`gameStartPayload.actionSeq` や raw `actionLog[].seq` だけを根拠にしない。
- live room の canonical mirror は in-memory なので、server restart 後は snapshot + actionLog replay が復元正本になる。
- 非 host は `ROOM_NOT_FOUND` 後、host 復元を待つ retry に倒れる。

## hostless restore の候補設計

1. 非 host は `recreateRoom` ではなく `restoreCandidate` として bundle を送る。
2. サーバーは候補を即採用せず、同じ roomId の候補を短い grace window で集める。
3. 候補ごとに以下を算出する。
   - `hostEpoch`
   - replay-backed rank（`stateSnapshot.actionSeq + replayable actionLog count`）
   - `replayedActionSeq`（snapshot/actionLog から実際に replay 済みと見なせる seq）
   - canonical mirror state hash
   - player count / player order / reconnect token hash の一致度
4. host 候補が来た場合は host を優先する。
5. host 候補が来ない場合だけ、複数候補の hash が一致し、rank が最大の bundle を provisional room として復元する。
6. provisional room は server log と client notice に明示し、後から host がより新しい hostEpoch/hash の bundle を提示した場合は置換可能にする。

## すぐ実装しない理由

非 host bundle 採用は、改ざん localStorage や stale bundle を room 正本に昇格させる可能性があります。実装する場合は、複数候補 hash 一致、grace window、UI notice、置換ルール、manual recovery 手順をセットにする必要があります。

## 先に入れた足場

- `restorePayloadRankDetails()` で gameStart / snapshot / actionLog の seq 内訳と `replayedActionSeq` を確認できるようにした。
- `onlineSession` 削除時に restore bundle も削除し、古い候補が残り続けないようにした。
- canonical mirror mismatch は server 側に記録済み。

## 手動確認

hostless restore 実装前でも、次を確認対象にします。

- host が復元できない場合、非 host は待機し続けるがクラッシュしない。
- host が戻った後、非 host が正しい状態へ追従する。
- 古い `onlineGameStart` / `onlineActionLog` / `onlineStateSnapshot` が削除操作後に残らない。
