'use strict';

const ONLINE_SOCKET_DISCONNECT_EFFECT_STEPS = Object.freeze([
    'finishLobby',
    'invalidateRestoreGeneration',
    'finishRestore',
    'quarantineRestore',
    'clearRestoreQueue',
    'markReconnecting',
    'clearActionFlight',
    'invalidateCpuSchedule',
    'observeDisconnect',
    'updateStatus',
]);

/** @param {{onlineActive?: boolean, waitingRoomActive?: boolean, restoreInProgress?: boolean}} state */
function planOnlineSocketDisconnect(state = {}) {
    const abortRestore = state.restoreInProgress === true;
    return Object.freeze({
        active: state.onlineActive === true || state.waitingRoomActive === true || abortRestore,
        abortRestore,
    });
}

function sameOnlineSocketDisconnectPlan(left, right) {
    return !!left && !!right && left.active === right.active &&
        left.abortRestore === right.abortRestore;
}

function selectOnlineSocketDisconnectPlan(state, legacyPlan, options = {}) {
    const purePlan = planOnlineSocketDisconnect(state);
    const enabled = options.authorityEnabled === true;
    const matched = sameOnlineSocketDisconnectPlan(purePlan, legacyPlan);
    return Object.freeze({
        plan: enabled && matched ? purePlan : legacyPlan,
        source: enabled && matched ? 'pure-plan' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: enabled && !matched ? 'socket-disconnect-plan-mismatch' : '',
    });
}

/**
 * Executes the existing socket-disconnect effects in their fixed order.
 * @param {{active: boolean, abortRestore: boolean}} plan
 * @param {Object<string, function(...*): *>} handlers
 * @returns {{ok: true, result: boolean, steps: ReadonlyArray<string>}}
 */
function executeOnlineSocketDisconnect(plan, handlers) {
    if (!plan || typeof plan.active !== 'boolean' || typeof plan.abortRestore !== 'boolean' ||
            (plan.abortRestore && !plan.active)) {
        throw new TypeError('online socket disconnect effect plan is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('online socket disconnect handlers are required');
    }
    for (const step of ONLINE_SOCKET_DISCONNECT_EFFECT_STEPS) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`online socket disconnect handler is required: ${step}`);
        }
    }
    const steps = [];
    handlers.finishLobby();
    steps.push('finishLobby');
    if (!plan.active) {
        return Object.freeze({ ok: true, result: false, steps: Object.freeze(steps) });
    }
    if (plan.abortRestore) {
        handlers.invalidateRestoreGeneration();
        steps.push('invalidateRestoreGeneration');
        handlers.finishRestore();
        steps.push('finishRestore');
        handlers.quarantineRestore();
        steps.push('quarantineRestore');
        handlers.clearRestoreQueue();
        steps.push('clearRestoreQueue');
    }
    handlers.markReconnecting();
    steps.push('markReconnecting');
    handlers.clearActionFlight();
    steps.push('clearActionFlight');
    handlers.invalidateCpuSchedule();
    steps.push('invalidateCpuSchedule');
    handlers.observeDisconnect();
    steps.push('observeDisconnect');
    handlers.updateStatus();
    steps.push('updateStatus');
    return Object.freeze({ ok: true, result: true, steps: Object.freeze(steps) });
}

const OnlineSocketDisconnect = Object.freeze({
    steps: ONLINE_SOCKET_DISCONNECT_EFFECT_STEPS,
    plan: planOnlineSocketDisconnect,
    samePlan: sameOnlineSocketDisconnectPlan,
    selectPlan: selectOnlineSocketDisconnectPlan,
    execute: executeOnlineSocketDisconnect,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineSocketDisconnect };
}
