'use strict';

const ONLINE_ACTION_NO_GAME_EFFECT_STEPS = Object.freeze([
    'markReconnecting',
    'updateStatus',
    'requestRejoin',
]);

/**
 * Executes the existing no-game recovery effects in their fixed order.
 * Incoming gameAction requests rejoin, while actionAccepted keeps the existing
 * status-only behavior after the shared reconnect marker.
 * @param {{requestRejoin?: boolean, result?: boolean, statusMessage?: string}} plan
 * @param {Object<string, function(...*): *>} handlers
 * @returns {{ok: true, result: boolean, rejoinRequested: boolean, steps: ReadonlyArray<string>}}
 */
function executeOnlineActionNoGame(plan, handlers) {
    if (!plan || typeof plan.requestRejoin !== 'boolean' ||
            typeof plan.result !== 'boolean' || typeof plan.statusMessage !== 'string') {
        throw new TypeError('online action no-game effect plan is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('online action no-game handlers are required');
    }
    for (const step of ONLINE_ACTION_NO_GAME_EFFECT_STEPS) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`online action no-game handler is required: ${step}`);
        }
    }
    const steps = [];
    handlers.markReconnecting();
    steps.push('markReconnecting');
    handlers.updateStatus(plan.statusMessage);
    steps.push('updateStatus');
    let rejoinRequested = false;
    if (plan.requestRejoin) {
        rejoinRequested = handlers.requestRejoin() === true;
        steps.push('requestRejoin');
    }
    return Object.freeze({
        ok: true,
        result: plan.result,
        rejoinRequested,
        steps: Object.freeze(steps),
    });
}

const OnlineActionNoGame = Object.freeze({
    steps: ONLINE_ACTION_NO_GAME_EFFECT_STEPS,
    incomingStatusMessage: '⚠️ ゲーム状態を準備できていないため、再接続しています...',
    acceptedStatusMessage: '⚠️ ゲーム状態を準備できていないため、再接続してください。',
    execute: executeOnlineActionNoGame,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineActionNoGame };
}
