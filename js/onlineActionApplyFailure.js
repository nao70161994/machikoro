'use strict';

const ONLINE_ACTION_APPLY_FAILURE_EFFECT_STEPS = Object.freeze([
    'reportError',
    'markReconnecting',
    'invalidateCpuSchedule',
    'requestRejoin',
    'scheduleRetry',
]);

/**
 * Executes the existing action-apply failure effects in their fixed order.
 * Restore-queue flush failures stop after invalidating the CPU schedule so the
 * queue owner can preserve and abort the remaining events canonically.
 * @param {{requestRejoin?: boolean}} plan
 * @param {Object<string, function(...*): *>} handlers
 * @returns {{ok: true, result: false, rejoinRequested: boolean, steps: ReadonlyArray<string>}}
 */
function executeOnlineActionApplyFailure(plan, handlers) {
    if (!plan || typeof plan.requestRejoin !== 'boolean') {
        throw new TypeError('online action apply failure effect plan is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('online action apply failure handlers are required');
    }
    for (const step of ONLINE_ACTION_APPLY_FAILURE_EFFECT_STEPS) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`online action apply failure handler is required: ${step}`);
        }
    }
    const steps = [];
    handlers.reportError();
    steps.push('reportError');
    handlers.markReconnecting();
    steps.push('markReconnecting');
    handlers.invalidateCpuSchedule();
    steps.push('invalidateCpuSchedule');
    let rejoinRequested = false;
    if (plan.requestRejoin) {
        rejoinRequested = handlers.requestRejoin() === true;
        steps.push('requestRejoin');
        if (!rejoinRequested) {
            handlers.scheduleRetry();
            steps.push('scheduleRetry');
        }
    }
    return Object.freeze({
        ok: true,
        result: false,
        rejoinRequested,
        steps: Object.freeze(steps),
    });
}

const OnlineActionApplyFailure = Object.freeze({
    steps: ONLINE_ACTION_APPLY_FAILURE_EFFECT_STEPS,
    execute: executeOnlineActionApplyFailure,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineActionApplyFailure };
}
