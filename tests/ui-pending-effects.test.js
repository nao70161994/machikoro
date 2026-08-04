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

    UiPendingEffects.applyModalInteraction({
        modal: { display: 'flex', pointerEvents: 'auto' },
        inner: { pointerEvents: 'auto' },
        content: { pointerEvents: 'auto' },
    }, { modal, content });

    assert.deepStrictEqual(calls, [
        ['modal', 'display', 'flex'],
        ['modal', 'pointerEvents', 'auto'],
        ['query', '.pending-modal-inner'],
        ['inner', 'pointerEvents', 'auto'],
        ['content', 'pointerEvents', 'auto'],
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
