# ntfy client error reporting

Machikoro can forward real browser errors to ntfy so iPhone Safari / Android Chrome only failures are visible soon after they happen.

## Server setup

Set this environment variable on Render:

- `NTFY_TOPIC`: ntfy topic name to publish client errors to.

Example topic names:

- `machikoro-prod-errors-<random-suffix>`
- `machikoro-staging-errors-<random-suffix>`

Use a hard-to-guess topic. Anyone who knows the topic can subscribe to it on the public ntfy.sh service.

Render steps:

1. Open the Render service dashboard.
2. Go to `Environment`.
3. Add `NTFY_TOPIC` with the chosen topic name.
4. Redeploy or restart the service.

If `NTFY_TOPIC` is not set, `POST /api/client-error` still accepts reports but only writes a server-side `console.warn`. The game must not stop when notification delivery fails.

## Subscribing on Android

1. Install the ntfy app from F-Droid or Google Play.
2. Tap `+`.
3. Subscribe to the configured topic, for example `machikoro-prod-errors-<random-suffix>`.
4. Trigger a test client error in a staging build and confirm a notification arrives.

## Subscribing on iPhone

1. Open https://ntfy.sh in Safari, or install an ntfy-compatible app if preferred.
2. Subscribe to the configured topic.
3. Allow notifications when prompted.
4. Keep the topic name private.

## Payload

The browser sends `POST /api/client-error` with a compact JSON payload captured from:

- `window.onerror`
- `window.onunhandledrejection`
- a minimal `console.error` hook

Included fields:

- `message`
- `stack` truncated before notification
- `filename`, `line`, `column`
- `userAgent`
- current game `phase`
- online `roomId`
- `playerIndex`
- `timestamp`
- app version / build hash when available

Example ntfy message:

```
phase=build
room=ABCD
player=1
version=89bdf41
Safari iPhone
updatePendingModalContent recursion
js/ui.js:381:5
```

## Server safeguards

- Payloads are validated and capped to 32 KiB.
- Long strings and stack traces are truncated.
- Duplicate reports are suppressed for a short window.
- Per-IP reports are rate limited.
- ntfy failures are logged and do not block gameplay.

## Privacy notes

Client reports can include player-visible names inside stack messages, room IDs, URLs, user agent strings, and app version data. Do not put public or shared topics into production. Rotate the topic if it leaks. Avoid adding localStorage contents, reconnect tokens, card inventories, or full game snapshots to this endpoint.
