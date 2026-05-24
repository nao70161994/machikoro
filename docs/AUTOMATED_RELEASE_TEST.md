# Automated Release Test

This project does not currently depend on Playwright. The release gate therefore uses the existing Node/vm test harness to approximate mobile browsers, PWA lifecycle, online restore, and long-run stability without downloading browser binaries. Run it with:

```sh
npm run test:release
```

Use this as a substitute for busy release windows, not as a full replacement for real device checks.

## Coverage Matrix

| Area | Status | Automated evidence | Manual remainder |
| --- | --- | --- | --- |
| iPhone Safari viewport / touch / safe-area | Partial | `tests/release-e2e.test.js` defines an iPhone Safari UA, mobile touch viewport, device scale, and safe-area profile. It verifies `viewport-fit=cover`, CSS `env(safe-area-inset-*)`, `:focus-visible`, and reduced-motion CSS. | Real iOS Safari rendering, notch/home-indicator behavior, keyboard resize, and OS-level install prompt remain manual only. |
| Android Chrome viewport / touch | Partial | `tests/release-e2e.test.js` defines a Pixel/Android Chrome UA, mobile touch viewport, and device scale. | Real Chrome address-bar collapse, Android WebView/TWA differences, and hardware keyboard/back gesture remain manual only. |
| PWA install flow | Partial | `test:release` executes `bindPwaInstallHandlers()`, dispatches a synthetic `beforeinstallprompt`, verifies default prompt suppression, banner display, and prompt callback. | Native install UI, homescreen icon, standalone launch, and store/TWA flows remain manual only. |
| Service Worker update flow | Partial | `test:release` verifies `index.html` contains registration, `updatefound`, `controllerchange`, and `SKIP_WAITING`; it also dispatches SW `message` and `activate` events in vm. Source-level tests cover the explicit-update reload guard. | Browser cache storage behavior across real upgrades and multi-tab controller timing remain manual only. |
| ntfy client-error-test | Automated | `test:release` calls `handleClientErrorTestRequest()` with a mock `fetchImpl`, verifies `/api/client-error-test` payload and ntfy title/body without sending to ntfy.sh. | Real ntfy subscription delivery remains manual only. |
| Client error capture | Automated | `test:release` loads `appShell.js` with an iPhone Safari-like context and verifies message, stack truncation, phase, roomId, playerIndex, UA, app version, and duplicate suppression. | Browser-specific stack formats remain manual only. |
| Modal / toast / focus / Esc | Automated | `test:release` opens a modal, verifies `role=dialog`, `aria-modal`, focus trap, Esc close, and focus restore. Existing `ui.test.js` covers non-blocking toast. | Screen reader announcement quality remains manual only. |
| Reconnect / restore | Automated | Existing `online` and `server` suites cover rejoin data, canonical snapshot, pending outbound action handling, and restore rank. `test:release` adds a high-level server restart-like recreate path. | Multi-device reconnect over real networks remains manual only. |
| Host migration | Automated | Existing online/server tests cover `hostChanged`; `test:release` verifies a newer host epoch can replace a restored room. | Real disconnect timing and tab sleep behavior remain manual only. |
| Server restart restore approximation | Automated | `test:release` deletes the room, recreates from snapshot/action log, and verifies `rejoinData` and canonical snapshot are returned. | Render restart timing and client retry backoff remain manual only. |
| 30-60 minute long-run smoke approximation | Partial | `test:release` runs a shortened deterministic 180-step game loop with repeated snapshot serialize/restore roundtrips. | Actual 30-60 minute browser session, thermal throttling, mobile memory pressure, and sleep/wake remain manual only. |

## Release Command Set

Recommended automated release gate:

```sh
git diff --check
npm run test:static
npm run test:smoke
npm test
npm run test:online
npm run test:pwa
npm run test:release
```

For CPU/RL changes, also run:

```sh
npm run test:cpu
npm run test:rl
```

## Failure Triage

- Mobile profile failures usually mean `index.html`, `style.css`, or accessibility CSS drifted away from mobile/PWA assumptions.
- PWA lifecycle failures usually mean the update banner or Service Worker message contract changed; check `index.html` and `sw.js` together.
- ntfy failures should not send real notifications. The test uses mock fetch and fails on payload/header/body mismatches.
- Restore failures usually mean `server.js` restore validation, snapshot serialization, or restore rank changed. Run `npm run test:online` after fixing.
- Long-run smoke failures usually indicate a phase transition or snapshot roundtrip regression; inspect the failing iteration in the assertion stack.

## CI Integration

`npm run test:release` runs in GitHub Actions via `.github/workflows/release-test.yml` and nightly via `.github/workflows/nightly-release-test.yml`.

Triggers:

- `pull_request`: blocks PRs when the release pseudo E2E gate fails.
- `push` to `main`: catches regressions after merge.
- `workflow_dispatch`: lets maintainers re-run the gate manually.

The release workflow uses Node.js 20, Python 3, `npm ci`, `pip install -r scripts/rl/requirements.txt`, `npm run test:static`, `npm test`, `npm run test:pwa`, and `npm run test:release`. The Python dependency install is required because `npm test` includes RLCPU parity fixtures that import `scripts/rl/encode.py` and require `numpy`. It does not send real ntfy notifications because the release pseudo E2E uses a mocked `fetchImpl` for `/api/client-error-test`. The APK workflow installs the same RL Python dependencies, then runs `npm run test:static`, `npm test`, `npm run test:pwa`, and `npm run test:release` before Bubblewrap. The nightly workflow runs `npm run test:release`, `npm run test:pwa`, and `npm run test:online`; it posts to `NTFY_CI_TOPIC` only on failure.
