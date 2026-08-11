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
    assert.strictEqual((rolling.html.match(/<div class="dot" aria-hidden="true"><\/div>/g) || []).length, 9);
    assert.strictEqual(rolling.opacity, null);

    const empty = UiDiceDisplay.buildView([]);
    assert.strictEqual(empty.html, `<div class="dice-display">${UiDiceDisplay.buildFaceHtml(1, { decorative: true })}</div>`);
    assert.strictEqual(empty.opacity, '0.2');

    const result = UiDiceDisplay.buildView([2, 6]);
    assert.strictEqual(result.html, `<div class="dice-display">
        ${UiDiceDisplay.buildFaceHtml(2)}${UiDiceDisplay.buildFaceHtml(6)}
    </div>`);
    assert.strictEqual(result.opacity, '1');
    assert.strictEqual(Object.isFrozen(result), true);
});

runTest('dice faceは実出目へaccessible nameを付けdotとplaceholderを読み上げ対象外にする', () => {
    const face = UiDiceDisplay.buildFaceHtml(4);
    assert.ok(face.includes('role="img" aria-label="サイコロの出目 4"'));
    assert.strictEqual((face.match(/aria-hidden="true"/g) || []).length, 9);
    assert.ok(UiDiceDisplay.buildFaceHtml(1, { decorative: true }).includes('aria-hidden="true"'));
});

runTest('dice result announcement controllerは新しいeligible結果だけを一度通知する', () => {
    const controller = UiDiceDisplay.createAnnouncementController();
    assert.deepStrictEqual(controller.transition([], { eligible: true, resultKey: 'empty' }), {
        announce: false,
        clear: true,
        text: '',
    });
    assert.deepStrictEqual(controller.transition([2, 6], {
        eligible: true,
        resultKey: 'turn-1',
    }), {
        announce: true,
        clear: true,
        text: 'サイコロの出目は2と6、合計8です',
    });
    assert.strictEqual(controller.transition([2, 6], {
        eligible: true,
        resultKey: 'turn-1',
    }).announce, false);
    assert.strictEqual(controller.transition([3], {
        eligible: false,
        resultKey: 'cpu-turn',
    }).announce, false);
    assert.deepStrictEqual(controller.transition([3], {
        eligible: true,
        rerolled: true,
        resultKey: 'turn-2-reroll',
    }).text, '振り直し後、サイコロの出目は3です');

    const target = { textContent: 'old' };
    assert.strictEqual(UiDiceDisplay.applyAnnouncementPlan({
        announce: true,
        clear: true,
        text: '結果',
    }, target), true);
    assert.strictEqual(target.textContent, '結果');
});
