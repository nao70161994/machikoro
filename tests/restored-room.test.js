'use strict';

const assert = require('assert');
const makeRestoredRoom = require('../server/restoredRoom');
const { runTest } = require('./helpers/test-utils');

function fixture(overrides = {}) {
    const gameStartPayload = { playerNames: ['Alice', 'Bob'] };
    return {
        roomId: 'ROOM01',
        restoredPlayers: [{ id: 'socket-a', index: 0 }],
        playerSettings: [{ type: 'human' }, { type: 'cpu', difficulty: 'normal' }],
        playerNames: gameStartPayload.playerNames,
        playerIndex: 0,
        restoredHostEpoch: 3,
        restoredActionSeq: 8,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 900,
        gameStartPayload,
        replayStateSnapshot: { actionSeq: 7 },
        sanitizedActionLog: [{ action: 'nextTurn', actionSeq: 8 }],
        now: 12345,
        approvedHostless: false,
        hostlessRestoreGeneration: 2,
        hostlessRestoreCount: 1,
        candidateCount: 4,
        ...overrides,
    };
}

runTest('restored mirror state planはmirror結果をcanonical snapshotへ副作用なく畳み込む', () => {
    const calls = [];
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState(game, shopStock, undoState, actionSeq) {
            calls.push([game, shopStock, undoState, actionSeq]);
            return { canonical: true, actionSeq };
        },
    });
    const mirror = {
        game: { phase: 'build' },
        shopStock: { 麦畑: 4 },
        lastUndoState: { action: 'buildCard' },
    };
    const plan = builder.buildRestoredMirrorStatePlan({ mirror, actionSeq: 8 });
    assert.deepStrictEqual(calls, [[
        mirror.game,
        mirror.shopStock,
        mirror.lastUndoState,
        8,
    ]]);
    assert.deepStrictEqual(plan, {
        canonicalMirror: mirror,
        lastUndoState: mirror.lastUndoState,
        stateSnapshot: { canonical: true, actionSeq: 8 },
        actionLog: [],
    });
    assert.strictEqual(plan.canonicalMirror, mirror);
    assert.notStrictEqual(plan.actionLog, builder.buildRestoredMirrorStatePlan({
        mirror,
        actionSeq: 8,
    }).actionLog);
});

runTest('restored mirror state planはserializer欠落を実行前に拒否する', () => {
    const builder = makeRestoredRoom({ sanitizeStateSnapshot: snapshot => snapshot });
    assert.throws(() => builder.buildRestoredMirrorStatePlan({
        mirror: { game: {}, shopStock: {} },
        actionSeq: 0,
    }), /serializeMirrorState/);
});

runTest('restored room activation planは新規・置換・hostless拒否をpureに分ける', () => {
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState: () => null,
    });
    assert.deepStrictEqual(builder.planRestoredRoomActivation({
        roomExists: false,
        approvedHostless: false,
    }), {
        decision: builder.activationDecisions.INSTALL_NEW,
        detachExisting: false,
        deleteExisting: false,
        install: true,
    });
    assert.deepStrictEqual(builder.planRestoredRoomActivation({
        roomExists: true,
        approvedHostless: false,
    }), {
        decision: builder.activationDecisions.REPLACE_EXISTING,
        detachExisting: true,
        deleteExisting: true,
        install: true,
    });
    assert.deepStrictEqual(builder.planRestoredRoomActivation({
        roomExists: true,
        approvedHostless: true,
    }), {
        decision: builder.activationDecisions.REJECT_EXISTING_HOSTLESS,
        detachExisting: false,
        deleteExisting: false,
        install: false,
    });
});

runTest('restored room metadata planは通常復元のhost/seqを入力非破壊で固定する', () => {
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState: () => null,
    });
    const input = {
        playerIndex: 1,
        hostEpoch: 4,
        actionSeq: 9,
        approvedHostless: false,
        hostlessRestoreGeneration: 2,
        hostlessRestoreCount: 3,
    };
    const plan = builder.planRestoredRoomMetadata(input);
    assert.deepStrictEqual(plan, {
        hostPlayerIndex: 1,
        hostEpoch: 4,
        actionSeq: 9,
        applyHostlessMetadata: false,
        hostlessRestoreGeneration: 2,
        hostlessRestoreCount: 3,
    });
    assert.strictEqual(Object.isFrozen(plan), true);
    assert.deepStrictEqual(input, {
        playerIndex: 1,
        hostEpoch: 4,
        actionSeq: 9,
        approvedHostless: false,
        hostlessRestoreGeneration: 2,
        hostlessRestoreCount: 3,
    });
});

runTest('restored room metadata planはhostless復元だけepochと世代を一度進める', () => {
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState: () => null,
    });
    assert.deepStrictEqual(builder.planRestoredRoomMetadata({
        playerIndex: 1,
        hostEpoch: 4,
        actionSeq: 9,
        approvedHostless: true,
        hostlessRestoreGeneration: 2,
        hostlessRestoreCount: 3,
    }), {
        hostPlayerIndex: 1,
        hostEpoch: 5,
        actionSeq: 9,
        applyHostlessMetadata: true,
        hostlessRestoreGeneration: 3,
        hostlessRestoreCount: 4,
    });
});

runTest('restored room builderは検証済み入力を既存room shapeへ写像する', () => {
    const sanitizeCalls = [];
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot(snapshot, playerCount) {
            sanitizeCalls.push([snapshot, playerCount]);
            return { sanitized: true, actionSeq: snapshot.actionSeq };
        },
    });
    const input = fixture();
    const before = JSON.parse(JSON.stringify(input));
    const room = builder.buildRestoredRoom(input);

    assert.deepStrictEqual(sanitizeCalls, [[input.replayStateSnapshot, 2]]);
    assert.deepStrictEqual(room, {
        roomId: 'ROOM01',
        players: input.restoredPlayers,
        playerSettings: input.playerSettings,
        maxPlayers: 2,
        started: true,
        restored: true,
        hostPlayerIndex: 0,
        hostEpoch: 3,
        actionSeq: 8,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 900,
        gameStartPayload: input.gameStartPayload,
        stateSnapshot: { sanitized: true, actionSeq: 7 },
        acceptedClientActions: {},
        actionLog: input.sanitizedActionLog,
        lastUndoState: null,
        lastTouchedAt: 12345,
        provisionalRestore: false,
        hostlessRestoreGeneration: 2,
        hostlessRestoreCount: 1,
        hostlessRestoreCandidateCount: 0,
    });
    assert.strictEqual(room.players, input.restoredPlayers);
    assert.strictEqual(room.playerSettings, input.playerSettings);
    assert.strictEqual(room.gameStartPayload, input.gameStartPayload);
    assert.strictEqual(room.actionLog, input.sanitizedActionLog);
    assert.deepStrictEqual(input, before);
});

runTest('restored room builderはhostless metadataと既存fallback値を維持する', () => {
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState: () => null,
    });
    const room = builder.buildRestoredRoom(fixture({
        approvedHostless: true,
        candidateCount: 3,
        enabledCards: null,
        enabledLandmarks: null,
        cpuSpeed: 0,
        hostlessRestoreGeneration: 0,
        hostlessRestoreCount: 0,
    }));
    assert.deepStrictEqual(room.enabledCards, []);
    assert.deepStrictEqual(room.enabledLandmarks, []);
    assert.strictEqual(room.cpuSpeed, 1500);
    assert.strictEqual(room.provisionalRestore, true);
    assert.strictEqual(room.hostlessRestoreGeneration, 0);
    assert.strictEqual(room.hostlessRestoreCount, 0);
    assert.strictEqual(room.hostlessRestoreCandidateCount, 3);
});

runTest('restored room builderはsanitize dependency欠落を副作用前に拒否する', () => {
    assert.throws(() => makeRestoredRoom(), /sanitizeStateSnapshot/);
});
