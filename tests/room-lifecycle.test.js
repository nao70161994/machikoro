const assert = require('assert');
const makeRoomLifecycle = require('../server/roomLifecycle');
const { runTest } = require('./helpers/test-utils');

const { roomHostChangedPayload } = makeRoomLifecycle({
    limits: {},
    defaultRooms: {},
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
