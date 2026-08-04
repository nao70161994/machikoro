'use strict';

const assert = require('assert');
const UiWatchdogReporting = require('../js/uiWatchdogReporting');
const { runTest } = require('./helpers/test-utils');

runTest('watchdog reportingはcheckpoint・復旧・保存・通知を既存順で実行する', () => {
    const events = [];
    const snapshot = { phase: 'build' };
    const result = UiWatchdogReporting.execute({
        freezeKind: 'cpu-turn-stalled',
        stagnantMs: 5000,
        snapshot,
        interactabilityIssues: [{ reason: 'stalled' }],
    }, {
        markCheckpoint(name, payload) {
            events.push([name, payload.recovery || null]);
        },
        recover(value) {
            events.push(['recover', value]);
            return true;
        },
        serialize(payload) {
            events.push(['serialize', payload.recovery]);
            return 'stored-json';
        },
        store(key, value) {
            events.push(['store', key, value]);
        },
        buildStack(payload) {
            events.push(['stack', payload.recovery]);
            return 'freeze-stack';
        },
        report(input) {
            events.push(['report', input]);
        },
    });

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.payload.recovery, { attempted: true, success: true });
    assert.deepStrictEqual(events.slice(0, 5), [
        ['freeze-watchdog-report', null],
        ['recover', snapshot],
        ['serialize', { attempted: true, success: true }],
        ['store', 'machikoroFreezeSnapshot', 'stored-json'],
        ['stack', { attempted: true, success: true }],
    ]);
    assert.deepStrictEqual(events[5][1], {
        source: 'freeze-watchdog',
        phase: 'build',
        message: 'cpu-turn-stalled after 5000ms',
        stack: 'freeze-stack',
    });
});

runTest('watchdog reportingはeffect不足を全副作用前に拒否する', () => {
    let calls = 0;
    assert.deepStrictEqual(UiWatchdogReporting.execute({}, {
        markCheckpoint() { calls++; },
    }), { ok: false, reason: 'invalid-effects', payload: null });
    assert.strictEqual(calls, 0);
});
