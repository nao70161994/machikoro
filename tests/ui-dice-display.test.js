'use strict';

const assert = require('assert');
const UiDiceDisplay = require('../js/uiDiceDisplay');
const { runTest } = require('./helpers/test-utils');

runTest('dice displayは1〜6のdot配置と不正値の1 fallbackを固定する', () => {
    const counts = [1, 2, 3, 4, 5, 6].map(value =>
        (UiDiceDisplay.buildFaceHtml(value).match(/dot "/g) || []).length
    );
    assert.deepStrictEqual(counts, [1, 2, 3, 4, 5, 6]);
    assert.strictEqual(
        UiDiceDisplay.buildFaceHtml(0),
        UiDiceDisplay.buildFaceHtml(1)
    );
});

runTest('dice display viewはrolling・empty・複数出目のexact HTML契約を維持する', () => {
    const rolling = UiDiceDisplay.buildView(null, true);
    assert.ok(rolling.html.includes('dice-face rolling'));
    assert.strictEqual((rolling.html.match(/<div class="dot"><\/div>/g) || []).length, 9);
    assert.strictEqual(rolling.opacity, null);

    const empty = UiDiceDisplay.buildView([]);
    assert.strictEqual(empty.html, `<div class="dice-display">${UiDiceDisplay.buildFaceHtml(1)}</div>`);
    assert.strictEqual(empty.opacity, '0.2');

    const result = UiDiceDisplay.buildView([2, 6]);
    assert.strictEqual(result.html, `<div class="dice-display">
        ${UiDiceDisplay.buildFaceHtml(2)}${UiDiceDisplay.buildFaceHtml(6)}
    </div>`);
    assert.strictEqual(result.opacity, '1');
    assert.strictEqual(Object.isFrozen(result), true);
});
