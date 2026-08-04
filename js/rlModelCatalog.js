'use strict';

const RL_MODEL_CATALOG = Object.freeze([
    {
        id: "self-only-4p-h256-lr1e5-5000-seed103",
        label: "RL（多人数・上位3）",
        path: "models/rl_model/portfolio/seed103-4p.browser.json",
        weight: 3,
        minPlayers: 3,
        maxPlayers: 10,
    },
    {
        id: "self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3",
        label: "RL（農業・ワイナリー）",
        path: "models/rl_model/portfolio/seed71-top3.browser.json",
        weight: 5,
        maxPlayers: 2,
    },
    {
        id: "self-only-both-h256-lr2e5-5000-seed70-rewardcap",
        label: "RL（寿司・倉庫）",
        path: "models/rl_model/portfolio/seed70.browser.json",
        weight: 1,
        maxPlayers: 2,
    },
    {
        id: "self-only-both-h256-lr2e5-5000-seed69-rewardcap",
        label: "RL（バーガー・倉庫）",
        path: "models/rl_model/portfolio/seed69.browser.json",
        weight: 1,
        maxPlayers: 2,
    },
].map(model => Object.freeze(model)));

const RLModelCatalog = Object.freeze({
    models: RL_MODEL_CATALOG,
    modelIds: Object.freeze(RL_MODEL_CATALOG.map(model => model.id)),
});

if (typeof module !== 'undefined' && module.exports) module.exports = RLModelCatalog;
if (typeof window !== 'undefined') window.RLModelCatalog = RLModelCatalog;
if (typeof globalThis !== 'undefined') globalThis.RLModelCatalog = RLModelCatalog;
