# Release Checklist

Use this before publishing `main` or enabling ads/PWA production traffic. This checklist is intentionally split into automated gates and manual-only reminders so release status is not inferred from one green command.

## Automated Gate

Run from a clean checkout:

```sh
git diff --check
npm run test:static
npm run test:smoke
npm test
npm run test:online
npm run test:pwa
npm run test:release
npm run test:cpu
npm run test:rl
```

CI also runs `npm run test:static`, `npm test`, and `npm run test:release` from `.github/workflows/release-test.yml` on pull requests, pushes to `main`, and manual dispatch. The Android/TWA APK workflow runs `npm ci`, `npm run test:static`, `npm test`, `npm run test:pwa`, and `npm run test:release` before `bubblewrap build`.

## Render Environment Variables

Required / platform-provided:

- `PORT`: provided by Render. The server defaults to `3000` locally.

Recommended for production observability:

- `NTFY_TOPIC`: ntfy topic for browser error notification. Without it, client error reports only write `console.warn` on the server.
- `CLIENT_ERROR_ALLOWED_ORIGINS`: comma-separated allowed origins, for example `https://machikoro-9jv2.onrender.com`. Same-origin reports are always accepted; cross-origin reports are rejected unless allowlisted.
- `CLIENT_ERROR_SHARED_TOKEN`: optional shared token for `/api/client-error` and `/api/client-error-test`. Leave unset unless the client/test caller will send `X-Client-Error-Token` or `Authorization: Bearer`.
- `TRUST_PROXY=1`: set only when deployed behind a trusted proxy and paired with `CLIENT_ERROR_ALLOWED_ORIGINS` for the public HTTPS origin. Leave unset for direct serving.
- `CLIENT_ERROR_ALLOW_NO_ORIGIN`: leave unset in production unless a controlled non-browser diagnostic sender requires no-origin reports.

Temporary / debug only:

- `CLIENT_ERROR_TEST_ENABLED=1`: enables `/api/client-error-test` in production-like environments. Remove it after the notification test.

Optional build metadata:

- `BUILD_HASH`: overrides the git-derived build hash used by `/api/version`, Service Worker cache injection, and client error reports.

Android/TWA build workflow secrets:

- `ANDROID_KEYSTORE_BASE64`
- `KEYSTORE_STORE_PASSWORD`
- `KEYSTORE_KEY_PASSWORD`

## ntfy Check

- Confirm `docs/NTFY_ERROR_REPORTING.md` is followed for topic naming, Android/iPhone subscription, Render setup, and privacy notes.
- Use `/api/client-error-test` only with `CLIENT_ERROR_TEST_ENABLED=1` or non-production `NODE_ENV`.
- Do not leave a public or guessable `NTFY_TOPIC` in production.

## Ads Placeholder Safety

Current state is placeholder-only; no real AdSense/AdMob SDK is loaded.

Before adding a real SDK, verify `docs/ADS_PLAN.md`:

- Allowed placements are `title-bottom`, `rules-bottom`, and `result-bottom`.
- No ad slot is near dice, build, pending modal, Undo, reconnect, or other gameplay controls.
- Placeholder failure must not stop game rendering.
- PWA cache includes `js/adSlots.js` so offline app shell does not lose the helper.
- `privacy.html` and `rules.html` are reachable from the title screen and are cached for PWA/offline shell use.
- `privacy.html` explains local storage, online room data, client error reporting, and future ad provider data use.
- Placeholder slots use `pointer-events: none` and neutral copy so they cannot behave like buttons or encourage accidental taps.

## PWA Install / Update

Automated checks:

- `npm run test:pwa`
- `npm run test:release`

Release expectations:

- Service Worker install does not precache RL model JSON.
- RL model JSON is lazy-loaded and runtime cached only when needed.
- Update banner keeps game-in-progress updates manual; title/app shell update flow remains available.
- PWA banner z-index stays below modals and crash recovery UI.

Manual-only checks are listed in `docs/AUTOMATED_RELEASE_TEST.md` and `docs/PWA_MODEL_LOADING.md`.

## Documentation Entrypoints

- Release pseudo E2E and CI: `docs/AUTOMATED_RELEASE_TEST.md`
- ntfy browser error notification: `docs/NTFY_ERROR_REPORTING.md`
- AdSense public URL setup: `docs/ADSENSE_SETUP.md`
- Ads placeholder policy: `docs/ADS_PLAN.md`
- PWA model loading: `docs/PWA_MODEL_LOADING.md`
- Online restore/recovery: `docs/ONLINE_RECOVERY.md`, `docs/online-restore-schema.md`
- Maintenance checks by change type: `docs/maintenance-checklists.md`

## Final State

Before tagging or announcing a release:

- Required commands above have passed.
- CI is green for the target commit.
- `git status --short` is empty.
- Any remaining real-device checks are explicitly tracked as manual-only, not silently assumed complete.
