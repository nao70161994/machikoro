'use strict';

const ONLINE_ACTION_GAP_EFFECT_STEPS = Object.freeze([
    'markReconnecting',
    'invalidateCpuSchedule',
    'updateStatus',
    'requestRejoin',
    'scheduleRetry',
]);

/**
 * Executes the existing sequence-gap recovery effects in their fixed order.
 * A null status keeps actionAccepted's existing no-status behavior.
 * @param {{result?: boolean, statusMessage?: string|null}} plan
 * @param {Object<string, function(...*): *>} handlers
 * @returns {{ok: true, result: boolean, rejoinRequested: boolean, steps: ReadonlyArray<string>}}
 */
function executeOnlineActionGap(plan, handlers) {
    if (!plan || typeof plan.result !== 'boolean' ||
            (plan.statusMessage !== null && typeof plan.statusMessage !== 'string')) {
        throw new TypeError('online action gap effect plan is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('online action gap handlers are required');
    }
    for (const step of ONLINE_ACTION_GAP_EFFECT_STEPS) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`online action gap handler is required: ${step}`);
        }
    }
    const steps = [];
    handlers.markReconnecting();
    steps.push('markReconnecting');
    handlers.invalidateCpuSchedule();
    steps.push('invalidateCpuSchedule');
    if (plan.statusMessage !== null) {
        handlers.updateStatus(plan.statusMessage);
        steps.push('updateStatus');
    }
    const rejoinRequested = handlers.requestRejoin() === true;
    steps.push('requestRejoin');
    if (!rejoinRequested) {
        handlers.scheduleRetry();
        steps.push('scheduleRetry');
    }
    return Object.freeze({
        ok: true,
        result: plan.result,
        rejoinRequested,
        steps: Object.freeze(steps),
    });
}

const OnlineActionGap = Object.freeze({
    steps: ONLINE_ACTION_GAP_EFFECT_STEPS,
    incomingStatusMessage: '操作の欠落を検知したため、状態を再同期しています...',
    execute: executeOnlineActionGap,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineActionGap };
}
