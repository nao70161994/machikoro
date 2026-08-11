'use strict';

const assert = require('assert');
const UiPendingEffects = require('../js/uiPendingEffects');
const { runTest } = require('./helpers/test-utils');

function makeButton(name, calls) {
    return {
        classList: {
            add(value) { calls.push([name, 'add', value]); },
            remove(value) { calls.push([name, 'remove', value]); },
        },
        setAttribute(key, value) { calls.push([name, 'attr', key, value]); },
    };
}

runTest('ui pending effectsはgroup reset後に選択chipとhidden inputを既存順で適用する', () => {
    const calls = [];
    const first = makeButton('first', calls);
    const selected = makeButton('selected', calls);
    const input = { value: 'old' };
    const result = UiPendingEffects.applyBusinessCardSelection({
        groupButtons: [
            { selected: false, ariaPressed: 'false' },
            { selected: false, ariaPressed: 'false' },
        ],
        selectedButton: { selected: true, ariaPressed: 'true' },
        inputValue: '7',
    }, {
        groupButtons: [first, selected],
        selectedButton: selected,
        findInput() {
            calls.push(['find-input']);
            return input;
        },
    });
    assert.strictEqual(result, true);
    assert.strictEqual(input.value, '7');
    assert.deepStrictEqual(calls, [
        ['first', 'remove', 'selected'],
        ['first', 'attr', 'aria-pressed', 'false'],
        ['selected', 'remove', 'selected'],
        ['selected', 'attr', 'aria-pressed', 'false'],
        ['selected', 'add', 'selected'],
        ['selected', 'attr', 'aria-pressed', 'true'],
        ['find-input'],
    ]);
});

runTest('ui pending effectsはinput欠落時もbutton適用後にfalseを返す', () => {
    const calls = [];
    const selected = makeButton('selected', calls);
    assert.strictEqual(UiPendingEffects.applyBusinessCardSelection({
        groupButtons: [],
        selectedButton: { selected: true, ariaPressed: 'true' },
        inputValue: '',
    }, {
        groupButtons: [],
        selectedButton: selected,
        findInput() {
            calls.push(['find-input']);
            return null;
        },
    }), false);
    assert.deepStrictEqual(calls, [
        ['selected', 'add', 'selected'],
        ['selected', 'attr', 'aria-pressed', 'true'],
        ['find-input'],
    ]);
});

runTest('ui pending effectsはmodal・inner・content viewを既存順で適用する', () => {
    const calls = [];
    const style = name => new Proxy({}, {
        set(target, key, value) {
            calls.push([name, key, value]);
            target[key] = value;
            return true;
        },
    });
    const inner = { style: style('inner') };
    const modal = {
        style: style('modal'),
        querySelector(selector) {
            calls.push(['query', selector]);
            return inner;
        },
    };
    const content = { style: style('content') };
    const body = {
        classList: {
            toggle(name, active) { calls.push(['body', 'toggle', name, active]); },
        },
    };

    UiPendingEffects.applyModalInteraction({
        body: { className: 'pending-surface-visible', active: true },
        modal: { display: 'flex', pointerEvents: 'auto' },
        inner: { pointerEvents: 'auto' },
        content: { pointerEvents: 'auto' },
    }, { body, modal, content });

    assert.deepStrictEqual(calls, [
        ['body', 'toggle', 'pending-surface-visible', true],
        ['modal', 'display', 'flex'],
        ['modal', 'pointerEvents', 'auto'],
        ['query', '.pending-modal-inner'],
        ['inner', 'pointerEvents', 'auto'],
        ['content', 'pointerEvents', 'auto'],
    ]);
});

runTest('ui pending effectsは表示と非表示でbody classを対称同期する', () => {
    const states = [];
    const body = {
        classList: {
            toggle(name, active) { states.push([name, active]); },
        },
    };
    for (const active of [true, false]) {
        UiPendingEffects.applyModalInteraction({
            body: { className: 'pending-surface-visible', active },
            modal: {},
            content: {},
            inner: null,
        }, { body });
    }
    assert.deepStrictEqual(states, [
        ['pending-surface-visible', true],
        ['pending-surface-visible', false],
    ]);
});

runTest('ui pending effectsはDOM断片欠落時も残るviewだけ適用する', () => {
    const content = { style: {} };
    assert.doesNotThrow(() => UiPendingEffects.applyModalInteraction({
        modal: { display: 'none' },
        inner: { pointerEvents: 'none' },
        content: { pointerEvents: 'none' },
    }, { modal: null, content }));
    assert.deepStrictEqual(content.style, { pointerEvents: 'none' });
});

runTest('pending effects update controllerは再入を拒否し完了後にstateを戻す', () => {
    const controller = UiPendingEffects.createUpdateController();
    const trace = [];
    assert.strictEqual(controller.isUpdating(), false);
    assert.strictEqual(controller.run(() => {
        trace.push(['outer', controller.isUpdating()]);
        trace.push(['nested', controller.run(() => true)]);
        return 'done';
    }), 'done');
    assert.deepStrictEqual(trace, [['outer', true], ['nested', false]]);
    assert.strictEqual(controller.isUpdating(), false);
});

runTest('pending effects update controllerは例外後も次の更新を受け付ける', () => {
    const controller = UiPendingEffects.createUpdateController();
    assert.throws(() => controller.run(() => { throw new Error('render failed'); }), /render failed/);
    assert.strictEqual(controller.isUpdating(), false);
    assert.strictEqual(controller.run(() => true), true);
    assert.strictEqual(controller.run(null), false);
});

runTest('pending focus controllerはhidden→visibleだけ初期focusを要求する', () => {
    const controller = UiPendingEffects.createFocusController();
    assert.deepStrictEqual(controller.transition(true, { focusEligible: true }), {
        focusInitial: true,
        restoreGame: false,
        visible: true,
        eligible: true,
    });
    assert.deepStrictEqual(controller.transition(true, {
        activeWithin: true,
        focusEligible: true,
    }), {
        focusInitial: false,
        restoreGame: false,
        visible: true,
        eligible: true,
    });
    assert.strictEqual(controller.isVisible(), true);
});

runTest('pending focus controllerはfocusがpending内に残る終了だけgame復帰を要求する', () => {
    const controller = UiPendingEffects.createFocusController(true);
    assert.deepStrictEqual(controller.transition(false, {
        activeWithin: true,
        focusEligible: true,
    }), {
        focusInitial: false,
        restoreGame: true,
        visible: false,
        eligible: true,
    });
    assert.deepStrictEqual(UiPendingEffects.focusTransition(true, false, {
        activeWithin: false,
        focusEligible: true,
    }), {
        focusInitial: false,
        restoreGame: false,
        visible: false,
        eligible: true,
    });
    assert.strictEqual(UiPendingEffects.focusTransition(false, true, {
        focusEligible: false,
    }).focusInitial, false);
});

runTest('pending focus controllerはreplay中visibleからeligible化した時に一度focusする', () => {
    const controller = UiPendingEffects.createFocusController();
    assert.deepStrictEqual(controller.transition(true, { focusEligible: false }), {
        focusInitial: false,
        restoreGame: false,
        visible: true,
        eligible: false,
    });
    assert.strictEqual(controller.transition(true, { focusEligible: true }).focusInitial, true);
    assert.strictEqual(controller.transition(true, { focusEligible: true }).focusInitial, false);
    assert.deepStrictEqual(controller.reset(), { visible: false, eligible: false });
    assert.strictEqual(controller.isVisible(), false);
    assert.strictEqual(controller.isEligible(), false);
});

runTest('pending focus effectは最初のenabled controlとgame復帰を排他的に適用する', () => {
    const calls = [];
    const first = { focus() { calls.push('focus-first'); } };
    const content = {
        querySelector(selector) {
            calls.push(selector);
            return first;
        },
    };
    assert.strictEqual(UiPendingEffects.applyFocusPlan({ focusInitial: true }, {
        content,
        restoreGameFocus() { calls.push('restore-game'); },
    }), true);
    assert.strictEqual(UiPendingEffects.applyFocusPlan({
        focusInitial: false,
        restoreGame: true,
    }, {
        content,
        restoreGameFocus() { calls.push('restore-game'); return true; },
    }), true);
    assert.deepStrictEqual(calls, [
        'button:not([disabled]), select:not([disabled])',
        'focus-first',
        'restore-game',
    ]);
});

runTest('pending focus effectはfocus拒否をrender例外へ広げない', () => {
    assert.doesNotThrow(() => {
        assert.strictEqual(UiPendingEffects.applyFocusPlan({ focusInitial: true }, {
            content: {
                querySelector() {
                    return { focus() { throw new Error('focus rejected'); } };
                },
            },
        }), false);
    });
});
