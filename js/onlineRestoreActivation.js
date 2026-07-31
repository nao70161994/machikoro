'use strict';

const ONLINE_RESTORE_ACTIVATION_EFFECT_STEPS = Object.freeze([
    'resetReconnectCompleted',
    'activateOnlineGame',
    'clearReconnectFlag',
    'resetPreviousCoins',
    'setAppliedSequence',
    'flushRestoreEvents',
    'observeRestoreActivated',
    'applyActivatedStatus',
]);

/**
 * Captures the canonical sequence boundary used to activate a restored game.
 * @param {{restoredThroughSeq?: number}} input
 * @returns {{restoredThroughSeq: number}}
 */
function planOnlineRestoreActivation(input = {}) {
    return Object.freeze({
        restoredThroughSeq: input.restoredThroughSeq,
    });
}

function sameOnlineRestoreActivationPlan(left, right) {
    return !!left && !!right &&
        left.restoredThroughSeq === right.restoredThroughSeq;
}

function selectOnlineRestoreActivationPlan(input, legacyPlan, options = {}) {
    const purePlan = planOnlineRestoreActivation(input);
    const enabled = options.authorityEnabled === true;
    const matched = sameOnlineRestoreActivationPlan(purePlan, legacyPlan);
    return Object.freeze({
        plan: enabled && matched ? purePlan : legacyPlan,
        source: enabled && matched ? 'pure-plan' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: enabled && !matched ? 'restore-activation-plan-mismatch' : '',
    });
}

/**
 * Activates restored runtime state, flushes queued events, then publishes activation.
 * @param {{restoredThroughSeq: number}} plan
 * @param {Object<string, function(...*): *>} handlers
 * @returns {{ok: true, result: boolean, steps: ReadonlyArray<string>}}
 */
function executeOnlineRestoreActivation(plan, handlers) {
    if (!plan || !Number.isInteger(plan.restoredThroughSeq) || plan.restoredThroughSeq < 0) {
        throw new TypeError('online restore activation plan is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('online restore activation handlers are required');
    }
    for (const step of ONLINE_RESTORE_ACTIVATION_EFFECT_STEPS) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`online restore activation handler is required: ${step}`);
        }
    }

    const steps = [];
    handlers.resetReconnectCompleted();
    steps.push('resetReconnectCompleted');
    handlers.activateOnlineGame();
    steps.push('activateOnlineGame');
    handlers.clearReconnectFlag();
    steps.push('clearReconnectFlag');
    handlers.resetPreviousCoins();
    steps.push('resetPreviousCoins');
    handlers.setAppliedSequence(plan.restoredThroughSeq);
    steps.push('setAppliedSequence');
    const flushed = handlers.flushRestoreEvents(plan.restoredThroughSeq) === true;
    steps.push('flushRestoreEvents');
    if (!flushed) {
        return Object.freeze({ ok: true, result: false, steps: Object.freeze(steps) });
    }
    handlers.observeRestoreActivated();
    steps.push('observeRestoreActivated');
    handlers.applyActivatedStatus();
    steps.push('applyActivatedStatus');
    return Object.freeze({ ok: true, result: true, steps: Object.freeze(steps) });
}

const OnlineRestoreActivation = Object.freeze({
    steps: ONLINE_RESTORE_ACTIVATION_EFFECT_STEPS,
    plan: planOnlineRestoreActivation,
    samePlan: sameOnlineRestoreActivationPlan,
    selectPlan: selectOnlineRestoreActivationPlan,
    execute: executeOnlineRestoreActivation,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineRestoreActivation };
}
