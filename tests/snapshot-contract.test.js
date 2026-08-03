const assert = require('assert');
const {
    makeUndoStateFromMirror,
    restoreMirrorState,
    serializeMirrorState,
} = require('../server');
const { loadGameRuntime } = require('./helpers/runtime-loaders');
const { makeSnapshotRoundtripFixtures } = require('./helpers/snapshot-fixtures');
const { runTest } = require('./helpers/test-utils');

function assertRestoredFixtureSemantics(runtime, fixture, restoredGame, snapshot, roundtrip) {
    if (fixture.name === 'build-with-undo') {
        assert.ok(snapshot.undoState);
        assert.deepStrictEqual(roundtrip.undoState, snapshot.undoState);
    }
    if (fixture.name === 'pending') {
        assert.strictEqual(restoredGame.phase, runtime.GAME_PHASES.PENDING);
        assert.deepStrictEqual(
            Array.from(runtime.GameManager.allowedActionsFor(restoredGame)),
            [runtime.GAME_ACTIONS.RESOLVE_TV]
        );
        assert.deepStrictEqual(
            Array.from(restoredGame.pendingActionQueue, entry => `${entry.action}:${entry.field}`),
            [`${runtime.GAME_ACTIONS.RESOLVE_TV}:pendingTV`]
        );
    }
    if (fixture.name === 'multi-pending-dormant') {
        assert.strictEqual(restoredGame.phase, runtime.GAME_PHASES.PENDING);
        assert.deepStrictEqual(
            Array.from(runtime.GameManager.allowedActionsFor(restoredGame)),
            [runtime.GAME_ACTIONS.RESOLVE_CLEANING]
        );
        assert.deepStrictEqual(
            Array.from(restoredGame.pendingActionQueue, entry => `${entry.action}:${entry.field}`),
            [
                `${runtime.GAME_ACTIONS.RESOLVE_CLEANING}:pendingCleaning`,
                `${runtime.GAME_ACTIONS.RESOLVE_RENOVATION}:pendingRenovation`,
            ]
        );
        const player = restoredGame.players[1];
        assert.deepStrictEqual(
            Array.from(player.dormantCards, card => player.cards.indexOf(card)),
            [0, 2]
        );
        assert.strictEqual(restoredGame.lastDiceResult, 8);
        assert.strictEqual(restoredGame.lastDice1, 3);
        assert.strictEqual(restoredGame.lastDice2, 5);
    }
    if (fixture.name === 'max-players') {
        assert.strictEqual(restoredGame.players.length, 10);
        assert.strictEqual(restoredGame.currentPlayerIndex, 9);
    }
    if (fixture.name === 'endgame') {
        assert.strictEqual(restoredGame.checkWinner(), restoredGame.players[2]);
        assert.deepStrictEqual(
            Array.from(runtime.GameManager.allowedActionsFor(restoredGame)),
            []
        );
    }
}

runTest('snapshot fixtures は主要状態をserialize/restore/serializeで保持する', () => {
    const runtime = loadGameRuntime();
    const fixtures = makeSnapshotRoundtripFixtures(runtime, makeUndoStateFromMirror);

    assert.deepStrictEqual(fixtures.map(fixture => fixture.name), [
        'initial',
        'build-with-undo',
        'pending',
        'multi-pending-dormant',
        'multiplayer-landmark',
        'max-players',
        'endgame',
    ]);

    for (const fixture of fixtures) {
        const snapshot = serializeMirrorState(
            fixture.game,
            fixture.shopStock,
            fixture.undoState,
            fixture.actionSeq
        );
        const restoredGame = new runtime.GameManager(fixture.game.players.length);
        const restoredStock = {};
        restoreMirrorState(restoredGame, restoredStock, snapshot, runtime.createCardByName);
        const roundtrip = serializeMirrorState(
            restoredGame,
            restoredStock,
            snapshot.undoState,
            snapshot.actionSeq
        );

        assert.deepStrictEqual(roundtrip, snapshot, fixture.name);
        assertRestoredFixtureSemantics(runtime, fixture, restoredGame, snapshot, roundtrip);
    }
});
