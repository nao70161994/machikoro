'use strict';

const assert = require('assert');
const { OnlineRestoreQueue } = require('../js/onlineRestoreQueue');
const { runTest } = require('./helpers/test-utils');

function queuePlan() {
    return [
        { index: 1, event: { type: 'gameAction', payload: { seq: 4 } } },
        { index: 3, event: { type: 'hostChanged', payload: { hostEpoch: 2 } } },
        { index: 5, event: { type: 'ignored', payload: {} } },
    ];
}

runTest('restore queue executorはplan順にhandlerを一度だけ実行する', () => {
    const plan = queuePlan();
    const calls = [];
    const result = OnlineRestoreQueue.executePlan(plan, {
        gameAction(payload) { calls.push(['gameAction', payload.seq]); },
        hostChanged(payload) { calls.push(['hostChanged', payload.hostEpoch]); },
    });
    assert.deepStrictEqual(result, { ok: true, failedIndex: -1 });
    assert.deepStrictEqual(calls, [['gameAction', 4], ['hostChanged', 2]]);
    assert.deepStrictEqual(plan, queuePlan());
    assert.ok(Object.isFrozen(result));
});

runTest('restore queue executorはfalseを返した元queue indexで停止する', () => {
    const calls = [];
    const result = OnlineRestoreQueue.executePlan(queuePlan(), {
        gameAction() { calls.push('gameAction'); return false; },
        hostChanged() { calls.push('hostChanged'); },
    });
    assert.deepStrictEqual(result, { ok: false, failedIndex: 1 });
    assert.deepStrictEqual(calls, ['gameAction']);
});

runTest('restore queue executorはhandler例外を既存経路へ伝播する', () => {
    const failure = new Error('apply failed');
    assert.throws(() => OnlineRestoreQueue.executePlan(queuePlan(), {
        gameAction() { throw failure; },
    }), error => error === failure);
});

runTest('restore queue executorは不正planとhandler欠落を空成功として扱う', () => {
    assert.deepStrictEqual(OnlineRestoreQueue.executePlan(null, null), {
        ok: true,
        failedIndex: -1,
    });
});
