'use strict';

const assert = require('assert');
const UiModalOpen = require('../js/uiModalOpen');
const { runTest } = require('./helpers/test-utils');

function handlers(calls) {
    return Object.fromEntries(UiModalOpen.steps.map(step => [
        step,
        modalId => calls.push([step, modalId]),
    ]));
}

runTest('UI modal open planはmodal identityを副作用なしで固定する', () => {
    const plan = UiModalOpen.plan({ modalId: 'rulesModal' });
    assert.deepStrictEqual(plan, { modalId: 'rulesModal' });
    assert.strictEqual(Object.isFrozen(plan), true);
});

runTest('UI modal open plan authorityはidentity完全一致時だけpure planを選ぶ', () => {
    const input = { modalId: 'rulesModal' };
    const legacy = Object.freeze({ modalId: 'rulesModal' });
    assert.strictEqual(UiModalOpen.selectPlan(input, legacy).source, 'legacy');
    assert.strictEqual(UiModalOpen.selectPlan(
        input, legacy, { authorityEnabled: true }
    ).source, 'pure-plan');

    const mismatch = Object.freeze({ modalId: 'confirmModal' });
    assert.deepStrictEqual(UiModalOpen.selectPlan(
        input, mismatch, { authorityEnabled: true }
    ), {
        plan: mismatch,
        source: 'legacy-fallback',
        fallbackReason: 'ui-modal-open-plan-mismatch',
    });
});

runTest('UI modal open executorはfocusをinertより前に実行する既存順を固定する', () => {
    const calls = [];
    const result = UiModalOpen.execute(
        { modalId: 'rulesModal' },
        handlers(calls)
    );
    assert.deepStrictEqual(calls, UiModalOpen.steps.map(step => [step, 'rulesModal']));
    assert.ok(calls.findIndex(call => call[0] === 'focusModal') <
        calls.findIndex(call => call[0] === 'setAppInert'));
    assert.deepStrictEqual(result.steps, UiModalOpen.steps);
});

runTest('UI modal open executorは全handlerをeffect前に検証する', () => {
    const calls = [];
    const incomplete = handlers(calls);
    delete incomplete.setDialogAttributes;
    assert.throws(() => UiModalOpen.execute(
        { modalId: 'rulesModal' },
        incomplete
    ), /setDialogAttributes/);
    assert.deepStrictEqual(calls, []);
});
