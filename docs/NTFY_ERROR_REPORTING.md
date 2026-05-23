# ntfy client error reporting

Machikoro can forward real browser errors to ntfy so iPhone Safari / Android Chrome only failures are visible soon after they happen.

## Server setup

Set these environment variables on Render:

- `NTFY_TOPIC`: ntfy topic name to publish client errors to.
- `CLIENT_ERROR_SHARED_TOKEN`: optional shared token. When set, `POST /api/client-error` and the debug test endpoint require `X-Client-Error-Token: <token>` or `Authorization: Bearer <token>`. Leave unset to keep the browser reporter working without a token.
- `CLIENT_ERROR_ALLOWED_ORIGINS`: optional comma-separated origin allowlist such as `https://machikoro.example.com`. Same-origin reports are always allowed; cross-origin browser reports are rejected by default when an `Origin` or `Referer` header is present.
- `TRUST_PROXY` / `EXPRESS_TRUST_PROXY`: optional Express proxy trust setting. Leave unset for direct serving; set `TRUST_PROXY=1` only behind a trusted proxy such as Render so request IP/protocol handling matches deployment.
- `CLIENT_ERROR_ALLOW_NO_ORIGIN`: optional escape hatch for controlled diagnostics. In production with `NTFY_TOPIC`, no-origin/no-token reports are rejected by default.

Example topic names:

- `machikoro-prod-errors-<random-suffix>`
- `machikoro-staging-errors-<random-suffix>`

Use a hard-to-guess topic. Anyone who knows the topic can subscribe to it on the public ntfy.sh service.

Render steps:

1. Open the Render service dashboard.
2. Go to `Environment`.
3. Add `NTFY_TOPIC` with the chosen topic name.
4. Optional: add `CLIENT_ERROR_ALLOWED_ORIGINS` with your production origin.
5. Optional: add `CLIENT_ERROR_SHARED_TOKEN` only if your reporter/test caller will send the matching header.
6. Redeploy or restart the service.

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
- online `roomId` in the server payload; ntfy notification text uses a short hash instead of the raw room id
- `playerIndex`
- `timestamp`
- app version / build hash when available

Example ntfy message:

```
phase=build
room=hash:e12e115a
player=1
version=89bdf41
Safari iPhone
updatePendingModalContent recursion
js/ui.js:381:5
```


## Test notification

A development/debug-only test endpoint is available:

```sh
curl -X POST http://localhost:3000/api/client-error-test
# If CLIENT_ERROR_SHARED_TOKEN is set:
curl -X POST -H 'X-Client-Error-Token: <token>' http://localhost:3000/api/client-error-test
```

The endpoint is enabled only when one of these is true:

- `NODE_ENV=development`
- `NODE_ENV=test`
- `CLIENT_ERROR_TEST_ENABLED=1`

It is disabled by default when `NODE_ENV` is unset or `production`, so it is not a production button that anyone can press. For Render production, enable `CLIENT_ERROR_TEST_ENABLED=1` only temporarily while testing, then remove it and redeploy/restart.

If `NTFY_TOPIC` is missing, the endpoint returns a clear warning response:

```json
{"ok":false,"error":"missing_ntfy_topic","message":"NTFY_TOPIC is not set"}
```

A successful test returns `202` and sends a notification with `phase=test`, a hashed room label such as `room=hash:e12e115a`, and the message `Machikoro ntfy test notification`. This notification is explicitly marked as a manual test and does not represent a real client error.

## Server safeguards

- Payloads are validated and capped to 32 KiB.
- Long strings and stack traces are truncated.
- Duplicate reports are suppressed for a short window.
- Per-IP reports are rate limited.
- Browser reports with a cross-origin `Origin` / `Referer` are rejected unless explicitly allowlisted.
- `CLIENT_ERROR_SHARED_TOKEN` can require a shared token for report and test endpoints.
- ntfy failures are logged and do not block gameplay.

## Privacy notes

Client reports can include player-visible names inside stack messages, raw room IDs in the server payload, origin/path URLs, user agent strings, and app version data. Browser reports intentionally strip query strings and hashes from URLs, and ntfy notification text hashes room IDs. Do not put public or shared topics into production. Rotate the topic if it leaks. Avoid adding localStorage contents, reconnect tokens, card inventories, or full game snapshots to this endpoint.
