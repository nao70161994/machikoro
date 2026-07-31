'use strict';

const assert = require('assert');
const { OnlineDecodeFailure } = require('../js/onlineDecodeFailure');
const { runTest } = require('./helpers/test-utils');

function decodeFailureHandlers(calls, overrides = {}) {
    return Object.fromEntries(OnlineDecodeFailure.steps.map(step => [
        step,
        overrides[step] || (() => {
            calls.push(step);
            return step === 'requestRejoin';
        }),
    ]));
}

runTest('online decode failure executorはgameActionの再同期effect順を維持する', () => {
    const calls = [];
    const result = OnlineDecodeFailure.execute(
        { clearActionFlight: false },
        decodeFailureHandlers(calls)
    );
    assert.deepStrictEqual(calls, ['markReconnecting', 'requestRejoin']);
    assert.deepStrictEqual(result, {
        ok: true,
        result: false,
        rejoinRequested: true,
        steps: ['markReconnecting', 'requestRejoin'],
    });
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.steps));
});

runTest('online decode failure executorはactionAcceptedだけflightを先に解除する', () => {
    const calls = [];
    const result = OnlineDecodeFailure.execute(
        { clearActionFlight: true },
        decodeFailureHandlers(calls)
    );
    assert.deepStrictEqual(calls, [
        'clearActionFlight',
        'markReconnecting',
        'requestRejoin',
    ]);
    assert.strictEqual(result.result, false);
    assert.strictEqual(result.rejoinRequested, true);
});

runTest('online decode failure executorはrejoin要求失敗時だけretryを最後に予約する', () => {
    const calls = [];
    const handlers = decodeFailureHandlers(calls, {
        requestRejoin() {
            calls.push('requestRejoin');
            return false;
        },
    });
    const result = OnlineDecodeFailure.execute(
        { clearActionFlight: false },
        handlers
    );
    assert.deepStrictEqual(calls, [
        'markReconnecting',
        'requestRejoin',
        'scheduleRetry',
    ]);
    assert.strictEqual(result.rejoinRequested, false);
});

runTest('online decode failure executorはplanと全handlerをeffect前に検証する', () => {
    const calls = [];
    assert.throws(
        () => OnlineDecodeFailure.execute({}, decodeFailureHandlers(calls)),
        /effect plan/
    );
    const handlers = decodeFailureHandlers(calls);
    delete handlers.scheduleRetry;
    assert.throws(
        () => OnlineDecodeFailure.execute({ clearActionFlight: false }, handlers),
        /scheduleRetry/
    );
    assert.deepStrictEqual(calls, []);
});

runTest('online decode failure executorはeffect例外を伝播して後続を実行しない', () => {
    const calls = [];
    const failure = new Error('rejoin failed');
    const handlers = decodeFailureHandlers(calls, {
        requestRejoin() {
            calls.push('requestRejoin');
            throw failure;
        },
    });
    assert.throws(
        () => OnlineDecodeFailure.execute({ clearActionFlight: true }, handlers),
        error => error === failure
    );
    assert.deepStrictEqual(calls, [
        'clearActionFlight',
        'markReconnecting',
        'requestRejoin',
    ]);
});
