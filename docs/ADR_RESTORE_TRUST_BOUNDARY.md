# ADR: Restore trust boundary

Date: 2026-05-24

Status: Accepted

## Context

Online play is currently a casual-trust system. Live rooms use server validation, server-generated dice for live dice actions, canonical mirror replay, reconnect tokens, restore rank, payload limits, and snapshot/action log checks. However, server restart restore still depends on a client-supplied local restore bundle, primarily from the host.

The deferred design items are:

- hostless restore
- signed restore
- server-persisted canonical state

This ADR records the decision space without implementing any of these changes.

## Current Trust Boundary

Server-trusted today:

- room membership and reconnect token hashes held by the live server
- live action order and accepted sequence numbers
- live dice generation for new dice actions
- live `canonicalMirror` while the process is alive
- schema, size, payload, phase, actor, and mirror replay validation

Client-supplied today:

- restore bundle after server restart
- persisted `onlineGameStart`, `onlineStateSnapshot`, and `onlineActionLog`
- historical dice values inside restored action logs, validated for replay compatibility

Current policy:

- Host restore is the only room replacement authority.
- Non-host clients wait for host restore after `ROOM_NOT_FOUND`.
- Server restart restore is a resilience feature, not a competitive anti-tamper feature.

## Decision Drivers

- Preserve casual-play reconnect and server restart recovery.
- Avoid accepting stale or tampered localStorage as canonical room state.
- Keep the online model understandable for future AI/human maintainers.
- Avoid a partial security feature that looks authoritative but is not.
- Keep PWA/offline/mobile recovery behavior practical.

## Options

### Option A: Keep current host-only restore

Continue to accept only host restore bundles for `recreateRoom`. Keep validation, ranking, action log replay, and diagnostics as the safety boundary.

メリット:

- No migration risk.
- Matches current host-driven CPU/action ownership.
- Lowest implementation cost.
- Avoids promoting non-host stale bundles to canonical state.

デメリット:

- If the host never returns after server restart, non-host clients cannot restore the room.
- Does not solve tampered host localStorage.
- Not suitable for ranked, prize, public competitive, or permanent-record play.

実装リスク:

- None if left unchanged.
- Future contributors may mistake the current validation for a full anti-tamper guarantee unless docs remain explicit.

### Option B: Hostless restore with candidate quorum

Let non-host clients submit restore candidates after `ROOM_NOT_FOUND`. The server collects candidates in a short grace window and adopts a provisional room only when candidate hashes/ranks agree and no host candidate appears.

メリット:

- Improves recovery when the host device is gone.
- Uses multiple clients to reduce stale single-bundle risk.
- Can keep host-preferred semantics while improving availability.

デメリット:

- Changes the trust boundary: non-host localStorage can become canonical.
- Needs candidate collection, grace windows, tie-breaking, provisional notices, and replacement rules.
- Does not prevent colluding or uniformly stale clients.
- More edge cases around host migration, reconnect tokens, and compacted snapshots.

実装リスク:

- A stale non-host bundle could overwrite a newer but delayed host bundle if ranking or grace windows are wrong.
- Clients may diverge if provisional restore is later replaced.
- Requires multi-device manual verification and additional diagnostics.

### Option C: Signed restore snapshots / signed action log

Server signs accepted actions, compacted snapshots, or state hashes while live. After restart, clients can submit only bundles carrying valid server signatures.

メリット:

- Prevents simple localStorage tampering after the signature point.
- Keeps client-carried restore storage but gives the server a way to verify provenance.
- Can be introduced incrementally for action log and snapshot metadata.

デメリット:

- A server restart loses signing keys unless keys are persistent.
- Key rotation, versioning, and backward compatibility become part of the restore schema.
- Signatures prove server provenance, not freshness across all clients unless combined with rank/hash policy.
- Old unsigned bundles need a migration or rejection strategy.

実装リスク:

- Partial signing can create false confidence if unsigned fields still affect restored state.
- Signature verification must cover exactly the canonical serialized bytes, or harmless normalization changes can break restore.
- Requires schema versioning and test fixtures for old/new signed bundles.

### Option D: Server-persisted canonical state

Persist canonical room state on the server side, either in a local durable store or an external database. After process restart, the server restores from its own canonical snapshot/log instead of client localStorage.

メリット:

- Strongest recovery authority among these options.
- Removes host localStorage as the primary restart source.
- Supports public/competitive operation better than signed client bundles alone.
- Simplifies reconnect after server restart from the client perspective.

デメリット:

- Requires persistent storage selection, deployment migration, retention policy, and cleanup.
- Render/free-hosting filesystem assumptions may not be durable enough.
- Adds operational cost and failure modes.
- Requires privacy/data retention decisions for room logs and snapshots.

実装リスク:

- Incorrect persistence/compaction can permanently store divergent state.
- Multi-instance deployments require shared storage and locking.
- Data retention and deletion behavior must be documented and tested.

### Option E: Signed restore plus server-persisted canonical state

Persist canonical state server-side for primary recovery, and sign exported snapshots/action logs for client-carried fallback or diagnostics.

メリット:

- Best long-term trust model.
- Server persisted state is primary, signed client bundles can remain a fallback.
- Supports future audit/replay features.

デメリット:

- Highest complexity.
- Requires both storage operations and cryptographic schema design.
- Large migration and testing surface.

実装リスク:

- Too large for an incremental stability pass.
- Easy to break existing reconnect/server restart restore unless staged behind feature flags.

## Decision

For the current project stage, keep Option A as the active implementation and document Option D as the preferred long-term direction for stronger trust. Do not implement hostless restore until the project either:

- accepts a lower-trust provisional recovery mode explicitly, or
- has server-persisted canonical state available, with signed snapshot/action metadata only as fallback/audit support unless client-carried signed state is explicitly accepted as the product authority model.

Recommended staged path:

1. Keep current host-only restore for casual play.
2. Add design-only fixtures for canonical hash comparison and candidate ranking before hostless restore.
3. If production needs stronger recovery, implement server-persisted canonical state first.
4. Add signed snapshot/action metadata only with a full schema/version/migration plan.
5. Reconsider hostless restore as a provisional fallback after the canonical authority is explicit.

## Test Policy

Before any implementation, create fixtures for:

- current host restore succeeds with valid token, schema, rank, snapshot, and action log.
- non-host replacement remains rejected under the current policy.
- stale host bundle loses to newer replay-backed rank.
- malformed/tampered snapshot is rejected.
- compacted snapshot plus residual action log round-trips through mirror replay.

For hostless restore:

- multiple non-host candidates with matching hash/rank create a provisional room only after the grace window.
- host candidate arriving during the grace window wins.
- host candidate arriving after provisional restore follows documented replacement rules.
- conflicting candidate hashes are rejected or held for manual recovery.
- reconnect tokens and player order remain consistent after provisional restore.

For signed restore:

- unsigned legacy bundle behavior is explicit: accepted only in compatibility mode or rejected in strict mode.
- changing any signed canonical field invalidates the signature.
- harmless serialization normalization does not break valid signatures.
- key rotation and schema version checks are covered.

For server-persisted canonical state:

- process restart restores from server store without client `recreateRoom`.
- compaction persists atomically with action log trimming.
- stale client restore cannot overwrite server-persisted canonical state.
- room expiration and deletion remove persisted state.
- multi-instance behavior is either unsupported and guarded, or tested with shared storage/locking.

Manual verification remains required for:

- multiple real devices across a server restart.
- host disappears permanently.
- host migration followed by server restart.
- PWA/mobile reconnect after stale cache or app backgrounding.

## Why Not Implement Now

These changes alter the authority model for online state. A partial implementation could reduce reliability or create a misleading security claim. The current system is stable for casual play because the server validates live actions and treats host restore as a constrained recovery path. Hostless restore, signed restore, and server-persisted canonical state should be implemented only as a dedicated design/migration effort with feature flags, compatibility policy, manual multi-device testing, and operational storage decisions.

Until then:

- Do not let non-host clients replace an existing/restored room.
- Do not use client-writable `gameStartPayload.actionSeq` or raw action log seq as freshness authority.
- Keep restore rank based on replay-backed snapshot/action log progress.
- Keep docs clear that server restart restore is not a full anti-tamper boundary.

## Update: 2026-05-26 Footings

The following implementation footings now exist but do not change the accepted trust boundary:

- Canonical state store adapter: default noop, memory adapter for tests/development only, no durable restart authority.
- Restore room index: local client locator for scoped bundles, not a server authority.
- Restore audit metadata: optional schema validation, no signature verification or trust elevation.

Therefore Option A remains the active implementation. Option D remains the preferred long-term authority before hostless restore. Option C remains fallback/audit support only until canonical serialization and key policy are accepted.

## Update: 2026-07-19 Provisional Availability Fallback

The product explicitly accepted the lower-trust provisional mode described in
`HOSTLESS_RESTORE_DESIGN.md`. Option A remains the active implementation for
normal host restore and for replacement of any live/restored room. The additive
fallback applies only when the room is absent and normal host recovery is
exhausted.

This does not make participant-carried data server-authoritative. It requires two
or more distinct human identities, exact agreement from every collected
candidate, explicit confirmation, bounded in-memory retention, generation and


## Update: 2026-07-26 Staged Authority Contracts

The following reversible contracts now exist without enabling production durable authority:

- `server/canonicalStateStore.js` requires `save/load/delete/list/prune/runExclusive` and explicit durable, atomic compare-and-swap, process-safe locking, and retention capabilities. The default remains `noop`; the memory adapter is test/development-only and is deliberately non-authoritative.
- `server/restoreAuditKeyring.js` supports an active signing key, verification by old key IDs, bounded key count, optional maximum age, and clock skew. Legacy single-secret configuration remains compatible.
- `server/restoreAuthorityPolicy.js` fixes the intended order as live room, authoritative durable canonical state, valid server-signed state, host replay, then explicitly confirmed hostless quorum. Invalid, conflicting, or completed higher-priority state fails closed instead of falling through.

The priority policy is wired into restore admission. The opt-in file adapter is an implemented durable backend for exactly one service instance; the default remains `noop`, so production deployments without the explicit durable-file settings continue using the existing signed/host/provisional paths. Do not enable file mode without a durable private mount, one-instance enforcement, retention/deletion policy, lock and recovery runbook, and rollback rehearsal. `HOSTLESS_RESTORE_ENABLED=0` remains the rollback for provisional quorum restore.

## Update: 2026-10-01 Free-Operation Constraint

The current operating preference is to avoid a recurring-cost persistence service
and keep the casual-play restore model. This means the project must not describe
the current server-restart path as server-authoritative canonical recovery:

- `CANONICAL_STATE_STORE=noop` is the default and stores no server state.
- `CANONICAL_STATE_STORE=memory` is useful for tests/development but loses records
  when the process exits.
- A valid HMAC audit proves that signed restore fields came from a server that
  held the signing key. It does not prove that a client presented the newest
  state after the server forgot its room history.
- Complete action-log replay can recover only actions still present in the
  submitted bundle. It cannot prove that the client did not omit newer actions.

An opt-in synchronous file adapter now exists for one service instance on a
durable local filesystem. It writes JSON records through fsync + atomic rename,
uses per-room lock directories for compare-and-swap, enforces retention, and
fails closed on corrupt lock metadata or authoritative store read/write errors.
The default remains `noop`; this change does not enable production persistence.
The adapter requires all of these settings:

```sh
CANONICAL_STATE_STORE=file
CANONICAL_STATE_STORE_DIR=/var/data/machikoro-canonical
CANONICAL_STATE_STORE_DURABLE=true
CANONICAL_STATE_STORE_SINGLE_INSTANCE=true
CANONICAL_STATE_RETENTION_MS=2592000000
```

`*_DURABLE` and `*_SINGLE_INSTANCE` are operator attestations, not automatic
proofs. The directory must be on a durable mounted volume, and exactly one
service instance may use it. The file backend does not support shared
multi-instance deployments. A lock timeout or authoritative write failure
aborts the synchronous server action before broadcast/acknowledgement. A later
process reclaims a lock only after proving its PID is gone; unreadable lock
metadata requires operator cleanup while the service is stopped.
An authoritative store rejects host restore when the room has no server record,
rejects hostless replacement when a server record exists, and never promotes a
hostless provisional room into a canonical record. Provisional recovery remains
the lower-trust casual-play path. An authoritative write failure marks the
affected room unavailable and rejects later actions and rejoin attempts. The
triggering game start, host change, or action is not emitted as accepted; the
server process and unrelated rooms continue running. Operators should inspect
the canonical store before removing the unavailable room or restoring service.

For the current Render deployment, a file adapter alone does not create
durability: Render documents that service filesystems are ephemeral by default
and are preserved across restarts only on a paid service with an attached
persistent disk. A Render disk is attached to one service instance and cannot
be shared by multiple instances. See [Render Persistent Disks](https://render.com/docs/disks).

The available operational choices are therefore:

1. **Keep free operation (current choice):** retain signed client-carried
   snapshots, bounded action-log replay, and the provisional quorum fallback.
   Describe recovery as best-effort casual recovery, not durable server
   canonical state. No production store authority is enabled.
2. **Use a paid single-instance disk:** configure and verify the existing file
   adapter with the variables above, set the disk mount path, and keep the
   service at one instance. This can survive process restarts and deploys, but
   it is not a shared multi-instance store and adds paid hosting cost.
3. **Use a shared managed database/KV:** implement an adapter with atomic
   revision checks, cross-process locking/consistency, retention, deletion, and
   restore migration tests. This is the path for multi-instance or stronger
   competitive recovery and requires an explicit service and cost decision.

Until option 2 or 3 is selected, the adapter remains disabled in production.
Do not mark server-canonical restart recovery complete, enable a memory store as
a production fix, or let client bundles override a future server-loaded record.
Before turning on durable authority, prove restart recovery, stale-client
rejection, atomic snapshot/action-log compaction, room expiry/deletion, lock
recovery, and failure behavior on the selected deployment target.
