# RL Adoption Review

- updatedAt: 2026-05-11
- minimumGames: 50
- currentMain: self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3

## Candidates

| id | score | games | weak | normal | strong | pass | style | target | recommended |
|---|---:|---:|---:|---:|---:|---:|---|---|---|
| `self-only-both-h256-lr2e5-5000-seed71-rewardcap` | 0.813333 | 50 | 0.96 | 0.94 | 0.68 | 0 | vineyard-farm-burger | n/a |  |
| `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3` | 0.793333 | 300 | 0.993333 | 0.933333 | 0.633333 | 0.0214 | vineyard-farm-winery-strong | n/a | yes |
| `self-only-both-h256-lr2e5-5000-seed69-rewardcap` | 0.605 | 100 | 0.93 | 0.75 | 0.4 | 0 | burger-warehouse-wheat | n/a | yes |
| `self-only-both-h256-lr2e5-5000-seed70-rewardcap` | 0.588333 | 100 | 1 | 0.77 | 0.33 | 0.017 | sushi-warehouse-farm | n/a | yes |

## Actions
- compare-main-vs-challenger: self-only-both-h256-lr2e5-5000-seed71-rewardcap が current main self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3 を weighted score で上回っています (+0.02)
  - cmd: `npm run eval-rl-models -- --models self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3,self-only-both-h256-lr2e5-5000-seed71-rewardcap --games 100 --markdown models/rl_model/self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3-self-only-both-h256-lr2e5-5000-seed71-rewardcap.md`
