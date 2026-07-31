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

runTest('restored room metadata planは通常復元のhost/seqを入力非破壊で固定する', () => {
    const builder = makeRestoredRoom({ sanitizeStateSnapshot: snapshot => snapshot });
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
    const builder = makeRestoredRoom({ sanitizeStateSnapshot: snapshot => snapshot });
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
    const builder = makeRestoredRoom({ sanitizeStateSnapshot: snapshot => snapshot });
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
