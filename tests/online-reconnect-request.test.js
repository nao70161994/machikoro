'use strict';

const assert = require('assert');
const { OnlineReconnectRequest } = require('../js/onlineReconnectRequest');
const { runTest } = require('./helpers/test-utils');

function requestHandlers(calls, overrides = {}) {
    return Object.fromEntries(OnlineReconnectRequest.steps.map(step => [
        step,
        overrides[step] || (value => calls.push([step, value])),
    ]));
}

runTest('online reconnect request executorは既存emit effect順を一度だけ実行する', () => {
    const calls = [];
    const result = OnlineReconnectRequest.execute(
        { decision: 'emit', nextAttemptCount: 4 },
        requestHandlers(calls)
    );
    assert.deepStrictEqual(calls, [
        ['clearTimer', undefined],
        ['setAttemptCount', 4],
        ['emitRejoin', undefined],
        ['armTimer', undefined],
    ]);
    assert.deepStrictEqual(result, {
        ok: true,
        steps: ['clearTimer', 'setAttemptCount', 'emitRejoin', 'armTimer'],
    });
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.steps));
});

runTest('online reconnect request executorはplanと全handlerをeffect前に検証する', () => {
    const calls = [];
    assert.throws(
        () => OnlineReconnectRequest.execute({ decision: 'wait-for-socket', nextAttemptCount: 0 }, requestHandlers(calls)),
        /emit plan/
    );
    const handlers = requestHandlers(calls);
    delete handlers.emitRejoin;
    assert.throws(
        () => OnlineReconnectRequest.execute({ decision: 'emit', nextAttemptCount: 1 }, handlers),
        /emitRejoin/
    );
    assert.deepStrictEqual(calls, []);
});

runTest('online reconnect request executorはemit例外を伝播しtimerをarmしない', () => {
    const calls = [];
    const failure = new Error('emit failed');
    const handlers = requestHandlers(calls, {
        emitRejoin() {
            calls.push(['emitRejoin', undefined]);
            throw failure;
        },
    });
    assert.throws(
        () => OnlineReconnectRequest.execute({ decision: 'emit', nextAttemptCount: 2 }, handlers),
        error => error === failure
    );
    assert.deepStrictEqual(calls, [
        ['clearTimer', undefined],
        ['setAttemptCount', 2],
        ['emitRejoin', undefined],
    ]);
});
