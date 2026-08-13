'use strict';

const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const makeRestorePreparation = require('../server/restorePreparation');

function makeHarness(overrides = {}) {
    const calls = [];
    const captured = {};
    const normalizedSettings = [{ type: 'human' }, { type: 'human' }];
    const restoredPlayers = [{ index: 0 }, { index: 1 }];
    const sanitizedActionLog = [{ action: 'nextTurn', seq: 8 }];
    const restoredRank = { hostEpoch: 3, actionSeq: 8 };
    const restoredMetadata = { hostEpoch: 3, actionSeq: 8 };
    const restoredRoom = { roomId: 'ROOM01' };
    const dependencies = {
        planGameStartAdmission(payload) {
            calls.push('game-start');
            captured.gameStartAdmission = payload;
            return { ok: true, playerNames: ['Alice', 'Bob'], playerSettings: normalizedSettings };
        },
        planIdentityAdmission(payload) {
            calls.push('identity');
            captured.identity = payload;
            return { ok: true, restoredPlayers };
        },
        planReplayAdmission(payload) {
            calls.push('replay');
            captured.replay = payload;
            return { ok: true, sanitizedActionLog, restoredRank };
        },
        planRoomMetadata(payload) {
            calls.push('metadata');
            captured.metadata = payload;
            return restoredMetadata;
        },
        applyRoomMetadata(payload, metadata, fields) {
            calls.push('apply-metadata');
            captured.appliedMetadata = { payload, metadata, fields };
            payload[fields.hostlessRestoreGenerationField] = metadata.hostEpoch;
            payload[fields.hostlessRestoreCountField] = metadata.actionSeq;
        },
        buildRoom(payload) {
            calls.push('build');
            captured.build = payload;
            return restoredRoom;
        },
        prepareMirror(room, effects) {
            calls.push('mirror');
            captured.mirror = { room, effects };
            return { ok: true };
        },
        rememberAcceptedAction() {},
        createMirror() {},
        buildMirrorStatePlan() {},
        applyMirrorStatePlan() {},
        now() { calls.push('now'); return 1234; },
        hostlessRestoreGenerationField: 'restoreGeneration',
        hostlessRestoreCountField: 'restoreCount',
        ...overrides,
    };
    return {
        calls,
        captured,
        dependencies,
        normalizedSettings,
        restoredPlayers,
        sanitizedActionLog,
        restoredRank,
        restoredMetadata,
        restoredRoom,
        coordinator: makeRestorePreparation(dependencies),
    };
}

function input(overrides = {}) {
    return {
        roomId: 'ROOM01',
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken: 'token',
        approvedHostless: true,
        socketId: 'socket-1',
        gameStartPayload: {
            playerSettings: [{ type: 'legacy' }],
            enabledCards: ['wheat'],
            enabledLandmarks: ['station'],
            cpuSpeed: 250,
            gameGeneration: 2,
            restoreGeneration: 5,
            restoreCount: 2,
        },
        stateSnapshot: { source: 'state' },
        replayStateSnapshot: { source: 'replay' },
        actionLog: [{ action: 'nextTurn' }],
        canonicalRecord: null,
        clientSnapshotTrusted: true,
        candidateCount: 4,
        ...overrides,
    };
}

runTest('restore preparationは依存不足を処理開始前に拒否する', () => {
    const harness = makeHarness();
    assert.throws(
        () => makeRestorePreparation({ ...harness.dependencies, buildRoom: null }),
        /buildRoom dependency is required/
    );
    assert.deepStrictEqual(harness.calls, []);
});

runTest('restore preparationはgame-start拒否後のidentity以降を呼ばない', () => {
    const rejection = Object.freeze({ ok: false, errorMessage: 'game-start-error' });
    const harness = makeHarness({
        planGameStartAdmission() { harness.calls.push('game-start'); return rejection; },
    });
    assert.strictEqual(harness.coordinator.prepareRestoredRoom(input()), rejection);
    assert.deepStrictEqual(harness.calls, ['game-start']);
});

runTest('restore preparationは設定正規化後のidentity拒否でreplay前に止まる', () => {
    const rejection = Object.freeze({ ok: false, errorMessage: 'identity-error' });
    const harness = makeHarness({
        planIdentityAdmission(payload) {
            harness.calls.push('identity');
            assert.strictEqual(payload.gameStartPayload.playerSettings, harness.normalizedSettings);
            return rejection;
        },
    });
    const restoreInput = input();
    assert.strictEqual(harness.coordinator.prepareRestoredRoom(restoreInput), rejection);
    assert.strictEqual(restoreInput.gameStartPayload.playerSettings, harness.normalizedSettings);
    assert.deepStrictEqual(harness.calls, ['game-start', 'identity']);
});

runTest('restore preparationはreplay拒否後にmetadataとroomを作らない', () => {
    const rejection = Object.freeze({ ok: false, errorMessage: 'replay-error' });
    const harness = makeHarness({
        planReplayAdmission(payload) {
            harness.calls.push('replay');
            harness.captured.replay = payload;
            return rejection;
        },
    });
    assert.strictEqual(harness.coordinator.prepareRestoredRoom(input()), rejection);
    assert.deepStrictEqual(harness.calls, ['game-start', 'identity', 'replay']);
});

runTest('restore preparationはadmissionからmirrorまでの既存順とpayloadを固定する', () => {
    const harness = makeHarness();
    const restoreInput = input();
    const result = harness.coordinator.prepareRestoredRoom(restoreInput);

    assert.deepStrictEqual(harness.calls, [
        'game-start', 'identity', 'replay', 'metadata', 'apply-metadata', 'now', 'build', 'mirror',
    ]);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.gameStartPayload, restoreInput.gameStartPayload);
    assert.strictEqual(result.restoredRoom, harness.restoredRoom);
    assert.strictEqual(Object.isFrozen(result), true);
    assert.strictEqual(harness.captured.identity.socketId, 'socket-1');
    assert.strictEqual(harness.captured.replay.stateSnapshot, restoreInput.stateSnapshot);
    assert.strictEqual(harness.captured.replay.replayStateSnapshot, restoreInput.replayStateSnapshot);
    assert.deepStrictEqual(harness.captured.metadata, {
        playerIndex: 0,
        hostEpoch: 3,
        actionSeq: 8,
        approvedHostless: true,
        hostlessRestoreGeneration: 5,
        hostlessRestoreCount: 2,
    });
    assert.strictEqual(harness.captured.build.restoredPlayers, harness.restoredPlayers);
    assert.strictEqual(harness.captured.build.sanitizedActionLog, harness.sanitizedActionLog);
    assert.strictEqual(harness.captured.build.gameGeneration, 2);
    assert.strictEqual(harness.captured.build.now, 1234);
    assert.strictEqual(harness.captured.build.hostlessRestoreGeneration, 3);
    assert.strictEqual(harness.captured.build.hostlessRestoreCount, 8);
    assert.strictEqual(harness.captured.mirror.room, harness.restoredRoom);
    assert.strictEqual(harness.captured.mirror.effects.createMirror, harness.dependencies.createMirror);
});

runTest('restore preparationはmirror失敗をactivation前の失敗として返す', () => {
    const rejection = Object.freeze({ ok: false, errorMessage: '復元データが壊れています' });
    const harness = makeHarness({
        prepareMirror() { harness.calls.push('mirror'); return rejection; },
    });
    assert.strictEqual(harness.coordinator.prepareRestoredRoom(input()), rejection);
    assert.deepStrictEqual(harness.calls, [
        'game-start', 'identity', 'replay', 'metadata', 'apply-metadata', 'now', 'build', 'mirror',
    ]);
});
