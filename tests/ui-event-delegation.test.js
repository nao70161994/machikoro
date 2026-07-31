const assert = require('assert');
const UiEventDelegation = require('../js/uiEventDelegation');
const { runTest } = require('./helpers/test-utils');

runTest('ui event delegationはdata属性名をdataset keyへ変換する', () => {
    assert.strictEqual(UiEventDelegation.datasetKey('data-action'), 'action');
    assert.strictEqual(UiEventDelegation.datasetKey('data-ui-action'), 'uiAction');
    assert.strictEqual(UiEventDelegation.datasetKey('data-player-index'), 'playerIndex');
});

runTest('ui event delegationはclosestを優先して対象要素を解決する', () => {
    const expected = { dataset: { action: 'buildCard' } };
    const selectors = [];
    const target = {
        closest(selector) {
            selectors.push(selector);
            return expected;
        },
    };
    assert.strictEqual(UiEventDelegation.elementFromEvent({ target }, 'data-action'), expected);
    assert.deepStrictEqual(selectors, ['[data-action]']);
});

runTest('ui event delegationはclosest不在時も既存dataset契約を維持する', () => {
    const target = { dataset: { uiAction: 'startGame' } };
    assert.strictEqual(UiEventDelegation.elementFromEvent({ target }, 'data-ui-action'), target);
    assert.strictEqual(UiEventDelegation.elementFromEvent({ target }, 'data-action'), null);
    assert.strictEqual(UiEventDelegation.elementFromEvent(null, 'data-action'), null);
});

runTest('ui event delegationはEnterとSpaceだけをkeyboard起動keyにする', () => {
    assert.strictEqual(UiEventDelegation.isKeyboardActivationKey({ key: 'Enter' }), true);
    assert.strictEqual(UiEventDelegation.isKeyboardActivationKey({ key: ' ' }), true);
    assert.strictEqual(UiEventDelegation.isKeyboardActivationKey({ key: 'Escape' }), false);
    assert.strictEqual(UiEventDelegation.isKeyboardActivationKey(null), false);
});

runTest('ui event delegationは有効なrole buttonだけを起動対象にする', () => {
    const element = { disabled: false, getAttribute: name => name === 'role' ? 'button' : null };
    assert.strictEqual(UiEventDelegation.isEnabledRoleButton(element), true);
    assert.strictEqual(UiEventDelegation.isEnabledRoleButton({ ...element, disabled: true }), false);
    assert.strictEqual(UiEventDelegation.isEnabledRoleButton({ ...element, getAttribute: () => 'link' }), false);
    assert.strictEqual(UiEventDelegation.isEnabledRoleButton(null), false);
    assert.strictEqual(Object.isFrozen(UiEventDelegation), true);
});
