'use strict';

const assert = require('assert');
const server = require('../server');
const { runTest } = require('./helpers/test-utils');

const runtime = server.loadGameRuntime();
const SELECTION = Object.freeze({ actionVersion: 1, snapshotVersion: 1 });

function makeRoom(playerCount = 3) {
    const playerNames = Array.from({ length: playerCount }, (_, index) => 'P' + index);
    const room = {
        gameStartPayload: {
            playerNames,
            playerSettings: playerNames.map(() => ({ type: 'human' })),
            playerOrder: playerNames.map((_, index) => index),
            enabledCards: runtime.CARDS.map(card => card.name),
            enabledLandmarks: runtime.Player.landmarkNames(),
            gameSchema: SELECTION,
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
        selection: SELECTION,
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
}

runTest('schema shadow parityはserver mirrorの代表multi-action traceを維持する', () => {
    const landmarks = runtime.Player.landmarkNames();
    const fixtures = [
        {
            name: 'build-undo-next-turn',
            setup(game) { game.phase = runtime.GAME_PHASES.BUILD; game.players[0].coins = 20; },
            actions: [
                ['buildCard', { cardName: '麦畑' }],
                ['undoBuild', {}],
                ['buildLandmark', { name: '駅' }],
                ['nextTurn', {}],
            ],
        },
        {
            name: 'station-dice-selection',
            setup(game) { game.phase = runtime.GAME_PHASES.ROLL; game.players[0].landmarks['駅'] = true; },
            actions: [
                ['rollDice', { forceDice: 1, tunaDice: [1, 1] }],
                ['selectDice', { useTwo: false, d1: 1, d2: 1, tunaDice: [1, 1] }],
            ],
        },
        {
            name: 'pending-tv',
            setup(game) {
                game.phase = runtime.GAME_PHASES.PENDING;
                game.pendingTV = 1;
                game.pendingActionQueue = [{ action: 'resolveTV', field: 'pendingTV' }];
                game.players[1].coins = 8;
            },
            actions: [['resolveTV', { targetIndex: 1 }]],
        },
        {
            name: 'winning-landmark',
            setup(game) {
                game.phase = runtime.GAME_PHASES.BUILD;
                game.players[0].coins = 100;
                for (const name of landmarks) game.players[0].landmarks[name] = true;
                game.players[0].landmarks[landmarks[landmarks.length - 1]] = false;
            },
            actions: [['buildLandmark', { name: landmarks[landmarks.length - 1] }]],
        },
    ];
    for (const fixture of fixtures) {
        const room = makeRoom();
        fixture.setup(room.canonicalMirror.game);
        for (const [action, data] of fixture.actions) {
            applyTraceStep(room, action, data);
        }
        assert.ok(room.actionSeq > 0, fixture.name);
    }
});
