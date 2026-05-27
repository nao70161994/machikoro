# ntfy client error reporting

ダイスシティは real browser errors を ntfy へ転送できるため、iPhone Safari / Android Chrome only failures are visible soon after they happen.

## Server setup

Set these environment variables on Render:

- `NTFY_TOPIC`: ntfy topic name to publish client errors to.
- `CLIENT_ERROR_SHARED_TOKEN`: optional shared token. When set, no-origin/scripted diagnostics and the debug test endpoint require `X-Client-Error-Token: <token>` or `Authorization: Bearer <token>`. Same-origin browser `/api/client-error` reports stay tokenless so real browser reporting is not broken.
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
classification=unknown
pattern=-
phase=build
room=hash:e12e115a
player=1
version=89bdf41
Safari iPhone
new unrecovered crash
js/ui.js:381:5
```

Classification is server-side:

- `unknown`: priority 5, new pattern; investigate first.
- `known-pattern`: priority 3, recognized freeze/UI-lock/message pattern.
- `stale-client`: priority 2, report came from a known fixed version prefix; update/clear the client cache before debugging.

See `docs/OPERATIONS.md` for the current known fixed version table and triage flow.

## Notification operation policy

Use separate topics and priorities so routine activity does not hide urgent failures:

- `play-start` / `play-finish`: lifecycle heartbeat on `NTFY_TOPIC`; useful for confirming real usage and deploy health, not an incident by itself.
- `unknown`: browser client-error on `NTFY_TOPIC`; highest priority and should be investigated immediately.
- `known-pattern`: browser client-error on `NTFY_TOPIC`; inspect version and frequency. Current-version repeats are regressions.
- `stale-client`: browser client-error on `NTFY_TOPIC`; guide the device through PWA update/cache clearing before debugging code.
- CI failed: GitHub Actions failure on `NTFY_CI_TOPIC`; release blocker until the failed command is green.

Keep `NTFY_TOPIC` and `NTFY_CI_TOPIC` different. Browser topics may include runtime details such as phase/version/user agent; CI topics include repository workflow metadata. Both should be hard to guess and rotated if leaked.


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

A successful test returns `202` and sends a notification with `phase=test`, a hashed room label such as `room=hash:e12e115a`, and the message `ダイスシティ ntfy test notification`. This notification is explicitly marked as a manual test and does not represent a real client error.

## Server safeguards

- Payloads are validated and capped to 32 KiB.
- Long strings and stack traces are truncated.
- Duplicate reports are suppressed for a short window.
- Per-IP reports are rate limited.
- Browser reports with a cross-origin `Origin` / `Referer` are rejected unless explicitly allowlisted.
- `CLIENT_ERROR_SHARED_TOKEN` can require a shared token for scripted/no-origin reports and test endpoints; same-origin browser reports remain tokenless.
- ntfy failures are logged and do not block gameplay.

## Privacy notes

Client reports can include player-visible names inside stack messages, raw room IDs in the server payload, origin/path URLs, user agent strings, and app version data. Browser reports intentionally strip query strings and hashes from URLs, and ntfy notification text hashes room IDs. Do not put public or shared topics into production. Rotate the topic if it leaks. Avoid adding localStorage contents, reconnect tokens, card inventories, or full game snapshots to this endpoint.

## Optional game lifecycle notifications

Client error reporting and lifecycle reporting are separate. Lifecycle notifications are enabled by default for browser gameplay so production monitoring sees normal starts and finishes without per-device setup. They can be disabled per browser profile when they become noisy.

Explicitly keep them enabled in a browser profile with localStorage:

```js
localStorage.setItem('machikoroLifecycleNotifyEnabled', 'true')
// or from the console:
window.__machikoroSetLifecycleNotificationsEnabled(true)
```

Opt out of lifecycle notifications with:

```js
localStorage.setItem('machikoroLifecycleNotifyEnabled', 'false')
// or:
window.__machikoroSetLifecycleNotificationsEnabled(false)
```


Check the current browser setting with:

```js
window.__machikoroLifecycleNotifyState()
// { key: 'machikoroLifecycleNotifyEnabled', value: null, enabled: true, defaultEnabled: true, ... }
```

Only false-like values such as `false`, `0`, `off`, `no`, or `disabled` turn lifecycle reporting off. The old key `machikoroLifecycleNotificationsEnabled` is still read as a compatibility fallback, but new tooling should use `machikoroLifecycleNotifyEnabled`.

When not explicitly disabled, the browser sends compact `POST /api/game-lifecycle` reports for:

- `play-start`
- `play-finish`

The server publishes to the same `NTFY_TOPIC` only when that environment variable is configured. If `NTFY_TOPIC` is missing, the endpoint only logs a server-side warning and gameplay continues.

For `/api/game-lifecycle`, same-origin browser reports stay tokenless so normal play-start/play-finish reporting does not require exposing a shared secret. Scripted/no-origin lifecycle diagnostics must send `X-Client-Error-Token` or `Authorization: Bearer` when `CLIENT_ERROR_SHARED_TOKEN` is configured.

Example start notification:

```text
Title: [ダイスシティ] Game Started
mode=local
players=4
cpu=3
```

Example finish notification:

```text
Title: [ダイスシティ] Game Finished
event=play-finish
mode=local
players=4
cpu=3
winner=CPU Strong
turn=14
```

Lifecycle privacy constraints are stricter than client-error diagnostics. The lifecycle payload must not include player names, room codes, reconnect tokens, card inventories, detailed snapshots, or raw logs. It only includes event type, local/online mode, player count, CPU count, turn count, CPU winner difficulty when relevant, a random session id for dedupe, and optional app version.

Spam controls:

- Default is on per browser profile unless explicitly disabled.
- The client sends at most one start and one finish notification for the in-memory game session.
- A short localStorage start suppression window prevents reload/start button repeats from sending multiple start notifications.
- The server deduplicates identical lifecycle event/session pairs for several minutes and rate limits the endpoint per sender.
- Self-play and CLI benchmark loops do not load the browser app shell, so they do not send lifecycle notifications.

## GitHub Actions CI failure notifications

GitHub Actions can send ntfy notifications when a CI job fails. This is separate from Render/browser error reporting and uses a repository secret instead of a server environment variable.

Setup:

1. Open the GitHub repository settings.
2. Go to `Secrets and variables > Actions > Repository secrets`.
3. Add `NTFY_CI_TOPIC` with a hard-to-guess topic name, ideally separate from `NTFY_TOPIC`.
4. Subscribe to that topic in the ntfy app or web UI.

The workflows in `.github/workflows/` post only when `failure()` is true. If `NTFY_CI_TOPIC` is unset, the notify step is skipped. Successful runs do not notify. `.github/workflows/nightly-release-test.yml` runs the release/PWA/online regression set on a daily schedule and uses the same failure-only topic.

CI failure notifications include only compact build metadata:

- workflow name
- branch
- short commit hash
- failed job name
- GitHub Actions run URL

Example CI notification:

```text
Title: [ダイスシティ CI] Release pseudo E2E failed
workflow=Release pseudo E2E
branch=main
commit=1a84285
failed_job=release-test
run=https://github.com/nao70161994/machikoro/actions/runs/123456789
```

Keep `NTFY_CI_TOPIC` private. Anyone who knows the topic can subscribe to CI failure messages on ntfy.sh.
