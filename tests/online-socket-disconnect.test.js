'use strict';

const assert = require('assert');
const { OnlineSocketDisconnect } = require('../js/onlineSocketDisconnect');
const { runTest } = require('./helpers/test-utils');

function handlers(calls) {
    return Object.fromEntries(OnlineSocketDisconnect.steps.map(step => [
        step,
        () => calls.push(step),
    ]));
}

runTest('online socket disconnect planはactiveとrestore中断をpureに判定する', () => {
    assert.deepStrictEqual(OnlineSocketDisconnect.plan({
        onlineActive: false, restoreInProgress: true,
    }), { active: true, abortRestore: true });
    assert.deepStrictEqual(OnlineSocketDisconnect.plan({
        onlineActive: false, restoreInProgress: false,
    }), { active: false, abortRestore: false });
});

runTest('online socket disconnect plan authorityはlegacy完全一致時だけpure planを選ぶ', () => {
    const state = { onlineActive: true, restoreInProgress: false };
    const legacyPlan = { active: true, abortRestore: false };
    assert.strictEqual(OnlineSocketDisconnect.selectPlan(
        state, legacyPlan, { authorityEnabled: true }
    ).source, 'pure-plan');
    assert.deepStrictEqual(OnlineSocketDisconnect.selectPlan(
        state, { active: false, abortRestore: false }, { authorityEnabled: true }
    ), {
        plan: { active: false, abortRestore: false },
        source: 'legacy-fallback',
        fallbackReason: 'socket-disconnect-plan-mismatch',
    });
});

runTest('online socket disconnect executorはrestoreを隔離してから再接続状態へ移す', () => {
    const calls = [];
    const result = OnlineSocketDisconnect.execute({
        active: true, abortRestore: true,
    }, handlers(calls));
    assert.deepStrictEqual(calls, OnlineSocketDisconnect.steps);
    assert.strictEqual(result.result, true);
    assert.ok(Object.isFrozen(result.steps));
});

runTest('online socket disconnect executorは通常activeでrestore effectだけを省く', () => {
    const calls = [];
    OnlineSocketDisconnect.execute({
        active: true, abortRestore: false,
    }, handlers(calls));
    assert.deepStrictEqual(calls, [
        'finishLobby', 'markReconnecting', 'clearActionFlight',
        'invalidateCpuSchedule', 'observeDisconnect', 'updateStatus',
    ]);
});

runTest('online socket disconnect executorはinactiveでもlobby待機だけ解除する', () => {
    const calls = [];
    const result = OnlineSocketDisconnect.execute({
        active: false, abortRestore: false,
    }, handlers(calls));
    assert.deepStrictEqual(calls, ['finishLobby']);
    assert.strictEqual(result.result, false);
});

runTest('online socket disconnect executorは全handlerをeffect前に検証する', () => {
    const calls = [];
    const incomplete = handlers(calls);
    delete incomplete.updateStatus;
    assert.throws(
        () => OnlineSocketDisconnect.execute({ active: false, abortRestore: false }, incomplete),
        /updateStatus/
    );
    assert.deepStrictEqual(calls, []);
});
