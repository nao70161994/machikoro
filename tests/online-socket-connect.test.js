'use strict';

const assert = require('assert');
const { OnlineSocketConnect } = require('../js/onlineSocketConnect');
const { runTest } = require('./helpers/test-utils');

function handlers(calls) {
    return Object.fromEntries(OnlineSocketConnect.steps.map(step => [
        step,
        () => calls.push(step),
    ]));
}

runTest('online socket connect planは待機表示と再join資格をpureに判定する', () => {
    const plan = OnlineSocketConnect.plan({
        waitingStatus: true,
        onlineActive: true,
        reconnecting: false,
        restoreInProgress: false,
        hasRoomId: true,
        originalPlayerIndex: 1,
        hasPlayerName: true,
        hasReconnectToken: true,
    });
    assert.deepStrictEqual(plan, { clearWaitingStatus: true, requestRejoin: true });
    assert.ok(Object.isFrozen(plan));
    assert.strictEqual(OnlineSocketConnect.plan({
        waitingStatus: false,
        onlineActive: true,
        hasRoomId: true,
        originalPlayerIndex: -1,
        hasPlayerName: true,
        hasReconnectToken: true,
    }).requestRejoin, false);
});

runTest('online socket connect plan authorityはlegacy完全一致時だけpure planを選ぶ', () => {
    const state = {
        waitingStatus: true, onlineActive: false, reconnecting: true, restoreInProgress: false,
        hasRoomId: true, originalPlayerIndex: 0, hasPlayerName: true, hasReconnectToken: true,
    };
    const legacyPlan = { clearWaitingStatus: true, requestRejoin: true };
    assert.strictEqual(OnlineSocketConnect.selectPlan(
        state, legacyPlan, { authorityEnabled: true }
    ).source, 'pure-plan');
    assert.deepStrictEqual(OnlineSocketConnect.selectPlan(
        state, { clearWaitingStatus: false, requestRejoin: true }, { authorityEnabled: true }
    ), {
        plan: { clearWaitingStatus: false, requestRejoin: true },
        source: 'legacy-fallback',
        fallbackReason: 'socket-connect-plan-mismatch',
    });
    assert.strictEqual(OnlineSocketConnect.selectPlan(state, legacyPlan).source, 'legacy');
});

runTest('online socket connect executorは表示解除後にreconnectとrejoinを実行する', () => {
    const calls = [];
    const result = OnlineSocketConnect.execute({
        clearWaitingStatus: true,
        requestRejoin: true,
    }, handlers(calls));
    assert.deepStrictEqual(calls, ['clearWaitingStatus', 'markReconnecting', 'requestRejoin']);
    assert.deepStrictEqual(result.steps, calls);
    assert.ok(Object.isFrozen(result.steps));
});

runTest('online socket connect executorは不要なeffectを実行しない', () => {
    const calls = [];
    OnlineSocketConnect.execute({
        clearWaitingStatus: false,
        requestRejoin: false,
    }, handlers(calls));
    assert.deepStrictEqual(calls, []);
});

runTest('online socket connect executorは全handlerをeffect前に検証する', () => {
    const calls = [];
    const incomplete = handlers(calls);
    delete incomplete.requestRejoin;
    assert.throws(
        () => OnlineSocketConnect.execute({
            clearWaitingStatus: true,
            requestRejoin: false,
        }, incomplete),
        /requestRejoin/
    );
    assert.deepStrictEqual(calls, []);
});
