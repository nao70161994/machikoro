'use strict';

const assert = require('assert');
const { OnlineRestoreAbort } = require('../js/onlineRestoreAbort');
const { runTest } = require('./helpers/test-utils');

function abortHandlers(calls, overrides = {}) {
    return Object.fromEntries(OnlineRestoreAbort.steps.map(step => [
        step,
        overrides[step] || (value => {
            calls.push([step, value]);
            return step === 'requestRejoin';
        }),
    ]));
}

runTest('online restore abort executorは既存effect順でrejoin成功時にretryしない', () => {
    const calls = [];
    const queue = [{ type: 'gameAction' }];
    const result = OnlineRestoreAbort.execute(
        { abort: true, statusMessage: '再同期', queuedEvents: queue },
        abortHandlers(calls)
    );
    assert.deepStrictEqual(calls, [
        ['finishRestore', undefined],
        ['quarantineRestore', undefined],
        ['replaceQueue', queue],
        ['markReconnecting', undefined],
        ['updateStatus', '再同期'],
        ['requestRejoin', undefined],
    ]);
    assert.deepStrictEqual(result, { ok: true, rejoinRequested: true });
    assert.ok(Object.isFrozen(result));
});

runTest('online restore abort executorはrejoin不可時だけ最後にretryを予約する', () => {
    const calls = [];
    const handlers = abortHandlers(calls, {
        requestRejoin() {
            calls.push(['requestRejoin', undefined]);
            return false;
        },
    });
    const result = OnlineRestoreAbort.execute(
        { abort: true, statusMessage: '', queuedEvents: [] },
        handlers
    );
    assert.deepStrictEqual(calls.slice(-2), [
        ['requestRejoin', undefined],
        ['scheduleRetry', undefined],
    ]);
    assert.deepStrictEqual(result, { ok: true, rejoinRequested: false });
});

runTest('online restore abort executorはplanと全handlerをeffect前に検証する', () => {
    const calls = [];
    assert.throws(
        () => OnlineRestoreAbort.execute({ abort: false, queuedEvents: [] }, abortHandlers(calls)),
        /abort plan/
    );
    const handlers = abortHandlers(calls);
    delete handlers.updateStatus;
    assert.throws(
        () => OnlineRestoreAbort.execute({ abort: true, queuedEvents: [] }, handlers),
        /updateStatus/
    );
    assert.deepStrictEqual(calls, []);
});

runTest('online restore abort executorはeffect例外を伝播して後続を実行しない', () => {
    const calls = [];
    const failure = new Error('status failed');
    const handlers = abortHandlers(calls, {
        updateStatus() {
            calls.push(['updateStatus', undefined]);
            throw failure;
        },
    });
    assert.throws(
        () => OnlineRestoreAbort.execute({ abort: true, queuedEvents: [] }, handlers),
        error => error === failure
    );
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'finishRestore',
        'quarantineRestore',
        'replaceQueue',
        'markReconnecting',
        'updateStatus',
    ]);
});
