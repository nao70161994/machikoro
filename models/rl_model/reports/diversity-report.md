# RL Diversity Report

- updatedAt: 2026-09-13

## Style Groups

### 4p-wheat-vineyard-pizza

| id | status | score | games |
|---|---|---:|---:|
| `self-only-4p-h256-lr1e5-5000-seed103` | adopted | n/a | 1000 |

### asset-engine-mover-curriculum

| id | status | score | games |
|---|---|---:|---:|
| `mp-mover-legal-curriculum-seed415-4p-strength` | candidate | n/a | 300 |

### burger-warehouse-wheat

| id | status | score | games |
|---|---|---:|---:|
| `self-only-both-h256-lr2e5-5000-seed69-rewardcap` | candidate | 0.605 | 100 |

### sushi-warehouse-farm

| id | status | score | games |
|---|---|---:|---:|
| `self-only-both-h256-lr2e5-5000-seed70-rewardcap` | candidate | 0.588333 | 100 |

### target-wheat-vineyard-forest

| id | status | score | games |
|---|---|---:|---:|
| `mp-mixed-34510-target-only-seed145-4p` | adopted | n/a | 300 |

### vineyard-farm-burger

| id | status | score | games |
|---|---|---:|---:|
| `self-only-both-h256-lr2e5-5000-seed71-rewardcap` | candidate | 0.813333 | 100 |

### vineyard-farm-winery-strong

| id | status | score | games |
|---|---|---:|---:|
| `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3` | adopted | 0.793333 | 300 |

## Overlap Pairs

| left | right | overlap | sameStyle | compare |
|---|---|---:|---|---|
| `mp-mixed-34510-target-only-seed145-4p` | `mp-mover-legal-curriculum-seed415-4p-strength` | 4 | no | `npm run eval-rl-models -- --models mp-mixed-34510-target-only-seed145-4p,mp-mover-legal-curriculum-seed415-4p-strength --games 100 --markdown models/rl_model/mp-mixed-34510-target-only-seed145-4p-mp-mover-legal-curriculum-seed415-4p-strength.md` |
| `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3` | `mp-mixed-34510-target-only-seed145-4p` | 2 | no | `npm run eval-rl-models -- --models self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3,mp-mixed-34510-target-only-seed145-4p --games 100 --markdown models/rl_model/self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3-mp-mixed-34510-target-only-seed145-4p.md` |
| `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3` | `mp-mover-legal-curriculum-seed415-4p-strength` | 2 | no | `npm run eval-rl-models -- --models self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3,mp-mover-legal-curriculum-seed415-4p-strength --games 100 --markdown models/rl_model/self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3-mp-mover-legal-curriculum-seed415-4p-strength.md` |
