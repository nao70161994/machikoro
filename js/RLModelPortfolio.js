const RL_MODEL_PORTFOLIO = Object.freeze([
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

    function modelWeight(model) {
        return Number.isFinite(model.weight) ? Math.max(0, model.weight) : 1;
    }

    function selectRandomModel(playerCount) {
        const models = eligibleModels(playerCount);
        const totalWeight = models.reduce((sum, model) => sum + modelWeight(model), 0);
        if (totalWeight <= 0) return null;
        let pick = Math.random() * totalWeight;
        for (const model of models) {
            pick -= modelWeight(model);
            if (pick <= 0) return model;
        }
        return models[models.length - 1] || null;
    }

    function modelById(modelId, playerCount) {
        const models = eligibleModels(playerCount);
        return models.find(model => model.id === modelId) || null;
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
        const requestedModelId = options.rlModelId || options.modelId;
        const model = requestedModelId
            ? modelById(requestedModelId, options.playerCount)
            : selectRandomModel(options.playerCount);
        if (!model) {
            throw new Error(`RL model is not available: ${requestedModelId || "none"}`);
        }
        if (typeof RLCPU === "undefined") {
            throw new Error("RLCPU is not loaded");
        }
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
        modelById,
        selectRandomModel,
        supportsPlayerCount,
    };
})();
