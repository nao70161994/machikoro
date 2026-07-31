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
