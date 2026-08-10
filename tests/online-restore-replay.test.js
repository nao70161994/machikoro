'use strict';

const assert = require('assert');
const { OnlineRestoreReplay } = require('../js/onlineRestoreReplay');
const { runTest } = require('./helpers/test-utils');

function handlers(calls, overrides = {}) {
    return Object.assign(Object.fromEntries(OnlineRestoreReplay.handlers.map(name => [
        name,
        (...args) => calls.push([name, ...args]),
    ])), overrides);
}

runTest('online restore replay planはreplay入力参照を変更せず固定する', () => {
    const playerNames = ['Alice', 'Bob'];
    const playerSettings = [{ type: 'human' }, { type: 'human' }];
    const playerOrder = [0, 1];
    const stateSnapshot = { phase: 'build' };
    const actionLog = [{ action: 'nextTurn', data: {} }];
    const plan = OnlineRestoreReplay.plan({
        playerNames,
        playerSettings,
        playerOrder,
        stateSnapshot,
        actionLog,
        provisionalRestore: true,
    });
    assert.deepStrictEqual(plan, {
        playerNames,
        playerSettings,
        playerOrder,
        stateSnapshot,
        actionLog,
        provisionalRestore: true,
    });
    assert.strictEqual(plan.actionLog, actionLog);
    assert.strictEqual(Object.isFrozen(plan), true);
});

runTest('online restore replay plan authorityは全参照一致時だけpure planを選ぶ', () => {
    const input = {
        playerNames: ['A', 'B'],
        playerSettings: [],
        playerOrder: [0, 1],
        stateSnapshot: null,
        actionLog: [],
        provisionalRestore: false,
    };
    const legacy = Object.freeze(Object.assign({}, input));
    assert.strictEqual(OnlineRestoreReplay.selectPlan(input, legacy).source, 'legacy');
    assert.strictEqual(OnlineRestoreReplay.selectPlan(
        input, legacy, { authorityEnabled: true }
    ).source, 'pure-plan');
    const mismatch = Object.assign({}, legacy, { actionLog: [] });
    const selection = OnlineRestoreReplay.selectPlan(
        input, mismatch, { authorityEnabled: true }
    );
    assert.strictEqual(selection.source, 'legacy-fallback');
    assert.strictEqual(selection.plan, mismatch);
    assert.strictEqual(selection.fallbackReason, 'restore-replay-plan-mismatch');
});

runTest('online restore replay executorはinitからsnapshot/action/logまで既存順を維持する', () => {
    const calls = [];
    const snapshot = { phase: 'build' };
    const actionLog = [
        { action: 'buildCard', data: { cardName: '麦畑' } },
        { action: 'nextTurn', data: {} },
    ];
    const result = OnlineRestoreReplay.execute({
        playerNames: ['A', 'B'],
        playerSettings: [],
        playerOrder: [0, 1],
        stateSnapshot: snapshot,
        actionLog,
        provisionalRestore: true,
    }, handlers(calls));
    assert.deepStrictEqual(calls, [
        ['setReplaying', true],
        ['observeReplayStarted'],
        ['applyReplayStatus'],
        ['initGame', ['A', 'B'], [], [0, 1]],
        ['restoreSnapshot', snapshot],
        ['applyAction', 'buildCard', { cardName: '麦畑' }],
        ['applyAction', 'nextTurn', {}],
        ['addProvisionalLog'],
        ['setReplaying', false],
    ]);
    assert.deepStrictEqual(result.steps, [
        'startReplaying',
        'observeReplayStarted',
        'applyReplayStatus',
        'initGame',
        'restoreSnapshot',
        'applyAction',
        'applyAction',
        'addProvisionalLog',
        'finishReplaying',
    ]);
});

runTest('online restore replay executorは失敗時もreplay modeを解除して例外を伝播する', () => {
    const calls = [];
    const error = new Error('replay failed');
    assert.throws(() => OnlineRestoreReplay.execute({
        playerNames: [],
        playerSettings: [],
        playerOrder: [],
        stateSnapshot: null,
        actionLog: [{ action: 'nextTurn', data: {} }],
        provisionalRestore: false,
    }, handlers(calls, {
        applyAction: () => {
            calls.push(['applyAction']);
            throw error;
        },
    })), thrown => thrown === error);
    assert.deepStrictEqual(calls.slice(-2), [
        ['applyAction'],
        ['setReplaying', false],
    ]);
    assert.strictEqual(calls.some(call => call[0] === 'addProvisionalLog'), false);
});

runTest('online restore replay executorはsnapshot/actionのfalseを成功扱いしない', () => {
    for (const rejectedEffect of ['restoreSnapshot', 'applyAction']) {
        const calls = [];
        assert.throws(() => OnlineRestoreReplay.execute({
            playerNames: [],
            playerSettings: [],
            playerOrder: [],
            stateSnapshot: { phase: 'build' },
            actionLog: [{ action: 'nextTurn', data: {} }],
            provisionalRestore: false,
        }, handlers(calls, {
            [rejectedEffect]: (...args) => {
                calls.push([rejectedEffect, ...args]);
                return false;
            },
        })), /online (snapshot restore|restore action) rejected/, rejectedEffect);
        assert.deepStrictEqual(calls[calls.length - 1], ['setReplaying', false]);
        if (rejectedEffect === 'restoreSnapshot') {
            assert.strictEqual(calls.some(call => call[0] === 'applyAction'), false);
        }
    }
});

runTest('online restore replay executorは全handlerをeffect前に検証する', () => {
    const calls = [];
    const incomplete = handlers(calls);
    delete incomplete.restoreSnapshot;
    assert.throws(() => OnlineRestoreReplay.execute({
        actionLog: [],
        provisionalRestore: false,
    }, incomplete), /restoreSnapshot/);
    assert.deepStrictEqual(calls, []);
});
