const assert = require('assert');
const { registerLobbySocketHandlers } = require('../server/lobbySocketHandlers');
const { runTest } = require('./helpers/test-utils');

function makeSocket(id, trace) {
    const handlers = {};
    return {
        id,
        handlers,
        on(name, handler) { handlers[name] = handler; trace.push(['on', name]); },
        join(roomId) { trace.push(['join', roomId]); },
        emit(name, payload) { trace.push(['socket-emit', name, payload]); },
    };
}

function makeRuntime() {
    const rooms = Object.create(null);
    const trace = [];
    const io = {
        to(roomId) {
            return { emit(name, payload) { trace.push(['room-emit', roomId, name, payload]); } };
        },
    };
    const dependencies = {
        requirePlainSocketPayload(socket, payload) {
            trace.push(['require-payload', socket.id]);
            return !!payload && typeof payload === 'object' && !Array.isArray(payload);
        },
        sanitizeName(name) { return typeof name === 'string' ? name.trim() : ''; },
        emitAppError(socket, message) { trace.push(['error', socket.id, message]); },
        hasInvalidOnlineRlModelSettings() { return false; },
        normalizePlayerSettings(settings) { return Array.isArray(settings) ? settings : []; },
        normalizeCpuSpeed(value) { return Number(value) || 1500; },
        validateCreateRoomLifecycle() { return { ok: true }; },
        rooms,
        generateRoomId() { return 'ROOM01'; },
        generateReconnectToken() { return 'token-' + (Object.keys(rooms).length + 1); },
        normalizeEnabledCards(cards) { return Array.isArray(cards) ? cards : ['麦畑']; },
        landmarkNames() { return ['駅', '港']; },
        markCreateRoomForSocket(socket, now) { trace.push(['mark-socket', socket.id, now]); },
        createRoomRateKeyForSocket(socket) { return 'rate:' + socket.id; },
        markCreateRoomForRateKey(key, now) { trace.push(['mark-rate', key, now]); },
        buildPlayerList(room) { return room.players.map(player => player.name); },
        io,
        checkGameStart(value, roomId) { assert.strictEqual(value, io); trace.push(['check-start', roomId]); },
        validateSocketCanEnterRoom() { return { ok: true }; },
        isValidRoomId(roomId) { return roomId === 'ROOM01'; },
        now() { return 1_700_000_000_000; },
        log(message) { trace.push(['log', message]); },
    };
    return { rooms, trace, dependencies };
}

runTest('lobby socket handler はcreateRoom/joinRoomだけを同じ順序で登録する', () => {
    const runtime = makeRuntime();
    const socket = makeSocket('host', runtime.trace);
    registerLobbySocketHandlers(socket, runtime.dependencies);
    assert.deepStrictEqual(Object.keys(socket.handlers), ['createRoom', 'joinRoom']);
    assert.deepStrictEqual(runtime.trace.slice(0, 2), [['on', 'createRoom'], ['on', 'joinRoom']]);
});

runTest('createRoom handler はroom作成からemit/start-checkまで既存順序を維持する', () => {
    const runtime = makeRuntime();
    const socket = makeSocket('host', runtime.trace);
    registerLobbySocketHandlers(socket, runtime.dependencies);
    runtime.trace.length = 0;
    socket.handlers.createRoom({
        playerName: ' Alice ',
        playerCount: 2,
        playerSettings: [],
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        clientVersion: 'v1',
        hostlessRestoreVersion: 1,
    });
    assert.strictEqual(socket.roomId, 'ROOM01');
    assert.strictEqual(socket.playerIndex, 0);
    assert.strictEqual(socket.clientVersion, 'v1');
    assert.strictEqual(socket.hostlessRestoreVersion, 1);
    assert.strictEqual(runtime.rooms.ROOM01.players[0].name, 'Alice');
    assert.deepStrictEqual(runtime.trace.map(entry => entry[0]), [
        'require-payload',
        'mark-socket',
        'mark-rate',
        'join',
        'socket-emit',
        'room-emit',
        'check-start',
        'log',
    ]);
    assert.deepStrictEqual(runtime.trace[4], [
        'socket-emit',
        'roomCreated',
        { roomId: 'ROOM01', playerIndex: 0, reconnectToken: 'token-1' },
    ]);
});

runTest('joinRoom handler は空きhuman席へ追加して既存emit順序を維持する', () => {
    const runtime = makeRuntime();
    runtime.rooms.ROOM01 = {
        roomId: 'ROOM01',
        players: [{ id: 'host', name: 'Alice', index: 0 }],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        maxPlayers: 2,
        started: false,
    };
    const socket = makeSocket('guest', runtime.trace);
    registerLobbySocketHandlers(socket, runtime.dependencies);
    runtime.trace.length = 0;
    socket.handlers.joinRoom({ roomId: 'ROOM01', playerName: ' Bob ', clientVersion: 'v2' });
    assert.strictEqual(socket.playerIndex, 1);
    assert.strictEqual(runtime.rooms.ROOM01.players[1].name, 'Bob');
    assert.deepStrictEqual(runtime.trace.map(entry => entry[0]), [
        'require-payload',
        'join',
        'socket-emit',
        'room-emit',
        'check-start',
    ]);
    assert.strictEqual(runtime.trace[2][1], 'roomJoined');
});

runTest('lobby handler はinvalid payloadを副作用なしで拒否する', () => {
    const runtime = makeRuntime();
    const socket = makeSocket('host', runtime.trace);
    registerLobbySocketHandlers(socket, runtime.dependencies);
    runtime.trace.length = 0;
    socket.handlers.createRoom(null);
    socket.handlers.joinRoom([]);
    assert.deepStrictEqual(runtime.trace, [
        ['require-payload', 'host'],
        ['require-payload', 'host'],
    ]);
    assert.deepStrictEqual(Object.keys(runtime.rooms), []);
});

runTest('lobby handler はschema capabilityをplayerへ保存し不正値を副作用前に拒否する', () => {
    const runtime = makeRuntime();
    runtime.dependencies.resolveClientGameSchemaCapabilities = value => value && value.valid
        ? { ok: true, capabilities: { actionVersions: [0, 1], snapshotVersions: [0, 1] } }
        : { ok: false, capabilities: null, reason: 'invalid' };
    const socket = makeSocket('host', runtime.trace);
    registerLobbySocketHandlers(socket, runtime.dependencies);
    runtime.trace.length = 0;
    socket.handlers.createRoom({ playerName: 'Alice', playerCount: 2, playerSettings: [], gameSchemaCapabilities: {} });
    assert.deepStrictEqual(runtime.trace, [
        ['require-payload', 'host'], ['error', 'host', 'SCHEMA_CAPABILITY_INVALID'],
    ]);
    assert.deepStrictEqual(Object.keys(runtime.rooms), []);

    runtime.trace.length = 0;
    socket.handlers.createRoom({
        playerName: 'Alice', playerCount: 2, playerSettings: [],
        enabledLandmarks: ['駅'], gameSchemaCapabilities: { valid: true },
    });
    assert.deepStrictEqual(runtime.rooms.ROOM01.players[0].gameSchemaCapabilities, {
        actionVersions: [0, 1], snapshotVersions: [0, 1],
    });
});

runTest('joinRoom handler はroom内peerと共通schemaがない候補を追加しない', () => {
    const runtime = makeRuntime();
    runtime.rooms.ROOM01 = {
        roomId: 'ROOM01', players: [{ id: 'host', name: 'Alice', index: 0 }],
        playerSettings: [{ type: 'human' }, { type: 'human' }], maxPlayers: 2, started: false,
    };
    runtime.dependencies.negotiateRoomGameSchemaCandidate = () => ({ ok: false, reason: 'no-common' });
    const socket = makeSocket('guest', runtime.trace);
    registerLobbySocketHandlers(socket, runtime.dependencies);
    runtime.trace.length = 0;
    socket.handlers.joinRoom({ roomId: 'ROOM01', playerName: 'Bob' });
    assert.deepStrictEqual(runtime.trace, [
        ['require-payload', 'guest'], ['error', 'guest', 'SCHEMA_VERSION_UNSUPPORTED'],
    ]);
    assert.strictEqual(runtime.rooms.ROOM01.players.length, 1);
});
