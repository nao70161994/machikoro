'use strict';

const assert = require('assert');
const { OnlineActionTimeout } = require('../js/onlineActionTimeout');
const { runTest } = require('./helpers/test-utils');

function timeoutHandlers(calls, overrides = {}) {
    return Object.fromEntries(OnlineActionTimeout.steps.map(step => [
        step,
        overrides[step] || (value => {
            calls.push([step, value]);
            return step === 'requestRejoin';
        }),
    ]));
}

runTest('online action timeout executorはrejoin effect順と戻り値を維持する', () => {
    const calls = [];
    const result = OnlineActionTimeout.execute({ decision: 'rejoin' }, timeoutHandlers(calls));
    assert.deepStrictEqual(calls, [
        ['clearActionFlight', undefined],
        ['markReconnecting', undefined],
        ['invalidateCpuSchedule', undefined],
        ['updateStatus', OnlineActionTimeout.statusMessage],
        ['requestRejoin', undefined],
    ]);
    assert.deepStrictEqual(result, { ok: true, result: true, steps: OnlineActionTimeout.steps });
    assert.ok(Object.isFrozen(result));
});

runTest('online action timeout executorはrejoin失敗のfalseを維持する', () => {
    const calls = [];
    const handlers = timeoutHandlers(calls, {
        requestRejoin() {
            calls.push(['requestRejoin', undefined]);
            return false;
        },
    });
    const result = OnlineActionTimeout.execute({ decision: 'rejoin' }, handlers);
    assert.strictEqual(result.result, false);
    assert.strictEqual(calls.at(-1)[0], 'requestRejoin');
});

runTest('online action timeout executorはclear-onlyでflightだけを解除する', () => {
    const calls = [];
    const result = OnlineActionTimeout.execute({ decision: 'clear-only' }, timeoutHandlers(calls));
    assert.deepStrictEqual(calls, [['clearActionFlight', undefined]]);
    assert.deepStrictEqual(result, { ok: true, result: false, steps: ['clearActionFlight'] });
    assert.ok(Object.isFrozen(result.steps));
});

runTest('online action timeout executorはplanと全handlerをeffect前に検証する', () => {
    const calls = [];
    assert.throws(() => OnlineActionTimeout.execute({ decision: 'ignore' }, timeoutHandlers(calls)), /effect plan/);
    const handlers = timeoutHandlers(calls);
    delete handlers.updateStatus;
    assert.throws(() => OnlineActionTimeout.execute({ decision: 'rejoin' }, handlers), /updateStatus/);
    assert.deepStrictEqual(calls, []);
});

runTest('online action timeout executorはeffect例外を伝播して後続を実行しない', () => {
    const calls = [];
    const failure = new Error('status failed');
    const handlers = timeoutHandlers(calls, {
        updateStatus() {
            calls.push(['updateStatus', undefined]);
            throw failure;
        },
    });
    assert.throws(() => OnlineActionTimeout.execute({ decision: 'rejoin' }, handlers), error => error === failure);
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'clearActionFlight',
        'markReconnecting',
        'invalidateCpuSchedule',
        'updateStatus',
    ]);
});
