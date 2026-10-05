const assert = require('assert');
const makeRoomLifecycle = require('../server/roomLifecycle');
const { runTest } = require('./helpers/test-utils');

const {
    isActiveRoomSocket,
    isRoomHostConnected,
    roomHostChangedPayload,
    setRoomHostPlayerIndex,
} = makeRoomLifecycle({
    limits: {},
    defaultRooms: {},
});

runTest('room lifecycle はhost indexとepochを開始payloadへ同期する', () => {
    const gameStartPayload = {};
    const room = {
        hostPlayerIndex: 0,
        hostEpoch: 2,
        gameStartPayload,
    };

    setRoomHostPlayerIndex(room, 1);
    assert.deepStrictEqual(room, {
        hostPlayerIndex: 1,
        hostEpoch: 3,
        gameStartPayload: {
            hostPlayerIndex: 1,
            hostEpoch: 3,
        },
    });

    setRoomHostPlayerIndex(room, 1);
    assert.strictEqual(room.hostEpoch, 3);

    const legacyRoom = { gameStartPayload: {} };
    setRoomHostPlayerIndex(legacyRoom, 0);
    assert.strictEqual(legacyRoom.hostEpoch, 1);
    assert.deepStrictEqual(legacyRoom.gameStartPayload, {
        hostPlayerIndex: 0,
        hostEpoch: 1,
    });
});

runTest('room lifecycle はhost epochをsafe integer内で厳密に増加させる', () => {
    const maximumRoom = {
        hostPlayerIndex: 0,
        hostEpoch: Number.MAX_SAFE_INTEGER - 1,
        gameStartPayload: {},
    };
    setRoomHostPlayerIndex(maximumRoom, 1);
    assert.strictEqual(maximumRoom.hostEpoch, Number.MAX_SAFE_INTEGER);

    const overflowRoom = {
        hostPlayerIndex: 0,
        hostEpoch: Number.MAX_SAFE_INTEGER,
        gameStartPayload: {},
    };
    assert.throws(() => setRoomHostPlayerIndex(overflowRoom, 1), /cannot be incremented safely/);
    assert.strictEqual(overflowRoom.hostPlayerIndex, 0);
    assert.strictEqual(overflowRoom.hostEpoch, Number.MAX_SAFE_INTEGER);
});

runTest('room lifecycle はhostChanged wire payloadを既存fieldへ限定する', () => {
    assert.deepStrictEqual(roomHostChangedPayload({ hostPlayerIndex: 3, hostEpoch: 7, extra: true }), {
        newHostPlayerIndex: 3,
        hostEpoch: 7,
    });
    assert.deepStrictEqual(roomHostChangedPayload({ hostPlayerIndex: 0, hostEpoch: 'bad' }), {
        newHostPlayerIndex: 0,
        hostEpoch: 0,
    });
    assert.deepStrictEqual(roomHostChangedPayload(null), {
        newHostPlayerIndex: undefined,
        hostEpoch: 0,
    });
});

runTest('room lifecycle は再接続後の本人socketとhost接続だけを認識する', () => {
    const room = {
        hostPlayerIndex: 1,
        players: [{ id: 'new-a', index: 0 }, { id: 'host-b', index: 1 }],
    };
    const sockets = new Map([['host-b', {}]]);

    assert.strictEqual(isActiveRoomSocket(room, { id: 'new-a', playerIndex: 0 }), true);
    assert.strictEqual(isActiveRoomSocket(room, { id: 'old-a', playerIndex: 0 }), false);
    assert.strictEqual(isActiveRoomSocket(room, { id: 'host-b', playerIndex: null }), false);
    assert.strictEqual(isRoomHostConnected(room, sockets), true);
    sockets.delete('host-b');
    assert.strictEqual(isRoomHostConnected(room, sockets), false);
    assert.strictEqual(isRoomHostConnected(null, sockets), false);
});

runTest('room lifecycle は接続中の開始済みroomをTTL削除しない', () => {
    const rooms = {
        connected: { started: true, lastTouchedAt: 1 },
        disconnected: { started: true, lastTouchedAt: 1 },
    };
    const lifecycle = makeRoomLifecycle({
        limits: { startedRoomTtlMs: 100, pendingRoomTtlMs: 50 },
        defaultRooms: rooms,
        log: { log() {} },
        isRoomConnected: room => room === rooms.connected,
    });
    assert.strictEqual(lifecycle.cleanupExpiredRooms(1000), 1);
    assert.ok(rooms.connected);
    assert.strictEqual(rooms.disconnected, undefined);
});

runTest('待機室GCは期限切れhostを接続中の参加者へ移譲して一覧を通知する', () => {
    const { makeWaitingReservationPruner } = require('../server/disconnectSocketHandler');
    const room = {
        started: false, hostPlayerIndex: 0, hostEpoch: 0, lastTouchedAt: 1,
        players: [{ id: null, index: 0, reservedUntil: 100 }, { id: 'guest', index: 1 }],
    };
    const events = [];
    const prune = makeWaitingReservationPruner({
        getConnectedPlayers: current => current.players.filter(player => player.id === 'guest'),
        setRoomHostPlayerIndex,
        emitRoomHostChanged: current => events.push(['host', current.hostPlayerIndex]),
        emitPlayerList: current => events.push(['players', current.players.map(player => player.index)]),
    });
    const lifecycle = makeRoomLifecycle({
        limits: { pendingRoomTtlMs: 1000 }, defaultRooms: { ROOM: room },
        pruneWaitingRoomReservations: prune, log: { log() {} },
    });
    lifecycle.cleanupExpiredRooms(99);
    assert.strictEqual(room.hostPlayerIndex, 0);
    assert.deepStrictEqual(events, []);
    lifecycle.cleanupExpiredRooms(100);
    assert.strictEqual(room.hostPlayerIndex, 1);
    assert.strictEqual(room.hostEpoch, 1);
    assert.deepStrictEqual(events, [['host', 1], ['players', [1]]]);
});
