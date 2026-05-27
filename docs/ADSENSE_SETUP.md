# AdSense Setup

Use this checklist after Render deploy, before submitting the production URL to AdSense, and when rechecking public pages during review. Replace `<PUBLIC_ORIGIN>` with the deployed origin, for example `https://machikoro-9jv2.onrender.com`.

## 1. Public URL Checks After Render Deploy / During Review

Open these URLs in a normal browser window and in a private/incognito window:

- `<PUBLIC_ORIGIN>/`: title screen loads without console errors and has indexable metadata.
- `<PUBLIC_ORIGIN>/privacy.html`: privacy policy is public, indexable, and links back to the game and rules page.
- `<PUBLIC_ORIGIN>/rules.html`: rules page is public, indexable, and links back to the game and privacy policy.
- `<PUBLIC_ORIGIN>/manifest.json` and `<PUBLIC_ORIGIN>/manifest.webmanifest`: PWA manifests return JSON.
- `<PUBLIC_ORIGIN>/sw.js`: Service Worker script returns JavaScript and includes the current app shell cache list.
- `<PUBLIC_ORIGIN>/api/version`: returns the deployed build/version metadata.

Quick command check:

```sh
PUBLIC_ORIGIN=https://machikoro-9jv2.onrender.com
curl -fI "$PUBLIC_ORIGIN/"
curl -fI "$PUBLIC_ORIGIN/privacy.html"
curl -fI "$PUBLIC_ORIGIN/rules.html"
curl -fI "$PUBLIC_ORIGIN/manifest.json"
curl -fI "$PUBLIC_ORIGIN/manifest.webmanifest"
curl -s "$PUBLIC_ORIGIN/manifest.json" | grep -E "ダイスシティ|start_url|standalone|theme_color|portrait|192x192|512x512|icon-192|icon-512"
curl -s "$PUBLIC_ORIGIN/manifest.webmanifest" | grep -E "ダイスシティ|start_url|standalone|theme_color|portrait|192x192|512x512|icon-192|icon-512"
curl -fI "$PUBLIC_ORIGIN/sw.js"
curl -s "$PUBLIC_ORIGIN/api/version" | grep -E "hash"
curl -s "$PUBLIC_ORIGIN/" | grep -E "index,follow|style.css|登録不要|privacy.html|rules.html|og:description|twitter:description|og:image|twitter:image|og:image:alt|twitter:image:alt"
curl -s "$PUBLIC_ORIGIN/rules.html" | grep -E "index,follow|style.css|privacy.html|アカウント登録なし|勝利条件|カード選択|保存と再開|最終更新日|og:description|twitter:description|og:image|twitter:image|og:image:alt|twitter:image:alt"
curl -s "$PUBLIC_ORIGIN/privacy.html" | grep -E "index,follow|style.css|rules.html|アカウント登録|メールアドレス|エラー通知|Cookie|AdSense審査|Google AdSense|審査用スクリプト|実際の広告ユニット|お問い合わせ|最終更新日|og:description|twitter:description|og:image|twitter:image|og:image:alt|twitter:image:alt"
```

Negative checks for review-mode URL metadata and external connection hints on all public pages:

```sh
for page in '' rules.html privacy.html; do
  html=$(curl -s "$PUBLIC_ORIGIN/$page")
  if printf '%s' "$html" | grep -Ei '<link[^>]+rel[[:space:]]*=[[:space:]]*["'"'"']([^"'"'"']*[[:space:]])?canonical([[:space:]]|["'"'"'])|<meta[^>]+(property|name)[[:space:]]*=[[:space:]]*["'"'"'](og:url|twitter:url)["'"'"']|<meta[^>]+["'"'"'](og:url|twitter:url)["'"'"'][^>]+(property|name)[[:space:]]*=|<link[^>]+rel[[:space:]]*=[[:space:]]*["'"'"']([^"'"'"']*[[:space:]])?(preconnect|dns-prefetch|preload|modulepreload)([[:space:]]|["'"'"'])'; then
    echo "Unexpected URL metadata or external connection hint found in /$page"
    exit 1
  fi
done
echo "Public page URL metadata and external connection hint checks passed"
```

Negative checks for the static explanation pages:

```sh
for page in rules.html privacy.html; do
  html=$(curl -s "$PUBLIC_ORIGIN/$page")
  if printf '%s' "$html" | grep -Ei '<script|adsbygoogle|pagead2.googlesyndication.com|ca-pub-|data-ad-client[[:space:]]*=|data-ad-slot[[:space:]]*=|<iframe|<embed|<object|<canvas|<img|<picture|<source|<video|<audio|<svg|<dialog|<details|<summary|<form|<button|<input|<select|<textarea|data-|data-ui-action|[[:space:]]id[[:space:]]*=|[[:space:]]style[[:space:]]*=|[[:space:]]src[[:space:]]*=|role[[:space:]]*=[[:space:]]*"button"|[[:space:]]on[a-z]+[[:space:]]*='; then
    echo "Unexpected active or embedded content found in $page"
    exit 1
  fi
done
echo "Static explanation page negative checks passed"
```

Do not submit to AdSense if any of the public pages return an error, redirect unexpectedly, show stale content from a previous deployment, or fail the negative checks above.

## 2. Privacy / Rules Navigation

From `<PUBLIC_ORIGIN>/`:

- Confirm the title screen shows the legal links below the title ad placeholder, and the title page description / OGP / Twitter metadata mention 登録不要 / no-registration play.
- Confirm each public page keeps exactly one charset, one viewport, and one HTML title in the head before checking preview metadata.
- Confirm each public page uses one shared `style.css` stylesheet and does not add review-period external CSS hosts.
- Open `ルール` and confirm it reaches `rules.html`.
- Open `プライバシーポリシー` and confirm it reaches `privacy.html`.
- Confirm `privacy.html` mentions that normal play does not require account registration or email address input, plus local browser storage, online room data, client error reporting, error notification exclusions, AdSense review script / future ad unit / Cookie usage, contact guidance, and the last updated date.
- Confirm `privacy.html` description / OGP / Twitter metadata mention account-free play, error reporting, AdSense review, and ads so shared previews do not show stale privacy-page content.
- Confirm `rules.html` describes how to start a local or online game, card selection, save/resume behavior, plus the win condition, turn flow, card colors, activation order, landmarks, and the last updated date.
- Confirm `rules.html` description / OGP / Twitter metadata also mention account-free play, the win condition, card selection, and save/resume, so shared previews do not show stale rule-page content.
- Confirm `privacy.html` and `rules.html` remain static explanation pages without page scripts, forms, buttons, `dialog` / `details` / `summary`, extra `src` asset loads, embedded media elements, inline event handlers, app `id`/`data-*` attributes, `data-ui-action`, automatic redirects / meta refresh, ad placeholders, or an AdSense loader.
- Confirm the title, rules, and privacy pages include OGP/Twitter preview metadata, `og:image` and `twitter:image` both point to `/icons/icon-512.png`, image alt text is present, and the referenced PNG assets remain 512x512 and 192x192 as advertised by metadata and manifests.
  Preview image metadata should stay same-origin relative rather than using an external image host.
- Confirm public HTML metadata does not hardcode staging origins or localhost into preview tags; use the deployed URL only in external submission forms and command examples.
- Keep each public-page description / OGP / Twitter description concise enough for search and share previews; the automated test keeps them at 160 characters or less.
- Keep public-page titles consistent across HTML title, OGP, and Twitter metadata; the automated test keeps each title at 60 characters or less.
- Keep `og:site_name`, `og:type`, and `twitter:card` stable across public pages so shared previews do not drift.

The in-app rules modal can remain available, but AdSense review should have direct public URLs for both privacy and rules.

## 3. Advertising Placeholder Review

Current review state uses placeholders plus the AdSense review loader in `index.html` head:

- AdSense review code is installed: `ca-pub-8683516545883768` is loaded once from `pagead2.googlesyndication.com` with `async` and `crossorigin="anonymous"`. Do not add live ad units such as `<ins class="adsbygoogle">`, `data-ad-client`, `data-ad-slot`, or ad unit ids during review.
- Allowed placeholder locations are `title-bottom`, `rules-bottom`, and `result-bottom` only.
- The placeholders are generated by `js/adSlots.js` and documented in `docs/ADS_PLAN.md`.
- Placeholder text is neutral and does not look like a reward, button, or call to action.
- Placeholder CSS keeps `pointer-events: none`, so the placeholder itself cannot receive taps.
- There is no placeholder near dice buttons, build cards, pending modal controls, Undo, reconnect, or online room controls.

Manual visual check:

1. Open the title screen and confirm `title-bottom` is below the setting tabs/content area.
2. Open the rules modal and confirm `rules-bottom` is after the rules text.
3. Finish a local test game or use a controlled debug path and confirm `result-bottom` appears only on the result screen.
4. On mobile width, confirm no placeholder overlaps buttons or sits between a label and its control.

## 4. PWA Cache Check

After Render deploy:

- In DevTools Application > Service Workers, confirm the latest `sw.js` is active.
- In Cache Storage, confirm the app shell includes `/privacy.html`, `/rules.html`, and `/js/adSlots.js`.
- Confirm Service Worker install/update does not precache RL model JSON.
- Confirm offline reload can still show the app shell and the public static pages after they have been cached.

Automated local checks before deploy:

```sh
npm run test:pwa
npm run test:release
```

## 5. ntfy Real Notification Check

Before submission, verify the production error-notification path once with the real Render URL.

Render environment variables:

- `NTFY_TOPIC`: required for actual notification delivery.
- `CLIENT_ERROR_ALLOWED_ORIGINS=<PUBLIC_ORIGIN>`: recommended origin gate for production.
- `CLIENT_ERROR_SHARED_TOKEN`: optional. If set, send it with the test request.
- `CLIENT_ERROR_TEST_ENABLED=1`: temporary only, remove after the test.

Test without a shared token:

```sh
curl -X POST "$PUBLIC_ORIGIN/api/client-error-test"
```

Test with a shared token:

```sh
curl -X POST \
  -H "X-Client-Error-Token: $CLIENT_ERROR_SHARED_TOKEN" \
  "$PUBLIC_ORIGIN/api/client-error-test"
```

Expected result:

- The HTTP response is accepted, normally `202`.
- The subscribed Android/iPhone ntfy client receives a message with `phase=test`, a hashed room label such as `room=hash:e12e115a`, and `ダイスシティ ntfy test notification`.
- After the test, remove `CLIENT_ERROR_TEST_ENABLED` from Render and redeploy/restart.

Do not submit with a public or guessable `NTFY_TOPIC`, and do not paste reconnect tokens or full game snapshots into error payloads.

## 6. AdSense Review Script Position

The AdSense review loader is installed. Keep it in `index.html` inside `<head>`, after the existing PWA/meta/icon links and before `</head>`. Do not add a second loader:

```html
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<script async
    src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8683516545883768"
    crossorigin="anonymous"></script>
</head>
```

Submission fixes during review must stay within `docs/OPERATIONS.md` の `AdSense Review Change Policy`; do not use submission cleanup as a reason to change UI flow, ad placement, PWA behavior, URLs, game rules, or broad architecture.

After review, if real ad units or an SDK adapter are intentionally added, follow these implementation rules:

- Keep SDK loading isolated in `js/adSlots.js` or a small adapter called from it.
- Do not place ad units near gameplay controls, pending choices, online reconnect, or Undo.
- Keep failure behavior non-blocking: SDK load failure must leave a placeholder or empty slot and never stop game rendering.
- Re-run `git diff --check`, `node tests/main.test.js`, `npm run test:static`, `npm run test:pwa`, and `npm run test:release` after any post-review ad SDK/unit change or intentional public-page metadata/copy change.

## 7. Submission Gate

Before clicking submit in AdSense or after review-period public-page changes:

- `docs/RELEASE_CHECKLIST.md` automated gate is green for the deployed commit.
- The title page is reachable from the public origin and its description / OGP / Twitter metadata mention 登録不要 / no-registration play.
- `privacy.html` and `rules.html` are reachable from the public origin, and their description / OGP / Twitter metadata matches the current privacy and rule-page wording.
- AdSense review code is installed exactly once, ad surfaces remain placeholder-only, and live ad units (`<ins class="adsbygoogle">`, `data-ad-client`, `data-ad-slot`, ad unit ids) remain absent until real ad units are intentionally configured after review.
- PWA cache contains the public pages and ad placeholder helper.
- ntfy real notification delivery has been confirmed, the temporary test endpoint flag has been removed, and `NTFY_TOPIC` is not public or guessable.
- The commit hash in `/api/version` matches the commit intended for review.
