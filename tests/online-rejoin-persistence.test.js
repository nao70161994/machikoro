'use strict';

const assert = require('assert');
const { OnlineRejoinPersistence } = require('../js/onlineRejoinPersistence');
const { runTest } = require('./helpers/test-utils');

function handlers(calls) {
    return Object.fromEntries(OnlineRejoinPersistence.steps.map(step => [
        step,
        value => calls.push([step, value]),
    ]));
}

runTest('online rejoin persistence planは既存runtime既定値をpureに固定する', () => {
    const enabledCards = ['麦畑'];
    const enabledLandmarks = ['駅'];
    const defaults = ['駅', 'ショッピングモール'];
    const input = {
        acceptedPending: true,
        cpuSpeed: 0,
        enabledCards,
        enabledLandmarks,
        defaultLandmarks: defaults,
        playerIndex: 2,
        hostPlayerIndex: 1,
        resetUiLocksAvailable: true,
    };
    const before = JSON.stringify(input);
    const plan = OnlineRejoinPersistence.plan(input);
    assert.deepStrictEqual(plan, {
        clearPendingOutboundAction: true,
        cpuSpeed: 1500,
        updateEnabledCards: true,
        enabledCards,
        enabledLandmarks,
        playerIndex: 2,
        hostPlayerIndex: 1,
        resetUiLocks: true,
    });
    assert.strictEqual(Object.isFrozen(plan), true);
    assert.strictEqual(JSON.stringify(input), before);

    const fallback = OnlineRejoinPersistence.plan({
        acceptedPending: false,
        cpuSpeed: 400,
        enabledCards: null,
        enabledLandmarks: [],
        defaultLandmarks: defaults,
        playerIndex: 0,
        hostPlayerIndex: 0,
    });
    assert.strictEqual(fallback.clearPendingOutboundAction, false);
    assert.strictEqual(fallback.cpuSpeed, 400);
    assert.strictEqual(fallback.updateEnabledCards, false);
    assert.strictEqual(fallback.enabledLandmarks, defaults);
    assert.strictEqual(fallback.resetUiLocks, false);
});

runTest('online rejoin persistence plan authorityは参照を含む完全一致時だけpure planを選ぶ', () => {
    const cards = ['麦畑'];
    const landmarks = ['駅'];
    const input = {
        acceptedPending: true,
        cpuSpeed: 300,
        enabledCards: cards,
        enabledLandmarks: landmarks,
        defaultLandmarks: [],
        playerIndex: 1,
        hostPlayerIndex: 0,
        resetUiLocksAvailable: true,
    };
    const legacy = Object.freeze({
        clearPendingOutboundAction: true,
        cpuSpeed: 300,
        updateEnabledCards: true,
        enabledCards: cards,
        enabledLandmarks: landmarks,
        playerIndex: 1,
        hostPlayerIndex: 0,
        resetUiLocks: true,
    });
    assert.strictEqual(OnlineRejoinPersistence.selectPlan(input, legacy).source, 'legacy');
    assert.strictEqual(OnlineRejoinPersistence.selectPlan(
        input, legacy, { authorityEnabled: true }
    ).source, 'pure-plan');
    const mismatch = Object.assign({}, legacy, { enabledCards: cards.slice() });
    const selection = OnlineRejoinPersistence.selectPlan(
        input, mismatch, { authorityEnabled: true }
    );
    assert.strictEqual(selection.source, 'legacy-fallback');
    assert.strictEqual(selection.plan, mismatch);
    assert.strictEqual(selection.fallbackReason, 'rejoin-persistence-plan-mismatch');
});

runTest('online rejoin persistence executorはpending clearを含む既存effect順を維持する', () => {
    const calls = [];
    const result = OnlineRejoinPersistence.execute({
        clearPendingOutboundAction: true,
        cpuSpeed: 300,
        updateEnabledCards: true,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        playerIndex: 1,
        hostPlayerIndex: 0,
        resetUiLocks: true,
    }, handlers(calls));
    assert.deepStrictEqual(calls, [
        ['clearActionFlight', undefined],
        ['clearPendingOutboundAction', undefined],
        ['clearRetry', undefined],
        ['setCpuSpeed', 300],
        ['setEnabledCards', ['麦畑']],
        ['setEnabledLandmarks', ['駅']],
        ['setPlayerIndices', 1],
        ['setHostState', 0],
        ['persistRestoreBundle', undefined],
        ['saveSession', undefined],
        ['invalidateCpuSchedule', undefined],
        ['resetUiLocks', undefined],
    ]);
    assert.deepStrictEqual(result.steps, calls.map(call => call[0]));
});

runTest('online rejoin persistence executorは任意effectだけを省略する', () => {
    const calls = [];
    OnlineRejoinPersistence.execute({
        clearPendingOutboundAction: false,
        cpuSpeed: 1500,
        updateEnabledCards: false,
        enabledCards: null,
        enabledLandmarks: ['駅'],
        playerIndex: 0,
        hostPlayerIndex: 0,
        resetUiLocks: false,
    }, handlers(calls));
    assert.strictEqual(calls.some(call => call[0] === 'clearPendingOutboundAction'), false);
    assert.strictEqual(calls.some(call => call[0] === 'setEnabledCards'), false);
    assert.strictEqual(calls.some(call => call[0] === 'resetUiLocks'), false);
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'clearActionFlight',
        'clearRetry',
        'setCpuSpeed',
        'setEnabledLandmarks',
        'setPlayerIndices',
        'setHostState',
        'persistRestoreBundle',
        'saveSession',
        'invalidateCpuSchedule',
    ]);
});

runTest('online rejoin persistence executorは全handlerをeffect前に検証する', () => {
    const calls = [];
    const incomplete = handlers(calls);
    delete incomplete.saveSession;
    assert.throws(() => OnlineRejoinPersistence.execute({
        clearPendingOutboundAction: false,
        cpuSpeed: 1500,
        updateEnabledCards: false,
        enabledCards: null,
        enabledLandmarks: [],
        playerIndex: 0,
        hostPlayerIndex: 0,
        resetUiLocks: false,
    }, incomplete), /saveSession/);
    assert.deepStrictEqual(calls, []);
});
