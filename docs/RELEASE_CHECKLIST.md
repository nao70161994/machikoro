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

CI also runs `npm run test:static`, `npm test`, `npm run test:pwa`, and `npm run test:release` from `.github/workflows/release-test.yml` on pull requests, pushes to `main`, and manual dispatch. Nightly regression runs `npm run test:release`, `npm run test:pwa`, and `npm run test:online` from `.github/workflows/nightly-release-test.yml`. The Android/TWA APK workflow runs `npm ci`, `npm run test:static`, `npm test`, `npm run test:pwa`, and `npm run test:release` before `bubblewrap build`.

## Render Environment Variables

Required / platform-provided:

- `PORT`: provided by Render. The server defaults to `3000` locally.

Recommended for production observability:

- `NTFY_TOPIC`: ntfy topic for browser error notification. Without it, client error reports only write `console.warn` on the server.
- GitHub Secret `NTFY_CI_TOPIC`: optional topic for GitHub Actions failure notifications. Set it in GitHub repository `Settings > Secrets and variables > Actions > Repository secrets`; success runs do not notify, and unset secrets skip the notification step.
- `CLIENT_ERROR_ALLOWED_ORIGINS`: comma-separated allowed origins, for example `https://machikoro-9jv2.onrender.com`. Same-origin reports are always accepted; cross-origin reports are rejected unless allowlisted.
- `CLIENT_ERROR_SHARED_TOKEN`: optional shared token for scripted/no-origin diagnostics and `/api/client-error-test`. Same-origin browser `/api/client-error` stays tokenless; leave unset unless a test caller or non-browser sender will send `X-Client-Error-Token` or `Authorization: Bearer`.
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
- Game lifecycle notifications are default ON. Confirm `window.__machikoroLifecycleNotifyState()` reports `enabled: true` when `localStorage.machikoroLifecycleNotifyEnabled` is unset. Use `localStorage.setItem('machikoroLifecycleNotifyEnabled', 'false')` only to opt out noisy browser profiles.
- Lifecycle ntfy payloads must not include player names, room codes, reconnect tokens, card inventories, or full snapshots.
- Do not leave a public or guessable `NTFY_TOPIC` in production.
- If CI failure notifications are needed, set GitHub Secret `NTFY_CI_TOPIC` to a separate hard-to-guess topic. The release/APK/nightly workflows post only on failure and include workflow name, branch, short commit, failed job, and the Actions run URL.
- Use `docs/OPERATIONS.md` to classify ntfy browser reports as `unknown`, `known-pattern`, or `stale-client`; only `unknown` client errors should page at high priority.

## Ads Placeholder Safety

AdSense review code is installed in `index.html` head. The app still uses placeholder ad surfaces; no in-game ad slot or gameplay-near SDK placement is enabled.

審査コード導入済み: keep exactly one `adsbygoogle.js?client=ca-pub-8683516545883768` script in `index.html` head with `async` and `crossorigin="anonymous"`.

Before adding ad slots or expanding beyond the review loader, verify `docs/ADS_PLAN.md`:

- Allowed placements are `title-bottom`, `rules-bottom`, and `result-bottom`.
- No ad slot is near dice, build, pending modal, Undo, reconnect, or other gameplay controls.
- Placeholder failure must not stop game rendering.
- PWA cache includes `js/adSlots.js` so offline app shell does not lose the helper.
- `privacy.html` and `rules.html` are reachable from the title screen and are cached for PWA/offline shell use.
- `privacy.html` explains account-free play, local storage, online room data, client error reporting, error notification exclusions, the AdSense review script, future ad provider data use, Cookie handling, contact guidance, and the last updated date.
- Placeholder slots use `pointer-events: none` and neutral copy so they cannot behave like buttons or encourage accidental taps.

## PWA Install / Update

Automated checks:

- `npm run test:pwa`
- `npm run test:release`

Release expectations:

- Service Worker install does not precache RL model JSON.
- RL model JSON is lazy-loaded and runtime cached only when needed.
- Update banner keeps game-in-progress updates manual; title/app shell update flow remains available.
- `/api/version` returns the deployed build hash with no-store cache headers. A client whose `window.MACHIKORO_CLIENT_VERSION` differs from that hash must show the PWA update banner, emit a compact `version-mismatch` client notification, and offer an update button.
- For stale-cache reports such as an old `version=f6ce626`, open DevTools console and compare `window.MACHIKORO_CLIENT_VERSION`, `window.__machikoroVersionMismatch`, and `curl -s <PUBLIC_ORIGIN>/api/version`. Use the banner update button to clear Machikoro caches/service worker registrations and reload.
- If the banner does not appear, run `window.__machikoroCheckVersionMismatch()` from the console, then manually unregister the Service Worker and clear `machikoro-*` caches before reloading.
- PWA banner z-index stays below modals and crash recovery UI.

Manual-only checks are listed in `docs/AUTOMATED_RELEASE_TEST.md` and `docs/PWA_MODEL_LOADING.md`.

## UI Action Gate / UI Lock

Automated checks:

- `node tests/ui.test.js`
- `node tests/integration.test.js`
- `npm run test:online`
- `npm run test:release`

Release expectations:

- UI操作可否は `GameManager.allowedActionsFor(game)` を読む `currentUiAllowedActions()` / `canShowUiAction()` と、online input block 判定 `isOnlineUiInputBlocked()` に集約する。
- online input block は missing socket、disconnected socket、reconnecting、`onlineActionInFlight` をすべて含む。これらの状態では表示側も操作不可にする。
- `rollDice`, `nextTurn`, `buildCard`, `buildLandmark`, `undoBuild`, pending resolver は別経路で phase / turn だけを見て有効化しない。
- 新しいボタンや delegated handler を追加する場合、UI 表示は `canShowUiAction()` 系 helper、実行権限は `main.js` の handler gate を通す。DOM の `disabled` 直書きだけで新しい操作可否ルールを作らない。
- Pending resolver は queue head と allowed action の両方が一致する時だけ表示する。
- CPUターン、他人onlineターン、online in-flight/reconnecting/disconnected 中にクリック可能な gameplay action が出ないことを確認する。

Regression test index:

- `renderActiveGameState は skip/end turn を allowedActions と online gate に同期する`
- `renderActiveGameState は CPUターンと他人オンラインターンで主要ボタンを無効にする`
- `renderBuildMenu は buildCard/buildLandmark/undoBuild を allowedActions と online gate に同期する`
- `renderPending は allowedActionsFor の先頭pending actionだけを表示する`
- `renderPending は online input block 中に resolver を表示しない`
- `integration: 自分ターンで操作可能ボタンがなければwatchdogがUI lockを検知する`
- `integration: pending操作不能ならwatchdogが縮約通知してrender復旧する`

## Documentation Entrypoints

- Operations / nightly regression / ntfy triage: `docs/OPERATIONS.md`
- Release pseudo E2E and CI: `docs/AUTOMATED_RELEASE_TEST.md`
- ntfy browser error notification: `docs/NTFY_ERROR_REPORTING.md`
- AdSense public URL setup: `docs/ADSENSE_SETUP.md`
- Ads placeholder policy: `docs/ADS_PLAN.md`
- PWA model loading: `docs/PWA_MODEL_LOADING.md`
- Online restore/recovery: `docs/ONLINE_RECOVERY.md`, `docs/online-restore-schema.md`
- Maintenance checks by change type: `docs/maintenance-checklists.md`

## Public Preflight Summary

Before public traffic, AdSense review, or broader PWA install testing, confirm this short list in addition to the automated gate:

- `privacy.html` and `rules.html` are reachable from the title screen and mention account-free play, local storage / online room data / client error reporting, error notification exclusions / AdSense review script and ad provider data, contact guidance, and the last updated date as applicable.
- `privacy.html` and `rules.html` remain static explanation pages: no page script, form, button, extra `src` asset load, embedded media element, inline event handler, app `id`/`data-*` attribute, `data-ui-action`, automatic redirect / meta refresh, ad placeholder, or AdSense loader is added to either public page.
- Public-page metadata, OGP/Twitter tags, manifest/head PWA metadata, static-page links, and static-page heading order are locked by the public-page assertions in `node tests/main.test.js`; update those assertions in the same commit as any intentional review-period copy change.
- `rules.html` explains the win condition, how to start local/online play, how card selection works, and how save/resume works before the detailed turn and card rules.
- Public pages keep exactly one charset, one viewport, one HTML title, one `robots` meta with `index,follow`, and one shared `style.css` stylesheet in the head. Public pages include OGP/Twitter metadata with both `og:image` and `twitter:image` pointing to `/icons/icon-512.png` as same-origin relative paths, plus image alt metadata; OGP and PWA icon metadata sizes stay aligned with the 512x512 and 192x192 PNG assets; manifest `id`, `start_url`, language, display mode, theme colors, and portrait orientation stay stable; title-page PWA head metadata keeps one manifest link to `/manifest.webmanifest` and stays aligned with the manifest name, theme color, mobile web app flags, status bar style, and Apple touch icon; `og:site_name`, `og:type`, and `twitter:card` stay stable; HTML title, OGP title, and Twitter title stay consistent and concise; public-page description / OGP / Twitter descriptions stay concise; public HTML metadata does not hardcode staging origins, localhost, or review-period external CSS hosts; the title page and rule-page metadata mention 登録不要 / no-registration play, and privacy-page metadata mentions error reporting / AdSense review / ad topics.
- AdSense placeholders are still limited to title, rules, and result surfaces; no slot is near dice, build, pending, Undo, reconnect, or update controls.
- `NTFY_TOPIC` receives a controlled `/api/client-error-test` notification, then `CLIENT_ERROR_TEST_ENABLED` is removed again.
- `NTFY_CI_TOPIC` is configured as a GitHub Actions secret if CI failure paging is desired.
- `/api/version` matches the intended deploy commit, and a browser with stale `window.MACHIKORO_CLIENT_VERSION` shows the PWA update banner.
- PWA install and update behavior has been checked on at least one real mobile browser before relying on it publicly.
- CI is green on the exact commit being deployed.

## Final State

Before tagging or announcing a release:

- Required commands above have passed.
- CI is green for the target commit.
- `git status --short` is empty.
- Any remaining real-device checks are explicitly tracked as manual-only, not silently assumed complete.
