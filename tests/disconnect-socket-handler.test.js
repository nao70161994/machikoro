'use strict';

const assert = require('assert');
const { createDisconnectSocketHandler } = require('../server/disconnectSocketHandler');
const { runTest } = require('./helpers/test-utils');

function createSubject(overrides = {}) {
    const rooms = {};
    const handlers = {};
    const calls = [];
    const emitted = [];
    const io = {
        sockets: { sockets: new Map() },
        to(roomId) {
            return {
                emit(event, payload) {
                    emitted.push({ roomId, event, payload });
                },
            };
        },
    };
    const dependencies = Object.assign({
        io,
        rooms,
        buildPlayerList(room) {
            calls.push('build-player-list');
            return room.players.map(player => player.name);
        },
        getRemainingConnectedPlayers(room) {
            calls.push('remaining');
            return room.players.filter(player => player.id);
        },
        setRoomHostPlayerIndex(room, playerIndex) {
            calls.push('set-host');
            room.hostPlayerIndex = playerIndex;
        },
        emitRoomHostChanged() {
            calls.push('emit-host');
        },
        persistRoomCanonicalState() {
            calls.push('persist');
        },
        disconnectHostlessRestore() {
            calls.push('hostless');
        },
        log() {
            calls.push('log');
        },
        logError() {
            calls.push('error');
        },
        now: () => 4321,
    }, overrides);
    const subject = createDisconnectSocketHandler(dependencies);
    const socket = {
        id: 'socket-1',
        on(event, handler) {
            handlers[event] = handler;
        },
    };
    return { subject, rooms, handlers, calls, emitted, io, socket };
}

runTest('disconnect socket handlerはhostless復元処理の後にroom切断処理を行う', () => {
    const subject = createSubject();
    subject.rooms.ROOM1 = {
        started: false,
        players: [{ id: 'socket-1', name: 'Alice' }, { id: 'socket-2', name: 'Bob' }],
    };
    subject.socket.roomId = 'ROOM1';
    subject.subject.registerSocket(subject.socket);

    subject.handlers.disconnect();

    assert.deepStrictEqual(subject.calls, ['hostless', 'build-player-list', 'log']);
    assert.deepStrictEqual(subject.rooms.ROOM1.players, [{ id: 'socket-2', name: 'Bob' }]);
    assert.deepStrictEqual(subject.emitted, [{
        roomId: 'ROOM1',
        event: 'playerList',
        payload: ['Bob'],
    }]);
});

runTest('disconnect socket handlerは開始済みhost切断時の通知と永続化順を維持する', () => {
    const subject = createSubject({
        getRemainingConnectedPlayers() {
            subject.calls.push('remaining');
            return [{ id: 'socket-2', index: 1, name: 'Bob' }];
        },
    });
    subject.rooms.ROOM1 = {
        started: true,
        hostPlayerIndex: 0,
        players: [
            { id: 'socket-1', index: 0, name: 'Alice' },
            { id: 'socket-2', index: 1, name: 'Bob' },
        ],
    };
    Object.assign(subject.socket, { roomId: 'ROOM1', playerIndex: 0 });
    subject.subject.registerSocket(subject.socket);

    subject.handlers.disconnect();

    assert.strictEqual(subject.rooms.ROOM1.players[0].id, null);
    assert.strictEqual(subject.rooms.ROOM1.lastTouchedAt, 4321);
    assert.strictEqual(subject.rooms.ROOM1.hostPlayerIndex, 1);
    assert.deepStrictEqual(subject.calls, [
        'hostless', 'remaining', 'set-host', 'emit-host', 'persist', 'log', 'log',
    ]);
    assert.deepStrictEqual(subject.emitted, [{
        roomId: 'ROOM1',
        event: 'playerDisconnected',
        payload: { playerIndex: 0, playerName: 'Alice' },
    }]);
});

runTest('disconnect socket handlerは開始済みroomの再接続TTLを最終切断から延長する', () => {
    const subject = createSubject();
    subject.rooms.ROOM1 = {
        started: true,
        lastTouchedAt: 1,
        hostPlayerIndex: 1,
        players: [{ id: 'socket-1', index: 0, name: 'Alice' }],
    };
    Object.assign(subject.socket, { roomId: 'ROOM1', playerIndex: 0 });

    subject.subject.handleSocketDisconnect(subject.io, subject.socket);

    assert.strictEqual(subject.rooms.ROOM1.lastTouchedAt, 4321);
    assert.strictEqual(subject.rooms.ROOM1.players[0].id, null);
});

runTest('disconnect socket handlerは古いsocketの遅延切断を無視する', () => {
    const subject = createSubject();
    subject.rooms.ROOM1 = {
        started: true,
        hostPlayerIndex: 0,
        players: [{ id: 'socket-new', index: 0, name: 'Alice' }],
    };
    Object.assign(subject.socket, { roomId: 'ROOM1', playerIndex: 0 });

    subject.subject.handleSocketDisconnect(subject.io, subject.socket);

    assert.strictEqual(subject.rooms.ROOM1.players[0].id, 'socket-new');
    assert.deepStrictEqual(subject.calls, []);
    assert.deepStrictEqual(subject.emitted, []);
});
