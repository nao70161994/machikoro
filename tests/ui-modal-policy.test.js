const assert = require('assert');
const UiModalPolicy = require('../js/uiModalPolicy');
const { runTest } = require('./helpers/test-utils');

runTest('UI modal policy はblocking/non-blocking registryと背景rootを固定する', () => {
    assert.deepStrictEqual(UiModalPolicy.inertRootIds, [
        'titleScreen',
        'gameScreen',
        'pwaUpdateBanner',
        'pwaInstallBanner',
    ]);
    assert.strictEqual(UiModalPolicy.policyFor('rulesModal').blocking, true);
    assert.strictEqual(UiModalPolicy.policyFor('pendingModal').blocking, false);
    assert.strictEqual(UiModalPolicy.policyFor('pendingModal').gameCritical, true);
    assert.strictEqual(UiModalPolicy.policyFor('unknownModal').blocking, true);
    assert.strictEqual(Object.isFrozen(UiModalPolicy.registry), true);
    assert.strictEqual(Object.isFrozen(UiModalPolicy.exceptions), true);
});

runTest('UI confirm controllerはawaitingとcancel handlerを一つのstate境界で所有する', () => {
    const awaitingChanges = [];
    const calls = [];
    const cancel = () => calls.push('cancel');
    const controller = UiModalPolicy.createConfirmController(value => awaitingChanges.push(value));
    assert.deepStrictEqual(controller.snapshot(), { awaiting: false, hasCancelHandler: false });
    const opened = controller.open(cancel);
    assert.deepStrictEqual(opened, { awaiting: true, hasCancelHandler: true });
    const accepted = controller.close(true);
    assert.strictEqual(accepted.cancelHandler, null);
    assert.deepStrictEqual(accepted.state, { awaiting: false, hasCancelHandler: false });
    controller.open(cancel);
    const rejected = controller.close(false);
    assert.strictEqual(rejected.cancelHandler, cancel);
    assert.deepStrictEqual(calls, []);
    rejected.cancelHandler();
    assert.deepStrictEqual(calls, ['cancel']);
    assert.deepStrictEqual(awaitingChanges, [true, false, true, false]);
    assert.ok(Object.isFrozen(opened));
    assert.ok(Object.isFrozen(rejected));
    assert.ok(Object.isFrozen(rejected.state));
});

runTest('UI modal runtime controllerはactive focus inert復元stateを一つの境界で所有する', () => {
    const controller = UiModalPolicy.createRuntimeController();
    const focus = { focus() {} };
    const restore = [{ el: {} }];
    assert.deepStrictEqual(controller.snapshot(), {
        activeModalId: null,
        hasLastFocus: false,
        inertRestoreCount: 0,
    });
    controller.setActiveModalId('rulesModal');
    controller.rememberFocus(focus);
    controller.rememberFocus(null);
    controller.setInertRestore(restore);
    assert.strictEqual(controller.getActiveModalId(), 'rulesModal');
    assert.strictEqual(controller.getLastFocus(), focus);
    assert.strictEqual(controller.getInertRestore(), restore);
    assert.deepStrictEqual(controller.snapshot(), {
        activeModalId: 'rulesModal',
        hasLastFocus: true,
        inertRestoreCount: 1,
    });
    assert.ok(Object.isFrozen(controller.snapshot()));
    controller.setActiveModalId(null);
    controller.clearLastFocus();
    controller.clearInertRestore();
    assert.deepStrictEqual(controller.snapshot(), {
        activeModalId: null,
        hasLastFocus: false,
        inertRestoreCount: 0,
    });
});

runTest('UI modal policy はvisible blocking modalだけを抽出する', () => {
    const visible = new Set(['rulesModal', 'pendingModal', 'noticeToast', 'confirmModal']);
    assert.deepStrictEqual(
        UiModalPolicy.visibleBlockingIds(id => visible.has(id)),
        ['rulesModal', 'confirmModal']
    );
    assert.deepStrictEqual(UiModalPolicy.visibleBlockingIds(null), []);
});

runTest('UI modal policy はnested blockingをdenyしnon-blockingを許可する', () => {
    const visible = new Set(['rulesModal']);
    const denied = UiModalPolicy.canOpen('confirmModal', {
        activeModalId: 'rulesModal',
        isVisible: id => visible.has(id),
    });
    assert.deepStrictEqual(denied, {
        ok: false,
        reason: 'nested-blocking-modal-denied',
        parentId: 'rulesModal',
        childId: 'confirmModal',
        blockingIds: ['rulesModal'],
    });
    assert.deepStrictEqual(UiModalPolicy.canOpen('pendingModal', {
        activeModalId: 'rulesModal',
        isVisible: id => visible.has(id),
    }), { ok: true, parentId: null, blockingIds: [] });
    assert.strictEqual(UiModalPolicy.hasStackException('rulesModal', 'confirmModal'), false);
    assert.strictEqual(UiModalPolicy.stackExceptionKey('rulesModal', 'confirmModal'), 'rulesModal->confirmModal');
});

runTest('UI modal policy はclose後のactive ownerをvisible blocking順で選ぶ', () => {
    const visible = new Set(['confirmModal']);
    assert.strictEqual(UiModalPolicy.activeAfterClose(
        'rulesModal',
        'rulesModal',
        ['confirmModal'],
        id => visible.has(id)
    ), 'confirmModal');
    assert.strictEqual(UiModalPolicy.activeAfterClose(
        'rulesModal',
        'confirmModal',
        ['confirmModal'],
        id => visible.has(id)
    ), 'confirmModal');
    assert.strictEqual(UiModalPolicy.activeAfterClose(
        'rulesModal',
        'rulesModal',
        [],
        () => false
    ), null);
});


runTest('UI modal policy はDOM由来の表示状態をpureに判定する', () => {
    assert.strictEqual(UiModalPolicy.isVisibleState({ exists: false }), false);
    assert.strictEqual(UiModalPolicy.isVisibleState({ exists: true, inline: { display: 'flex' } }), true);
    assert.strictEqual(UiModalPolicy.isVisibleState({
        exists: true,
        inline: { display: 'flex', pointerEvents: 'none' },
    }), false);
    assert.strictEqual(UiModalPolicy.isVisibleState({
        exists: true,
        inline: {},
        computed: { display: 'flex', visibility: 'visible', opacity: '1', pointerEvents: 'auto' },
    }), true);
    assert.strictEqual(UiModalPolicy.isVisibleState({
        exists: true,
        inline: { display: 'flex' },
        computed: { display: 'none' },
    }), false);
});

runTest('UI modal policy はfocus trapの副作用なしactionを返す', () => {
    assert.strictEqual(UiModalPolicy.focusTrapAction({ containsActive: false, focusableCount: 2 }), 'focus-modal');
    assert.strictEqual(UiModalPolicy.focusTrapAction({ containsActive: true, focusableCount: 0 }), 'focus-modal');
    assert.strictEqual(UiModalPolicy.focusTrapAction({
        containsActive: true, focusableCount: 2, activeIndex: 0, shiftKey: true,
    }), 'focus-last');
    assert.strictEqual(UiModalPolicy.focusTrapAction({
        containsActive: true, focusableCount: 2, activeIndex: 1, shiftKey: false,
    }), 'focus-first');
    assert.strictEqual(UiModalPolicy.focusTrapAction({
        containsActive: true, focusableCount: 2, activeIndex: 0, shiftKey: false,
    }), 'none');
});
runTest('UI modal policy はkeydown観測から副作用なしcommandを返す', () => {
    assert.strictEqual(UiModalPolicy.keydownAction({ active: false, visible: true, key: 'Escape', hasCloseHandler: true }), 'none');
    assert.strictEqual(UiModalPolicy.keydownAction({ active: true, visible: false, key: 'Escape', hasCloseHandler: true }), 'none');
    assert.strictEqual(UiModalPolicy.keydownAction({ active: true, visible: true, key: 'Escape', hasCloseHandler: true }), 'close');
    assert.strictEqual(UiModalPolicy.keydownAction({ active: true, visible: true, key: 'Escape', hasCloseHandler: false }), 'none');
    assert.strictEqual(UiModalPolicy.keydownAction({ active: true, visible: true, key: 'Enter' }), 'none');
    assert.strictEqual(UiModalPolicy.keydownAction({
        active: true, visible: true, key: 'Tab', containsActive: true,
        focusableCount: 2, activeIndex: 1, shiftKey: false,
    }), 'focus-first');
});
