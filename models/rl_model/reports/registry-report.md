# RL Registry Report

- updatedAt: 2026-09-13
- statuses: archive:10, adopted:3, candidate:4, rejected:6, candidate-4p:1

## Warnings
- mp-mixed-34510-target-only-seed145-4p と mp-mover-legal-curriculum-seed415-4p-strength: topCards が 4/5 重複しています

## Actions
- review-diversity: mp-mixed-34510-target-only-seed145-4p と mp-mover-legal-curriculum-seed415-4p-strength: topCards が 4/5 重複しています

## Recommended

| id | role | status | 2p | 3p | 4p | 5p | 10p | target |
|---|---|---|---:|---:|---:|---:|---:|---|
| `self-only-4p-h256-lr1e5-5000-seed103` | adopted-3p-10p | adopted | missing | 200 | 200 | 200 | 1000 | n/a |
| `mp-mixed-34510-target-only-seed145-4p` | adopted-4p-specialist | adopted | missing | missing | 300 | missing | missing | n/a |
| `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3` | adopted-2p-main | adopted | 300 | missing | missing | missing | missing | n/a |
| `self-only-both-h256-lr2e5-5000-seed70-rewardcap` | sushi-warehouse-variant | candidate | 100 | missing | missing | missing | missing | n/a |
| `self-only-both-h256-lr2e5-5000-seed69-rewardcap` | burger-warehouse-variant | candidate | 100 | missing | missing | missing | missing | n/a |

## Models

| id | status | eval | style | target |
|---|---|---|---|---|
| `terminal-shaped-h128-lr1e4` | archive | 100 games/opponent | bread-farm-fishing | n/a |
| `terminal-shaped-h128-long` | archive | 20 games/opponent | shop-loan-fishing | n/a |
| `terminal-shaped-curriculum-h128` | archive | 20 games/opponent | sushi-farm-cheese | n/a |
| `strong-select-seed21` | archive | 20 games/opponent | field-vineyard-normal-stable | n/a |
| `self-only-both-h256-lr3e5-5000-seed62` | archive | 100 games/opponent | bread-warehouse-sushi-strong | n/a |
| `self-only-both-h256-lr2e5-5000-seed66-rewardcap` | archive | 100 games/opponent | bread-warehouse-pizza-stable | n/a |
| `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3` | adopted | 100 games/opponent | vineyard-farm-winery-strong | n/a |
| `self-only-both-h256-lr2e5-5000-seed71-rewardcap` | candidate | 100 games/opponent | vineyard-farm-burger | n/a |
| `self-only-both-h256-lr2e5-5000-seed69-rewardcap` | candidate | 100 games/opponent | burger-warehouse-wheat | n/a |
| `self-only-both-h256-lr2e5-5000-seed70-rewardcap` | candidate | 100 games/opponent | sushi-warehouse-farm | n/a |
| `self-only-both-h256-lr2e5-5000-seed65` | archive | 20 games/opponent | sushi-warehouse-bread | n/a |
| `self-only-both-5000-seed51` | rejected | 8 games/opponent | self-play-internal-overfit | n/a |
| `terminal-shaped-h128-lr1e4-long` | archive | 20 games/opponent | farm-cheese-weak-specialist | n/a |
| `terminal-shaped-h128-lr1e4-seed2` | archive | 4 games/opponent | wheat-bread-sushi | n/a |
| `terminal-shaped-h128-lr1e4-seed3` | archive | 4 games/opponent | wheat-bread-farm | n/a |
| `terminal-shaped-h128-lr1e4-strong005` | rejected | 4 games/opponent | strong-mix-005 | n/a |
| `terminal-shaped-h128-lr1e4-strong010` | rejected | 4 games/opponent | strong-mix-010 | n/a |
| `terminal-shaped-curriculum-h256` | rejected | no-eval | pass-collapse | n/a |
| `terminal-shaped-curriculum-h256-lr1e4` | rejected | no-eval | high-pass-weak | n/a |
| `self-only-4p-h256-lr1e5-5000-seed102` | candidate-4p | 200 games/lineup | 4p-vineyard-farm-pizza | n/a |
| `mp-mixed-34510-target-only-seed145-4p` | adopted | 300 games/lineup | target-wheat-vineyard-forest | n/a |
| `business-curriculum-probe-seed149-2p` | rejected | 100 games/opponent | 2p-vineyard-ranch-winery-business-curriculum | n/a |
| `self-only-4p-h256-lr1e5-5000-seed103` | adopted | eval-recorded | 4p-wheat-vineyard-pizza | n/a |
| `mp-mover-legal-curriculum-seed415-4p-strength` | candidate | 300 games/lineup | asset-engine-mover-curriculum | n/a |
