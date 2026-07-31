'use strict';

const TRACE_MODAL_IDS = Object.freeze(['rulesModal', 'cardSelectModal']);

/**
 * Captures the decisions made after a modal has been hidden.
 * @param {{modalId?: string, nextActiveModalId?: string|null, visibleBlockingIds?: string[], restoreFocus?: boolean, hasRestorableFocus?: boolean, canRenderPending?: boolean, canTrace?: boolean}} input
 * @returns {{modalId: string, nextActiveModalId: string|null, visibleBlockingIds: ReadonlyArray<string>, shouldUnlockApp: boolean, shouldRenderPending: boolean, shouldRestoreFocus: boolean, shouldTrace: boolean}}
 */
function planUiModalClose(input = {}) {
    const modalId = input.modalId;
    const visibleBlockingIds = Object.freeze(Array.isArray(input.visibleBlockingIds)
        ? input.visibleBlockingIds.slice()
        : []);
    const shouldUnlockApp = visibleBlockingIds.length <= 0;
    return Object.freeze({
        modalId,
        nextActiveModalId: shouldUnlockApp ? null : (input.nextActiveModalId || null),
        visibleBlockingIds,
        shouldUnlockApp,
        shouldRenderPending: shouldUnlockApp && modalId !== 'pendingModal' && input.canRenderPending === true,
        shouldRestoreFocus: input.restoreFocus !== false && input.hasRestorableFocus === true,
        shouldTrace: TRACE_MODAL_IDS.includes(modalId) && input.canTrace === true,
    });
}

function sameUiModalClosePlan(left, right) {
    if (!left || !right) return false;
    if (left.modalId !== right.modalId ||
        left.nextActiveModalId !== right.nextActiveModalId ||
        left.shouldUnlockApp !== right.shouldUnlockApp ||
        left.shouldRenderPending !== right.shouldRenderPending ||
        left.shouldRestoreFocus !== right.shouldRestoreFocus ||
        left.shouldTrace !== right.shouldTrace) return false;
    if (!Array.isArray(left.visibleBlockingIds) || !Array.isArray(right.visibleBlockingIds) ||
        left.visibleBlockingIds.length !== right.visibleBlockingIds.length) return false;
    return left.visibleBlockingIds.every((id, index) => id === right.visibleBlockingIds[index]);
}

function selectUiModalClosePlan(input, legacyPlan, options = {}) {
    const purePlan = planUiModalClose(input);
    const enabled = options.authorityEnabled === true;
    const matched = sameUiModalClosePlan(purePlan, legacyPlan);
    return Object.freeze({
        plan: enabled && matched ? purePlan : legacyPlan,
        source: enabled && matched ? 'pure-plan' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: enabled && !matched ? 'ui-modal-close-plan-mismatch' : '',
    });
}

function effectStepsFor(plan) {
    const steps = ['setActiveModal'];
    if (plan.shouldUnlockApp) {
        steps.push('restoreAppInert', 'clearOrphanLocks');
        if (plan.shouldRenderPending) steps.push('renderPending');
    }
    if (plan.shouldRestoreFocus) steps.push('restoreFocus');
    steps.push('clearLastFocus');
    if (plan.shouldTrace) steps.push('recordTrace');
    return Object.freeze(steps);
}

/**
 * Runs the existing post-hide modal-close effects in their accessibility-sensitive order.
 * @param {ReturnType<planUiModalClose>} plan
 * @param {Object<string, function(*): *>} handlers
 * @returns {{ok: true, steps: ReadonlyArray<string>}}
 */
function executeUiModalClose(plan, handlers) {
    if (!plan || typeof plan.modalId !== 'string' || !plan.modalId) {
        throw new TypeError('ui modal close plan is required');
    }
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('ui modal close handlers are required');
    }
    const steps = effectStepsFor(plan);
    for (const step of steps) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`ui modal close handler is required: ${step}`);
        }
    }
    for (const step of steps) handlers[step](plan);
    return Object.freeze({ ok: true, steps });
}

const UiModalClose = Object.freeze({
    traceModalIds: TRACE_MODAL_IDS,
    plan: planUiModalClose,
    samePlan: sameUiModalClosePlan,
    selectPlan: selectUiModalClosePlan,
    effectStepsFor,
    execute: executeUiModalClose,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UiModalClose;
}
if (typeof window !== 'undefined') window.UiModalClose = UiModalClose;
if (typeof globalThis !== 'undefined') globalThis.UiModalClose = UiModalClose;
