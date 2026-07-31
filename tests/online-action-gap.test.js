'use strict';

const assert = require('assert');
const { OnlineActionGap } = require('../js/onlineActionGap');
const { runTest } = require('./helpers/test-utils');

function gapHandlers(calls, overrides = {}) {
    return Object.fromEntries(OnlineActionGap.steps.map(step => [
        step,
        overrides[step] || (value => {
            calls.push([step, value]);
            return step === 'requestRejoin';
        }),
    ]));
}

runTest('online action gap executorはincomingのstatus付き再同期順を維持する', () => {
    const calls = [];
    const result = OnlineActionGap.execute({
        result: true,
        statusMessage: OnlineActionGap.incomingStatusMessage,
    }, gapHandlers(calls));
    assert.deepStrictEqual(calls, [
        ['markReconnecting', undefined],
        ['invalidateCpuSchedule', undefined],
        ['updateStatus', OnlineActionGap.incomingStatusMessage],
        ['requestRejoin', undefined],
    ]);
    assert.strictEqual(result.result, true);
    assert.strictEqual(result.rejoinRequested, true);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.steps));
});

runTest('online action gap executorはactionAcceptedのstatusなし契約を維持する', () => {
    const calls = [];
    const result = OnlineActionGap.execute({
        result: false,
        statusMessage: null,
    }, gapHandlers(calls));
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'markReconnecting',
        'invalidateCpuSchedule',
        'requestRejoin',
    ]);
    assert.strictEqual(result.result, false);
});

runTest('online action gap executorはrejoin失敗時だけretryを予約する', () => {
    const calls = [];
    const handlers = gapHandlers(calls, {
        requestRejoin() {
            calls.push(['requestRejoin', undefined]);
            return false;
        },
    });
    const result = OnlineActionGap.execute({
        result: true,
        statusMessage: null,
    }, handlers);
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'markReconnecting',
        'invalidateCpuSchedule',
        'requestRejoin',
        'scheduleRetry',
    ]);
    assert.strictEqual(result.rejoinRequested, false);
});

runTest('online action gap executorはplanと全handlerをeffect前に検証する', () => {
    const calls = [];
    assert.throws(
        () => OnlineActionGap.execute({ result: true }, gapHandlers(calls)),
        /effect plan/
    );
    const handlers = gapHandlers(calls);
    delete handlers.updateStatus;
    assert.throws(
        () => OnlineActionGap.execute({ result: true, statusMessage: null }, handlers),
        /updateStatus/
    );
    assert.deepStrictEqual(calls, []);
});

runTest('online action gap executorは例外を伝播して後続を実行しない', () => {
    const calls = [];
    const failure = new Error('status failed');
    const handlers = gapHandlers(calls, {
        updateStatus() {
            calls.push(['updateStatus', undefined]);
            throw failure;
        },
    });
    assert.throws(
        () => OnlineActionGap.execute({
            result: true,
            statusMessage: OnlineActionGap.incomingStatusMessage,
        }, handlers),
        error => error === failure
    );
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'markReconnecting',
        'invalidateCpuSchedule',
        'updateStatus',
    ]);
});
