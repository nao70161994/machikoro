'use strict';

const ONLINE_HOST_CHANGED_EFFECT_STEPS = Object.freeze([
    'setHostState',
    'addHostLog',
    'render',
    'scheduleCpu',
    'invalidateCpuSchedule',
    'persistHostState',
]);

/**
 * Computes host ownership without mutating client state.
 * @param {{newHostPlayerIndex?: number, myOriginalPlayerIndex?: number}} input
 * @returns {{isHost: boolean}}
 */
function planOnlineHostChanged(input = {}) {
    return Object.freeze({
        isHost: Number.isInteger(input.newHostPlayerIndex) &&
            input.newHostPlayerIndex === input.myOriginalPlayerIndex,
    });
}

function sameOnlineHostChangedPlan(left, right) {
    return !!left && !!right && left.isHost === right.isHost;
}

function selectOnlineHostChangedPlan(input, legacyPlan, options = {}) {
    const purePlan = planOnlineHostChanged(input);
    const enabled = options.authorityEnabled === true;
    const matched = sameOnlineHostChangedPlan(purePlan, legacyPlan);
    return Object.freeze({
        plan: enabled && matched ? purePlan : legacyPlan,
        source: enabled && matched ? 'pure-plan' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: enabled && !matched ? 'host-changed-plan-mismatch' : '',
    });
}

/**
 * Executes host ownership, CPU scheduling, and persistence in the existing order.
 * @param {{isHost: boolean}} plan
 * @param {Object<string, function(...*): *>} handlers
 * @returns {{ok: true, result: true, steps: ReadonlyArray<string>}}
 */
function executeOnlineHostChanged(plan, handlers) {
    if (!plan || typeof plan.isHost !== 'boolean') {
        throw new TypeError('online host changed effect plan is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('online host changed handlers are required');
    }
    for (const step of ONLINE_HOST_CHANGED_EFFECT_STEPS) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`online host changed handler is required: ${step}`);
        }
    }
    const steps = [];
    handlers.setHostState(plan.isHost);
    steps.push('setHostState');
    if (plan.isHost) {
        handlers.addHostLog();
        steps.push('addHostLog');
        handlers.render();
        steps.push('render');
        handlers.scheduleCpu();
        steps.push('scheduleCpu');
    } else {
        handlers.invalidateCpuSchedule();
        steps.push('invalidateCpuSchedule');
    }
    handlers.persistHostState();
    steps.push('persistHostState');
    return Object.freeze({ ok: true, result: true, steps: Object.freeze(steps) });
}

const OnlineHostChanged = Object.freeze({
    steps: ONLINE_HOST_CHANGED_EFFECT_STEPS,
    plan: planOnlineHostChanged,
    samePlan: sameOnlineHostChangedPlan,
    selectPlan: selectOnlineHostChangedPlan,
    execute: executeOnlineHostChanged,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineHostChanged };
}
