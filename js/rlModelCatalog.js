'use strict';

const RL_MODEL_CATALOG = Object.freeze([
    {
        id: "self-only-4p-h256-lr1e5-5000-seed103",
        aliases: Object.freeze(["seed103", "seed103-4p"]),
        label: "RL（多人数・上位3）",
        path: "models/rl_model/portfolio/seed103-4p.browser.json",
        bytes: 12030008,
        sha256: "9e18b1d974b5d5968fcc330a98c44312b29cde905b2953cf12530ef350539712",
        weight: 3,
        minPlayers: 3,
        maxPlayers: 10,
        legacyVocabulary: true,
        productionActive: true,
        registryStatus: "adopted",
    },
    {
        id: "mp-mixed-34510-target-only-seed145-4p",
        aliases: Object.freeze(["seed145", "seed145-4p-target-specialist"]),
        label: "RL（4人・目標判断強化）",
        path: "models/rl_model/portfolio/seed145-4p-target-specialist.browser.json",
        bytes: 12668421,
        sha256: "192e269d2d37b7cbacefd67d496a09aade48ab8715f25a6b24fb467eda117e38",
        weight: 1,
        minPlayers: 4,
        maxPlayers: 4,
        productionActive: true,
        registryStatus: "adopted",
    },
    {
        id: "mp-mover-legal-curriculum-seed415-4p-strength",
        aliases: Object.freeze(["seed415-4p-strength"]),
        label: "RL（4人・strength）",
        path: "models/rl_model/portfolio/seed415-4p-strength.browser.json",
        bytes: 12667729,
        sha256: "2cb47d535cb42c65396596b0002c1c559f65156ca2463ab1706274388a2506e7",
        weight: 1,
        minPlayers: 4,
        maxPlayers: 4,
        productionActive: false,
        registryStatus: "candidate",
    },
    {
        id: "self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3",
        aliases: Object.freeze(["seed71", "seed71-top3"]),
        label: "RL（農業・ワイナリー）",
        path: "models/rl_model/portfolio/seed71-top3.browser.json",
        bytes: 10909992,
        sha256: "c0e4572d80d70758574bd8e67e462be8f9e031d3956c431e085fac172c9917b3",
        weight: 5,
        maxPlayers: 2,
        legacyVocabulary: true,
        productionActive: true,
        registryStatus: "adopted",
    },
    {
        id: "self-only-both-h256-lr2e5-5000-seed70-rewardcap",
        aliases: Object.freeze(["seed70"]),
        label: "RL（寿司・倉庫）",
        path: "models/rl_model/portfolio/seed70.browser.json",
        bytes: 10914676,
        sha256: "9b8265f0f656223b37db0d277cad1d7aba4602c1a3db9f32de4b527012ec1065",
        weight: 1,
        maxPlayers: 2,
        legacyVocabulary: true,
        productionActive: false,
        registryStatus: "candidate",
    },
    {
        id: "self-only-both-h256-lr2e5-5000-seed69-rewardcap",
        aliases: Object.freeze(["seed69"]),
        label: "RL（バーガー・倉庫）",
        path: "models/rl_model/portfolio/seed69.browser.json",
        bytes: 10887237,
        sha256: "ccb2626325a6ff6856af62e594fd41f2dbddb44c926903b0e5834345d775b5df",
        weight: 1,
        maxPlayers: 2,
        legacyVocabulary: true,
        productionActive: false,
        registryStatus: "candidate",
    },
].map(model => Object.freeze(model)));

const RLModelCatalog = Object.freeze({
    models: RL_MODEL_CATALOG,
    modelIds: Object.freeze(RL_MODEL_CATALOG.map(model => model.id)),
    modelDigests: Object.freeze(Object.fromEntries(
        RL_MODEL_CATALOG.map(model => [model.id, model.sha256])
    )),
});

if (typeof module !== 'undefined' && module.exports) module.exports = RLModelCatalog;
if (typeof window !== 'undefined') window.RLModelCatalog = RLModelCatalog;
if (typeof globalThis !== 'undefined') globalThis.RLModelCatalog = RLModelCatalog;
