'use strict';

const ONLINE_DECODE_FAILURE_EFFECT_STEPS = Object.freeze([
    'clearActionFlight',
    'markReconnecting',
    'requestRejoin',
    'scheduleRetry',
]);

/**
 * Executes the existing malformed-action recovery effects in their fixed order.
 * All handlers are validated before the first effect so incomplete test or
 * runtime wiring cannot leave reconnect state partially updated.
 * @param {{clearActionFlight?: boolean}} plan
 * @param {Object<string, function(...*): *>} handlers
 * @returns {{ok: true, result: false, rejoinRequested: boolean, steps: ReadonlyArray<string>}}
 */
function executeOnlineDecodeFailure(plan, handlers) {
    if (!plan || typeof plan.clearActionFlight !== 'boolean') {
        throw new TypeError('online decode failure effect plan is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('online decode failure handlers are required');
    }
    for (const step of ONLINE_DECODE_FAILURE_EFFECT_STEPS) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`online decode failure handler is required: ${step}`);
        }
    }
    const steps = [];
    if (plan.clearActionFlight) {
        handlers.clearActionFlight();
        steps.push('clearActionFlight');
    }
    handlers.markReconnecting();
    steps.push('markReconnecting');
    const rejoinRequested = handlers.requestRejoin() === true;
    steps.push('requestRejoin');
    if (!rejoinRequested) {
        handlers.scheduleRetry();
        steps.push('scheduleRetry');
    }
    return Object.freeze({
        ok: true,
        result: false,
        rejoinRequested,
        steps: Object.freeze(steps),
    });
}

const OnlineDecodeFailure = Object.freeze({
    steps: ONLINE_DECODE_FAILURE_EFFECT_STEPS,
    execute: executeOnlineDecodeFailure,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineDecodeFailure };
}
