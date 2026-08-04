'use strict';
const assert = require('assert');
const LocalGameEngineRuntime = require('../js/localGameEngineRuntime');
const { runTest } = require('./helpers/test-utils');

function createHarness(options = {}) {
    const calls = [];
    let online = options.online === true;
    let shadow = options.shadow === true;
    let authority = options.authority === true;
    let game = { id: 'live' };
    let undoState = { id: 'undo' };
    const controller = { value: null, set(value) { this.value = value; }, get() { return this.value; } };
    const runtime = LocalGameEngineRuntime.createRuntime({
        actionProposal: { create: (action, data) => ({ action, data }) },
        adapterOptions: () => ({}),
        assignShopStock: (target, value) => { calls.push(['assignStock', value]); Object.assign(target, value); },
        checkpoint: (event, details) => calls.push(['checkpoint', event, details]),
        clientShadow: {
            createOutcomeController: () => controller,
            prepare(input) { calls.push(['prepare', input.action]); return { action: input.action, shadow: input.transition(input.snapshot, input.action, input.data) }; },
            finish(input) { calls.push(['finish', input.prepared.action]); return { report: { status: 'matched' }, authority: { authority: input.authorityEnabled ? 'pure-transition' : 'legacy' } }; },
            equalSnapshots: () => true,
        },
        determinism: { isResolved: () => options.resolved !== false },
        getEngine: () => ({
            transitionSnapshot: input => ({ transitioned: input.action }),
            applyMutableAction: input => calls.push(['mutable', input.action]),
        }),
        gameRuntime: {
            setGame(value) { game = value; calls.push(['setGame', value]); },
            setUndoState(value) { undoState = value; calls.push(['setUndo', value]); },
        },
        getGameState: () => ({ game, undoState }),
        getOnlineState: () => ({ isOnlineGame: online }),
        isAuthorityEnabled: () => authority,
        isShadowEnabled: () => shadow,
        pendingActionsFor: () => [],
        render: () => calls.push(['render']),
        runtimeAdapter: {
            create: () => ({
                hydrate: snapshot => ({ game: { id: 'hydrated' }, shopStock: { A: 2 }, undoState: snapshot.undoState }),
                serialize: runtimeValue => ({ game: runtimeValue.game, undoState: runtimeValue.undoState }),
            }),
        },
        scheduleCpu: () => calls.push(['scheduleCpu']),
        sendAction: (action, data) => { calls.push(['send', action, data]); return 'sent'; },
        shopStock: {},
        snapshot: { serializeGameState: (value, stock, metadata) => ({ game: value, stock: { ...stock }, undoState: metadata.undoState }) },
        stationName: '駅',
    });
    return { calls, controller, runtime, setOnline: value => { online = value; }, setShadow: value => { shadow = value; }, setAuthority: value => { authority = value; } };
}

runTest('local game engine runtimeはlocal human actionのcheckpoint・render・schedule順を所有する', () => {
    const h = createHarness();
    assert.strictEqual(h.runtime.runHuman('nextTurn', {}, () => { h.calls.push(['fallback']); return true; }), true);
    assert.deepStrictEqual(h.calls.map(call => call[0]), [
        'checkpoint', 'fallback', 'checkpoint', 'render', 'checkpoint', 'scheduleCpu', 'checkpoint',
    ]);
    assert.deepStrictEqual(h.calls.map(call => call[1]).filter(Boolean), [
        'action-start', 'action-local-applied', 'action-rendered', 'action-scheduleCPU-returned',
    ]);
});

runTest('local game engine runtimeはonline actionを送信だけで終える', () => {
    const h = createHarness({ online: true });
    let fallback = 0;
    assert.strictEqual(h.runtime.runHuman('rollDice', { forceDice: 2 }, () => { fallback++; }), 'sent');
    assert.strictEqual(fallback, 0);
    assert.deepStrictEqual(h.calls.map(call => call[0]), ['checkpoint', 'send', 'checkpoint']);
});

runTest('local game engine runtimeはresolved shadowだけを比較しoutcome controllerへ記録する', () => {
    const h = createHarness({ shadow: true, authority: true });
    const prepared = h.runtime.prepare('nextTurn', {});
    const outcome = h.runtime.finish(prepared);
    assert.strictEqual(outcome.authority.authority, 'pure-transition');
    assert.strictEqual(h.controller.get(), outcome);
    const unresolved = createHarness({ shadow: true, resolved: false });
    assert.strictEqual(unresolved.runtime.prepare('rollDice', { forceDice: null }), null);
});

runTest('local game engine runtimeは必須依存欠落を初期化前に拒否する', () => {
    assert.throws(() => LocalGameEngineRuntime.createRuntime(), /dependency is required/);
});
