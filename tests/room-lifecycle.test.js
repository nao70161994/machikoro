const assert = require('assert');
const makeRoomLifecycle = require('../server/roomLifecycle');
const { runTest } = require('./helpers/test-utils');

const {
    roomHostChangedPayload,
    setRoomHostPlayerIndex,
    roomHostlessRestoreCapabilities,
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

runTest('room lifecycle はhostless capabilityをCPUとsocket対応状況から投影する', () => {
    const room = {
        playerSettings: [
            { type: 'cpu' },
            { type: 'human' },
            { type: 'human' },
            { type: 'human' },
        ],
        players: [
            { id: 'cpu-socket', index: 0 },
            { id: 'supported', index: 1 },
            { id: 'unsupported', index: 2 },
        ],
    };
    const sockets = new Map([
        ['cpu-socket', { hostlessRestoreVersion: 1 }],
        ['supported', { hostlessRestoreVersion: 1 }],
        ['unsupported', { hostlessRestoreVersion: 0 }],
    ]);

    assert.deepStrictEqual(
        roomHostlessRestoreCapabilities(sockets, room, ['CPU', 'A', 'B', 'C']),
        [0, 1, 0, 0]
    );
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
