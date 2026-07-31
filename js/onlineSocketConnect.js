'use strict';

const ONLINE_SOCKET_CONNECT_EFFECT_STEPS = Object.freeze([
    'clearWaitingStatus',
    'markReconnecting',
    'requestRejoin',
]);

/**
 * Builds the existing socket-connect callback decision without effects.
 * @param {{waitingStatus?: boolean, onlineActive?: boolean, reconnecting?: boolean, restoreInProgress?: boolean, hasRoomId?: boolean, originalPlayerIndex?: number, hasPlayerName?: boolean, hasReconnectToken?: boolean}} state
 * @returns {{clearWaitingStatus: boolean, requestRejoin: boolean}}
 */
function planOnlineSocketConnect(state = {}) {
    return Object.freeze({
        clearWaitingStatus: state.waitingStatus === true,
        requestRejoin: (state.onlineActive === true || state.reconnecting === true ||
            state.restoreInProgress === true) && state.hasRoomId === true &&
            Number.isInteger(state.originalPlayerIndex) && state.originalPlayerIndex >= 0 &&
            state.hasPlayerName === true && state.hasReconnectToken === true,
    });
}

function sameOnlineSocketConnectPlan(left, right) {
    return !!left && !!right &&
        left.clearWaitingStatus === right.clearWaitingStatus &&
        left.requestRejoin === right.requestRejoin;
}

/**
 * Selects the pure plan only when it exactly matches the independent legacy projection.
 * @param {Object} state
 * @param {{clearWaitingStatus: boolean, requestRejoin: boolean}} legacyPlan
 * @param {{authorityEnabled?: boolean}} options
 * @returns {{plan: Object, source: string, fallbackReason: string}}
 */
function selectOnlineSocketConnectPlan(state, legacyPlan, options = {}) {
    const purePlan = planOnlineSocketConnect(state);
    const enabled = options.authorityEnabled === true;
    const matched = sameOnlineSocketConnectPlan(purePlan, legacyPlan);
    return Object.freeze({
        plan: enabled && matched ? purePlan : legacyPlan,
        source: enabled && matched ? 'pure-plan' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: enabled && !matched ? 'socket-connect-plan-mismatch' : '',
    });
}

/**
 * Executes waiting-status cleanup before the existing reconnect/rejoin effects.
 * All handlers are validated before the first effect.
 * @param {{clearWaitingStatus: boolean, requestRejoin: boolean}} plan
 * @param {Object<string, function(...*): *>} handlers
 * @returns {{ok: true, result: true, steps: ReadonlyArray<string>}}
 */
function executeOnlineSocketConnect(plan, handlers) {
    if (!plan || typeof plan.clearWaitingStatus !== 'boolean' ||
            typeof plan.requestRejoin !== 'boolean') {
        throw new TypeError('online socket connect effect plan is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('online socket connect handlers are required');
    }
    for (const step of ONLINE_SOCKET_CONNECT_EFFECT_STEPS) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`online socket connect handler is required: ${step}`);
        }
    }
    const steps = [];
    if (plan.clearWaitingStatus) {
        handlers.clearWaitingStatus();
        steps.push('clearWaitingStatus');
    }
    if (plan.requestRejoin) {
        handlers.markReconnecting();
        steps.push('markReconnecting');
        handlers.requestRejoin();
        steps.push('requestRejoin');
    }
    return Object.freeze({
        ok: true,
        result: true,
        steps: Object.freeze(steps),
    });
}

const OnlineSocketConnect = Object.freeze({
    steps: ONLINE_SOCKET_CONNECT_EFFECT_STEPS,
    plan: planOnlineSocketConnect,
    samePlan: sameOnlineSocketConnectPlan,
    selectPlan: selectOnlineSocketConnectPlan,
    execute: executeOnlineSocketConnect,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineSocketConnect };
}
