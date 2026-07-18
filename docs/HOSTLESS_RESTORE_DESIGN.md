# Hostless Restore Design

Last updated: 2026-07-19

Status: Accepted for staged implementation as a provisional quorum-based
lower-trust mode. This is an availability fallback for casual play, not durable
server authority.

## 2026-07-19 Accepted Contract

- Existing host restore stays authoritative during a 60-second host grace period.
- Hostless candidate collection then lasts 30 seconds.
- At least two distinct human player identities must submit candidates. Multiple
  tabs/devices for one player count once; CPU players never count.
- Every candidate received in the collection window must have the same canonical
  state hash and replay-backed rank. One-client recovery, majority voting, and
  best-rank selection across mismatches are forbidden.
- Completed games are reported as completed and are not recreated.
- The agreeing compatible player with the lowest original player index receives
  a 60-second confirmation. Reject, disconnect, or timeout passes confirmation to
  the next agreeing player. Recovery occurs only after explicit approval.
- The approving player becomes host. A returning former host rejoins its original
  seat without replacing the restored room or reclaiming host automatically.
- Candidate bodies are memory-only and expire within two minutes. Success,
  terminal failure, room completion, and cleanup discard them immediately.
- Each success increments a restore generation; older-generation candidates are
  never reused. A match permits at most three provisional restores.
- Failure reasons distinguish insufficient candidates, mismatch, rejection,
  timeout, completion, and attempt limit without deleting client bundles.
- The confirmation and game log identify provisional participant-data recovery;
  no permanent warning banner is required.
- Hostless support is enabled by default but has an emergency server switch back
  to host-only behavior.
- Socket.IO support is additive. Existing events and payload meanings remain
  unchanged. Unsupported clients are not disconnected; their presence keeps the
  room on the existing host-only path.
- Existing localStorage keys and formats remain unchanged.

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
6. provisional room は server log と client notice に明示し、後から届いた
   host/non-host bundleでは置換しない。

## Implementation Slices

1. Pure candidate canonicalization, equality, rank, generation, expiry, host
   selection, and attempt-limit helpers with table-driven contracts.
2. In-memory coordinator for grace, collection, confirmation rotation, terminal
   cleanup, and emergency disable.
3. Additive client capability, candidate submission, status, confirmation, retry,
   and local discard actions.
4. Integration contracts for host precedence, old-client fallback, mismatch,
   duplicate identities, timeout, completion, and repeated generations.
5. Mixed Android/iPhone manual verification before mobile timing is considered
   fully verified.

## 先に入れた足場

- `restorePayloadRankDetails()` で gameStart / snapshot / actionLog の seq 内訳と `replayedActionSeq` を確認できるようにした。
- `onlineSession` 削除時に restore bundle も削除し、古い候補が残り続けないようにした。
- canonical mirror mismatch は server 側に記録済み。

## 手動確認

hostless restore 実装前でも、次を確認対象にします。

- host が復元できない場合、非 host は待機し続けるがクラッシュしない。
- host が戻った後、非 host が正しい状態へ追従する。
- 古い `onlineGameStart` / `onlineActionLog` / `onlineStateSnapshot` が削除操作後に残らない。

## 2026-05-26 Re-evaluation Gate

The current implementation still does not meet the bar for hostless restore. The new footings change the prerequisites, not the decision:

- `server/canonicalStateStore.js` exists, but the default is noop and `CANONICAL_STATE_STORE=memory` is non-durable. Hostless restore must wait for a durable authoritative store or an explicitly accepted provisional quorum mode.
- `onlineRestoreRoomIndex` exists, but it is only a locator for scoped client bundles. It must not promote non-host bundles to canonical state.
- `restoreAudit` metadata exists, but unsigned audit records do not add trust, freshness, or authority.

Hostless restore can be reconsidered only after all of the following are true:

1. Durable server-persisted canonical state exists, or the product explicitly accepts lower-trust provisional restore.
2. Candidate comparison fixtures cover canonical hash, replay-backed rank, host epoch, player order, and reconnect token hash consistency.
3. Replacement rules define what happens when a host candidate arrives before, during, or after a provisional restore.
4. Multi-device manual tests cover host disappearance, host migration, server restart, stale client cache, and mobile background/resume.
5. User-facing diagnostics clearly label provisional recovery and do not present it as authoritative.

Until those gates are met, non-host clients should keep retrying or reconnecting, and restored room replacement remains host-only.
