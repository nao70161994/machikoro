'use strict';

const assert = require('assert');
const GameSchemaRecreateWire = require('../js/gameSchemaRecreateWire');
const { runTest } = require('./helpers/test-utils');

const LEGACY = Object.freeze({ actionVersion: 0, snapshotVersion: 0 });
const CURRENT = Object.freeze({ actionVersion: 1, snapshotVersion: 1 });

function restorePayload(selection = CURRENT) {
    return {
        roomId: 'ABC123',
        gameStartPayload: { gameSchema: selection, actionSeq: 8 },
        stateSnapshot: { actionSeq: 7, phase: 'build' },
        actionLog: [{
            action: 'nextTurn',
            data: {},
            playerIndex: 1,
            seq: 8,
            clientActionId: 'client-8',
            restoreActionAudit: { signature: 'action-audit' },
        }],
        restoreAudit: { signature: 'snapshot-audit' },
        playerIndex: 1,
    };
}

runTest('recreate schema wireはflag OFFでpayload identityを維持する', () => {
    const payload = restorePayload();
    assert.strictEqual(GameSchemaRecreateWire.encode(false, payload).value, payload);
    assert.strictEqual(GameSchemaRecreateWire.decode(false, payload).value, payload);
});

runTest('recreate schema wireは未包装legacyを選択versionに関係なく変更しない', () => {
    const payload = restorePayload(CURRENT);
    const decoded = GameSchemaRecreateWire.decode(true, payload);
    assert.strictEqual(decoded.ok, true);
    assert.strictEqual(decoded.value, payload);
});

runTest('recreate schema wireはlegacy選択の内部形式を維持して外枠だけversion化する', () => {
    const payload = restorePayload(LEGACY);
    const encoded = GameSchemaRecreateWire.encode(true, payload);
    assert.strictEqual(encoded.ok, true);
    assert.strictEqual(encoded.value.schemaVersion, 1);
    assert.deepStrictEqual(encoded.value.recreateRoom, payload);
    assert.deepStrictEqual(GameSchemaRecreateWire.decode(true, encoded.value).value, payload);
});

runTest('recreate schema wireはSnapshotとaction logをmetadata込みで可逆変換する', () => {
    const payload = restorePayload(CURRENT);
    const before = JSON.parse(JSON.stringify(payload));
    const encoded = GameSchemaRecreateWire.encode(true, payload);
    assert.strictEqual(encoded.ok, true);
    assert.deepStrictEqual(encoded.value.recreateRoom.stateSnapshot, {
        schemaVersion: 1,
        snapshot: payload.stateSnapshot,
    });
    assert.deepStrictEqual(encoded.value.recreateRoom.actionLog[0], {
        playerIndex: 1,
        seq: 8,
        clientActionId: 'client-8',
        restoreActionAudit: { signature: 'action-audit' },
        schemaVersion: 1,
        action: 'nextTurn',
        data: {},
    });
    assert.deepStrictEqual(encoded.value.recreateRoom.restoreAudit, payload.restoreAudit);
    assert.deepStrictEqual(GameSchemaRecreateWire.decode(true, encoded.value).value, payload);
    assert.deepStrictEqual(payload, before);
});

runTest('recreate schema wireは不正な内部versionと形式をfail closedにする', () => {
    const payload = restorePayload(CURRENT);
    const encoded = GameSchemaRecreateWire.encode(true, payload).value;
    encoded.recreateRoom.stateSnapshot.schemaVersion = 99;
    const invalidSnapshot = GameSchemaRecreateWire.decode(true, encoded);
    assert.strictEqual(invalidSnapshot.reason,
        GameSchemaRecreateWire.failureReasons.SNAPSHOT_CODEC_REJECTED);
    assert.strictEqual(invalidSnapshot.codecReason, 'invalid-snapshot');

    const invalidActionPayload = restorePayload(CURRENT);
    invalidActionPayload.actionLog = [{ action: 'unknown', data: {} }];
    assert.strictEqual(
        GameSchemaRecreateWire.encode(true, invalidActionPayload).reason,
        GameSchemaRecreateWire.failureReasons.ACTION_CODEC_REJECTED
    );
    const invalidLog = restorePayload(CURRENT);
    invalidLog.actionLog = null;
    assert.strictEqual(
        GameSchemaRecreateWire.encode(true, invalidLog).reason,
        GameSchemaRecreateWire.failureReasons.INVALID_PAYLOAD
    );
});
