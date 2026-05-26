# Risk Reduction Plan

This document records public-release risk reduction decisions that are easy to lose during small maintenance changes.

## Public Naming

- Public product name: ダイスシティ
- Internal code name retained: machikoro / Machikoro
- Rationale: public UI, SEO, PWA install surfaces, notifications, and store-like display names should use ダイスシティ, while internal package names, cache keys, localStorage keys, URLs, and historical implementation docs can keep machikoro to avoid risky migrations.

## 2026-05-26 Naming Update

Updated public-facing names in:

- index.html title, app title, Apple PWA title, rules modal title, and description meta
- manifest.json and manifest.webmanifest name / short_name / description
- privacy.html and rules.html title, eyebrow, and description meta
- README.md public project heading and overview
- ntfy client-error, lifecycle, and CI notification titles
- Android/TWA workflow display name and launcher name
- public operations / notification docs that show user-facing notification text

Intentionally not renamed:

- npm package name
- server package id / Android package id
- cache names and Service Worker prefixes
- localStorage keys and window debug helper names
- repository URLs, Render host examples, and internal docs that describe code paths

## 2026-05-26 Title Logo Layout Update

- The title logo text is now kept on one line with responsive `clamp()` sizing and `white-space: nowrap`.
- The subtitle uses the same no-wrap responsive sizing so the public title area does not regress on narrow mobile widths.
- Public naming surfaces checked in this pass: index title/logo/meta, PWA manifests, privacy/rules pages, README, legal links, footer/navigation, and PWA install/update display strings.
- No internal `machikoro` identifiers were renamed.

## 2026-05-26 Public Name Final Audit

- Audited public-facing surfaces for the old Japanese product name, romanized old-name variants, and public notification titles after the rename.
- Public UI / SEO / PWA surfaces checked: `index.html`, `privacy.html`, `rules.html`, `manifest.json`, `manifest.webmanifest`, `README.md`, `sw.js`, root public assets, icons, legal links, rules links, PWA install/update text, and ntfy notification title examples.
- No remaining old Japanese product-name text was found in public UI / SEO / PWA / notification surfaces.
- Remaining `machikoro` strings are internal or operational identifiers: Service Worker cache prefix, debug helpers, localStorage keys, package ids, deployed host examples, GitHub repository URLs, and technical docs. These are intentionally retained for compatibility and are not displayed as the product name.
- The `icons/` files are binary PNG assets and contain no text metadata in this audit scope.

## Follow-up Checks

- When adding a new public page, include ダイスシティ in title and meta description.
- When adding a notification title or PWA/store display field, use ダイスシティ.
- When editing internal code identifiers, prefer compatibility over cosmetic renames.
