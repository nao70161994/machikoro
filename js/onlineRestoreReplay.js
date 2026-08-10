'use strict';

const ONLINE_RESTORE_REPLAY_EFFECT_HANDLERS = Object.freeze([
    'setReplaying',
    'observeReplayStarted',
    'applyReplayStatus',
    'initGame',
    'restoreSnapshot',
    'applyAction',
    'addProvisionalLog',
]);

/**
 * Captures the exact references consumed by the restore replay body.
 * @param {Object<string, *>} input
 * @returns {Readonly<Object<string, *>>}
 */
function planOnlineRestoreReplay(input = {}) {
    return Object.freeze({
        playerNames: input.playerNames,
        playerSettings: input.playerSettings,
        playerOrder: input.playerOrder,
        stateSnapshot: input.stateSnapshot,
        actionLog: input.actionLog,
        provisionalRestore: input.provisionalRestore === true,
    });
}

function sameOnlineRestoreReplayPlan(left, right) {
    return !!left && !!right &&
        left.playerNames === right.playerNames &&
        left.playerSettings === right.playerSettings &&
        left.playerOrder === right.playerOrder &&
        left.stateSnapshot === right.stateSnapshot &&
        left.actionLog === right.actionLog &&
        left.provisionalRestore === right.provisionalRestore;
}

function selectOnlineRestoreReplayPlan(input, legacyPlan, options = {}) {
    const purePlan = planOnlineRestoreReplay(input);
    const enabled = options.authorityEnabled === true;
    const matched = sameOnlineRestoreReplayPlan(purePlan, legacyPlan);
    return Object.freeze({
        plan: enabled && matched ? purePlan : legacyPlan,
        source: enabled && matched ? 'pure-plan' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: enabled && !matched ? 'restore-replay-plan-mismatch' : '',
    });
}

/**
 * Replays one canonical restore in the existing order and always leaves replay mode.
 * @param {Readonly<Object<string, *>>} plan
 * @param {Object<string, function(...*): *>} handlers
 * @returns {{ok: true, steps: ReadonlyArray<string>}}
 */
function executeOnlineRestoreReplay(plan, handlers) {
    if (!plan || !Array.isArray(plan.actionLog)) {
        throw new TypeError('online restore replay plan is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('online restore replay handlers are required');
    }
    for (const handler of ONLINE_RESTORE_REPLAY_EFFECT_HANDLERS) {
        if (typeof handlers[handler] !== 'function') {
            throw new TypeError(`online restore replay handler is required: ${handler}`);
        }
    }

    const steps = [];
    handlers.setReplaying(true);
    steps.push('startReplaying');
    try {
        handlers.observeReplayStarted();
        steps.push('observeReplayStarted');
        handlers.applyReplayStatus();
        steps.push('applyReplayStatus');
        handlers.initGame(plan.playerNames, plan.playerSettings, plan.playerOrder);
        steps.push('initGame');
        if (plan.stateSnapshot) {
            if (handlers.restoreSnapshot(plan.stateSnapshot) === false) {
                throw new Error('online snapshot restore rejected');
            }
            steps.push('restoreSnapshot');
        }
        for (const entry of plan.actionLog) {
            if (handlers.applyAction(entry.action, entry.data) === false) {
                throw new Error('online restore action rejected');
            }
            steps.push('applyAction');
        }
        if (plan.provisionalRestore) {
            handlers.addProvisionalLog();
            steps.push('addProvisionalLog');
        }
    } finally {
        handlers.setReplaying(false);
        steps.push('finishReplaying');
    }
    return Object.freeze({ ok: true, steps: Object.freeze(steps) });
}

const OnlineRestoreReplay = Object.freeze({
    handlers: ONLINE_RESTORE_REPLAY_EFFECT_HANDLERS,
    plan: planOnlineRestoreReplay,
    samePlan: sameOnlineRestoreReplayPlan,
    selectPlan: selectOnlineRestoreReplayPlan,
    execute: executeOnlineRestoreReplay,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineRestoreReplay };
}
