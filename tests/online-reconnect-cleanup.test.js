'use strict';

const assert = require('assert');
const { OnlineReconnectCleanup } = require('../js/onlineReconnectCleanup');
const { runTest } = require('./helpers/test-utils');

function cleanupHandlers(calls, overrides = {}) {
    return Object.fromEntries(OnlineReconnectCleanup.steps.map(step => [
        step,
        overrides[step] || (() => calls.push(step)),
    ]));
}

runTest('online reconnect cleanup executorは既存terminal effect順を一度だけ実行する', () => {
    const calls = [];
    const result = OnlineReconnectCleanup.executeTerminal(cleanupHandlers(calls));
    assert.deepStrictEqual(calls, [
        'clearPendingOutboundAction',
        'clearReconnectFlag',
        'removeOnlineSession',
        'clearRestoreBundle',
        'updateResumeButton',
        'disconnectSocket',
    ]);
    assert.deepStrictEqual(result, { ok: true, steps: calls });
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.steps));
});

runTest('online reconnect cleanup executorは全handlerをeffect開始前に検証する', () => {
    const calls = [];
    const handlers = cleanupHandlers(calls);
    delete handlers.clearRestoreBundle;
    assert.throws(
        () => OnlineReconnectCleanup.executeTerminal(handlers),
        /clearRestoreBundle/
    );
    assert.deepStrictEqual(calls, []);
});

runTest('online reconnect cleanup executorはeffect例外を伝播して後続を実行しない', () => {
    const calls = [];
    const failure = new Error('storage failed');
    const handlers = cleanupHandlers(calls, {
        removeOnlineSession() {
            calls.push('removeOnlineSession');
            throw failure;
        },
    });
    assert.throws(
        () => OnlineReconnectCleanup.executeTerminal(handlers),
        error => error === failure
    );
    assert.deepStrictEqual(calls, [
        'clearPendingOutboundAction',
        'clearReconnectFlag',
        'removeOnlineSession',
    ]);
});
