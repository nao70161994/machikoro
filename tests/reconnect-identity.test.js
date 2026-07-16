const assert = require('assert');
const crypto = require('crypto');
const makeReconnectIdentity = require('../server/reconnectIdentity');
const { runTest } = require('./helpers/test-utils');

runTest('reconnect identity はUUIDとrandomBytes fallbackでtokenを生成する', () => {
    const uuidIdentity = makeReconnectIdentity({
        crypto: { randomUUID: () => 'uuid-token' },
    });
    const bytesIdentity = makeReconnectIdentity({
        crypto: { randomBytes: () => Buffer.from('00112233445566778899aabbccddeeff', 'hex') },
    });

    assert.strictEqual(uuidIdentity.generateReconnectToken(), 'uuid-token');
    assert.strictEqual(bytesIdentity.generateReconnectToken(), '00112233445566778899aabbccddeeff');
});

runTest('reconnect identity はtoken hashと期待hashの既存優先順位を維持する', () => {
    const identity = makeReconnectIdentity({ crypto });
    const directHash = 'a'.repeat(64);
    const room = {
        players: [
            { index: 0, name: 'Alice', reconnectTokenHash: directHash, reconnectToken: 'old-token' },
            { index: 1, name: 'Bob', reconnectToken: 'legacy-token' },
        ],
        gameStartPayload: {
            playerNames: ['Alice', 'Bob', 'Carol'],
            reconnectTokenHashes: ['b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)],
        },
    };

    assert.strictEqual(identity.hashReconnectToken(''), '');
    assert.strictEqual(identity.getExpectedReconnectTokenHash(room, 0, 'Alice'), directHash);
    assert.strictEqual(identity.getExpectedReconnectTokenHash(room, 1, 'Bob'), identity.hashReconnectToken('legacy-token'));
    assert.strictEqual(identity.getExpectedReconnectTokenHash(room, 2, 'Carol'), 'd'.repeat(64));
    assert.strictEqual(identity.getExpectedReconnectTokenHash(room, 2, 'Wrong'), '');
});

runTest('reconnect identity はhumanにhashを必須化しCPUだけ空hashを許可する', () => {
    const identity = makeReconnectIdentity({ crypto });
    const validHash = 'e'.repeat(64);
    const payload = {
        playerNames: ['Alice', 'CPU1'],
        playerSettings: [{ type: 'human' }, { type: 'cpu' }],
        reconnectTokenHashes: [validHash, ''],
    };

    assert.strictEqual(identity.isValidRestoreReconnectTokenHashes(payload), true);
    assert.strictEqual(identity.isValidRestoreReconnectTokenHashes({ ...payload, reconnectTokenHashes: ['', ''] }), false);
    assert.strictEqual(identity.isValidRestoreReconnectTokenHashes({ ...payload, reconnectTokenHashes: [validHash, 'bad'] }), false);
    assert.strictEqual(identity.isValidRestoreReconnectTokenHashes({ ...payload, reconnectTokenHashes: [validHash] }), false);
});
