# Automated Release Test

The release checks have two browser layers. `npm run test:release` uses the Node/vm harness for focused contracts without downloading browser binaries; `npm run test:browser-e2e` runs Playwright against WebKit and is required in release CI. Neither layer is a native Android TWA or iOS operating-system test.

Run the Node release contracts with:

```sh
npm run test:release
```

Use automated browser/emulator runners for remaining checks. Do not ask the user to perform routine device verification. Where the available runner cannot exercise an operating-system feature, record it as unverified rather than calling a checklist or screenshot proof.

## Coverage Matrix

| Area | Status | Automated evidence | Manual remainder |
| --- | --- | --- | --- |
| iPhone Safari viewport / touch / safe-area | Partial | WebKit CI runs browser E2E at mobile and desktop viewports; `tests/release-e2e.test.js` also defines an iPhone-like touch/safe-area profile and checks viewport metadata, CSS safe-area use, focus-visible, and reduced motion. | Native iOS keyboard, home-indicator, and install prompt behavior are not covered by the current runner; keep them unverified until automated iOS coverage exists. |
| Android Chrome viewport / touch | Partial | `tests/release-e2e.test.js` defines a Pixel/Android Chrome-like profile; Playwright WebKit covers responsive browser behavior. | Native address-bar collapse, Android WebView/TWA, and system back behavior are not covered by current CI; use emulator automation when available. |
| PWA install flow | Partial | Node release tests exercise `bindPwaInstallHandlers()` with a synthetic `beforeinstallprompt`; browser E2E verifies the in-page install banner and its game-screen behavior. | Native install UI, homescreen icon, standalone launch, and store/TWA behavior remain outside current browser automation. |
| Service Worker update flow | Partial | Node tests exercise SW lifecycle contracts; Playwright WebKit covers real browser registration, two-generation waiting/apply, cache migration, and update UI. | OS-level app update and multi-tab timing are not covered by TWA automation. |
| ntfy client-error-test | Automated | `test:release` calls `handleClientErrorTestRequest()` with a mock `fetchImpl`, verifying the request without sending to ntfy.sh. | Live notification delivery is intentionally not part of release CI. |
| Client error capture | Automated | Node release contracts check redaction, stack truncation, context, and deduplication; browser checks observe page errors and reporting behavior. | Platform-specific native WebView stack formats are not separately exercised. |
| Modal / toast / focus / Esc | Partial | Node and WebKit tests cover dialog semantics, focus trap/restore, Escape, toast, viewport fit, and actionable pending UI. | Screen-reader narration quality and native assistive-technology behavior are not covered by current CI. |
| Reconnect / restore | Automated | Online/server suites cover rejoin data, canonical snapshots, pending actions, and restore rank; Socket E2Es cover live transport reconnect paths. | Internet impairment and multi-device radio/network transitions are not represented by localhost tests. |
| Host migration | Automated | Online/server tests cover host change and host reselection; production Socket E2E covers hostless recovery after simulated process memory loss. | OS sleep/background scheduling is not represented by current runner. |
| Hostless restore production path | Automated | `tests/hostless-restore-production-socket-e2e.test.js` uses the actual `server.js` Socket.IO assembly, valid reconnect tokens and signed snapshot, default 60s grace + 30s collection, requester disconnect, confirmation-owner rotation, and snapshot replay. | The test deletes the in-memory room map; it does not restart the OS process or prove durable canonical storage. The default store remains `noop`. |
| Server restart restore approximation | Automated | `test:release` covers recreate from snapshot/action log; the production hostless E2E covers the gateway/runtime path after simulated in-process room loss. | A real restart across a process boundary depends on selecting and enabling durable storage. |
| 30-60 minute long-run smoke approximation | Partial | `test:release` runs a shortened deterministic 180-step game loop with repeated snapshot serialize/restore roundtrips; dedicated performance scripts measure bounded hot paths. | Sustained mobile thermal and memory pressure are not covered by this short Node smoke; add automated soak/emulator evidence before making those claims. |

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

The release workflow uses Node.js 20, Python 3.12, `npm ci`, `pip install -r scripts/rl/requirements-ci.txt`, `npm run test:static`, `npm test`, `npm run test:pwa`, `npm run test:online`, and `npm run test:release`; the separate `mobile-webkit` job runs `npm run test:browser-e2e`. Python is needed because RL parity fixtures import `scripts/rl/encode.py` and require `numpy`. Release tests do not send real ntfy notifications because `/api/client-error-test` uses a mocked `fetchImpl`. The APK validation workflow runs static, unit, PWA, release, and APK validation gates before any optional signed build. The nightly workflow runs release, PWA, and online tests; it posts to `NTFY_CI_TOPIC` only on failure.
