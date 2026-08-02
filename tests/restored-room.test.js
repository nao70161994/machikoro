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

runTest('restored mirror state plan適用は既存代入順と参照を維持する', () => {
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState: () => null,
    });
    const writes = [];
    const restoredRoom = new Proxy({ roomId: 'ROOM01' }, {
        set(room, property, value) {
            writes.push([property, value]);
            room[property] = value;
            return true;
        },
    });
    const mirrorStatePlan = {
        canonicalMirror: { game: {} },
        lastUndoState: { action: 'buildCard' },
        stateSnapshot: { actionSeq: 8 },
        actionLog: [],
    };

    const result = builder.applyRestoredMirrorStatePlan(restoredRoom, mirrorStatePlan);

    assert.strictEqual(result, restoredRoom);
    assert.deepStrictEqual(writes, [
        ['canonicalMirror', mirrorStatePlan.canonicalMirror],
        ['lastUndoState', mirrorStatePlan.lastUndoState],
        ['stateSnapshot', mirrorStatePlan.stateSnapshot],
        ['actionLog', mirrorStatePlan.actionLog],
    ]);
    assert.strictEqual(restoredRoom.roomId, 'ROOM01');
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

runTest('restored room activation effect authorityは明示opt-inだけを許可する', () => {
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState: () => null,
    });
    for (const value of [undefined, '', '0', 'false', 'off']) {
        assert.strictEqual(builder.activationEffectAuthorityEnabled({
            RESTORED_ROOM_ACTIVATION_EFFECT_AUTHORITY_ENABLED: value,
        }), false);
    }
    for (const value of ['1', 'true', 'TRUE']) {
        assert.strictEqual(builder.activationEffectAuthorityEnabled({
            RESTORED_ROOM_ACTIVATION_EFFECT_AUTHORITY_ENABLED: value,
        }), true);
    }
});

runTest('restored room activation executorはdetach・delete・install順を固定する', () => {
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState: () => null,
    });
    const calls = [];
    const executed = builder.executeRestoredRoomActivation(
        builder.planRestoredRoomActivation({ roomExists: true, approvedHostless: false }),
        {
            detachExisting: () => calls.push('detach'),
            deleteExisting: () => calls.push('delete'),
            install: () => calls.push('install'),
        }
    );
    assert.deepStrictEqual(calls, ['detach', 'delete', 'install']);
    assert.deepStrictEqual(executed, ['detachExisting', 'deleteExisting', 'install']);
    assert.strictEqual(Object.isFrozen(executed), true);
});

runTest('restored room activation executorはeffect欠落時に部分実行しない', () => {
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState: () => null,
    });
    const calls = [];
    assert.throws(() => builder.executeRestoredRoomActivation(
        builder.planRestoredRoomActivation({ roomExists: true, approvedHostless: false }),
        {
            detachExisting: () => calls.push('detach'),
            deleteExisting: () => calls.push('delete'),
        }
    ), /install effect is required/);
    assert.deepStrictEqual(calls, []);
});

runTest('restored room delivery effect authorityは明示opt-inだけを許可する', () => {
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState: () => null,
    });
    for (const value of [undefined, '', '0', 'false', 'off']) {
        assert.strictEqual(builder.deliveryEffectAuthorityEnabled({
            RESTORED_ROOM_DELIVERY_EFFECT_AUTHORITY_ENABLED: value,
        }), false);
    }
    for (const value of ['1', 'true', 'TRUE']) {
        assert.strictEqual(builder.deliveryEffectAuthorityEnabled({
            RESTORED_ROOM_DELIVERY_EFFECT_AUTHORITY_ENABLED: value,
        }), true);
    }
});

runTest('restored room delivery executorはpersistからrejoinDataまでの順を固定する', () => {
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState: () => null,
    });
    const calls = [];
    const executed = builder.executeRestoredRoomDelivery({
        persist: () => calls.push('persist'),
        joinSocket: () => calls.push('join'),
        assignSocketRoom: () => calls.push('room'),
        assignSocketPlayer: () => calls.push('player'),
        emitRejoinData: () => calls.push('emit'),
    });
    assert.deepStrictEqual(calls, ['persist', 'join', 'room', 'player', 'emit']);
    assert.deepStrictEqual(executed, [
        'persist',
        'joinSocket',
        'assignSocketRoom',
        'assignSocketPlayer',
        'emitRejoinData',
    ]);
    assert.strictEqual(Object.isFrozen(executed), true);
});

runTest('restored room delivery executorはeffect欠落時に部分実行しない', () => {
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState: () => null,
    });
    const calls = [];
    assert.throws(() => builder.executeRestoredRoomDelivery({
        persist: () => calls.push('persist'),
        joinSocket: () => calls.push('join'),
        assignSocketRoom: () => calls.push('room'),
        assignSocketPlayer: () => calls.push('player'),
    }), /emitRejoinData effect is required/);
    assert.deepStrictEqual(calls, []);
});

runTest('restored room completion planは通常復元のlogと戻り値をpureに組み立てる', () => {
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState: () => null,
    });
    assert.deepStrictEqual(builder.planRestoredRoomCompletion({
        roomId: 'ROOM01',
        playerName: 'Alice',
        playerIndex: 1,
        approvedHostless: false,
        restoredRoom: {},
    }), {
        logMessage: 'ルーム復元: ROOM01 by Alice(1)',
        result: { ok: true, roomId: 'ROOM01', provisionalRestore: false },
    });
});

runTest('restored room completion planはhostless logを匿名room IDで固定する', () => {
    const calls = [];
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState: () => null,
        hostlessRestoreRoomLogId(roomId) {
            calls.push(roomId);
            return 'hash:abc';
        },
    });
    const restoredRoom = {
        hostlessRestoreCandidateCount: 3,
        hostlessRestoreGeneration: 4,
    };
    assert.deepStrictEqual(builder.planRestoredRoomCompletion({
        roomId: 'ROOM01',
        playerName: 'Alice',
        playerIndex: 1,
        approvedHostless: true,
        restoredRoom,
    }), {
        logMessage: '[hostless-restore] roomHash=hash:abc candidates=3 generation=4 result=approved',
        result: { ok: true, roomId: 'ROOM01', provisionalRestore: true },
    });
    assert.deepStrictEqual(calls, ['ROOM01']);
});

runTest('restored room completion planはhostless匿名化dependency欠落を拒否する', () => {
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState: () => null,
    });
    assert.throws(() => builder.planRestoredRoomCompletion({
        roomId: 'ROOM01',
        approvedHostless: true,
        restoredRoom: {},
    }), /hostlessRestoreRoomLogId dependency is required/);
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

runTest('restored room metadata適用は通常復元の代入順とpayload同一性を維持する', () => {
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState: () => null,
    });
    const writes = [];
    const target = new Proxy({ generation: 7, count: 8 }, {
        set(payload, property, value) {
            writes.push([property, value]);
            payload[property] = value;
            return true;
        },
    });
    const result = builder.applyRestoredRoomMetadata(target, {
        hostPlayerIndex: 1,
        hostEpoch: 4,
        actionSeq: 9,
        applyHostlessMetadata: false,
        hostlessRestoreGeneration: 3,
        hostlessRestoreCount: 4,
    }, {
        hostlessRestoreGenerationField: 'generation',
        hostlessRestoreCountField: 'count',
    });

    assert.strictEqual(result, target);
    assert.deepStrictEqual(writes, [
        ['hostPlayerIndex', 1],
        ['hostEpoch', 4],
        ['actionSeq', 9],
    ]);
    assert.strictEqual(target.generation, 7);
    assert.strictEqual(target.count, 8);
});

runTest('restored room metadata適用はhostless項目を既存順で追記する', () => {
    const builder = makeRestoredRoom({
        sanitizeStateSnapshot: snapshot => snapshot,
        serializeMirrorState: () => null,
    });
    const writes = [];
    const target = new Proxy({}, {
        set(payload, property, value) {
            writes.push([property, value]);
            payload[property] = value;
            return true;
        },
    });
    const result = builder.applyRestoredRoomMetadata(target, {
        hostPlayerIndex: 2,
        hostEpoch: 6,
        actionSeq: 10,
        applyHostlessMetadata: true,
        hostlessRestoreGeneration: 4,
        hostlessRestoreCount: 5,
    }, {
        hostlessRestoreGenerationField: 'generation',
        hostlessRestoreCountField: 'count',
    });

    assert.strictEqual(result, target);
    assert.deepStrictEqual(writes, [
        ['hostPlayerIndex', 2],
        ['hostEpoch', 6],
        ['actionSeq', 10],
        ['generation', 4],
        ['count', 5],
    ]);
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
