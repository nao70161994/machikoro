'use strict';

const assert = require('assert');
const CrashScreenEffects = require('../js/crashScreenEffects');
const { runTest } = require('./helpers/test-utils');

function makeElement() {
    return {
        style: {},
        attributes: {},
        disabled: false,
        offsetParent: {},
        focusCount: 0,
        setAttribute(name, value) { this.attributes[name] = value; },
        hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
        focus() { this.focusCount += 1; },
    };
}

runTest('crash screen effectsはviewを既存DOM属性へ適用する', () => {
    const screen = makeElement();
    const message = makeElement();
    const resumeButton = makeElement();

    CrashScreenEffects.applyView({ screen, message, resumeButton }, {
        message: 'boom',
        resumeDisplay: 'block',
    });

    assert.strictEqual(message.textContent, 'boom');
    assert.strictEqual(resumeButton.style.display, 'block');
    assert.strictEqual(screen.style.display, 'flex');
    assert.deepStrictEqual(screen.attributes, {
        'aria-modal': 'true',
        tabindex: '-1',
    });
});

runTest('crash screen effectsは既存tabindexを保持して初期focusを選ぶ', () => {
    const screen = makeElement();
    screen.attributes.tabindex = '0';
    const message = makeElement();
    const resumeButton = makeElement();
    const reloadButton = makeElement();
    const elements = { screen, message, resumeButton, reloadButton };

    CrashScreenEffects.applyView(elements, { message: 'x', resumeDisplay: 'none' });
    CrashScreenEffects.focusInitial(elements, 'resume');
    assert.strictEqual(screen.attributes.tabindex, '0');
    assert.strictEqual(resumeButton.focusCount, 1);

    CrashScreenEffects.focusInitial(elements, 'reload');
    assert.strictEqual(reloadButton.focusCount, 1);
});

runTest('crash screen effectsは操作可能要素だけをfocus trap対象にする', () => {
    const enabled = makeElement();
    const disabled = makeElement();
    disabled.disabled = true;
    const hidden = makeElement();
    hidden.offsetParent = null;
    const screen = makeElement();
    screen.querySelectorAll = () => [enabled, disabled, hidden];

    assert.deepStrictEqual(CrashScreenEffects.focusableElements(screen), [enabled]);

    let prevented = 0;
    CrashScreenEffects.applyFocusTrap(
        { preventDefault: true, focusTarget: 'last' },
        { preventDefault() { prevented += 1; } },
        screen,
        [enabled]
    );
    assert.strictEqual(prevented, 1);
    assert.strictEqual(enabled.focusCount, 1);
});

runTest('crash screen effectsはfocus対象なしと非表示をscreenへ適用する', () => {
    const screen = makeElement();
    let prevented = 0;
    CrashScreenEffects.applyFocusTrap(
        { preventDefault: true, focusTarget: 'screen' },
        { preventDefault() { prevented += 1; } },
        screen,
        []
    );
    CrashScreenEffects.hide(screen);

    assert.strictEqual(prevented, 1);
    assert.strictEqual(screen.focusCount, 1);
    assert.strictEqual(screen.style.display, 'none');
});
