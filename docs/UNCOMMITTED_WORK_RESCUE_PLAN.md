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

## Durable canonical state

`server/canonicalStateStore.js` defaults to `noop`. File persistence requires explicit `CANONICAL_STATE_STORE=file`; no deployment should enable it implicitly. Persistent volume selection, capacity and retention, backup/restore, corruption response, lease ownership across instances, and shared multi-instance storage remain operational design work.

## Rollback and order

Each thematic commit is a rollback unit. The recommended main-candidate order is game/CPU guards, storage/RL guards, PWA deferral, client scheduler recovery, then test harness. Online client and server protocol commits must be reviewed and deployed together. Do not cherry-pick the canonical store or restart-restore server integration into main from this plan.

GitHub Actions and real-device checks are evidence gates, not assumed results. See `docs/RELEASE_CHECKLIST.md` and `TESTPLAN.md`.
