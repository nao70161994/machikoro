'use strict';
const assert = require('assert');
const CpuPhaseHandlers = require('../js/cpuPhaseHandlers');
const { runTest } = require('./helpers/test-utils');

function createHarness() {
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
        executeAction: (action, data, fallback) => { calls.push(['execute', action, data]); return fallback(); },
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

runTest('CPU phase handlersは必須依存欠落を初期化前に拒否する', () => {
    assert.throws(() => CpuPhaseHandlers.create(), /dependency is required/);
});
