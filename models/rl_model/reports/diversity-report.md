# RL Diversity Report

- updatedAt: 2026-04-20

## Style Groups

### 4p-vineyard-farm-pizza

| id | status | score | games |
|---|---|---:|---:|
| `self-only-4p-h256-lr1e5-5000-seed102` | adopted | n/a | 200 |

### bread-warehouse-pizza-stable

| id | status | score | games |
|---|---|---:|---:|
| `self-only-both-h256-lr2e5-5000-seed66-rewardcap` | candidate | 0.566667 | 20 |

### bread-warehouse-sushi-strong

| id | status | score | games |
|---|---|---:|---:|
| `self-only-both-h256-lr3e5-5000-seed62` | candidate | 0.591667 | 20 |

### burger-warehouse-wheat

| id | status | score | games |
|---|---|---:|---:|
| `self-only-both-h256-lr2e5-5000-seed69-rewardcap` | candidate | 0.605 | 100 |

### field-vineyard-normal-stable

| id | status | score | games |
|---|---|---:|---:|
| `strong-select-seed21` | candidate | 0.441667 | 20 |

### shop-loan-fishing

| id | status | score | games |
|---|---|---:|---:|
| `terminal-shaped-h128-long` | candidate | 0.458333 | 20 |

### sushi-warehouse-farm

| id | status | score | games |
|---|---|---:|---:|
| `self-only-both-h256-lr2e5-5000-seed70-rewardcap` | candidate | 0.588333 | 100 |

### vineyard-farm-burger

| id | status | score | games |
|---|---|---:|---:|
| `self-only-both-h256-lr2e5-5000-seed71-rewardcap` | candidate | 0.813333 | 50 |

### vineyard-farm-winery-strong

| id | status | score | games |
|---|---|---:|---:|
| `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3` | adopted | 0.793333 | 300 |

## Overlap Pairs

| left | right | overlap | sameStyle | compare |
|---|---|---:|---|---|
| `self-only-both-h256-lr3e5-5000-seed62` | `self-only-both-h256-lr2e5-5000-seed66-rewardcap` | 4 | no | `npm run eval-rl-models -- --models self-only-both-h256-lr3e5-5000-seed62,self-only-both-h256-lr2e5-5000-seed66-rewardcap --games 100 --markdown models/rl_model/self-only-both-h256-lr3e5-5000-seed62-self-only-both-h256-lr2e5-5000-seed66-rewardcap.md` |
| `self-only-both-h256-lr2e5-5000-seed66-rewardcap` | `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3` | 3 | no | `npm run eval-rl-models -- --models self-only-both-h256-lr2e5-5000-seed66-rewardcap,self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3 --games 100 --markdown models/rl_model/self-only-both-h256-lr2e5-5000-seed66-rewardcap-self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3.md` |
| `self-only-both-h256-lr3e5-5000-seed62` | `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3` | 3 | no | `npm run eval-rl-models -- --models self-only-both-h256-lr3e5-5000-seed62,self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3 --games 100 --markdown models/rl_model/self-only-both-h256-lr3e5-5000-seed62-self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3.md` |
| `strong-select-seed21` | `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3` | 3 | no | `npm run eval-rl-models -- --models strong-select-seed21,self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3 --games 100 --markdown models/rl_model/strong-select-seed21-self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3.md` |
| `terminal-shaped-h128-long` | `self-only-both-h256-lr2e5-5000-seed66-rewardcap` | 3 | no | `npm run eval-rl-models -- --models terminal-shaped-h128-long,self-only-both-h256-lr2e5-5000-seed66-rewardcap --games 100 --markdown models/rl_model/terminal-shaped-h128-long-self-only-both-h256-lr2e5-5000-seed66-rewardcap.md` |
| `strong-select-seed21` | `self-only-both-h256-lr2e5-5000-seed66-rewardcap` | 2 | no | `npm run eval-rl-models -- --models strong-select-seed21,self-only-both-h256-lr2e5-5000-seed66-rewardcap --games 100 --markdown models/rl_model/strong-select-seed21-self-only-both-h256-lr2e5-5000-seed66-rewardcap.md` |
| `strong-select-seed21` | `self-only-both-h256-lr3e5-5000-seed62` | 2 | no | `npm run eval-rl-models -- --models strong-select-seed21,self-only-both-h256-lr3e5-5000-seed62 --games 100 --markdown models/rl_model/strong-select-seed21-self-only-both-h256-lr3e5-5000-seed62.md` |
| `terminal-shaped-h128-long` | `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3` | 2 | no | `npm run eval-rl-models -- --models terminal-shaped-h128-long,self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3 --games 100 --markdown models/rl_model/terminal-shaped-h128-long-self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3.md` |
| `terminal-shaped-h128-long` | `self-only-both-h256-lr3e5-5000-seed62` | 2 | no | `npm run eval-rl-models -- --models terminal-shaped-h128-long,self-only-both-h256-lr3e5-5000-seed62 --games 100 --markdown models/rl_model/terminal-shaped-h128-long-self-only-both-h256-lr3e5-5000-seed62.md` |
| `terminal-shaped-h128-long` | `strong-select-seed21` | 2 | no | `npm run eval-rl-models -- --models terminal-shaped-h128-long,strong-select-seed21 --games 100 --markdown models/rl_model/terminal-shaped-h128-long-strong-select-seed21.md` |
