# RL Model Cards

- registryUpdatedAt: n/a

## RL（多人数・上位3）

- id: `self-only-4p-h256-lr1e5-5000-seed103`
- role/status: adopted-3p-10p / adopted
- production: yes (weight 3)
- players: 3–10
- artifact: `models/rl_model/portfolio/seed103-4p.browser.json` (11.5 MiB)
- SHA-256: `9e18b1d974b5d5968fcc330a98c44312b29cde905b2953cf12530ef350539712`
- schema: v3, state-mp-v1, stateDim=353, targets=n/a
- action schema: action-flat-v1
- vocabulary fingerprint: legacy/missing
- source run: models/rl_model/runs/self-only-4p-h256-lr1e5-5000-seed103
- latest evaluation: 2026-08-19 js-cpu-seat-effect-10p paired=yes
- integrity: ok

## RL（4人・目標判断強化）

- id: `mp-mixed-34510-target-only-seed145-4p`
- role/status: adopted-4p-specialist / adopted
- production: yes (weight 1)
- players: 4–4
- artifact: `models/rl_model/portfolio/seed145-4p-target-specialist.browser.json` (12.1 MiB)
- SHA-256: `192e269d2d37b7cbacefd67d496a09aade48ab8715f25a6b24fb467eda117e38`
- schema: v3, state-mp-v1, stateDim=353, targets=3
- action schema: action-flat-v1
- vocabulary fingerprint: present
- source run: models/rl_model/runs/mp-mixed-34510-target-only-seed145
- latest evaluation: 2026-08-25 js-lineup-stability paired=yes
- integrity: ok

## RL（4人・strength）

- id: `mp-mover-legal-curriculum-seed415-4p-strength`
- role/status: n/a / candidate
- production: no (weight 1)
- players: 4–4
- artifact: `models/rl_model/portfolio/seed415-4p-strength.browser.json` (12.1 MiB)
- SHA-256: `2cb47d535cb42c65396596b0002c1c559f65156ca2463ab1706274388a2506e7`
- schema: v3, state-mp-v1, stateDim=353, targets=3
- action schema: action-flat-v1
- vocabulary fingerprint: present
- source run: models/rl_model/runs/strategy-mp-mover-legal-curriculum-seed415-smoke
- latest evaluation: 2026-09-13 js-lineup-stability paired=yes
- integrity: ok

## RL（農業・ワイナリー）

- id: `self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3`
- role/status: adopted-2p-main / adopted
- production: yes (weight 5)
- players: 2–2
- artifact: `models/rl_model/portfolio/seed71-top3.browser.json` (10.4 MiB)
- SHA-256: `c0e4572d80d70758574bd8e67e462be8f9e031d3956c431e085fac172c9917b3`
- schema: v3, state-2p-v1, stateDim=145, targets=n/a
- action schema: action-flat-v1
- vocabulary fingerprint: legacy/missing
- source run: models/rl_model/runs/self-only-both-h256-lr2e5-5000-seed71-rewardcap
- latest evaluation: 2026-09-13 js-head-to-head-screen paired=no
- integrity: ok

## RL（寿司・倉庫）

- id: `self-only-both-h256-lr2e5-5000-seed70-rewardcap`
- role/status: sushi-warehouse-variant / candidate
- production: no (weight 1)
- players: 2–2
- artifact: `models/rl_model/portfolio/seed70.browser.json` (10.4 MiB)
- SHA-256: `9b8265f0f656223b37db0d277cad1d7aba4602c1a3db9f32de4b527012ec1065`
- schema: v3, state-2p-v1, stateDim=145, targets=n/a
- action schema: action-flat-v1
- vocabulary fingerprint: legacy/missing
- source run: models/rl_model/runs/self-only-both-h256-lr2e5-5000-seed70-rewardcap
- latest evaluation: 2026-04-20 js paired=no
- integrity: ok

## RL（バーガー・倉庫）

- id: `self-only-both-h256-lr2e5-5000-seed69-rewardcap`
- role/status: burger-warehouse-variant / candidate
- production: no (weight 1)
- players: 2–2
- artifact: `models/rl_model/portfolio/seed69.browser.json` (10.4 MiB)
- SHA-256: `ccb2626325a6ff6856af62e594fd41f2dbddb44c926903b0e5834345d775b5df`
- schema: v3, state-2p-v1, stateDim=145, targets=n/a
- action schema: action-flat-v1
- vocabulary fingerprint: legacy/missing
- source run: models/rl_model/runs/self-only-both-h256-lr2e5-5000-seed69-rewardcap
- latest evaluation: 2026-04-20 js paired=no
- integrity: ok
