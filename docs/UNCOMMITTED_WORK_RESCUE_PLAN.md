# B Classification Adoption Record

Date: 2026-07-15

## Branches

- Source: `review/online-durability-split`
- Validation: `review/online-durability-b-validation`
- Ready: `review/online-durability-b-ready`
- C/rescue histories are preserved and must not be rewritten.

## Classification

| Class | Source commits / scope | Decision |
| --- | --- | --- |
| B1 | `92805aa` online retry/ACK/restore queue; `6bc947d` durable-independent E2E; `3f73ec5` Playwright WebKit; `12a3a1a` independent nightly jobs; `d7a14c9` Node 20 Socket.IO test client; `4585e0b` rule-correct 4-player driver | Main candidate after exact ready-branch gates pass. |
| B2 | `b0c6c14`, `172785b` APK; `d13e866` manual delivery | Keep outside main. APK run `29347726039` stopped because signing password secrets were absent. Delivery cannot be dispatched until its workflow exists on the default branch. |
| B3 | restart E2E requiring file persistence; durable canonical file store/transaction | Keep on experimental/C work only. Default store remains `noop`. |
| B4 | dotted stream action IDs, watermark protocol, non-host canonical replacement | Deferred: incompatible with the current action ID validator or restore authority policy. |

## Verification

- Local: syntax/static/smoke/unit/online/release/PWA/CPU/RL/simulation gates plus 20 consecutive diagnostic completion runs and 5 final soak runs.
- GitHub Release `29348809695`: success.
- GitHub Nightly `29348807863`: success for online restore/sync, 3-run soak, simulation, and Ubuntu WebKit.
- GitHub APK `29347726039`: conditional failure due to missing `KEYSTORE_STORE_PASSWORD` and `KEYSTORE_KEY_PASSWORD`; no APK behavior conclusion.
- Real iPhone Safari: not run. Background resume, long four-player play, and PWA update remain manual-required.

## Compatibility And Rollback

- Socket.IO event names, existing payload fields, localStorage keys, save format, game rules, and CPU strength are unchanged.
- No file durable canonical store, canonical transaction, restart persistence, stream/watermark protocol, production schedule, or APK change is in B1.
- Apply in this order: online implementation, Node E2E, Playwright, Node 20 client support, driver fix, nightly workflow, docs.
- Roll back in reverse order. Online implementation and its tests are one compatibility unit; do not keep only one side.

## 2026-07-15 Remaining work disposition

- Safe CI/runtime, read-only delivery, secret-free APK validation, and protocol contract tests were rebuilt on `review/remaining-ai-ready`.
- File durability is isolated on `review/durable-canonical-experimental`; it is opt-in and not a main merge candidate.
- Stream/watermark and non-host authority implementations remain excluded. The compatibility contract and legacy action ID boundary are the only main candidates.
- Signed APK and iPhone Safari checks remain human-only; no result is inferred for either.
