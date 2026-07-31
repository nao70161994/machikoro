'use strict';

const ONLINE_REJOIN_PERSISTENCE_EFFECT_STEPS = Object.freeze([
    'clearActionFlight',
    'clearPendingOutboundAction',
    'clearRetry',
    'setCpuSpeed',
    'setEnabledCards',
    'setEnabledLandmarks',
    'setPlayerIndices',
    'setHostState',
    'persistRestoreBundle',
    'saveSession',
    'invalidateCpuSchedule',
    'resetUiLocks',
]);

/**
 * Computes the runtime values applied before a rejoined game is replayed.
 * @param {Object<string, *>} input
 * @returns {Readonly<Object<string, *>>}
 */
function planOnlineRejoinPersistence(input = {}) {
    const enabledLandmarks = input.enabledLandmarks && input.enabledLandmarks.length > 0
        ? input.enabledLandmarks
        : input.defaultLandmarks;
    return Object.freeze({
        clearPendingOutboundAction: input.acceptedPending === true,
        cpuSpeed: input.cpuSpeed || 1500,
        updateEnabledCards: !!input.enabledCards,
        enabledCards: input.enabledCards,
        enabledLandmarks,
        playerIndex: input.playerIndex,
        hostPlayerIndex: input.hostPlayerIndex,
        resetUiLocks: input.resetUiLocksAvailable === true,
    });
}

function sameOnlineRejoinPersistencePlan(left, right) {
    return !!left && !!right &&
        left.clearPendingOutboundAction === right.clearPendingOutboundAction &&
        left.cpuSpeed === right.cpuSpeed &&
        left.updateEnabledCards === right.updateEnabledCards &&
        left.enabledCards === right.enabledCards &&
        left.enabledLandmarks === right.enabledLandmarks &&
        left.playerIndex === right.playerIndex &&
        left.hostPlayerIndex === right.hostPlayerIndex &&
        left.resetUiLocks === right.resetUiLocks;
}

function selectOnlineRejoinPersistencePlan(input, legacyPlan, options = {}) {
    const purePlan = planOnlineRejoinPersistence(input);
    const enabled = options.authorityEnabled === true;
    const matched = sameOnlineRejoinPersistencePlan(purePlan, legacyPlan);
    return Object.freeze({
        plan: enabled && matched ? purePlan : legacyPlan,
        source: enabled && matched ? 'pure-plan' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: enabled && !matched ? 'rejoin-persistence-plan-mismatch' : '',
    });
}

/**
 * Applies rejoin runtime and persistence effects in the legacy order.
 * @param {Readonly<Object<string, *>>} plan
 * @param {Object<string, function(...*): *>} handlers
 * @returns {{ok: true, steps: ReadonlyArray<string>}}
 */
function executeOnlineRejoinPersistence(plan, handlers) {
    if (!plan || typeof plan.clearPendingOutboundAction !== 'boolean') {
        throw new TypeError('online rejoin persistence plan is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('online rejoin persistence handlers are required');
    }
    for (const step of ONLINE_REJOIN_PERSISTENCE_EFFECT_STEPS) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`online rejoin persistence handler is required: ${step}`);
        }
    }

    const steps = [];
    handlers.clearActionFlight();
    steps.push('clearActionFlight');
    if (plan.clearPendingOutboundAction) {
        handlers.clearPendingOutboundAction();
        steps.push('clearPendingOutboundAction');
    }
    handlers.clearRetry();
    steps.push('clearRetry');
    handlers.setCpuSpeed(plan.cpuSpeed);
    steps.push('setCpuSpeed');
    if (plan.updateEnabledCards) {
        handlers.setEnabledCards(plan.enabledCards);
        steps.push('setEnabledCards');
    }
    handlers.setEnabledLandmarks(plan.enabledLandmarks);
    steps.push('setEnabledLandmarks');
    handlers.setPlayerIndices(plan.playerIndex);
    steps.push('setPlayerIndices');
    handlers.setHostState(plan.hostPlayerIndex);
    steps.push('setHostState');
    handlers.persistRestoreBundle();
    steps.push('persistRestoreBundle');
    handlers.saveSession();
    steps.push('saveSession');
    handlers.invalidateCpuSchedule();
    steps.push('invalidateCpuSchedule');
    if (plan.resetUiLocks) {
        handlers.resetUiLocks();
        steps.push('resetUiLocks');
    }
    return Object.freeze({ ok: true, steps: Object.freeze(steps) });
}

const OnlineRejoinPersistence = Object.freeze({
    steps: ONLINE_REJOIN_PERSISTENCE_EFFECT_STEPS,
    plan: planOnlineRejoinPersistence,
    samePlan: sameOnlineRejoinPersistencePlan,
    selectPlan: selectOnlineRejoinPersistencePlan,
    execute: executeOnlineRejoinPersistence,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineRejoinPersistence };
}
