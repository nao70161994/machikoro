'use strict';

const assert = require('assert');
const { OnlineRestoreActivation } = require('../js/onlineRestoreActivation');
const { runTest } = require('./helpers/test-utils');

function handlers(calls, flushResult = true) {
    return Object.fromEntries(OnlineRestoreActivation.steps.map(step => [
        step,
        value => {
            calls.push([step, value]);
            return step === 'flushRestoreEvents' ? flushResult : undefined;
        },
    ]));
}

runTest('online restore activation planは復元済みsequence境界をpureに固定する', () => {
    const plan = OnlineRestoreActivation.plan({ restoredThroughSeq: 12 });
    assert.deepStrictEqual(plan, { restoredThroughSeq: 12 });
    assert.strictEqual(Object.isFrozen(plan), true);
});

runTest('online restore activation plan authorityはsequence完全一致時だけpure planを選ぶ', () => {
    const input = { restoredThroughSeq: 12 };
    const legacy = Object.freeze({ restoredThroughSeq: 12 });
    assert.strictEqual(OnlineRestoreActivation.selectPlan(input, legacy).source, 'legacy');
    assert.strictEqual(OnlineRestoreActivation.selectPlan(
        input, legacy, { authorityEnabled: true }
    ).source, 'pure-plan');
    const mismatch = Object.freeze({ restoredThroughSeq: 11 });
    assert.deepStrictEqual(OnlineRestoreActivation.selectPlan(
        input, mismatch, { authorityEnabled: true }
    ), {
        plan: mismatch,
        source: 'legacy-fallback',
        fallbackReason: 'restore-activation-plan-mismatch',
    });
});

runTest('online restore activation executorはqueue flush後にactivated通知する', () => {
    const calls = [];
    const result = OnlineRestoreActivation.execute(
        { restoredThroughSeq: 12 },
        handlers(calls, true)
    );
    assert.deepStrictEqual(calls, [
        ['resetReconnectCompleted', undefined],
        ['activateOnlineGame', undefined],
        ['clearReconnectFlag', undefined],
        ['resetPreviousCoins', undefined],
        ['setAppliedSequence', 12],
        ['flushRestoreEvents', 12],
        ['observeRestoreActivated', undefined],
        ['applyActivatedStatus', undefined],
    ]);
    assert.strictEqual(result.result, true);
    assert.deepStrictEqual(result.steps, calls.map(call => call[0]));
});

runTest('online restore activation executorはqueue flush失敗後の通知を実行しない', () => {
    const calls = [];
    const result = OnlineRestoreActivation.execute(
        { restoredThroughSeq: 4 },
        handlers(calls, false)
    );
    assert.strictEqual(result.result, false);
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'resetReconnectCompleted',
        'activateOnlineGame',
        'clearReconnectFlag',
        'resetPreviousCoins',
        'setAppliedSequence',
        'flushRestoreEvents',
    ]);
});

runTest('online restore activation executorは全handlerをeffect前に検証する', () => {
    const calls = [];
    const incomplete = handlers(calls);
    delete incomplete.applyActivatedStatus;
    assert.throws(() => OnlineRestoreActivation.execute(
        { restoredThroughSeq: 1 },
        incomplete
    ), /applyActivatedStatus/);
    assert.deepStrictEqual(calls, []);
});
