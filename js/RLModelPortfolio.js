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
].map(model => Object.freeze(model)));

const RLModelPortfolio = (() => {
    const cache = new Map();
    const pendingLoads = new Map();
    const loadStates = new Map();
    const pendingFetchDeadlines = new Set();
    const pendingRetryDeadlines = new Set();

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

    function isMobileSafariRuntime() {
        if (typeof navigator === "undefined" || !navigator.userAgent) return false;
        const ua = navigator.userAgent;
        const isAppleMobile = /iP(?:hone|ad|od)/.test(ua) || (/\bMacintosh\b/.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1);
        return isAppleMobile && /Safari\//.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS)/.test(ua);
    }

    function shouldAvoidSynchronousModelLoad() {
        return isMobileSafariRuntime();
    }

    function markLoadState(model, status, error = null) {
        if (!model) return;
        loadStates.set(model.path, Object.freeze({
            status,
            modelId: model.id,
            path: model.path,
            error: error ? String(error && error.message || error) : '',
            updatedAt: Date.now(),
        }));
    }

    function modelLoadState(model) {
        if (!model) return Object.freeze({ status: 'missing', modelId: '', path: '', error: 'missing model', updatedAt: 0 });
        if (cache.has(model.path)) return Object.freeze({ status: 'ready', modelId: model.id, path: model.path, error: '', updatedAt: Date.now() });
        if (pendingLoads.has(model.path)) return Object.freeze({ status: 'loading', modelId: model.id, path: model.path, error: '', updatedAt: Date.now() });
        return loadStates.get(model.path) || Object.freeze({ status: 'idle', modelId: model.id, path: model.path, error: '', updatedAt: 0 });
    }

    function eligibleLoadState(playerCount) {
        const models = eligibleModels(playerCount);
        if (!models.length) return Object.freeze({ status: 'missing', ready: 0, total: 0, errors: [] });
        const states = models.map(modelLoadState);
        const ready = states.filter(state => state.status === 'ready').length;
        const loading = states.some(state => state.status === 'loading');
        const failedStates = states.filter(state => state.status === 'failed');
        let status = 'idle';
        if (ready === models.length) status = 'ready';
        else if (loading) status = 'loading';
        else if (failedStates.length) status = 'failed';
        return Object.freeze({
            status,
            ready,
            total: models.length,
            errors: failedStates.map(state => state.error).filter(Boolean),
        });
    }

    function loadModelData(model) {
        if (!model) throw new Error("RL model portfolio is empty");
        if (cache.has(model.path)) return cache.get(model.path);
        throw new Error(`RL model is not preloaded: ${model.path}`);
    }

    function preloadRetryDelay(attempt, options) {
        const delayMs = Number.isFinite(options.retryDelayMs) ? Math.max(0, options.retryDelayMs) : Math.min(1200, 300 * attempt);
        if (delayMs <= 0 || typeof setTimeout !== "function") return Promise.resolve();
        return new Promise(resolve => {
            const pending = {
                deadline: Date.now() + delayMs,
                timer: null,
                settled: false,
            };
            pending.finish = () => {
                if (pending.settled) return;
                pending.settled = true;
                if (pending.timer !== null && typeof clearTimeout === "function") clearTimeout(pending.timer);
                pending.timer = null;
                pendingRetryDeadlines.delete(pending);
                resolve();
            };
            pending.arm = () => {
                if (pending.settled) return;
                if (pending.timer !== null && typeof clearTimeout === "function") clearTimeout(pending.timer);
                const remaining = pending.deadline - Date.now();
                if (remaining <= 0) {
                    pending.finish();
                    return;
                }
                pending.timer = setTimeout(pending.finish, remaining);
            };
            pendingRetryDeadlines.add(pending);
            pending.arm();
        });
    }

    function fetchModelData(model, options) {
        const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(0, options.timeoutMs) : 15000;
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        const fetchOptions = { cache: "force-cache" };
        if (controller) fetchOptions.signal = controller.signal;
        const fetchPromise = fetch(model.path, fetchOptions)
            .then(response => {
                if (!response || response.ok === false) {
                    const status = response && response.status !== undefined ? response.status : "unknown";
                    throw new Error(`RL model preload failed: ${model.path} (${status})`);
                }
                return response.json();
            });
        if (timeoutMs <= 0 || typeof setTimeout !== "function") return fetchPromise;
        return new Promise((resolve, reject) => {
            const pending = {
                model,
                controller,
                deadline: Date.now() + timeoutMs,
                timer: null,
                settled: false,
                reject,
            };
            const settle = (callback, value) => {
                if (pending.settled) return;
                pending.settled = true;
                if (pending.timer !== null && typeof clearTimeout === "function") clearTimeout(pending.timer);
                pending.timer = null;
                pendingFetchDeadlines.delete(pending);
                callback(value);
            };
            pending.expire = () => {
                if (pending.controller) pending.controller.abort();
                settle(reject, new Error(`RL model preload timed out: ${model.path} (${timeoutMs}ms)`));
            };
            pending.arm = () => {
                if (pending.settled) return;
                if (pending.timer !== null && typeof clearTimeout === "function") clearTimeout(pending.timer);
                const remaining = pending.deadline - Date.now();
                if (remaining <= 0) {
                    pending.expire();
                    return;
                }
                pending.timer = setTimeout(pending.expire, remaining);
            };
            pendingFetchDeadlines.add(pending);
            pending.arm();
            fetchPromise.then(
                data => settle(resolve, data),
                error => settle(reject, error)
            );
        });
    }

    function resumePendingLoadsAfterPageActivation() {
        for (const pending of [...pendingFetchDeadlines]) pending.arm();
        for (const pending of [...pendingRetryDeadlines]) pending.arm();
        return pendingFetchDeadlines.size + pendingRetryDeadlines.size;
    }

    function preloadModelData(model, options = {}) {
        if (!model) return Promise.reject(new Error("RL model portfolio is empty"));
        if (cache.has(model.path)) {
            markLoadState(model, 'ready');
            return Promise.resolve(cache.get(model.path));
        }
        if (pendingLoads.has(model.path)) return pendingLoads.get(model.path);
        if (typeof fetch !== "function") {
            const error = new Error("fetch is not available for RL model preload");
            markLoadState(model, 'failed', error);
            return Promise.reject(error);
        }
        markLoadState(model, 'loading');
        const maxAttempts = Math.max(1, Math.floor(Number.isFinite(options.attempts) ? options.attempts : 3));
        const loadWithRetry = (attempt) => fetchModelData(model, options).catch(error => {
            if (attempt >= maxAttempts) throw error;
            return preloadRetryDelay(attempt, options).then(() => loadWithRetry(attempt + 1));
        });
        const request = loadWithRetry(1)
            .then(data => {
                cache.set(model.path, data);
                pendingLoads.delete(model.path);
                markLoadState(model, 'ready');
                return data;
            })
            .catch(error => {
                pendingLoads.delete(model.path);
                markLoadState(model, 'failed', error);
                throw error;
            });
        pendingLoads.set(model.path, request);
        return request;
    }

    function preloadEligibleModels(playerCount, options = {}) {
        const models = eligibleModels(playerCount);
        if (!models.length) return Promise.resolve([]);
        return Promise.all(models.map(model => preloadModelData(model, options)));
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
        eligibleLoadState,
        modelLoadState,
        preloadEligibleModels,
        preloadModelData,
        resumePendingLoadsAfterPageActivation,
        selectRandomModel,
        shouldAvoidSynchronousModelLoad,
        supportsPlayerCount,
    };
})();
