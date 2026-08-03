'use strict';

const assert = require('assert');

const PARITY_PLAYER_COUNTS = Object.freeze([2, 3, 5, 10]);
const SCHEMA_SELECTIONS = Object.freeze([
    Object.freeze({ actionVersion: 0, snapshotVersion: 0 }),
    Object.freeze({ actionVersion: 0, snapshotVersion: 1 }),
    Object.freeze({ actionVersion: 1, snapshotVersion: 0 }),
    Object.freeze({ actionVersion: 1, snapshotVersion: 1 }),
]);

function requireObject(value, name) {
    if (!value || typeof value !== 'object') throw new TypeError(name + ' must be an object');
    return value;
}

function makeGameSchemaParityHarness(server, runtime) {
    requireObject(server, 'server');
    requireObject(runtime, 'runtime');

    function makeRoom(playerCount = 3, selection = SCHEMA_SELECTIONS[0]) {
        const playerNames = Array.from({ length: playerCount }, (_, index) => 'P' + index);
        const room = {
            gameStartPayload: {
                playerNames,
                playerSettings: playerNames.map(() => ({ type: 'human' })),
                playerOrder: playerNames.map((_, index) => index),
                enabledCards: runtime.CARDS.map(card => card.name),
                enabledLandmarks: runtime.Player.landmarkNames(),
                gameSchema: selection,
            },
            stateSnapshot: null,
            actionLog: [],
            actionSeq: 0,
            lastUndoState: null,
        };
        room.canonicalMirror = server.createRoomMirror(room);
        return room;
    }

    function applyTraceStep(room, action, rawData) {
        const mirror = room.canonicalMirror;
        const data = action === 'undoBuild' ? { state: mirror.lastUndoState } : rawData;
        const nextSeq = room.actionSeq + 1;
        const source = server.serializeMirrorState(
            mirror.game, mirror.shopStock, mirror.lastUndoState, room.actionSeq
        );
        const shadow = server.transitionMirrorEnvelope({
            selection: room.gameStartPayload.gameSchema,
            snapshot: source,
            action,
            data,
            actionSeq: nextSeq,
            enabledLandmarks: room.gameStartPayload.enabledLandmarks,
        });
        assert.strictEqual(shadow.ok, true, action + ' shadow rejected: ' + shadow.reason);
        const entry = { action, data, seq: nextSeq, playerIndex: 0 };
        assert.strictEqual(server.applyAcceptedActionToRoomCanonicalMirror(room, mirror, entry), true, action);
        room.actionSeq = nextSeq;
        room.lastUndoState = room.canonicalMirror.lastUndoState || null;
        const live = server.serializeMirrorState(
            room.canonicalMirror.game, room.canonicalMirror.shopStock, room.lastUndoState, nextSeq
        );
        assert.deepStrictEqual(
            JSON.parse(JSON.stringify(shadow.snapshot)),
            JSON.parse(JSON.stringify(live)),
            action + ' shadow/live mismatch'
        );
        assert.strictEqual(
            server.adoptTransitionSnapshotToRoomMirror(room, shadow),
            true,
            action + ' pure snapshot adoption failed'
        );
        room.lastUndoState = room.canonicalMirror.lastUndoState || null;
        const adopted = server.serializeMirrorState(
            room.canonicalMirror.game, room.canonicalMirror.shopStock, room.lastUndoState, nextSeq
        );
        assert.deepStrictEqual(
            JSON.parse(JSON.stringify(adopted)),
            JSON.parse(JSON.stringify(shadow.snapshot)),
            action + ' adopted mirror mismatch'
        );
    }

    function setPending(game, action, field) {
        game.phase = runtime.GAME_PHASES.PENDING;
        game[field] = field === 'pendingIT' ? true : 1;
        game.pendingActionQueue = [{ action, field }];
    }

    return Object.freeze({ makeRoom, applyTraceStep, setPending });
}

module.exports = Object.freeze({
    PARITY_PLAYER_COUNTS,
    SCHEMA_SELECTIONS,
    makeGameSchemaParityHarness,
});
