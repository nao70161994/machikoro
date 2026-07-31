'use strict';

const ONLINE_RECONNECT_REQUEST_EFFECT_STEPS = Object.freeze([
    'clearTimer',
    'setAttemptCount',
    'emitRejoin',
    'armTimer',
]);

/**
 * Executes the existing rejoin emit effects in their fixed order.
 * All dependencies are validated before the first effect.
 * @param {{decision?: string, nextAttemptCount?: number}} plan
 * @param {Object<string, function(...*): *>} handlers
 * @returns {{ok: true, steps: ReadonlyArray<string>}}
 */
function executeOnlineReconnectRequest(plan, handlers) {
    if (!plan || plan.decision !== 'emit' || !Number.isInteger(plan.nextAttemptCount)) {
        throw new TypeError('online reconnect emit plan is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('online reconnect request handlers are required');
    }
    for (const step of ONLINE_RECONNECT_REQUEST_EFFECT_STEPS) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`online reconnect request handler is required: ${step}`);
        }
    }
    handlers.clearTimer();
    handlers.setAttemptCount(plan.nextAttemptCount);
    handlers.emitRejoin();
    handlers.armTimer();
    return Object.freeze({
        ok: true,
        steps: ONLINE_RECONNECT_REQUEST_EFFECT_STEPS,
    });
}

const OnlineReconnectRequest = Object.freeze({
    steps: ONLINE_RECONNECT_REQUEST_EFFECT_STEPS,
    execute: executeOnlineReconnectRequest,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineReconnectRequest };
}
