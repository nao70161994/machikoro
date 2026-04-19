const RL_MODEL_PORTFOLIO = Object.freeze([
    {
        id: "self-only-4p-h256-lr1e5-5000-seed102",
        label: "RL（4人・牧場）",
        path: "models/rl_model/portfolio/seed102-4p.browser.json",
        weight: 3,
        minPlayers: 3,
        maxPlayers: 4,
    },
    {
        id: "self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3",
        label: "RL（農業・ワイナリー）",
        path: "models/rl_model/portfolio/seed71-top3.browser.json",
        weight: 3,
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
    {
        id: "terminal-shaped-h128-lr1e4",
        label: "RL（パン・漁船）",
        path: "models/rl_model/portfolio/h128-lr1e4.browser.json",
        weight: 1,
        maxPlayers: 2,
    },
]);

const RLModelPortfolio = (() => {
    const cache = new Map();

    function eligibleModels(playerCount) {
        const count = Number(playerCount) || 2;
        const models = RL_MODEL_PORTFOLIO.filter((model) => {
            if (model.minPlayers && count < model.minPlayers) return false;
            if (model.maxPlayers && count > model.maxPlayers) return false;
            return true;
        });
        return models;
    }

    function supportsPlayerCount(playerCount) {
        return eligibleModels(playerCount).length > 0;
    }

    function selectRandomModel(playerCount) {
        const models = eligibleModels(playerCount);
        const totalWeight = models.reduce((sum, model) => sum + Math.max(0, model.weight || 1), 0);
        let pick = Math.random() * (totalWeight || RL_MODEL_PORTFOLIO.length || 1);
        for (const model of models) {
            pick -= Math.max(0, model.weight || 1);
            if (pick <= 0) return model;
        }
        return models[models.length - 1] || null;
    }

    function loadModelData(model) {
        if (!model) throw new Error("RL model portfolio is empty");
        if (cache.has(model.path)) return cache.get(model.path);
        const request = new XMLHttpRequest();
        request.open("GET", model.path, false);
        request.send(null);
        if (request.status < 200 || request.status >= 300) {
            throw new Error(`RL model load failed: ${model.path} (${request.status})`);
        }
        const data = JSON.parse(request.responseText);
        cache.set(model.path, data);
        return data;
    }

    function createRandomCpu(options = {}) {
        if (typeof RLCPU === "undefined") {
            throw new Error("RLCPU is not loaded");
        }
        const model = selectRandomModel(options.playerCount);
        const cpu = new RLCPU(loadModelData(model));
        cpu.difficulty = "rl";
        cpu.modelId = model.id;
        cpu.modelLabel = model.label;
        return cpu;
    }

    return {
        models: RL_MODEL_PORTFOLIO,
        createRandomCpu,
        eligibleModels,
        selectRandomModel,
        supportsPlayerCount,
    };
})();
