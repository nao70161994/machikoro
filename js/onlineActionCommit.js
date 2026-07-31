'use strict';

const ONLINE_ACTION_COMMIT_EFFECT_STEPS = Object.freeze([
    'setSequence',
    'saveActionLog',
    'clearPending',
    'render',
    'scheduleCpu',
]);

/**
 * Executes the existing successful online-action commit effects in their fixed
 * order. Restore queue flushes commit sequence/log state without rendering or
 * scheduling, and only actionAccepted clears the matching pending action.
 * @param {{alreadyApplied?: boolean, clearPending?: boolean, render?: boolean}} plan
 * @param {Object<string, function(...*): *>} handlers
 * @returns {{ok: true, result: true, steps: ReadonlyArray<string>}}
 */
function executeOnlineActionCommit(plan, handlers) {
    if (!plan || typeof plan.alreadyApplied !== 'boolean' ||
            typeof plan.clearPending !== 'boolean' || typeof plan.render !== 'boolean') {
        throw new TypeError('online action commit effect plan is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('online action commit handlers are required');
    }
    for (const step of ONLINE_ACTION_COMMIT_EFFECT_STEPS) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`online action commit handler is required: ${step}`);
        }
    }
    const steps = [];
    handlers.setSequence();
    steps.push('setSequence');
    handlers.saveActionLog(plan.alreadyApplied);
    steps.push('saveActionLog');
    if (plan.clearPending) {
        handlers.clearPending();
        steps.push('clearPending');
    }
    if (plan.render) {
        handlers.render();
        steps.push('render');
        handlers.scheduleCpu();
        steps.push('scheduleCpu');
    }
    return Object.freeze({
        ok: true,
        result: true,
        steps: Object.freeze(steps),
    });
}

const OnlineActionCommit = Object.freeze({
    steps: ONLINE_ACTION_COMMIT_EFFECT_STEPS,
    execute: executeOnlineActionCommit,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineActionCommit };
}
