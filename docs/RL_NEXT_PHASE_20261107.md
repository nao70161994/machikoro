# RL portfolio next phase — 2026-11-07

## 1. Human-selectable strategy identities

The game **already supports explicit manual RL model selection** in both local and online setup through `localRlModel` and `onlineRlModel` handlers. The two setting panels now show numeric seed aliases together with strategy labels, and explain the difference between auto-selection and manual pinning. No new game mode or save schema is added.

| Model | Gameplay scope | Observed approach |
|---|---|---|
| seed73 | 2p | wheat/vineyard/winery engine |
| seed76 | 2p | flowers/fishing engine |
| seed104 | exactly 4p | vineyard/ranch/loan |
| seed71/seed103/seed145 | existing scopes | preserved as baselines |

Server-side model IDs, digests and manual assignments continue using the existing verified catalog. If a game uses multiple RL players, the existing 32 MiB artifact budget remains in place.

## 2. Training-collapse causal probes

[RL stability workflow](https://github.com/nao70161994/machikoro/actions/workflows/rl-stability-experiment-20261107.yml) trains two independent seeds at four treatments:

- Reference: lr 2e-5, initial ε .20.
- Half lr: lr 1e-5, initial ε .20.
- Quarter lr: lr 5e-6, initial ε .20.
- Low exploration: lr 2e-5, initial ε .05.

All other conditions match (2p, self-only, both sides learn, hidden256, terminal capped reward, 1,800 games per model). **The terminal win reward and all build-specific bonuses remain unchanged**. Paired best-versus-final matches use unused evaluation seeds and report the loss curve plus the checkpoint strategy. Changing learning rate and ε will affect the learned opponent distributions too; this is not a mathematical proof of a single root cause. We do not automatically promote a late checkpoint.

## 3. Multi-player generalization

[Multi-player training](https://github.com/nao70161994/machikoro/actions/workflows/rl-multiplayer-natural-training-20261107.yml) creates four independent exploratory candidates:

- Fixed 3p, seed401: 1,600 games.
- Fixed 5p, seed402: 1,600 games.
- Uniformly mixed 3/4/5/10p, seed403: 2,000 games.
- Uniformly mixed 3/4/5/10p, seed404: 2,000 games.

All use the established 353-state multi-player representation, self-only training, and common terminal win/asset objectives. Fixed-number candidates are screened only at their trained count. Mixed candidates undergo paired-seat **60-game smoke** screenings for 3, 4, 5 and 10 players; these exploratory results are not enough to promote to production. Every candidate must undergo at least 100 fresh games per target lineup, special-action parity tests, and direct comparison with adopted seed103 before promotion.

## 4. Reproducible AI league

[The league workflow](https://github.com/nao70161994/machikoro/actions/workflows/rl-natural-league-20261107.yml) runs **10 two-player pairings** across seed69/70/71/73/76 and **3 four-player pairings** across seed103/145/104, with 120 paired-seat games per 2p pairing and two 80-game 4p lineups per 4p pairing.

`scripts/report-rl-league.js` produces JSON and Markdown summary artifacts with direct results, paired-seat proportions, descriptive Wilson intervals, top-card purchase frequencies, and Jensen–Shannon divergence between purchased-card distributions. Other CPU winners remain separate in 4p data. Apparent nontransitivity and strategy diversity are preserved as independent reporting axes.

## Promotion safeguard

All three workflows are explicitly launched by the experiment-branch workflow path, not by changes to `main` or a schedule. Training runs have **no write permissions** and **do not update the production model catalog**. Archive checkpoints and all evaluation artifacts before their 30-day expiry. All new models remain *research only* until separate statistically sufficient and feature-parity validations.
