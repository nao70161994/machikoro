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
