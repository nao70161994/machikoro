'use strict';

const UI_MODAL_OPEN_EFFECT_STEPS = Object.freeze([
    'captureFocus',
    'setActiveModal',
    'addBodyClass',
    'normalizeVisualState',
    'setDialogAttributes',
    'focusModal',
    'setAppInert',
]);

/**
 * Captures the modal identity used by the existing open effect sequence.
 * @param {{modalId?: string}} input
 * @returns {{modalId: string}}
 */
function planUiModalOpen(input = {}) {
    return Object.freeze({ modalId: input.modalId });
}

function sameUiModalOpenPlan(left, right) {
    return !!left && !!right && left.modalId === right.modalId;
}

function selectUiModalOpenPlan(input, legacyPlan, options = {}) {
    const purePlan = planUiModalOpen(input);
    const enabled = options.authorityEnabled === true;
    const matched = sameUiModalOpenPlan(purePlan, legacyPlan);
    return Object.freeze({
        plan: enabled && matched ? purePlan : legacyPlan,
        source: enabled && matched ? 'pure-plan' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: enabled && !matched ? 'ui-modal-open-plan-mismatch' : '',
    });
}

/**
 * Runs the existing modal-open side effects in their accessibility-sensitive order.
 * @param {{modalId: string}} plan
 * @param {Object<string, function(string): *>} handlers
 * @returns {{ok: true, steps: ReadonlyArray<string>}}
 */
function executeUiModalOpen(plan, handlers) {
    if (!plan || typeof plan.modalId !== 'string' || !plan.modalId) {
        throw new TypeError('ui modal open plan is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('ui modal open handlers are required');
    }
    for (const step of UI_MODAL_OPEN_EFFECT_STEPS) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`ui modal open handler is required: ${step}`);
        }
    }

    const steps = [];
    for (const step of UI_MODAL_OPEN_EFFECT_STEPS) {
        handlers[step](plan.modalId);
        steps.push(step);
    }
    return Object.freeze({ ok: true, steps: Object.freeze(steps) });
}

const UiModalOpen = Object.freeze({
    steps: UI_MODAL_OPEN_EFFECT_STEPS,
    plan: planUiModalOpen,
    samePlan: sameUiModalOpenPlan,
    selectPlan: selectUiModalOpenPlan,
    execute: executeUiModalOpen,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UiModalOpen;
}
if (typeof window !== 'undefined') window.UiModalOpen = UiModalOpen;
if (typeof globalThis !== 'undefined') globalThis.UiModalOpen = UiModalOpen;
