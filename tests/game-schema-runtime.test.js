'use strict';

const assert = require('assert');
const GameSchemaNegotiation = require('../js/gameSchemaNegotiation');
const GameSchemaRuntime = require('../server/gameSchemaRuntime');
const { runTest } = require('./helpers/test-utils');

const current = GameSchemaNegotiation.capabilities;

runTest('game schema runtime flagは明示的な有効値だけを受理する', () => {
    assert.strictEqual(GameSchemaRuntime.gameSchemaNegotiationEnabled({}), false);
    assert.strictEqual(GameSchemaRuntime.gameSchemaNegotiationEnabled({ GAME_SCHEMA_NEGOTIATION_ENABLED: 'true' }), true);
    assert.strictEqual(GameSchemaRuntime.gameSchemaNegotiationEnabled({ GAME_SCHEMA_NEGOTIATION_ENABLED: 'OFF' }), false);
});

runTest('game schema runtimeはflag OFFでfieldを無視し既存経路を維持する', () => {
    const result = GameSchemaRuntime.resolveClientGameSchemaCapabilities({ actionVersions: [99] }, false);
    assert.deepStrictEqual(result, { ok: true, capabilities: null, reason: '' });
});

runTest('game schema runtimeは欠落をlegacyとして許可し不正と非互換を拒否する', () => {
    assert.strictEqual(GameSchemaRuntime.resolveClientGameSchemaCapabilities(undefined, true).ok, true);
    assert.strictEqual(GameSchemaRuntime.resolveClientGameSchemaCapabilities({}, true).ok, false);
    assert.strictEqual(GameSchemaRuntime.resolveClientGameSchemaCapabilities({
        actionVersions: [2], snapshotVersions: [0],
    }, true).reason, GameSchemaNegotiation.failureReasons.NO_COMMON_ACTION_VERSION);
});

runTest('game schema runtimeは全human peerの最高共通versionを選びCPUを除外する', () => {
    const room = {
        playerSettings: [{ type: 'human' }, { type: 'cpu' }, { type: 'human' }],
        players: [
            { index: 0, gameSchemaCapabilities: current },
            { index: 2, gameSchemaCapabilities: null },
        ],
    };
    assert.deepStrictEqual(GameSchemaRuntime.roomHumanCapabilityValues(room), [current, null]);
    assert.deepStrictEqual(GameSchemaRuntime.gameSchemaStartMetadata(room, true), {
        actionVersion: 0, snapshotVersion: 0,
    });
    room.players[1].gameSchemaCapabilities = current;
    assert.deepStrictEqual(GameSchemaRuntime.gameSchemaStartMetadata(room, true), {
        actionVersion: 1, snapshotVersion: 1,
    });
    assert.strictEqual(GameSchemaRuntime.gameSchemaStartMetadata(room, false), null);
});

runTest('game schema runtimeは再接続clientがroom選択versionを支えるか検査する', () => {
    const selectedV1 = { actionVersion: 1, snapshotVersion: 1 };
    assert.strictEqual(GameSchemaRuntime.supportsSelectedGameSchema(current, selectedV1), true);
    assert.strictEqual(GameSchemaRuntime.supportsSelectedGameSchema(null, selectedV1), false);
    assert.strictEqual(GameSchemaRuntime.supportsSelectedGameSchema(null, { actionVersion: 0, snapshotVersion: 0 }), true);
    assert.strictEqual(GameSchemaRuntime.supportsSelectedGameSchema(current, null), true);
    assert.strictEqual(GameSchemaRuntime.supportsSelectedGameSchema(current, { actionVersion: -1, snapshotVersion: 1 }), false);
});

runTest('game schema runtimeは参加候補を含むpeer間の共通version欠落を拒否する', () => {
    const room = { players: [{ index: 0, gameSchemaCapabilities: { actionVersions: [1], snapshotVersions: [1] } }] };
    assert.strictEqual(GameSchemaRuntime.negotiateRoomGameSchemaCandidate(
        room, 1, { actionVersions: [0], snapshotVersions: [0] }, true
    ).ok, false);
    assert.strictEqual(GameSchemaRuntime.negotiateRoomGameSchemaCandidate(
        room, 1, { actionVersions: [1], snapshotVersions: [1] }, true
    ).ok, true);
    assert.strictEqual(GameSchemaRuntime.negotiateRoomGameSchemaCandidate(room, 1, null, false).ok, true);
});

runTest('game schema runtimeはflag OFF rollback時に保存済みselectionを強制しない', () => {
    const selectedV1 = { actionVersion: 1, snapshotVersion: 1 };
    assert.strictEqual(GameSchemaRuntime.supportsSelectedGameSchemaForRuntime(null, selectedV1, false), true);
    assert.strictEqual(GameSchemaRuntime.supportsSelectedGameSchemaForRuntime(null, selectedV1, true), false);
    assert.strictEqual(GameSchemaRuntime.supportsSelectedGameSchemaForRuntime(current, selectedV1, true), true);
});

runTest('game schema wire flagは明示値だけを受理する', () => {
    assert.strictEqual(GameSchemaRuntime.gameSchemaWireEnabled({}), false);
    assert.strictEqual(GameSchemaRuntime.gameSchemaWireEnabled({ GAME_SCHEMA_WIRE_ENABLED: 'on' }), true);
    assert.strictEqual(GameSchemaRuntime.gameSchemaWireEnabled({ GAME_SCHEMA_WIRE_ENABLED: 'OFF' }), false);
});

runTest('game schema snapshot wire flagはAction wireと独立して明示値だけを受理する', () => {
    assert.strictEqual(GameSchemaRuntime.gameSchemaSnapshotWireEnabled({}), false);
    assert.strictEqual(GameSchemaRuntime.gameSchemaSnapshotWireEnabled({
        GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED: 'yes',
    }), true);
    assert.strictEqual(GameSchemaRuntime.gameSchemaSnapshotWireEnabled({
        GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED: 'OFF',
        GAME_SCHEMA_WIRE_ENABLED: 'on',
    }), false);
});

runTest('game schema recreate wire flagは独立した明示値だけを受理する', () => {
    assert.strictEqual(GameSchemaRuntime.gameSchemaRecreateWireEnabled({}), false);
    assert.strictEqual(GameSchemaRuntime.gameSchemaRecreateWireEnabled({
        GAME_SCHEMA_RECREATE_WIRE_ENABLED: 'yes',
    }), true);
    assert.strictEqual(GameSchemaRuntime.gameSchemaRecreateWireEnabled({
        GAME_SCHEMA_RECREATE_WIRE_ENABLED: 'OFF',
        GAME_SCHEMA_WIRE_ENABLED: 'on',
    }), false);
});

runTest('local save schema write flagは独立した明示値だけを受理する', () => {
    assert.strictEqual(GameSchemaRuntime.localSaveSchemaWriteEnabled({}), false);
    assert.strictEqual(GameSchemaRuntime.localSaveSchemaWriteEnabled({
        LOCAL_SAVE_SCHEMA_WRITE_ENABLED: 'yes',
    }), true);
    assert.strictEqual(GameSchemaRuntime.localSaveSchemaWriteEnabled({
        LOCAL_SAVE_SCHEMA_WRITE_ENABLED: 'OFF',
        GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED: 'on',
    }), false);
});
