'use strict';
const assert = require('assert');
const CpuPhaseHandlers = require('../js/cpuPhaseHandlers');
const { runTest } = require('./helpers/test-utils');

function createHarness(options = {}) {
    const calls = [];
    const phases = { ROLL: 'roll', SELECT_DICE: 'selectDice', REROLL_CONFIRM: 'reroll', HARBOR_CHOICE: 'harbor', PENDING: 'pending', BUILD: 'build' };
    const game = {
        phase: 'roll', pendingIT: false, builtThisTurn: false,
        nextTurn: () => calls.push(['nextTurn']),
        rollDice: (...args) => calls.push(['rollDice', ...args]),
    };
    let online = false;
    const proposals = {
        roll: { action: 'rollDice', data: { forceDice: 3, tunaDice: [1, 2] } },
        pending: { action: 'resolveTV', data: { targetIndex: 1 } },
        build: { action: 'buildCard', data: { cardName: '麦畑' } },
        nextTurn: { action: 'nextTurn', data: {} },
        resolveIT: { action: 'resolveIT', data: { doSave: true } },
    };
    const handlers = CpuPhaseHandlers.create({
        actions: { REROLL_DICE: 'rerollDice' },
        checkpoint: (event, details) => calls.push(['checkpoint', event, details]),
        chooseAction: name => proposals[name],
        executeAction: (action, data, fallback) => {
            calls.push(['execute', action, data]);
            return typeof options.executeAction === 'function'
                ? options.executeAction(action, data, fallback)
                : fallback();
        },
        gamePhases: phases,
        getGameState: () => ({ game }),
        getOnlineState: () => ({ isOnlineGame: online }),
        nextPendingAction: () => 'resolveTV',
        pendingResolution: { applyPendingAction: () => calls.push(['applyPending']) },
        render: () => calls.push(['render']),
        shopStock: { wheat: 6 },
    });
    return {
        calls,
        game,
        handlers,
        phases,
        proposals,
        setOnline: value => { online = value; },
    };
}

runTest('CPU phase handlersは既存8段階の順序を凍結する', () => {
    const { handlers } = createHarness();
    assert.deepStrictEqual(handlers.map(handler => handler.name), CpuPhaseHandlers.ORDER);
    assert.ok(Object.isFrozen(handlers));
    assert.ok(handlers.every(Object.isFrozen));
});

runTest('CPU phase roll handlerはcanonical proposalを既存fallback引数へ渡す', () => {
    const { calls, handlers } = createHarness();
    handlers[0].run({});
    assert.deepStrictEqual(calls, [
        ['execute', 'rollDice', { forceDice: 3, tunaDice: [1, 2] }],
        ['rollDice', 3, [1, 2]],
    ]);
});

for (const testCase of [
    {
        step: 'roll', phase: 'ROLL',
        proposal: { action: 'rollDice', data: { forceDice: 3, tunaDice: [1, 2] } },
    },
    {
        step: 'selectDice', phase: 'SELECT_DICE',
        proposal: { action: 'selectDice', data: { useTwo: true, d1: 2, d2: 4, tunaDice: [1, 6] } },
    },
    {
        step: 'rerollConfirm', phase: 'REROLL_CONFIRM',
        proposal: { action: 'skipReroll', data: {} },
    },
    {
        step: 'harborChoice', phase: 'HARBOR_CHOICE',
        proposal: { action: 'resolveHarbor', data: { useBonus: false } },
    },
    {
        step: 'nextTurn', phase: 'BUILD',
        proposal: { action: 'nextTurn', data: {} },
    },
    {
        step: 'resolveIT', phase: 'BUILD', pendingIT: true,
        proposal: { action: 'resolveIT', data: { doSave: true } },
    },
]) {
    for (const executionResult of [true, false]) {
        runTest(`CPU phase ${testCase.step} handlerはaction実行${executionResult ? '成功' : '拒否'}をschedulerへ返す`, () => {
            const h = createHarness({ executeAction: () => executionResult });
            h.game.phase = h.phases[testCase.phase];
            h.game.pendingIT = !!testCase.pendingIT;
            h.proposals[testCase.step] = testCase.proposal;

            assert.strictEqual(
                h.handlers.find(handler => handler.name === testCase.step).run({ difficulty: 'strong' }),
                executionResult
            );
            assert.strictEqual(h.calls.filter(call => call[0] === 'execute').length, 1);
        });
    }
}

runTest('CPU phase build handlerはlocal proposalを共有action境界へ渡しonline gateを維持する', () => {
    const local = createHarness();
    local.game.phase = local.phases.BUILD;
    const cpu = { chooseBuildAction() {}, executeBuildAction: () => false };
    assert.strictEqual(local.handlers.find(handler => handler.name === 'build').run(cpu), true);
    assert.deepStrictEqual(local.calls.map(call => call[0]), [
        'execute', 'checkpoint', 'execute', 'nextTurn',
    ]);

    const online = createHarness();
    online.game.phase = online.phases.BUILD;
    online.setOnline(true);
    assert.strictEqual(online.handlers.find(handler => handler.name === 'build').run(cpu), false);
    assert.deepStrictEqual(online.calls, []);
});

runTest('CPU phase pending handlerはproposal欠落を診断してno-progressを返す', () => {
    const h = createHarness();
    h.game.phase = h.phases.PENDING;
    h.proposals.pending = null;

    assert.strictEqual(h.handlers.find(handler => handler.name === 'pending').run({ difficulty: 'strong' }), false);
    const checkpoint = h.calls.find(call => call[1] === 'scheduleCPU-pending-no-proposal');
    assert.ok(checkpoint);
    assert.strictEqual(checkpoint[2].difficulty, 'strong');
    assert.strictEqual(checkpoint[2].pendingAction, 'resolveTV');
    assert.strictEqual(h.calls.some(call => call[0] === 'execute'), false);
});

runTest('CPU phase pending handlerは適用拒否を診断してno-progressを返す', () => {
    const h = createHarness();
    h.game.phase = h.phases.PENDING;
    h.proposals.pending = { action: 'resolveTV', data: { targetIndex: 1 } };
    const rejected = CpuPhaseHandlers.create({
        actions: { REROLL_DICE: 'rerollDice' },
        checkpoint: (event, details) => h.calls.push(['checkpoint', event, details]),
        chooseAction: () => h.proposals.pending,
        executeAction: () => false,
        gamePhases: h.phases,
        getGameState: () => ({ game: h.game }),
        getOnlineState: () => ({ isOnlineGame: false }),
        nextPendingAction: () => 'resolveTV',
        pendingResolution: { applyPendingAction: () => true },
        render: () => {},
        shopStock: {},
    }).find(handler => handler.name === 'pending');

    assert.strictEqual(rejected.run({ difficulty: 'strong' }), false);
    assert.ok(h.calls.some(call => call[1] === 'scheduleCPU-pending-apply-rejected'));
});

runTest('CPU phase pending handlerはlocal適用後の状態不変をno-progressとして拒否する', () => {
    const h = createHarness();
    h.game.phase = h.phases.PENDING;

    assert.strictEqual(h.handlers.find(handler => handler.name === 'pending').run({
        difficulty: 'strong',
    }), false);
    assert.ok(h.calls.some(call => call[1] === 'scheduleCPU-pending-state-unchanged'));
});

runTest('CPU phase pending handlerはonline hostのACK待ちを状態不変として拒否しない', () => {
    const h = createHarness();
    h.game.phase = h.phases.PENDING;
    h.setOnline(true);

    assert.notStrictEqual(h.handlers.find(handler => handler.name === 'pending').run({
        difficulty: 'strong',
    }), false);
    assert.strictEqual(h.calls.filter(call => call[0] === 'execute').length, 1);
    assert.strictEqual(h.calls.some(call => call[1] === 'scheduleCPU-pending-state-unchanged'), false);
});

for (const testCase of [
    { step: 'roll', phase: 'ROLL' },
    { step: 'selectDice', phase: 'SELECT_DICE' },
    { step: 'rerollConfirm', phase: 'REROLL_CONFIRM' },
    { step: 'harborChoice', phase: 'HARBOR_CHOICE' },
    { step: 'nextTurn', phase: 'BUILD' },
    { step: 'resolveIT', phase: 'BUILD', pendingIT: true },
]) {
    runTest(`CPU phase ${testCase.step} handlerはproposal欠落を例外化せず停止する`, () => {
        const h = createHarness();
        h.game.phase = h.phases[testCase.phase];
        h.game.pendingIT = !!testCase.pendingIT;
        h.proposals[testCase.step] = null;
        const handler = h.handlers.find(entry => entry.name === testCase.step);

        assert.strictEqual(handler.run({ difficulty: 'strong' }), false);
        const checkpoint = h.calls.find(call => call[1] === 'scheduleCPU-step-no-proposal');
        assert.ok(checkpoint);
        assert.strictEqual(checkpoint[2].step, testCase.step);
        assert.strictEqual(checkpoint[2].difficulty, 'strong');
        assert.strictEqual(h.calls.some(call => call[0] === 'execute'), false);
    });
}

runTest('CPU phase handlersは必須依存欠落を初期化前に拒否する', () => {
    assert.throws(() => CpuPhaseHandlers.create(), /dependency is required/);
});
