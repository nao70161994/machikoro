'use strict';

const LocalResumePolicy = (() => {
    const DECISIONS = Object.freeze({
        IGNORE_PENDING: 'ignore-pending',
        NO_SAVE: 'no-save',
        INVALID: 'invalid',
        PRELOAD_RL: 'preload-rl',
        RESUME: 'resume',
    });

    function shouldInspectRepository(facts = {}) {
        return !(facts.resumePending === true && facts.fromPreload !== true);
    }

    function initialDecision(facts = {}) {
        if (facts.resumePending === true && facts.fromPreload !== true) {
            return DECISIONS.IGNORE_PENDING;
        }
        return facts.repositoryExists === true ? 'read-save' : DECISIONS.NO_SAVE;
    }

    function shouldInspectRlLoadState(cpuSettings, skipRlPreload, canPreloadRl) {
        const settings = Array.isArray(cpuSettings) ? cpuSettings : [];
        return skipRlPreload !== true && canPreloadRl === true &&
            settings.some(setting => setting && setting.difficulty === 'rl');
    }

    function decide(facts = {}) {
        const decoded = facts.decoded;
        if (!decoded || decoded.ok !== true || !decoded.state) {
            return Object.freeze({ kind: DECISIONS.INVALID, state: null, cpuSettings: Object.freeze([]) });
        }
        const cpuSettings = Object.freeze(Array.isArray(facts.cpuSettings)
            ? facts.cpuSettings.slice()
            : []);
        const hasRlCpu = cpuSettings.some(setting => setting && setting.difficulty === 'rl');
        const shouldPreload = facts.skipRlPreload !== true && hasRlCpu &&
            facts.canPreloadRl === true &&
            (!facts.rlLoadState || facts.rlLoadState.status !== 'ready');
        return Object.freeze({
            kind: shouldPreload ? DECISIONS.PRELOAD_RL : DECISIONS.RESUME,
            state: decoded.state,
            cpuSettings,
        });
    }

    function cpuCreationPlan(cpuSettings, playerCount) {
        const settings = Array.isArray(cpuSettings) ? cpuSettings : [];
        const opponentDifficulties = settings.map(setting => setting
            ? setting.difficulty || 'normal'
            : 'human');
        return Object.freeze(settings.map(setting => {
            if (!setting) return null;
            return {
                difficulty: setting.difficulty,
                options: {
                    expertPurpose: 'live',
                    playerCount,
                    expertOpponentDifficulties: opponentDifficulties,
                    rlModelId: setting.rlModelId || setting.modelId || null,
                },
            };
        }));
    }

    function runtimePlan(state, cpuSettings, fallbackLandmarks = []) {
        const enabledCards = Array.isArray(state && state.enabledCardsList)
            ? Object.freeze(state.enabledCardsList.slice())
            : null;
        const savedLandmarks = Array.isArray(state && state.enabledLandmarksList) &&
            state.enabledLandmarksList.length > 0
            ? state.enabledLandmarksList
            : fallbackLandmarks;
        const enabledLandmarks = Object.freeze(Array.isArray(savedLandmarks)
            ? savedLandmarks.slice()
            : []);
        const playerCount = state && Array.isArray(state.players) ? state.players.length : 0;
        return Object.freeze({
            state,
            playerCount,
            cpuSpeed: state && state.cpuSpeed ? state.cpuSpeed : 1500,
            enabledCards,
            enabledLandmarks,
            cpuCreationPlan: cpuCreationPlan(cpuSettings, playerCount),
        });
    }

    function executeRuntime(plan, effects) {
        const names = [
            'captureRuntime',
            'rollbackRuntime',
            'invalidateCpuSchedule',
            'cancelDelayedHumanAction',
            'resetOnline',
            'resetUiLocks',
            'applySettings',
            'createAndHydrateGame',
            'createCpuPlayers',
            'resetPresentationState',
            'cancelAutoSkip',
            'clearUndo',
            'showGame',
            'render',
            'scheduleCpu',
        ];
        if (!plan || !effects || names.some(name => typeof effects[name] !== 'function')) {
            return Object.freeze({ ok: false, reason: 'invalid-effects' });
        }
        const before = effects.captureRuntime();
        try {
            effects.invalidateCpuSchedule();
            effects.cancelDelayedHumanAction();
            effects.resetOnline();
            effects.resetUiLocks();
            effects.applySettings(plan);
            if (effects.createAndHydrateGame(plan) !== true) {
                effects.rollbackRuntime(before);
                return Object.freeze({ ok: false, reason: 'hydrate-failed' });
            }
            effects.createCpuPlayers(plan.cpuCreationPlan);
            effects.resetPresentationState();
            effects.cancelAutoSkip();
            effects.clearUndo();
            effects.showGame();
            effects.render();
            effects.scheduleCpu();
            return Object.freeze({ ok: true, reason: 'resumed' });
        } catch (error) {
            try {
                effects.rollbackRuntime(before);
            } catch (_) {}
            return Object.freeze({ ok: false, reason: 'runtime-failed' });
        }
    }

    return Object.freeze({
        DECISIONS,
        shouldInspectRepository,
        initialDecision,
        shouldInspectRlLoadState,
        decide,
        cpuCreationPlan,
        runtimePlan,
        executeRuntime,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalResumePolicy;
if (typeof window !== 'undefined') Object.assign(window, { LocalResumePolicy });
if (typeof globalThis !== 'undefined') globalThis.LocalResumePolicy = LocalResumePolicy;
