'use strict';

const assert = require('assert');
const OnlinePendingOutboundState = require('../js/onlinePendingOutboundState');
const { runTest } = require('./helpers/test-utils');

runTest('online pending outbound stateはroomごとにentry identityを分離する', () => {
    const controller = OnlinePendingOutboundState.createController();
    const first = { roomId: ' room01 ', seq: 1 };
    const second = { roomId: 'ROOM02', seq: 2 };
    assert.strictEqual(controller.store(first), first);
    controller.store(second);
    assert.strictEqual(controller.read('ROOM01'), first);
    assert.strictEqual(controller.read('room02'), second);
    assert.strictEqual(controller.read('ROOM03'), null);
    assert.deepStrictEqual(controller.snapshot().map(item => item.roomId), ['ROOM01', 'ROOM02']);
});

runTest('online pending outbound stateはlegacy room欠落entryをcurrent roomへhydrateする', () => {
    const controller = OnlinePendingOutboundState.createController({
        normalizeRoomId(roomId) {
            return typeof roomId === 'string' ? roomId.trim().toUpperCase() : '';
        },
    });
    const legacy = { action: 'nextTurn', roomId: null };
    controller.store(legacy, 'room-current');
    assert.strictEqual(controller.read('ROOM-CURRENT'), legacy);
    assert.strictEqual(controller.read(''), null);
    assert.strictEqual(controller.remove('room-current'), true);
    assert.strictEqual(controller.read('ROOM-CURRENT'), null);
});

runTest('online pending outbound stateはclearと不正entryのfail-fastを固定する', () => {
    const controller = OnlinePendingOutboundState.createController();
    controller.store({ roomId: 'A' });
    controller.store({ roomId: 'B' });
    controller.clear();
    assert.deepStrictEqual(controller.snapshot(), []);
    assert.strictEqual(Object.isFrozen(controller.snapshot()), true);
    assert.throws(() => controller.store(null), /must be an object/);
});
