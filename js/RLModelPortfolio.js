const RL_MODEL_PORTFOLIO = RLModelCatalog.models;

const RLModelPortfolio = (() => {
    const cache = new Map();
    const pendingLoads = new Map();
    const loadStates = new Map();
    const loadDiagnostics = new Map();
    const pendingFetchDeadlines = new Set();
    const pendingRetryDeadlines = new Set();

    function modelsForPlayerCount(playerCount, options = {}) {
        const count = Number(playerCount) || 2;
        const models = RL_MODEL_PORTFOLIO.filter((model) => {
            if (options.productionOnly === true && model.productionActive === false) return false;
            if (model.minPlayers && count < model.minPlayers) return false;
            if (model.maxPlayers && count > model.maxPlayers) return false;
            return true;
        });
        return models;
    }

    function eligibleModels(playerCount) {
        return modelsForPlayerCount(playerCount, { productionOnly: true });
    }

    function supportsPlayerCount(playerCount) {
        return eligibleModels(playerCount).length > 0;
    }

    function modelWeight(model) {
        return Number.isFinite(model.weight) ? Math.max(0, model.weight) : 1;
    }

    function selectWeightedModel(models) {
        const totalWeight = models.reduce((sum, model) => sum + modelWeight(model), 0);
        if (totalWeight <= 0) return null;
        let pick = Math.random() * totalWeight;
        for (const model of models) {
            pick -= modelWeight(model);
            if (pick <= 0) return model;
        }
        return models[models.length - 1] || null;
    }

    function selectRandomModel(playerCount) {
        return selectWeightedModel(eligibleModels(playerCount));
    }

    function modelById(modelId, playerCount) {
        const models = modelsForPlayerCount(playerCount);
        return models.find(model => model.id === modelId ||
            (Array.isArray(model.aliases) && model.aliases.includes(modelId))) || null;
    }

    function assignModelIds(settings, playerCount) {
        const source = Array.from(settings || []).slice(0, Math.max(0, Number(playerCount) || 0));
        const eligible = eligibleModels(playerCount);
        const reserved = new Set();
        for (const setting of source) {
            if (!setting || setting.type !== 'cpu' || setting.difficulty !== 'rl' || !setting.rlModelId) continue;
            const model = modelById(setting.rlModelId, playerCount);
            if (!model) throw new Error(`RL model is not available: ${setting.rlModelId}`);
            reserved.add(model.id);
        }
        let available = eligible.filter(model => !reserved.has(model.id));
        return source.map(setting => {
            if (!setting) return setting;
            const assigned = Object.assign({}, setting);
            if (assigned.type !== 'cpu' || assigned.difficulty !== 'rl') return assigned;
            const model = assigned.rlModelId
                ? modelById(assigned.rlModelId, playerCount)
                : selectWeightedModel(available.length > 0 ? available : eligible);
            if (!model) {
                throw new Error(`RL model is not available: ${assigned.rlModelId || 'none'}`);
            }
            assigned.rlModelId = model.id;
            assigned.rlModelSha256 = model.sha256;
            assigned.rlModelSelection = setting.rlModelSelection === 'manual' ? 'manual' : 'auto';
            if (!setting.rlModelId) {
                available = available.filter(candidate => candidate.id !== model.id);
            }
            return assigned;
        });
    }

    function selectedModels(playerCount, settings) {
        const selected = new Map();
        const source = Array.from(settings || []).slice(0, Math.max(0, Number(playerCount) || 0));
        for (const setting of source) {
            if (!setting || setting.type !== 'cpu' || setting.difficulty !== 'rl') continue;
            const model = modelById(setting.rlModelId, playerCount);
            if (!model) {
                throw new Error(`RL model is not available: ${setting.rlModelId || 'unassigned'}`);
            }
            if (setting.rlModelSha256 && setting.rlModelSha256 !== model.sha256) {
                throw new Error(`RL model digest mismatch: ${model.id}`);
            }
            selected.set(model.id, model);
        }
        return [...selected.values()];
    }

    function safeFallbackSettings(settings, playerCount, fallbackDifficulty = 'strong') {
        const count = Math.max(0, Number(playerCount) || 0);
        const replaced = [];
        const fallbackSettings = Array.from(settings || []).slice(0, count).map((setting, index) => {
            if (!setting || setting.type !== 'cpu' || setting.difficulty !== 'rl') {
                return Object.freeze(Object.assign({}, setting || {}));
            }
            replaced.push(Object.freeze({
                playerIndex: index,
                modelId: setting.rlModelId || '',
                expectedSha256: setting.rlModelSha256 || '',
            }));
            const fallback = Object.assign({}, setting, { difficulty: fallbackDifficulty });
            delete fallback.rlModelId;
            delete fallback.rlModelSha256;
            delete fallback.rlModelSelection;
            return Object.freeze(fallback);
        });
        return Object.freeze({
            fallbackDifficulty,
            settings: Object.freeze(fallbackSettings),
            replaced: Object.freeze(replaced),
        });
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

    function markLoadState(model, status, error = null, diagnostics = null) {
        if (!model) return;
        if (diagnostics) loadDiagnostics.set(model.path, Object.freeze(Object.assign({}, diagnostics)));
        loadStates.set(model.path, Object.freeze({
            status,
            modelId: model.id,
            path: model.path,
            error: error ? String(error && error.message || error) : '',
            updatedAt: Date.now(),
        }));
    }

    function bytesToHex(bytes) {
        return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
    }

    function shouldVerifyArtifactIntegrity(model) {
        return !!(model && model.sha256 && typeof window !== "undefined");
    }

    function decodeAndVerifyResponse(response, model) {
        if (!shouldVerifyArtifactIntegrity(model)) return response.json().then(data => ({ data, diagnostics: null }));
        const RuntimeTextEncoder = globalThis.TextEncoder;
        const runtimeCrypto = globalThis.crypto;
        if (typeof response.text !== "function" || typeof RuntimeTextEncoder !== "function" ||
                !runtimeCrypto || !runtimeCrypto.subtle || typeof runtimeCrypto.subtle.digest !== "function") {
            return Promise.reject(new Error(`RL model integrity verifier is not available: ${model.id}`));
        }
        return response.text().then(text => {
            const encoded = new RuntimeTextEncoder().encode(text);
            if (Number.isSafeInteger(model.bytes) && encoded.byteLength !== model.bytes) {
                throw new Error(`RL model byte size mismatch: ${model.id}`);
            }
            return runtimeCrypto.subtle.digest("SHA-256", encoded).then(digest => {
                const actualSha256 = bytesToHex(digest);
                if (actualSha256 !== model.sha256) {
                    throw new Error(`RL model SHA-256 mismatch: ${model.id}`);
                }
                return {
                    data: JSON.parse(text),
                    diagnostics: Object.freeze({
                        verified: true,
                        bytes: encoded.byteLength,
                        sha256: actualSha256,
                    }),
                };
            });
        });
    }

    function modelLoadState(model) {
        if (!model) return Object.freeze({ status: 'missing', modelId: '', path: '', error: 'missing model', updatedAt: 0 });
        if (cache.has(model.path)) return Object.freeze({ status: 'ready', modelId: model.id, path: model.path, error: '', updatedAt: Date.now() });
        if (pendingLoads.has(model.path)) return Object.freeze({ status: 'loading', modelId: model.id, path: model.path, error: '', updatedAt: Date.now() });
        return loadStates.get(model.path) || Object.freeze({ status: 'idle', modelId: model.id, path: model.path, error: '', updatedAt: 0 });
    }

    function modelDiagnostics(model) {
        if (!model) return Object.freeze({ modelId: '', status: 'missing', expectedBytes: 0, loadedBytes: 0, expectedSha256: '', actualSha256: '', verified: false });
        const state = modelLoadState(model);
        const diagnostics = loadDiagnostics.get(model.path) || {};
        return Object.freeze({
            modelId: model.id,
            label: model.label,
            path: model.path,
            status: state.status,
            error: state.error,
            expectedBytes: Number(model.bytes) || 0,
            loadedBytes: Number(diagnostics.bytes) || 0,
            expectedSha256: model.sha256 || '',
            actualSha256: diagnostics.sha256 || '',
            verified: diagnostics.verified === true,
        });
    }

    function selectedMemoryBudget(playerCount, settings, options = {}) {
        const limitBytes = Number.isSafeInteger(options.limitBytes) && options.limitBytes > 0
            ? options.limitBytes
            : 32 * 1024 * 1024;
        const models = selectedModels(playerCount, settings);
        const artifactBytes = models.reduce((total, model) => total + Math.max(0, Number(model.bytes) || 0), 0);
        const loadedBytes = models.reduce((total, model) => {
            const diagnostics = loadDiagnostics.get(model.path);
            return total + Math.max(0, Number(diagnostics && diagnostics.bytes) || 0);
        }, 0);
        return Object.freeze({
            modelIds: Object.freeze(models.map(model => model.id)),
            artifactBytes,
            loadedBytes,
            limitBytes,
            withinBudget: artifactBytes <= limitBytes,
        });
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

    function selectedLoadState(playerCount, settings) {
        let models;
        try {
            models = selectedModels(playerCount, settings);
        } catch (error) {
            return Object.freeze({ status: 'failed', ready: 0, total: 0, errors: [String(error.message || error)] });
        }
        if (!models.length) return Object.freeze({ status: 'unused', ready: 0, total: 0, errors: [] });
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
        /** @type {RequestInit} */
        const fetchOptions = { cache: "force-cache" };
        if (controller) fetchOptions.signal = controller.signal;
        const fetchPromise = fetch(model.path, fetchOptions)
            .then(response => {
                if (!response || response.ok === false) {
                    const status = response && response.status !== undefined ? response.status : "unknown";
                    throw new Error(`RL model preload failed: ${model.path} (${status})`);
                }
                return decodeAndVerifyResponse(response, model);
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
            .then(result => {
                const data = result.data;
                if (typeof RLCPU === "undefined") {
                    throw new Error("RLCPU model validator is not available");
                }
                if (typeof RLCPU.validateModelData === "function") {
                    RLCPU.validateModelData(data, {
                        allowLegacyVocabulary: model.legacyVocabulary === true,
                        requireFormatVersion: true,
                    });
                } else {
                    new RLCPU(data, {
                        allowLegacyVocabulary: model.legacyVocabulary === true,
                        requireFormatVersion: true,
                    });
                }
                cache.set(model.path, data);
                pendingLoads.delete(model.path);
                markLoadState(model, 'ready', null, result.diagnostics);
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

    function preloadModelsSequentially(models, options = {}) {
        const loaded = [];
        return models.reduce((chain, model) => chain.then(() =>
            preloadModelData(model, options).then(data => {
                loaded.push(data);
            })
        ), Promise.resolve()).then(() => loaded);
    }

    function preloadEligibleModels(playerCount, options = {}) {
        const models = eligibleModels(playerCount);
        if (!models.length) return Promise.resolve([]);
        return preloadModelsSequentially(models, options);
    }

    function preloadSelectedModels(playerCount, settings, options = {}) {
        const models = selectedModels(playerCount, settings);
        if (!models.length) return Promise.resolve([]);
        return preloadModelsSequentially(models, options);
    }

    function createRandomCpu(options = {}) {
        const requestedModelId = options.rlModelId || options.modelId;
        const model = requestedModelId
            ? modelById(requestedModelId, options.playerCount)
            : selectRandomModel(options.playerCount);
        if (!model) {
            throw new Error(`RL model is not available: ${requestedModelId || "none"}`);
        }
        if (options.rlModelSha256 && options.rlModelSha256 !== model.sha256) {
            throw new Error(`RL model digest mismatch: ${model.id}`);
        }
        if (typeof RLCPU === "undefined") {
            throw new Error("RLCPU is not loaded");
        }
        const cpu = /** @type {RLCPU & {difficulty: string, modelId: string, modelLabel: string}} */ (new RLCPU(loadModelData(model), {
            allowLegacyVocabulary: model.legacyVocabulary === true,
        }));
        cpu.difficulty = "rl";
        cpu.modelId = model.id;
        cpu.modelLabel = model.label;
        return cpu;
    }

    return {
        models: RL_MODEL_PORTFOLIO,
        assignModelIds,
        createRandomCpu,
        eligibleModels,
        modelById,
        modelDiagnostics,
        eligibleLoadState,
        modelLoadState,
        preloadEligibleModels,
        preloadModelsSequentially,
        preloadSelectedModels,
        preloadModelData,
        resumePendingLoadsAfterPageActivation,
        safeFallbackSettings,
        selectRandomModel,
        selectedLoadState,
        selectedMemoryBudget,
        selectedModels,
        shouldAvoidSynchronousModelLoad,
        supportsPlayerCount,
    };
})();
