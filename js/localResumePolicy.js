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

    return Object.freeze({
        DECISIONS,
        shouldInspectRepository,
        initialDecision,
        shouldInspectRlLoadState,
        decide,
        cpuCreationPlan,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalResumePolicy;
if (typeof window !== 'undefined') window.LocalResumePolicy = LocalResumePolicy;
if (typeof globalThis !== 'undefined') globalThis.LocalResumePolicy = LocalResumePolicy;
