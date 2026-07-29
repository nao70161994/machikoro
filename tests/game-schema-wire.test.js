'use strict';

const assert = require('assert');
const GameSchemaWire = require('../js/gameSchemaWire');
const { runTest } = require('./helpers/test-utils');

const LEGACY = Object.freeze({ actionVersion: 0, snapshotVersion: 0 });
const CURRENT = Object.freeze({ actionVersion: 1, snapshotVersion: 1 });

runTest('game schema wireはflag OFFでpayload identityを維持する', () => {
    const payload = { action: 'nextTurn', data: {}, clientActionId: 'client-1' };
    const transformed = GameSchemaWire.encodeAction(false, CURRENT, payload);
    assert.strictEqual(transformed.ok, true);
    assert.strictEqual(transformed.value, payload);
    assert.strictEqual(GameSchemaWire.decodeAction(false, CURRENT, payload).value, payload);
});

runTest('game schema wireはlegacy/currentでtransport metadataを保持する', () => {
    const payload = {
        action: 'resolveHarbor', data: { useBonus: true }, clientActionId: 'client-1', seq: 3,
    };
    const legacy = GameSchemaWire.encodeAction(true, LEGACY, payload);
    assert.deepStrictEqual(legacy.value, payload);
    const current = GameSchemaWire.encodeAction(true, CURRENT, payload);
    assert.deepStrictEqual(current.value, {
        clientActionId: 'client-1', seq: 3, schemaVersion: 1,
        action: 'resolveHarbor', data: { useBonus: true },
    });
    assert.deepStrictEqual(GameSchemaWire.decodeAction(true, CURRENT, current.value).value, payload);
});

runTest('game schema wireはversion不一致とmalformed payloadをfail closedにする', () => {
    assert.strictEqual(GameSchemaWire.decodeAction(true, CURRENT, {
        action: 'nextTurn', data: {},
    }).codecReason, 'version-mismatch');
    assert.strictEqual(GameSchemaWire.decodeAction(true, CURRENT, null).reason,
        GameSchemaWire.failureReasons.INVALID_PAYLOAD);
    assert.strictEqual(GameSchemaWire.encodeAction(true, CURRENT, {
        action: 'unknown', data: {},
    }).reason, GameSchemaWire.failureReasons.CODEC_REJECTED);
});

runTest('game schema wireはSnapshot fieldだけを独立してversion変換する', () => {
    const snapshot = { actionSeq: 4, phase: 'build' };
    const payload = { stateSnapshot: snapshot, actionLog: [], playerIndex: 1 };
    const disabled = GameSchemaWire.encodeSnapshotField(false, CURRENT, payload);
    assert.strictEqual(disabled.value, payload);

    const current = GameSchemaWire.encodeSnapshotField(true, CURRENT, payload);
    assert.deepStrictEqual(current.value, {
        stateSnapshot: { schemaVersion: 1, snapshot },
        actionLog: [],
        playerIndex: 1,
    });
    assert.deepStrictEqual(
        GameSchemaWire.decodeSnapshotField(true, CURRENT, current.value).value,
        payload
    );

    const legacy = GameSchemaWire.encodeSnapshotField(true, LEGACY, payload);
    assert.deepStrictEqual(legacy.value, payload);
});

runTest('game schema wireはSnapshot欠落を保持しversion不一致をfail closedにする', () => {
    const withoutSnapshot = { stateSnapshot: null, actionLog: [] };
    assert.strictEqual(
        GameSchemaWire.encodeSnapshotField(true, CURRENT, withoutSnapshot).value,
        withoutSnapshot
    );
    assert.strictEqual(
        GameSchemaWire.decodeSnapshotField(true, CURRENT, {
            stateSnapshot: { actionSeq: 4 },
        }).codecReason,
        'version-mismatch'
    );
    assert.strictEqual(
        GameSchemaWire.decodeSnapshotField(true, CURRENT, null).reason,
        GameSchemaWire.failureReasons.INVALID_PAYLOAD
    );
});
