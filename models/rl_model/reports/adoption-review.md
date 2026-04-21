# RL Adoption Review

- updatedAt: 2026-04-20
- minimumGames: 50
- currentMain: self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3

## Candidates

| id | score | games | weak | normal | strong | pass | style | recommended |
|---|---:|---:|---:|---:|---:|---:|---|---|
| `self-only-both-h256-lr2e5-5000-seed71-rewardcap` | 0.813333 | 50 | 0.96 | 0.94 | 0.68 | 0 | vineyard-farm-burger |  |
| `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3` | 0.793333 | 300 | 0.993333 | 0.933333 | 0.633333 | 0.0214 | vineyard-farm-winery-strong | yes |
| `self-only-both-h256-lr2e5-5000-seed69-rewardcap` | 0.605 | 100 | 0.93 | 0.75 | 0.4 | 0 | burger-warehouse-wheat | yes |
| `self-only-both-h256-lr3e5-5000-seed62` | 0.591667 | 20 | 0.9 | 0.65 | 0.45 | 0.044 | bread-warehouse-sushi-strong |  |
| `self-only-both-h256-lr2e5-5000-seed70-rewardcap` | 0.588333 | 100 | 1 | 0.77 | 0.33 | 0.017 | sushi-warehouse-farm | yes |
| `self-only-both-h256-lr2e5-5000-seed66-rewardcap` | 0.566667 | 20 | 0.95 | 0.7 | 0.35 | 0.006 | bread-warehouse-pizza-stable |  |
| `terminal-shaped-h128-lr1e4` | 0.536667 | 100 | 0.99 | 0.53 | 0.39 | 0.001 | bread-farm-fishing |  |
| `self-only-both-h256-lr2e5-5000-seed65` | 0.533333 | 20 | 0.95 | 0.6 | 0.35 | 0.169 | sushi-warehouse-bread |  |
| `terminal-shaped-h128-long` | 0.458333 | 20 | 0.9 | 0.7 | 0.15 | n/a | shop-loan-fishing |  |
| `strong-select-seed21` | 0.441667 | 20 | 0.85 | 0.75 | 0.1 | n/a | field-vineyard-normal-stable |  |
| `terminal-shaped-h128-lr1e4-long` | 0.375 | 20 | 0.95 | 0.35 | 0.2 | n/a | farm-cheese-weak-specialist |  |
| `terminal-shaped-curriculum-h128` | 0.266667 | 20 | 0.75 | 0.35 | 0.05 | n/a | sushi-farm-cheese |  |

## Actions
- compare-main-vs-challenger: self-only-both-h256-lr2e5-5000-seed71-rewardcap が current main self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3 を weighted score で上回っています (+0.02)
  - cmd: `npm run eval-rl-models -- --models self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3,self-only-both-h256-lr2e5-5000-seed71-rewardcap --games 100 --markdown models/rl_model/self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3-self-only-both-h256-lr2e5-5000-seed71-rewardcap.md`
