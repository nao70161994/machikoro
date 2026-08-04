'use strict';

const assert = require('assert');
const UiTurnAnnouncer = require('../js/uiTurnAnnouncer');
const { runTest } = require('./helpers/test-utils');

runTest('turn announcer viewは人間・CPU文言と既存timingをpureに固定する', () => {
    assert.deepStrictEqual(UiTurnAnnouncer.buildView('Alice', false), {
        text: '👤 Alice のターン',
        display: 'flex',
        showDurationMs: 1300,
        transitionDurationMs: 400,
    });
    const cpu = UiTurnAnnouncer.buildView('CPU 1', true);
    assert.deepStrictEqual(cpu, {
        text: '🤖 CPU 1 のターン',
        display: 'flex',
        showDurationMs: 1300,
        transitionDurationMs: 400,
    });
    assert.strictEqual(Object.isFrozen(cpu), true);
    assert.strictEqual(UiTurnAnnouncer.showDurationMs, 1300);
    assert.strictEqual(UiTurnAnnouncer.transitionDurationMs, 400);
});

runTest('turn announcer timer controllerは二段timerと置換時cancelを所有する', () => {
    const scheduled = [];
    const cancelled = [];
    const controller = UiTurnAnnouncer.createTimerController({
        schedule(callback, delay) {
            const timer = { callback, delay, id: scheduled.length + 1 };
            scheduled.push(timer);
            return timer;
        },
        cancel(timer) { cancelled.push(timer.id); },
    });
    const effects = [];
    const callbacks = {
        beginHide() { effects.push('begin'); },
        finishHide() { effects.push('finish'); },
    };
    const view = UiTurnAnnouncer.buildView('Alice', false);

    controller.start(view, callbacks);
    assert.deepStrictEqual(controller.snapshot(), { timerAttached: true });
    controller.start(view, callbacks);
    assert.deepStrictEqual(cancelled, [1]);
    assert.strictEqual(scheduled[1].delay, 1300);
    scheduled[1].callback();
    assert.deepStrictEqual(effects, ['begin']);
    assert.strictEqual(scheduled[2].delay, 400);
    scheduled[2].callback();
    assert.deepStrictEqual(effects, ['begin', 'finish']);
    assert.deepStrictEqual(controller.snapshot(), { timerAttached: false });
});
