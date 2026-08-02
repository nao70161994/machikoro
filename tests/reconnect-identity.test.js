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

runTest('reconnect identity は一致tokenで既存playerを再接続しlegacy hashを補完する', () => {
    const identity = makeReconnectIdentity({ crypto });
    const legacyToken = 'legacy-token';
    const room = {
        players: [{ index: 0, name: 'Alice', reconnectToken: legacyToken }],
        gameStartPayload: { playerNames: ['Alice'], reconnectTokenHashes: [''] },
    };

    const player = identity.resolveRejoinPlayer(room, 0, 'Alice', legacyToken, 'new-socket');
    assert.strictEqual(player, room.players[0]);
    assert.strictEqual(player.id, 'new-socket');
    assert.strictEqual(player.reconnectTokenHash, identity.hashReconnectToken(legacyToken));
});

runTest('reconnect identity は復元playerを追加しtoken不一致ではroomを変更しない', () => {
    const identity = makeReconnectIdentity({ crypto });
    const token = 'restored-token';
    const room = {
        players: [],
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            reconnectTokenHashes: [identity.hashReconnectToken('alice-token'), identity.hashReconnectToken(token)],
        },
    };

    assert.strictEqual(identity.resolveRejoinPlayer(room, 1, 'Bob', 'wrong', 'socket-b'), null);
    assert.deepStrictEqual(room.players, []);
    const restored = identity.resolveRejoinPlayer(room, 1, 'Bob', token, 'socket-b');
    assert.deepStrictEqual(restored, {
        id: 'socket-b',
        index: 1,
        name: 'Bob',
        reconnectToken: '',
        reconnectTokenHash: identity.hashReconnectToken(token),
    });
    assert.strictEqual(room.players.length, 1);
});
