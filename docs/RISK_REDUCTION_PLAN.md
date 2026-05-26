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

## Follow-up Checks

- When adding a new public page, include ダイスシティ in title and meta description.
- When adding a notification title or PWA/store display field, use ダイスシティ.
- When editing internal code identifiers, prefer compatibility over cosmetic renames.
