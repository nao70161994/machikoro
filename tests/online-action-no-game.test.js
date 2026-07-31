'use strict';

const assert = require('assert');
const { OnlineActionNoGame } = require('../js/onlineActionNoGame');
const { runTest } = require('./helpers/test-utils');

function noGameHandlers(calls, overrides = {}) {
    return Object.fromEntries(OnlineActionNoGame.steps.map(step => [
        step,
        overrides[step] || (value => {
            calls.push([step, value]);
            return step === 'requestRejoin';
        }),
    ]));
}

runTest('online action no-game executorはincomingのstatusとrejoin順を維持する', () => {
    const calls = [];
    const result = OnlineActionNoGame.execute({
        requestRejoin: true,
        result: true,
        statusMessage: OnlineActionNoGame.incomingStatusMessage,
    }, noGameHandlers(calls));
    assert.deepStrictEqual(calls, [
        ['markReconnecting', undefined],
        ['updateStatus', OnlineActionNoGame.incomingStatusMessage],
        ['requestRejoin', undefined],
    ]);
    assert.strictEqual(result.result, true);
    assert.strictEqual(result.rejoinRequested, true);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.steps));
});

runTest('online action no-game executorはactionAcceptedでrejoinを送らない', () => {
    const calls = [];
    const result = OnlineActionNoGame.execute({
        requestRejoin: false,
        result: false,
        statusMessage: OnlineActionNoGame.acceptedStatusMessage,
    }, noGameHandlers(calls));
    assert.deepStrictEqual(calls, [
        ['markReconnecting', undefined],
        ['updateStatus', OnlineActionNoGame.acceptedStatusMessage],
    ]);
    assert.strictEqual(result.result, false);
    assert.strictEqual(result.rejoinRequested, false);
});

runTest('online action no-game executorはrejoinのfalseをretryへ変換しない', () => {
    const calls = [];
    const handlers = noGameHandlers(calls, {
        requestRejoin() {
            calls.push(['requestRejoin', undefined]);
            return false;
        },
    });
    const result = OnlineActionNoGame.execute({
        requestRejoin: true,
        result: true,
        statusMessage: OnlineActionNoGame.incomingStatusMessage,
    }, handlers);
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'markReconnecting',
        'updateStatus',
        'requestRejoin',
    ]);
    assert.strictEqual(result.rejoinRequested, false);
});

runTest('online action no-game executorはplanと全handlerをeffect前に検証する', () => {
    const calls = [];
    assert.throws(
        () => OnlineActionNoGame.execute({}, noGameHandlers(calls)),
        /effect plan/
    );
    const handlers = noGameHandlers(calls);
    delete handlers.requestRejoin;
    assert.throws(
        () => OnlineActionNoGame.execute({
            requestRejoin: false,
            result: false,
            statusMessage: '',
        }, handlers),
        /requestRejoin/
    );
    assert.deepStrictEqual(calls, []);
});

runTest('online action no-game executorは例外を伝播して後続を実行しない', () => {
    const calls = [];
    const failure = new Error('status failed');
    const handlers = noGameHandlers(calls, {
        updateStatus() {
            calls.push(['updateStatus', undefined]);
            throw failure;
        },
    });
    assert.throws(
        () => OnlineActionNoGame.execute({
            requestRejoin: true,
            result: true,
            statusMessage: OnlineActionNoGame.incomingStatusMessage,
        }, handlers),
        error => error === failure
    );
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'markReconnecting',
        'updateStatus',
    ]);
});
