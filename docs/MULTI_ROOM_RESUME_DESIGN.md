# Multiple Room Resume Design

Status: design footing only. No visible multiple-room resume UI is implemented yet.

## Decision

Multiple-room resume must be built on the room-scoped restore bundle index, not on the legacy global restore keys.

Current footing:

- `onlineRestoreRoomIndex` lists candidate room ids from scoped `onlineSession`, `onlineGameStart`, `onlineActionLog`, `onlineStateSnapshot`, and `onlinePendingAction` copies.
- Scoped reads still prefer `*:room:<ROOM>` keys and fall back to legacy global keys for compatibility.
- Stale index pruning removes index rows only. It does not delete restore bundles.

## Candidate States

A future picker should classify each indexed room before showing it:

- `live-reconnect`: session token exists and normal `rejoinRoom` should be tried first.
- `restart-restore-candidate`: host-scoped restore bundle exists and can be used for current host-only `recreateRoom`.
- `stale-bundle`: scoped data exists but is too old, incomplete, or mismatched.
- `completed-game`: restore data belongs to a finished game and should not be promoted as a resume candidate.
- `invalid-bundle`: parsing or validation failed; keep diagnostics, do not offer resume.

The picker must not let a non-host bundle replace canonical state unless the hostless restore design is explicitly accepted later.

## Data Contract

Use the index only as a locator. Before any resume action, re-read the scoped bundle and validate:

- room id matches the selected entry
- player index/name/reconnect token are present for live reconnect
- restore rank is computed from snapshot plus replayable actions, not raw user-provided seq alone
- pending outbound action belongs to the selected room
- signed/audit metadata, if present, validates but does not increase trust by itself

## UI Contract

When implemented, the UI must:

- keep the existing single online resume button behavior for the most recent valid session
- offer a separate picker only when more than one valid candidate exists
- show room id, player name, last updated time, and candidate state without exposing reconnect tokens
- keep stale/invalid bundles out of the primary action path
- provide non-destructive cleanup first; destructive pruning needs a separate confirmation and retention policy

## Test Plan

Before enabling visible UI, add tests for:

- index entries are classified from scoped data, not legacy globals
- live reconnect is preferred over server restart restore when a valid session exists
- non-host restore candidates are not shown as authoritative restore options
- stale/invalid/completed bundles are not primary resume actions
- destructive cleanup never removes the currently selected/live room by accident
- iPhone Safari and Android Chrome layout fit for the picker

## Deferred

The following remain deferred until UX and operational policy are explicit:

- visible multiple-room resume picker
- destructive legacy/global key pruning
- stale bundle expiry duration
- completed-game marker migration
- hostless restore behavior
