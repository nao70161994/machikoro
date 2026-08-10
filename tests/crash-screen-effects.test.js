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
        getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; },
        removeAttribute(name) { delete this.attributes[name]; },
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

runTest('crash screen effectsは背景lockを既存属性へ対称復元する', () => {
    const plain = makeElement();
    const locked = makeElement();
    locked.inert = true;
    locked.attributes['aria-hidden'] = 'false';
    locked.style.pointerEvents = 'auto';

    const restore = CrashScreenEffects.disableBackground([plain, locked]);
    assert.strictEqual(plain.inert, true);
    assert.strictEqual(plain.attributes['aria-hidden'], 'true');
    assert.strictEqual(plain.style.pointerEvents, 'none');
    assert.strictEqual(locked.inert, true);

    CrashScreenEffects.restoreBackground(restore);
    assert.strictEqual(plain.inert, false);
    assert.strictEqual(Object.hasOwn(plain.attributes, 'aria-hidden'), false);
    assert.strictEqual(plain.style.pointerEvents, '');
    assert.strictEqual(locked.inert, true);
    assert.strictEqual(locked.attributes['aria-hidden'], 'false');
    assert.strictEqual(locked.style.pointerEvents, 'auto');
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

runTest('crash screen effectsは可視な元focusまたは背景内のfallbackへ復帰する', () => {
    const previous = makeElement();
    const fallback = makeElement();
    const background = makeElement();
    background.querySelectorAll = () => [fallback];

    assert.strictEqual(CrashScreenEffects.restoreFocus(previous, [background]), previous);
    assert.strictEqual(previous.focusCount, 1);

    previous.offsetParent = null;
    assert.strictEqual(CrashScreenEffects.restoreFocus(previous, [background]), fallback);
    assert.strictEqual(fallback.focusCount, 1);
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
