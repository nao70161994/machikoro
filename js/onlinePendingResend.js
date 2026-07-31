'use strict';

const ONLINE_PENDING_RESEND_DECISIONS = Object.freeze({
    NONE: 'none',
    CLEAR: 'clear',
    RESEND: 'resend',
});

const ONLINE_PENDING_RESEND_EFFECT_STEPS = Object.freeze([
    'clearPendingOutboundAction',
    'setActionFlight',
    'emitAction',
]);

/**
 * Computes the post-restore pending-action effect without reading runtime state.
 * @param {Object<string, *>} input
 * @returns {{decision: string, pending: *}}
 */
function planOnlinePendingResend(input = {}) {
    const eligible = !!input.pending &&
        input.acceptedPending !== true &&
        input.currentPendingMatches === true &&
        input.socketConnected === true;
    if (!eligible) {
        return Object.freeze({
            decision: ONLINE_PENDING_RESEND_DECISIONS.NONE,
            pending: null,
        });
    }
    if (input.canResend !== true) {
        return Object.freeze({
            decision: ONLINE_PENDING_RESEND_DECISIONS.CLEAR,
            pending: null,
        });
    }
    return Object.freeze({
        decision: ONLINE_PENDING_RESEND_DECISIONS.RESEND,
        pending: input.pending,
    });
}

function sameOnlinePendingResendPlan(left, right) {
    return !!left && !!right &&
        left.decision === right.decision &&
        left.pending === right.pending;
}

function selectOnlinePendingResendPlan(input, legacyPlan, options = {}) {
    const purePlan = planOnlinePendingResend(input);
    const enabled = options.authorityEnabled === true;
    const matched = sameOnlinePendingResendPlan(purePlan, legacyPlan);
    return Object.freeze({
        plan: enabled && matched ? purePlan : legacyPlan,
        source: enabled && matched ? 'pure-plan' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: enabled && !matched ? 'pending-resend-plan-mismatch' : '',
    });
}

/**
 * Applies the existing clear-or-resend effects after canonical restore activation.
 * @param {{decision: string, pending: *}} plan
 * @param {Object<string, function(...*): *>} handlers
 * @returns {{ok: true, result: string, steps: ReadonlyArray<string>}}
 */
function executeOnlinePendingResend(plan, handlers) {
    const decision = plan && plan.decision;
    if (!plan || (decision !== ONLINE_PENDING_RESEND_DECISIONS.NONE &&
            decision !== ONLINE_PENDING_RESEND_DECISIONS.CLEAR &&
            decision !== ONLINE_PENDING_RESEND_DECISIONS.RESEND)) {
        throw new TypeError('online pending resend plan is required');
    }
    if (plan.decision === ONLINE_PENDING_RESEND_DECISIONS.RESEND && !plan.pending) {
        throw new TypeError('online pending resend action is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('online pending resend handlers are required');
    }
    for (const step of ONLINE_PENDING_RESEND_EFFECT_STEPS) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`online pending resend handler is required: ${step}`);
        }
    }

    const steps = [];
    if (plan.decision === ONLINE_PENDING_RESEND_DECISIONS.CLEAR) {
        handlers.clearPendingOutboundAction();
        steps.push('clearPendingOutboundAction');
    } else if (plan.decision === ONLINE_PENDING_RESEND_DECISIONS.RESEND) {
        handlers.setActionFlight();
        steps.push('setActionFlight');
        handlers.emitAction(plan.pending);
        steps.push('emitAction');
    }
    return Object.freeze({
        ok: true,
        result: plan.decision,
        steps: Object.freeze(steps),
    });
}

const OnlinePendingResend = Object.freeze({
    decisions: ONLINE_PENDING_RESEND_DECISIONS,
    steps: ONLINE_PENDING_RESEND_EFFECT_STEPS,
    plan: planOnlinePendingResend,
    samePlan: sameOnlinePendingResendPlan,
    selectPlan: selectOnlinePendingResendPlan,
    execute: executeOnlinePendingResend,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlinePendingResend };
}
