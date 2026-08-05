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
    return { calls, game, handlers, phases, setOnline: value => { online = value; } };
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

runTest('CPU phase handlersは必須依存欠落を初期化前に拒否する', () => {
    assert.throws(() => CpuPhaseHandlers.create(), /dependency is required/);
});
