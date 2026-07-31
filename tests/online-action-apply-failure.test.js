'use strict';

const assert = require('assert');
const { OnlineActionApplyFailure } = require('../js/onlineActionApplyFailure');
const { runTest } = require('./helpers/test-utils');

function applyFailureHandlers(calls, overrides = {}) {
    return Object.fromEntries(OnlineActionApplyFailure.steps.map(step => [
        step,
        overrides[step] || (() => {
            calls.push(step);
            return step === 'requestRejoin';
        }),
    ]));
}

runTest('online action apply failure executorはlive再同期effect順を維持する', () => {
    const calls = [];
    const result = OnlineActionApplyFailure.execute(
        { requestRejoin: true },
        applyFailureHandlers(calls)
    );
    assert.deepStrictEqual(calls, [
        'reportError',
        'markReconnecting',
        'invalidateCpuSchedule',
        'requestRejoin',
    ]);
    assert.deepStrictEqual(result, {
        ok: true,
        result: false,
        rejoinRequested: true,
        steps: calls,
    });
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.steps));
});

runTest('online action apply failure executorはrestore flush中にrejoinを開始しない', () => {
    const calls = [];
    const result = OnlineActionApplyFailure.execute(
        { requestRejoin: false },
        applyFailureHandlers(calls)
    );
    assert.deepStrictEqual(calls, [
        'reportError',
        'markReconnecting',
        'invalidateCpuSchedule',
    ]);
    assert.strictEqual(result.rejoinRequested, false);
});

runTest('online action apply failure executorはrejoin失敗時だけretryを予約する', () => {
    const calls = [];
    const handlers = applyFailureHandlers(calls, {
        requestRejoin() {
            calls.push('requestRejoin');
            return false;
        },
    });
    const result = OnlineActionApplyFailure.execute(
        { requestRejoin: true },
        handlers
    );
    assert.deepStrictEqual(calls, [
        'reportError',
        'markReconnecting',
        'invalidateCpuSchedule',
        'requestRejoin',
        'scheduleRetry',
    ]);
    assert.strictEqual(result.rejoinRequested, false);
});

runTest('online action apply failure executorはplanと全handlerをeffect前に検証する', () => {
    const calls = [];
    assert.throws(
        () => OnlineActionApplyFailure.execute({}, applyFailureHandlers(calls)),
        /effect plan/
    );
    const handlers = applyFailureHandlers(calls);
    delete handlers.scheduleRetry;
    assert.throws(
        () => OnlineActionApplyFailure.execute({ requestRejoin: false }, handlers),
        /scheduleRetry/
    );
    assert.deepStrictEqual(calls, []);
});

runTest('online action apply failure executorは例外を伝播して後続を実行しない', () => {
    const calls = [];
    const failure = new Error('report failed');
    const handlers = applyFailureHandlers(calls, {
        reportError() {
            calls.push('reportError');
            throw failure;
        },
    });
    assert.throws(
        () => OnlineActionApplyFailure.execute({ requestRejoin: true }, handlers),
        error => error === failure
    );
    assert.deepStrictEqual(calls, ['reportError']);
});
