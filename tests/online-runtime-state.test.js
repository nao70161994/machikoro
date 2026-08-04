'use strict';

const assert = require('assert');
const OnlineRuntimeState = require('../js/onlineRuntimeState');
const { runTest } = require('./helpers/test-utils');

runTest('online runtime stateは既存session初期値をfrozen snapshotへ投影する', () => {
    const controller = OnlineRuntimeState.createController();
    assert.deepStrictEqual(controller.snapshot(), OnlineRuntimeState.defaults);
    assert.ok(Object.isFrozen(controller.snapshot()));
    assert.deepStrictEqual(OnlineRuntimeState.fields, Object.keys(OnlineRuntimeState.defaults));
});

runTest('online runtime stateは既知fieldだけを更新して一括resetできる', () => {
    const socket = { connected: true };
    const controller = OnlineRuntimeState.createController();
    assert.strictEqual(controller.write('socket', socket), true);
    assert.strictEqual(controller.write('myRoomId', 'ABC123'), true);
    assert.strictEqual(controller.write('unknown', 1), false);
    assert.strictEqual(controller.read('socket'), socket);
    assert.strictEqual(controller.read('myRoomId'), 'ABC123');
    assert.strictEqual(controller.read('unknown'), undefined);
    assert.deepStrictEqual(controller.reset(), OnlineRuntimeState.defaults);
});

runTest('online runtime state compatibility globalsは同じcontrollerを双方向投影する', () => {
    const controller = OnlineRuntimeState.createController();
    const root = {};
    assert.strictEqual(controller.bindGlobals(root), true);
    root.isOnlineGame = true;
    root.myPlayerIndex = 3;
    controller.write('reconnectToken', 'token');

    assert.strictEqual(controller.read('isOnlineGame'), true);
    assert.strictEqual(controller.read('myPlayerIndex'), 3);
    assert.strictEqual(root.reconnectToken, 'token');
    assert.strictEqual(Object.keys(root).includes('isOnlineGame'), false);
});
