const assert = require('assert');
const {
    makeUndoStateFromMirror,
    restoreMirrorState,
    serializeMirrorState,
} = require('../server');
const { loadGameRuntime } = require('./helpers/runtime-loaders');
const { makeSnapshotRoundtripFixtures } = require('./helpers/snapshot-fixtures');
const { runTest } = require('./helpers/test-utils');

runTest('snapshot fixtures は主要状態をserialize/restore/serializeで保持する', () => {
    const runtime = loadGameRuntime();
    const fixtures = makeSnapshotRoundtripFixtures(runtime, makeUndoStateFromMirror);

    assert.deepStrictEqual(fixtures.map(fixture => fixture.name), [
        'initial',
        'build-with-undo',
        'pending',
        'multiplayer-landmark',
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
    }
});
