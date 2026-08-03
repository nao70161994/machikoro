'use strict';

const LocalGameStart = (() => {
    const REQUEST_DECISIONS = Object.freeze({
        IGNORE_PENDING: 'ignore-pending',
        WAIT_LOADING: 'wait-loading',
        PRELOAD: 'preload',
        START: 'start',
    });
    const EFFECT_STEPS = Object.freeze([
        'setRuntime',
        'saveSettings',
        'resetStats',
        'resetOnline',
        'resetUiLocks',
        'showGame',
        'initializeGame',
        'notifyLifecycleStart',
    ]);

    function initialDecision(facts = {}) {
        if (facts.startPending === true) return REQUEST_DECISIONS.IGNORE_PENDING;
        if (facts.loadStatus === 'loading') return REQUEST_DECISIONS.WAIT_LOADING;
        return 'inspect-preload';
    }

    function preloadDecision(preload) {
        return preload && typeof preload.then === 'function'
            ? REQUEST_DECISIONS.PRELOAD
            : REQUEST_DECISIONS.START;
    }

    function runtimePlan(playerCount, settings, cpuSpeed) {
        const count = Number.isInteger(playerCount) ? playerCount : 0;
        const source = Array.isArray(settings) ? settings : [];
        const playerSettings = Array.from({ length: count }, (_, index) =>
            Object.freeze(Object.assign({}, source[index] || {}))
        );
        return Object.freeze({
            playerCount: count,
            playerSettings: Object.freeze(playerSettings),
            cpuSpeed,
        });
    }

    function execute(plan, handlers) {
        if (!plan || !Number.isInteger(plan.playerCount)) {
            throw new TypeError('local game start plan is required');
        }
        if (!handlers || typeof handlers !== 'object') {
            throw new TypeError('local game start handlers are required');
        }
        for (const step of EFFECT_STEPS) {
            if (typeof handlers[step] !== 'function') {
                throw new TypeError(`local game start handler is required: ${step}`);
            }
        }
        handlers.setRuntime(plan);
        handlers.saveSettings();
        handlers.resetStats();
        handlers.resetOnline();
        handlers.resetUiLocks();
        handlers.showGame();
        handlers.initializeGame(plan.playerCount);
        handlers.notifyLifecycleStart();
        return Object.freeze({ ok: true, steps: EFFECT_STEPS });
    }

    return Object.freeze({
        REQUEST_DECISIONS,
        EFFECT_STEPS,
        initialDecision,
        preloadDecision,
        runtimePlan,
        execute,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalGameStart;
if (typeof window !== 'undefined') Object.assign(window, { LocalGameStart });
if (typeof globalThis !== 'undefined') globalThis.LocalGameStart = LocalGameStart;
