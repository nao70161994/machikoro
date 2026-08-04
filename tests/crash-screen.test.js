'use strict';

const assert = require('assert');
const CrashScreen = require('../js/crashScreen');
const { runTest } = require('./helpers/test-utils');

runTest('crash screen viewは既存300文字境界と保存復帰表示を固定する', () => {
    const error = new Error('x'.repeat(400));
    const resumable = CrashScreen.buildView(error, '{"saved":true}');
    assert.strictEqual(resumable.message.length, CrashScreen.MESSAGE_LIMIT);
    assert.ok(resumable.message.includes('x'));
    assert.deepStrictEqual({
        resumeDisplay: resumable.resumeDisplay,
        initialFocus: resumable.initialFocus,
    }, {
        resumeDisplay: 'block',
        initialFocus: 'resume',
    });
    assert.strictEqual(Object.isFrozen(resumable), true);

    assert.deepStrictEqual(CrashScreen.buildView(null, null), {
        message: '不明なエラー',
        resumeDisplay: 'none',
        initialFocus: 'reload',
    });
});

runTest('crash screen controllerは表示の重複を抑止して再開後に再表示できる', () => {
    const controller = CrashScreen.createController();
    assert.deepStrictEqual(controller.snapshot(), { shown: false });
    const first = controller.show();
    assert.deepStrictEqual(first, { changed: true, state: { shown: true } });
    assert.deepStrictEqual(controller.show(), { changed: false, state: { shown: true } });
    const hidden = controller.hide();
    assert.deepStrictEqual(hidden, { changed: true, state: { shown: false } });
    assert.deepStrictEqual(controller.hide(), { changed: false, state: { shown: false } });
    assert.strictEqual(controller.show().changed, true);
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.state));
});

runTest('crash screen focus planは非表示とTab以外を無視する', () => {
    assert.deepStrictEqual(CrashScreen.focusTrapPlan({ shown: false, key: 'Tab' }), {
        preventDefault: false,
        focusTarget: '',
    });
    assert.deepStrictEqual(CrashScreen.focusTrapPlan({ shown: true, key: 'Escape' }), {
        preventDefault: false,
        focusTarget: '',
    });
});

runTest('crash screen focus planはfocus対象なしなら画面へ戻す', () => {
    assert.deepStrictEqual(CrashScreen.focusTrapPlan({
        shown: true,
        key: 'Tab',
        focusableCount: 0,
        activeIndex: -1,
    }), {
        preventDefault: true,
        focusTarget: 'screen',
    });
});

runTest('crash screen focus planは先頭末尾だけを循環させる', () => {
    assert.deepStrictEqual(CrashScreen.focusTrapPlan({
        shown: true,
        key: 'Tab',
        shiftKey: true,
        focusableCount: 3,
        activeIndex: 0,
    }), {
        preventDefault: true,
        focusTarget: 'last',
    });
    assert.deepStrictEqual(CrashScreen.focusTrapPlan({
        shown: true,
        key: 'Tab',
        shiftKey: false,
        focusableCount: 3,
        activeIndex: 2,
    }), {
        preventDefault: true,
        focusTarget: 'first',
    });
    assert.deepStrictEqual(CrashScreen.focusTrapPlan({
        shown: true,
        key: 'Tab',
        shiftKey: false,
        focusableCount: 3,
        activeIndex: 1,
    }), {
        preventDefault: false,
        focusTarget: '',
    });
});
