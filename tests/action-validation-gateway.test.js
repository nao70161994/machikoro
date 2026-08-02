const assert = require('assert');
const makeActionValidationGateway = require('../server/actionValidationGateway');
const { runTest } = require('./helpers/test-utils');

function makeHarness(overrides = {}) {
    const calls = [];
    const game = { checkWinner: () => false };
    const mirror = { game, cpuPlayers: [false], shopStock: { stock: true }, lastUndoState: { source: 'mirror' } };
    const dependencies = {
        getRoomCanonicalMirror: () => { calls.push('mirror'); return mirror; },
        canSocketSubmitCurrentAction: () => { calls.push('actor'); return true; },
        getAllowedActions: () => { calls.push('allowed'); return new Set(['rollDice']); },
        makeServerDiceActionData: (receivedGame, action, data) => {
            calls.push('dice');
            assert.strictEqual(receivedGame, game);
            return { ...data, authoritative: action };
        },
        validateActionPayloadForState: (room, receivedGame, shopStock, action, data, options) => {
            calls.push('payload');
            return { room, receivedGame, shopStock, action, data, options };
        },
        ...overrides,
    };
    return {
        calls,
        game,
        mirror,
        validateGameAction: makeActionValidationGateway(dependencies).validateGameAction,
    };
}

runTest('action validation gateway は依存を副作用前に検証する', () => {
    assert.throws(() => makeActionValidationGateway({}), /getRoomCanonicalMirror must be a function/);
});

runTest('action validation gateway はmirrorなしで後続処理を呼ばない', () => {
    const harness = makeHarness({ getRoomCanonicalMirror: () => null });
    assert.deepStrictEqual(harness.validateGameAction({}, {}, 'rollDice', {}), { ok: false });
    assert.deepStrictEqual(harness.calls, []);
});

runTest('action validation gateway は勝利、actor、phaseを順に拒否して乱数を消費しない', () => {
    const winner = makeHarness();
    winner.game.checkWinner = () => true;
    assert.deepStrictEqual(winner.validateGameAction({}, {}, 'rollDice', {}), { ok: false });
    assert.deepStrictEqual(winner.calls, ['mirror']);

    const actorCalls = [];
    const actor = makeHarness({ canSocketSubmitCurrentAction: () => { actorCalls.push('actor'); return false; } });
    assert.deepStrictEqual(actor.validateGameAction({}, {}, 'rollDice', {}), { ok: false });
    assert.deepStrictEqual(actor.calls, ['mirror']);
    assert.deepStrictEqual(actorCalls, ['actor']);

    const phaseCalls = [];
    const phase = makeHarness({ getAllowedActions: () => { phaseCalls.push('allowed'); return new Set(); } });
    assert.deepStrictEqual(phase.validateGameAction({}, {}, 'rollDice', {}), { ok: false });
    assert.deepStrictEqual(phase.calls, ['mirror', 'actor']);
    assert.deepStrictEqual(phaseCalls, ['allowed']);
});

runTest('action validation gateway はcanonical payloadとroom Undoを検証へ渡す', () => {
    const harness = makeHarness();
    const roomUndo = { source: 'room' };
    const result = harness.validateGameAction({ lastUndoState: roomUndo }, { id: 'socket' }, 'rollDice', { forceDice: 3 });

    assert.deepStrictEqual(harness.calls, ['mirror', 'actor', 'allowed', 'dice', 'payload']);
    assert.strictEqual(result.mirror, harness.mirror);
    assert.deepStrictEqual(result.data, { forceDice: 3, authoritative: 'rollDice' });
    assert.strictEqual(result.ok.options.undoState, roomUndo);
    assert.strictEqual(result.ok.options.requireUndoPayload, false);
    assert.strictEqual(result.ok.receivedGame, harness.game);
    assert.strictEqual(result.ok.shopStock, harness.mirror.shopStock);
});

runTest('action validation gateway はroom Undoなしならmirror Undoへfallbackする', () => {
    const harness = makeHarness({ validateActionPayloadForState: (room, game, shop, action, data, options) => options });
    const result = harness.validateGameAction({}, {}, 'rollDice', {});
    assert.strictEqual(result.ok.undoState, harness.mirror.lastUndoState);
    assert.strictEqual(result.ok.requireUndoPayload, false);
});
