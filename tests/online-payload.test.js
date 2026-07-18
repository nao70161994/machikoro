const assert = require('assert');
const { OnlinePayload } = require('../js/onlinePayload');
const { runTest } = require('./helpers/test-utils');

runTest('online payload は再接続wire fieldを既存順序と値で生成する', () => {
    assert.deepStrictEqual(OnlinePayload.buildRejoin({
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Alice',
        reconnectToken: 'token-1',
        ignored: 'not-on-wire',
    }, 'build-123'), {
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Alice',
        reconnectToken: 'token-1',
        clientVersion: 'build-123',
        hostlessRestoreVersion: 1,
    });
});

runTest('online payload は欠落sessionも旧undefined field契約を維持する', () => {
    assert.deepStrictEqual(OnlinePayload.buildRejoin(null, 'unknown'), {
        roomId: null,
        playerIndex: null,
        playerName: null,
        reconnectToken: null,
        clientVersion: 'unknown',
        hostlessRestoreVersion: 1,
    });
});

runTest('online payload はhostless capabilityをfrozen定数で公開する', () => {
    assert.strictEqual(OnlinePayload.hostlessRestoreVersion, 1);
});
