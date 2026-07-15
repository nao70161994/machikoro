# Online Protocol Compatibility

## Current contract

The deployed protocol uses the existing Socket.IO event names and payloads. `clientVersion` is diagnostic metadata; it is not feature negotiation. A server must not infer support for a protocol extension from a build hash alone.

`clientActionId` is an opaque legacy identifier accepted only when it matches `[A-Za-z0-9:_-]{1,120}`. Dotted IDs such as `m1.stream.1` are intentionally rejected. Exact accepted IDs may be returned during rejoin, but the current protocol has no stream watermark.

Only the host may generate canonical actions and replace canonical restore state. A non-host reconnect can rejoin an existing room but cannot become an authority merely because it reports a newer snapshot.

## Rolling deployment matrix

| Client | Server | Supported behavior |
| --- | --- | --- |
| current | current | Existing UUID-like action IDs, exact ACK matching, snapshot plus action replay |
| old | current | Supported while existing event names and payload fields remain backward compatible |
| current | old | Supported because the client sends no stream/watermark fields and uses legacy action IDs |
| future stream-aware | current | Must fall back to the current contract; dotted action IDs are rejected |
| current | future stream-aware | Must receive legacy ACK/rejoin payloads without requiring watermarks |

A stream/watermark rollout therefore requires explicit capability negotiation with a legacy fallback. It cannot be enabled by changing the ID format alone.

## Deferred changes

The following remain experimental and are not approved for main:

- dotted monotonic action IDs;
- per-player or per-stream accepted watermarks;
- replacement of canonical state by a non-host;
- any protocol behavior that assumes the durable file store or server canonical transactions.

Before adoption, tests must reproduce a concrete failure in the current protocol and cover duplicate, out-of-order, stale, unknown-stream, lost-ACK, action-log compaction, and both rolling-deployment directions. Non-host state replacement additionally requires an authenticated authority model; newest-sequence-wins is insufficient.
