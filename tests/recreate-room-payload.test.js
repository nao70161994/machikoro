'use strict';

const assert = require('assert');
const RecreateRoomPayload = require('../js/recreateRoomPayload');
const { runTest } = require('./helpers/test-utils');

function restorePayload() {
    return {
        roomId: 'ABC123',
        gameStartPayload: { schemaVersion: 2, playerNames: ['Alice', 'Bob'] },
        stateSnapshot: { phase: 'build' },
        actionLog: [],
        restoreAudit: null,
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken: 'token',
    };
}

runTest('recreate room payloadはflag OFFでlegacy参照とshapeを維持する', () => {
    const payload = restorePayload();
    const encoded = RecreateRoomPayload.encode(false, payload);
    const decoded = RecreateRoomPayload.decode(false, payload);

    assert.strictEqual(encoded.ok, true);
    assert.strictEqual(encoded.value, payload);
    assert.strictEqual(encoded.schemaVersion, RecreateRoomPayload.legacySchemaVersion);
    assert.strictEqual(decoded.value, payload);
});

runTest('recreate room payloadはv1 envelopeをlegacy payloadへroundtripする', () => {
    const payload = restorePayload();
    const before = JSON.stringify(payload);
    const encoded = RecreateRoomPayload.encode(true, payload);

    assert.deepStrictEqual(encoded.value, {
        schemaVersion: 1,
        recreateRoom: payload,
    });
    assert.strictEqual(Object.isFrozen(encoded.value), true);
    const decoded = RecreateRoomPayload.decode(true, encoded.value);
    assert.strictEqual(decoded.ok, true);
    assert.strictEqual(decoded.value, payload);
    assert.strictEqual(decoded.schemaVersion, RecreateRoomPayload.schemaVersion);
    assert.strictEqual(JSON.stringify(payload), before);
});

runTest('recreate room payloadはflag ONでもunwrapped legacyを受理する', () => {
    const payload = restorePayload();
    const decoded = RecreateRoomPayload.decode(true, payload);

    assert.strictEqual(decoded.ok, true);
    assert.strictEqual(decoded.value, payload);
    assert.strictEqual(decoded.schemaVersion, RecreateRoomPayload.legacySchemaVersion);
});

runTest('recreate room payloadは未知versionとmalformed envelopeをfail closedにする', () => {
    assert.strictEqual(
        RecreateRoomPayload.decode(true, { schemaVersion: 99, recreateRoom: restorePayload() }).reason,
        RecreateRoomPayload.failureReasons.UNKNOWN_SCHEMA_VERSION
    );
    for (const value of [
        null,
        [],
        { schemaVersion: 1 },
        { schemaVersion: 1, recreateRoom: null },
        { schemaVersion: 1, recreateRoom: restorePayload(), extra: true },
    ]) {
        assert.strictEqual(
            RecreateRoomPayload.decode(true, value).reason,
            RecreateRoomPayload.failureReasons.INVALID_PAYLOAD
        );
    }
    assert.strictEqual(
        RecreateRoomPayload.encode(true, null).reason,
        RecreateRoomPayload.failureReasons.INVALID_PAYLOAD
    );
});
