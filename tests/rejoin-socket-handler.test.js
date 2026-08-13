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
        validateSocketCanEnterRoom() { events.push(['room-entry']); return { ok: true }; },
        emitAppError(_socket, message) { events.push(['error', message]); },
        rooms: { ROOM01: room },
        getExpectedReconnectTokenHash() { events.push(['expected-hash']); return 'hash'; },
        hashReconnectToken() { events.push(['hash-token']); return 'hash'; },
        admitRejoin() { events.push(['admit']); return { ok: true, message: '' }; },
        detachExistingPlayerSocket() { events.push(['detach']); },
        resolveRejoinPlayer() { events.push(['resolve']); return { index: 1, name: 'Bob' }; },
        buildRejoinDataPayload() { events.push(['payload']); return { state: 'canonical' }; },
        isRoomHostConnected() { return true; },
        setRoomHostPlayerIndex(_room, playerIndex) { _room.hostPlayerIndex = playerIndex; },
        emitRoomHostChanged() {},
        persistRoomCanonicalState() {},
        pruneExpiredWaitingReservations() {},
        isWaitingReservation(player) { return !!player && !player.id; },
        buildPlayerList(targetRoom) { return targetRoom.players.map(player => player.name); },
        checkGameStart() { events.push(['check-start']); },
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
        ['room-entry'],
        ['expected-hash'],
        ['hash-token'],
        ['admit'],
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
        ['room-entry'],
        ['expected-hash'],
        ['hash-token'],
        ['error', 'INVALID_TOKEN'],
    ]);
    assert.strictEqual(fixture.socket.roomId, undefined);
});

runTest('rejoin handler は別のactive roomからの再参加をidentity検証前に拒否する', () => {
    const fixture = makeFixture({
        validateSocketCanEnterRoom(_socket, roomId) {
            fixture.events.push(['room-entry', roomId]);
            return { ok: false, message: 'すでに別のルームに参加しています' };
        },
    });
    fixture.events.length = 0;
    fixture.handlers.rejoinRoom(validPayload);

    assert.deepStrictEqual(fixture.events, [
        ['plain'],
        ['room-id'],
        ['room-entry', 'ROOM01'],
        ['error', 'すでに別のルームに参加しています'],
    ]);
    assert.strictEqual(fixture.socket.roomId, undefined);
    assert.strictEqual(fixture.room.lastTouchedAt, 0);
});

runTest('rejoin handler は認証済み連投をdetachとpayload生成前に拒否する', () => {
    const fixture = makeFixture({
        admitRejoin() {
            fixture.events.push(['admit']);
            return { ok: false, message: '再接続処理を続けて実行できません' };
        },
    });
    fixture.events.length = 0;
    fixture.handlers.rejoinRoom(validPayload);

    assert.deepStrictEqual(fixture.events, [
        ['plain'], ['room-id'], ['room-entry'], ['expected-hash'], ['hash-token'],
        ['admit'], ['error', '再接続処理を続けて実行できません'],
    ]);
    assert.strictEqual(fixture.socket.roomId, undefined);
    assert.strictEqual(fixture.room.lastTouchedAt, 0);
});

runTest('rejoin handlerは期限内の待機席を同一tokenで復元して開始判定する', () => {
    const fixture = makeFixture();
    fixture.room.started = false;
    fixture.room.players = [{
        id: null, index: 1, name: 'Bob', reconnectToken: 'token', reservedUntil: 9999,
    }];
    fixture.events.length = 0;
    fixture.handlers.rejoinRoom(validPayload);
    assert.strictEqual(fixture.room.players[0].id, 'new-socket');
    assert.strictEqual('reservedUntil' in fixture.room.players[0], false);
    assert.deepStrictEqual(fixture.events, [
        ['plain'], ['room-id'], ['now'], ['room-entry'], ['expected-hash'], ['hash-token'],
        ['now'], ['admit'], ['join', 'ROOM01'], ['now'],
        ['socket.emit', 'roomJoined', {
            roomId: 'ROOM01', playerIndex: 1, reconnectToken: 'token', hostPlayerIndex: undefined,
        }],
        ['io.to', 'ROOM01'], ['io.emit', 'playerList', ['Bob']],
        ['check-start'], ['log', '待機室へ再接続: Bob (ルーム: ROOM01)'],
    ]);
});

runTest('rejoin handlerは期限切れ待機席を復元しない', () => {
    const fixture = makeFixture({
        pruneExpiredWaitingReservations(room) { room.players = []; },
        getExpectedReconnectTokenHash() { fixture.events.push(['expected-hash']); return ''; },
    });
    fixture.room.started = false;
    fixture.room.players = [{ id: null, index: 1, name: 'Bob', reservedUntil: 1 }];
    fixture.events.length = 0;
    fixture.handlers.rejoinRoom(validPayload);
    assert.deepStrictEqual(fixture.events, [
        ['plain'], ['room-id'], ['now'], ['room-entry'], ['expected-hash'], ['error', 'INVALID_TOKEN'],
    ]);
    assert.strictEqual(fixture.socket.roomId, undefined);
});

runTest('rejoin handlerはhost不在時に先着playerをrejoinData前にhostへ再選出する', () => {
    const fixture = makeFixture({
        isRoomHostConnected() {
            fixture.events.push(['host-connected']);
            return false;
        },
        setRoomHostPlayerIndex(room, playerIndex) {
            fixture.events.push(['set-host', playerIndex]);
            room.hostPlayerIndex = playerIndex;
        },
        emitRoomHostChanged(roomId, room) {
            fixture.events.push(['host-changed', roomId, room.hostPlayerIndex]);
        },
        persistRoomCanonicalState(roomId, room, reason) {
            fixture.events.push(['persist', roomId, room.hostPlayerIndex, reason]);
        },
        buildRejoinDataPayload(room) {
            fixture.events.push(['payload', room.hostPlayerIndex]);
            return { hostPlayerIndex: room.hostPlayerIndex };
        },
    });
    fixture.room.hostPlayerIndex = 0;
    fixture.events.length = 0;

    fixture.handlers.rejoinRoom(validPayload);

    assert.strictEqual(fixture.room.hostPlayerIndex, 1);
    assert.deepStrictEqual(fixture.events, [
        ['plain'],
        ['room-id'],
        ['room-entry'],
        ['expected-hash'],
        ['hash-token'],
        ['admit'],
        ['detach'],
        ['resolve'],
        ['join', 'ROOM01'],
        ['host-connected'],
        ['set-host', 1],
        ['host-changed', 'ROOM01', 1],
        ['persist', 'ROOM01', 1, 'host-reselected'],
        ['log', 'ホスト再選出: ROOM01 → プレイヤー1'],
        ['now'],
        ['payload', 1],
        ['socket.emit', 'rejoinData', { hostPlayerIndex: 1 }],
        ['io.to', 'ROOM01'],
        ['io.emit', 'playerRejoined', { playerIndex: 1, playerName: 'Bob' }],
        ['log', '再接続: Bob (ルーム: ROOM01)'],
    ]);
});

runTest('rejoin handler rejects malformed payload without session mutation', () => {
    const fixture = makeFixture({ requirePlainSocketPayload() { fixture.events.push(['plain']); return false; } });
    fixture.events.length = 0;
    fixture.handlers.rejoinRoom(null);
    assert.deepStrictEqual(fixture.events, [['plain']]);
    assert.strictEqual(fixture.socket.clientVersion, undefined);
});

runTest('rejoin handler は認証後にschema capabilityを検証し不正値ではdetachしない', () => {
    const fixture = makeFixture({
        resolveClientGameSchemaCapabilities() {
            fixture.events.push(['schema']);
            return { ok: false, capabilities: null, reason: 'invalid' };
        },
    });
    fixture.events.length = 0;
    fixture.handlers.rejoinRoom(Object.assign({}, validPayload, { gameSchemaCapabilities: {} }));
    assert.deepStrictEqual(fixture.events, [
        ['plain'], ['room-id'], ['room-entry'], ['expected-hash'], ['hash-token'],
        ['schema'], ['error', 'SCHEMA_CAPABILITY_INVALID'],
    ]);
});

runTest('rejoin handler はroom選択schema非対応clientをdetach前に拒否する', () => {
    const fixture = makeFixture({
        resolveClientGameSchemaCapabilities() { return { ok: true, capabilities: null, reason: '' }; },
        supportsSelectedGameSchema() { fixture.events.push(['supports-schema']); return false; },
    });
    fixture.room.gameStartPayload = { gameSchema: { actionVersion: 1, snapshotVersion: 1 } };
    fixture.events.length = 0;
    fixture.handlers.rejoinRoom(validPayload);
    assert.deepStrictEqual(fixture.events, [
        ['plain'], ['room-id'], ['room-entry'], ['expected-hash'], ['hash-token'],
        ['supports-schema'], ['error', 'SCHEMA_VERSION_UNSUPPORTED'],
    ]);
});
