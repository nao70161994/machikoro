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
        buildLobbyState(room) {
            return {
                hostPlayerIndex: room.hostPlayerIndex,
                participants: room.players.map(player => ({
                    index: player.index,
                    name: player.name,
                    connected: !!player.id,
                })),
            };
        },
        io,
        checkGameStart(value, roomId) { assert.strictEqual(value, io); trace.push(['check-start', roomId]); },
        validateSocketCanEnterRoom() { return { ok: true }; },
        isValidRoomId(roomId) { return roomId === 'ROOM01'; },
        now() { return 1_700_000_000_000; },
        log(message) { trace.push(['log', message]); },
    };
    return { rooms, trace, dependencies };
}

runTest('lobby socket handler は待機室管理を含む既存順序で登録する', () => {
    const runtime = makeRuntime();
    const socket = makeSocket('host', runtime.trace);
    registerLobbySocketHandlers(socket, runtime.dependencies);
    assert.deepStrictEqual(Object.keys(socket.handlers), ['createRoom', 'joinRoom', 'removeWaitingPlayer', 'manageWaitingRoom']);
    assert.deepStrictEqual(runtime.trace.slice(0, 3), [
        ['on', 'createRoom'], ['on', 'joinRoom'], ['on', 'removeWaitingPlayer'],
    ]);
});

runTest('待機室hostは空席をCPU化して手動開始し末尾空き枠だけ変更できる', () => {
    const runtime = makeRuntime();
    runtime.rooms.ROOM01 = {
        roomId: 'ROOM01', players: [{ id: 'host', name: 'Alice', index: 0 }],
        playerSettings: [{ type: 'human' }, { type: 'human' }, { type: 'human' }],
        maxPlayers: 3, hostPlayerIndex: 0, started: false,
    };
    const host = makeSocket('host', runtime.trace);
    host.roomId = 'ROOM01';
    host.playerIndex = 0;
    registerLobbySocketHandlers(host, runtime.dependencies);
    runtime.trace.length = 0;

    host.handlers.manageWaitingRoom({ roomId: 'ROOM01', action: 'slots', delta: -1 });
    assert.strictEqual(runtime.rooms.ROOM01.maxPlayers, 2);
    assert.strictEqual(runtime.rooms.ROOM01.playerSettings.length, 2);
    host.handlers.manageWaitingRoom({ roomId: 'ROOM01', action: 'slots', delta: 1 });
    assert.strictEqual(runtime.rooms.ROOM01.maxPlayers, 3);

    host.handlers.manageWaitingRoom({ roomId: 'ROOM01', action: 'start' });
    assert.deepStrictEqual(runtime.rooms.ROOM01.playerSettings.map(setting => setting.type), ['human', 'cpu', 'cpu']);
    assert.ok(runtime.trace.some(entry => entry[0] === 'check-start'));
});

runTest('待機室hostだけが自分以外の参加者を外せる', () => {
    const runtime = makeRuntime();
    const guestTrace = [];
    const guest = makeSocket('guest', guestTrace);
    guest.roomId = 'ROOM01';
    guest.playerIndex = 1;
    guest.leave = roomId => guestTrace.push(['leave', roomId]);
    guest.disconnect = force => guestTrace.push(['disconnect', force]);
    runtime.dependencies.io.sockets = { sockets: new Map([['guest', guest]]) };
    runtime.rooms.ROOM01 = {
        roomId: 'ROOM01',
        players: [
            { id: 'host', name: 'Alice', index: 0 },
            { id: 'guest', name: 'Bob', index: 1 },
        ],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        maxPlayers: 2,
        hostPlayerIndex: 0,
        started: false,
    };
    const host = makeSocket('host', runtime.trace);
    host.roomId = 'ROOM01';
    host.playerIndex = 0;
    registerLobbySocketHandlers(host, runtime.dependencies);
    runtime.trace.length = 0;

    host.handlers.removeWaitingPlayer({ roomId: 'room01', playerIndex: 1 });

    assert.deepStrictEqual(runtime.rooms.ROOM01.players.map(player => player.index), [0]);
    assert.deepStrictEqual(guestTrace, [['leave', 'ROOM01'], ['disconnect', true]]);
    assert.ok(runtime.trace.some(entry => entry[0] === 'error' && entry[1] === 'guest'));
    assert.ok(runtime.trace.some(entry => entry[0] === 'room-emit' && entry[2] === 'playerList'));

    runtime.trace.length = 0;
    host.handlers.removeWaitingPlayer({ roomId: 'ROOM01', playerIndex: 0 });
    assert.ok(runtime.trace.some(entry => entry[0] === 'error'));
});

runTest('待機室の非host・開始済みroomは参加者管理を変更しない', () => {
    const runtime = makeRuntime();
    runtime.rooms.ROOM01 = {
        roomId: 'ROOM01',
        players: [
            { id: 'host', name: 'Alice', index: 0 },
            { id: 'guest', name: 'Bob', index: 1 },
        ],
        playerSettings: [], maxPlayers: 2, hostPlayerIndex: 0, started: false,
    };
    const guest = makeSocket('guest', runtime.trace);
    guest.roomId = 'ROOM01';
    guest.playerIndex = 1;
    registerLobbySocketHandlers(guest, runtime.dependencies);
    runtime.trace.length = 0;
    guest.handlers.removeWaitingPlayer({ roomId: 'ROOM01', playerIndex: 0 });
    assert.strictEqual(runtime.rooms.ROOM01.players.length, 2);
    assert.ok(runtime.trace.some(entry => entry[0] === 'error'));

    runtime.rooms.ROOM01.started = true;
    runtime.trace.length = 0;
    guest.handlers.removeWaitingPlayer({ roomId: 'ROOM01', playerIndex: 0 });
    assert.strictEqual(runtime.rooms.ROOM01.players.length, 2);
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
        { roomId: 'ROOM01', playerIndex: 0, reconnectToken: 'token-1', hostPlayerIndex: 0 },
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
