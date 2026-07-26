'use strict';

const assert = require('assert');
const { registerRejoinSocketHandler } = require('../server/rejoinSocketHandler');
const { runTest } = require('./helpers/test-utils');

function makeFixture(overrides = {}) {
    const handlers = {};
    const events = [];
    const room = { started: true, lastTouchedAt: 0 };
    const socket = {
        id: 'new-socket',
        on(event, handler) { handlers[event] = handler; events.push(['on', event]); },
        join(roomId) { events.push(['join', roomId]); },
        emit(event, payload) { events.push(['socket.emit', event, payload]); },
    };
    const dependencies = {
        requirePlainSocketPayload() { events.push(['plain']); return true; },
        isValidRoomId() { events.push(['room-id']); return true; },
        emitAppError(_socket, message) { events.push(['error', message]); },
        rooms: { ROOM01: room },
        getExpectedReconnectTokenHash() { events.push(['expected-hash']); return 'hash'; },
        hashReconnectToken() { events.push(['hash-token']); return 'hash'; },
        detachExistingPlayerSocket() { events.push(['detach']); },
        resolveRejoinPlayer() { events.push(['resolve']); return { index: 1, name: 'Bob' }; },
        buildRejoinDataPayload() { events.push(['payload']); return { state: 'canonical' }; },
        io: {
            to(roomId) {
                events.push(['io.to', roomId]);
                return { emit(event, payload) { events.push(['io.emit', event, payload]); } };
            },
        },
        now() { events.push(['now']); return 1234; },
        log(message) { events.push(['log', message]); },
        ...overrides,
    };
    registerRejoinSocketHandler(socket, dependencies);
    return { handlers, events, room, socket };
}

const validPayload = Object.freeze({
    roomId: 'ROOM01',
    playerIndex: 1,
    playerName: 'Bob',
    reconnectToken: 'token',
    clientVersion: 'v1',
    hostlessRestoreVersion: 1,
});

runTest('rejoin socket handler registers only the existing event', () => {
    const fixture = makeFixture();
    assert.deepStrictEqual(Object.keys(fixture.handlers), ['rejoinRoom']);
    assert.deepStrictEqual(fixture.events, [['on', 'rejoinRoom']]);
});

runTest('rejoin handler preserves validation, attach, emit, and log order', () => {
    const fixture = makeFixture();
    fixture.events.length = 0;
    fixture.handlers.rejoinRoom(validPayload);

    assert.deepStrictEqual(fixture.events, [
        ['plain'],
        ['room-id'],
        ['expected-hash'],
        ['hash-token'],
        ['detach'],
        ['resolve'],
        ['join', 'ROOM01'],
        ['now'],
        ['payload'],
        ['socket.emit', 'rejoinData', { state: 'canonical' }],
        ['io.to', 'ROOM01'],
        ['io.emit', 'playerRejoined', { playerIndex: 1, playerName: 'Bob' }],
        ['log', '再接続: Bob (ルーム: ROOM01)'],
    ]);
    assert.strictEqual(fixture.socket.roomId, 'ROOM01');
    assert.strictEqual(fixture.socket.playerIndex, 1);
    assert.strictEqual(fixture.socket.clientVersion, 'v1');
    assert.strictEqual(fixture.socket.hostlessRestoreVersion, 1);
    assert.strictEqual(fixture.room.lastTouchedAt, 1234);
});

runTest('rejoin handler fails closed before detaching on token mismatch', () => {
    const fixture = makeFixture({ hashReconnectToken() { fixture.events.push(['hash-token']); return 'other'; } });
    fixture.events.length = 0;
    fixture.handlers.rejoinRoom(validPayload);

    assert.deepStrictEqual(fixture.events, [
        ['plain'],
        ['room-id'],
        ['expected-hash'],
        ['hash-token'],
        ['error', 'INVALID_TOKEN'],
    ]);
    assert.strictEqual(fixture.socket.roomId, undefined);
});

runTest('rejoin handler rejects malformed payload without session mutation', () => {
    const fixture = makeFixture({ requirePlainSocketPayload() { fixture.events.push(['plain']); return false; } });
    fixture.events.length = 0;
    fixture.handlers.rejoinRoom(null);
    assert.deepStrictEqual(fixture.events, [['plain']]);
    assert.strictEqual(fixture.socket.clientVersion, undefined);
});
