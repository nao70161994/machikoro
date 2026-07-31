'use strict';

const assert = require('assert');
const UiModalClose = require('../js/uiModalClose');
const { runTest } = require('./helpers/test-utils');

function baseInput(overrides = {}) {
    return {
        modalId: 'rulesModal',
        nextActiveModalId: null,
        visibleBlockingIds: [],
        restoreFocus: true,
        hasRestorableFocus: true,
        canRenderPending: true,
        canTrace: true,
        ...overrides,
    };
}

runTest('UI modal close planはunlock・pending・focus・trace判断を固定する', () => {
    const ids = [];
    const plan = UiModalClose.plan(baseInput({ visibleBlockingIds: ids }));
    ids.push('lateModal');
    assert.deepStrictEqual(plan, {
        modalId: 'rulesModal',
        nextActiveModalId: null,
        visibleBlockingIds: [],
        shouldUnlockApp: true,
        shouldRenderPending: true,
        shouldRestoreFocus: true,
        shouldTrace: true,
    });
    assert.strictEqual(Object.isFrozen(plan), true);
    assert.strictEqual(Object.isFrozen(plan.visibleBlockingIds), true);
});

runTest('UI modal close planは残るblocking modal ownerを維持してunlockしない', () => {
    assert.deepStrictEqual(UiModalClose.plan(baseInput({
        modalId: 'confirmModal',
        nextActiveModalId: 'rulesModal',
        visibleBlockingIds: ['rulesModal'],
    })), {
        modalId: 'confirmModal',
        nextActiveModalId: 'rulesModal',
        visibleBlockingIds: ['rulesModal'],
        shouldUnlockApp: false,
        shouldRenderPending: false,
        shouldRestoreFocus: true,
        shouldTrace: false,
    });
});

runTest('UI modal close authorityは全decision完全一致時だけpure planを選ぶ', () => {
    const input = baseInput();
    const legacy = UiModalClose.plan(input);
    assert.strictEqual(UiModalClose.selectPlan(input, legacy).source, 'legacy');
    assert.strictEqual(UiModalClose.selectPlan(input, legacy, {
        authorityEnabled: true,
    }).source, 'pure-plan');
    const mismatch = Object.freeze({ ...legacy, shouldRestoreFocus: false });
    assert.deepStrictEqual(UiModalClose.selectPlan(input, mismatch, {
        authorityEnabled: true,
    }), {
        plan: mismatch,
        source: 'legacy-fallback',
        fallbackReason: 'ui-modal-close-plan-mismatch',
    });
});

runTest('UI modal close executorはunlock後にfocusを戻して最後にtraceする', () => {
    const calls = [];
    const plan = UiModalClose.plan(baseInput());
    const handlers = Object.fromEntries(UiModalClose.effectStepsFor(plan).map(step => [
        step,
        received => calls.push([step, received.modalId]),
    ]));
    const result = UiModalClose.execute(plan, handlers);
    assert.deepStrictEqual(result.steps, [
        'setActiveModal',
        'restoreAppInert',
        'clearOrphanLocks',
        'renderPending',
        'restoreFocus',
        'clearLastFocus',
        'recordTrace',
    ]);
    assert.deepStrictEqual(calls, result.steps.map(step => [step, 'rulesModal']));
});

runTest('UI modal close executorは全handlerをeffect前に検証する', () => {
    const calls = [];
    const plan = UiModalClose.plan(baseInput());
    const handlers = Object.fromEntries(UiModalClose.effectStepsFor(plan).map(step => [
        step,
        () => calls.push(step),
    ]));
    delete handlers.clearOrphanLocks;
    assert.throws(() => UiModalClose.execute(plan, handlers), /clearOrphanLocks/);
    assert.deepStrictEqual(calls, []);
});
