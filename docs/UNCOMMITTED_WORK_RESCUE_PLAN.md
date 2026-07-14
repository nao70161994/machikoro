# Online durability change adoption plan

This document records the split of the preserved WIP commit `5d841f6`.

## Branches

- `rescue/online-durability-review`: exact original WIP preservation; never merge directly.
- `review/online-durability-split`: thematic commits, including experimental work.
- `review/online-durability-ready`: main candidates only, after clean-branch verification.

## Adoption classes

- A: game/CPU stall guards, storage/RL loading guards, client scheduler recovery, PWA online-flow update deferral, and deterministic async test helpers.
- B: online client protocol hardening and browser/online E2E. Merge only after compatible client/server rollout and CI WebKit confirmation.
- C: canonical file persistence and the coupled server restart-restore integration. Experimental, explicit opt-in only, and not a main candidate yet.
- D: real iPhone Safari long-run play, GitHub Actions execution, and production delivery checks remain unverified outside this local environment.

## Commit map

| Commit | Class | Purpose | Dependency / gate |
| --- | --- | --- | --- |
| `64ec709` | A | Post-win action guards and CPU/RL build failure progress | None |
| `ff4ad9a` | A | Storage exception guards and bounded RL model loading | None |
| `a9697f6` | A | Defer PWA activation during online setup/reconnect | None |
| `6ccda41` | A | CPU schedule lease, page activation resume, and watchdog recovery | Apply after `a9697f6` for its HTML assertions |
| `d15e519` | A | Sequential async test helper and prerequisite/static checks | None |
| `79d8d1b` | B | Online ACK timeout, pending preservation, restore queue, stream watermark | Review/deploy with `c095177` |
| `23dd4c1` | B | Node online completion/restart/soak and Playwright WebKit E2E | CI WebKit confirmation; restart test uses class C store |
| `20a1a5d` | B | Release/nightly/WebKit/APK/manual delivery workflows | GitHub Actions and operations approval |
| `d3fb3c7` | C | Explicit opt-in canonical file store adapter | Do not merge to main yet |
| `c095177` | C | Server action/room hardening coupled to canonical transaction/restart restore | Review with `79d8d1b`; durable operations unresolved |

## Durable canonical state

`server/canonicalStateStore.js` defaults to `noop`. File persistence requires explicit `CANONICAL_STATE_STORE=file`; no deployment should enable it implicitly. Persistent volume selection, capacity and retention, backup/restore, corruption response, lease ownership across instances, and shared multi-instance storage remain operational design work.

## Rollback and order

Each thematic commit is a rollback unit. The recommended main-candidate order is game/CPU guards, storage/RL guards, PWA deferral, client scheduler recovery, then test harness. Online client and server protocol commits must be reviewed and deployed together. Do not cherry-pick the canonical store or restart-restore server integration into main from this plan.

GitHub Actions and real-device checks are evidence gates, not assumed results. See `docs/RELEASE_CHECKLIST.md` and `TESTPLAN.md`.
