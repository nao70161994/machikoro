'use strict';

const ONLINE_ACTION_TIMEOUT_EFFECT_STEPS = Object.freeze([
    'clearActionFlight',
    'markReconnecting',
    'invalidateCpuSchedule',
    'updateStatus',
    'requestRejoin',
]);
const ONLINE_ACTION_TIMEOUT_STATUS = '⚠️ サーバー応答がタイムアウトしました。状態を再同期しています...';

/**
 * Executes the existing ACK-timeout effects in their fixed order. The clear-only
 * plan stops after clearing the flight/timer state. All handlers are validated
 * before the first effect so test-only wiring failures cannot partially apply.
 * @param {{decision?: string}} plan
 * @param {Object<string, function(...*): *>} handlers
 * @returns {{ok: true, result: boolean, steps: ReadonlyArray<string>}}
 */
function executeOnlineActionTimeout(plan, handlers) {
    if (!plan || (plan.decision !== 'clear-only' && plan.decision !== 'rejoin')) {
        throw new TypeError('online action timeout effect plan is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('online action timeout handlers are required');
    }
    for (const step of ONLINE_ACTION_TIMEOUT_EFFECT_STEPS) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`online action timeout handler is required: ${step}`);
        }
    }
    handlers.clearActionFlight();
    if (plan.decision === 'clear-only') {
        return Object.freeze({ ok: true, result: false, steps: Object.freeze(['clearActionFlight']) });
    }
    handlers.markReconnecting();
    handlers.invalidateCpuSchedule();
    handlers.updateStatus(ONLINE_ACTION_TIMEOUT_STATUS);
    const result = handlers.requestRejoin() === true;
    return Object.freeze({ ok: true, result, steps: ONLINE_ACTION_TIMEOUT_EFFECT_STEPS });
}

const OnlineActionTimeout = Object.freeze({
    steps: ONLINE_ACTION_TIMEOUT_EFFECT_STEPS,
    statusMessage: ONLINE_ACTION_TIMEOUT_STATUS,
    execute: executeOnlineActionTimeout,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineActionTimeout };
}
