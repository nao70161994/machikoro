'use strict';

const ONLINE_RESTORE_ABORT_EFFECT_STEPS = Object.freeze([
    'finishRestore',
    'quarantineRestore',
    'replaceQueue',
    'markReconnecting',
    'updateStatus',
    'requestRejoin',
    'scheduleRetry',
]);

/**
 * Executes the existing restore-abort effects in their fixed order.
 * All dependencies are validated before the first effect. Retry scheduling runs
 * only when the existing rejoin request reports that it could not be started.
 * @param {{abort?: boolean, statusMessage?: string, queuedEvents?: ReadonlyArray<*>}} plan
 * @param {Object<string, function(...*): *>} handlers
 * @returns {{ok: true, rejoinRequested: boolean}}
 */
function executeOnlineRestoreAbort(plan, handlers) {
    if (!plan || plan.abort !== true || !Array.isArray(plan.queuedEvents)) {
        throw new TypeError('online restore abort plan is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('online restore abort handlers are required');
    }
    for (const step of ONLINE_RESTORE_ABORT_EFFECT_STEPS) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`online restore abort handler is required: ${step}`);
        }
    }
    handlers.finishRestore();
    handlers.quarantineRestore();
    handlers.replaceQueue(plan.queuedEvents);
    handlers.markReconnecting();
    handlers.updateStatus(plan.statusMessage);
    const rejoinRequested = handlers.requestRejoin() === true;
    if (!rejoinRequested) handlers.scheduleRetry();
    return Object.freeze({ ok: true, rejoinRequested });
}

const OnlineRestoreAbort = Object.freeze({
    steps: ONLINE_RESTORE_ABORT_EFFECT_STEPS,
    execute: executeOnlineRestoreAbort,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineRestoreAbort };
}
