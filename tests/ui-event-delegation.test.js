const assert = require('assert');
const UiEventDelegation = require('../js/uiEventDelegation');
const { runTest } = require('./helpers/test-utils');

runTest('ui event delegation binding controllerはstatic/delegated登録stateを単独所有する', () => {
    const controller = UiEventDelegation.createBindingController();
    assert.deepStrictEqual(controller.snapshot(), { static: false, delegated: false });
    assert.strictEqual(controller.isBound(UiEventDelegation.BINDINGS.STATIC), false);
    assert.deepStrictEqual(controller.markBound(UiEventDelegation.BINDINGS.STATIC), {
        static: true,
        delegated: false,
    });
    assert.strictEqual(controller.isBound(UiEventDelegation.BINDINGS.DELEGATED), false);
    controller.markBound(UiEventDelegation.BINDINGS.DELEGATED);
    assert.deepStrictEqual(controller.snapshot(), { static: true, delegated: true });
    assert.throws(() => controller.isBound('unknown'), /unknown UI binding/);
    assert.ok(Object.isFrozen(controller));
    assert.ok(Object.isFrozen(controller.snapshot()));
});

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

runTest('ui event delegationは各dataset familyをdetached commandへ変換する', () => {
    const staticCommand = UiEventDelegation.commandFromElement({
        dataset: { uiAction: 'changeCount', delta: '-1' },
    }, 'static');
    assert.deepStrictEqual(staticCommand, { family: 'static', name: 'changeCount', args: [-1] });
    assert.ok(Object.isFrozen(staticCommand));
    assert.ok(Object.isFrozen(staticCommand.args));
    assert.deepStrictEqual(UiEventDelegation.commandFromElement({
        dataset: { uiInput: 'localPlayerName', playerIndex: '2' },
        value: 'Alice',
    }, 'input'), { family: 'input', name: 'localPlayerName', args: [2, 'Alice'] });
    assert.deepStrictEqual(UiEventDelegation.commandFromElement({
        dataset: { action: 'resolveHarbor', useBonus: 'true' },
    }, 'dice'), { family: 'dice', name: 'resolveHarbor', args: [true] });
    assert.deepStrictEqual(UiEventDelegation.commandFromElement({
        dataset: { action: 'selectBusinessCard', inputId: 'myCardSelect' },
    }, 'pending'), { family: 'pending', name: 'selectBusinessCard', args: ['myCardSelect'] });
    assert.deepStrictEqual(UiEventDelegation.commandFromElement({
        dataset: { action: 'skipBusiness' },
    }, 'pending'), { family: 'pending', name: 'skipBusiness', args: [] });
    assert.deepStrictEqual(UiEventDelegation.commandFromElement({
        dataset: { action: 'showLandmarkDetail', landmarkName: '駅' },
    }, 'build'), { family: 'build', name: 'showLandmarkDetail', args: ['駅', true] });
    assert.strictEqual(UiEventDelegation.commandFromElement(null, 'static'), null);
});

runTest('ui event delegationはcommand effectを名前で一度だけ実行する', () => {
    const calls = [];
    const command = UiEventDelegation.commandFromElement({
        dataset: { action: 'resolveTV', targetIndex: '3' },
    }, 'pending');
    assert.strictEqual(UiEventDelegation.executeCommand(command, {
        resolveTV(index) { calls.push(index); },
    }), true);
    assert.deepStrictEqual(calls, [3]);
    assert.strictEqual(UiEventDelegation.executeCommand(command, {}), false);
    assert.strictEqual(UiEventDelegation.executeCommand(null, {}), false);
});
