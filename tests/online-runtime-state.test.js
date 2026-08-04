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
    controller.setSocket(socket);
    controller.acceptRoom({ playerIndex: -1, roomId: 'ABC123', reconnectToken: '' });
    assert.strictEqual(controller.write, undefined);
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
    controller.acceptRoom({ playerIndex: 3, roomId: null, reconnectToken: 'token' });

    assert.strictEqual(controller.read('isOnlineGame'), true);
    assert.strictEqual(controller.read('myPlayerIndex'), 3);
    assert.strictEqual(root.reconnectToken, 'token');
    assert.strictEqual(Object.keys(root).includes('isOnlineGame'), false);
});

runTest('online runtime compatibility globalsは製品向けread-only投影を選べる', () => {
    const socket = { connected: true };
    const root = {};
    const controller = OnlineRuntimeState.createController({ socket });
    assert.strictEqual(controller.bindGlobals(root, { writable: false }), true);
    assert.strictEqual(root.socket, socket);
    assert.strictEqual(Object.getOwnPropertyDescriptor(root, 'socket').set, undefined);
    assert.throws(() => { root.socket = null; }, TypeError);
    controller.setOnline(true);
    assert.strictEqual(root.isOnlineGame, true);
});

runTest('online runtime stateはroom受理と保存session復元をnamed transitionで適用する', () => {
    const controller = OnlineRuntimeState.createController();
    const accepted = controller.acceptRoom({
        playerIndex: 2,
        roomId: 'ABC123',
        reconnectToken: 'created-token',
    });
    assert.deepStrictEqual({
        original: accepted.myOriginalPlayerIndex,
        current: accepted.myPlayerIndex,
        roomId: accepted.myRoomId,
        token: accepted.reconnectToken,
    }, { original: 2, current: 2, roomId: 'ABC123', token: 'created-token' });

    const restored = controller.restoreIdentity({
        isRoomHost: true,
        playerName: 'Alice',
        roomId: 'DEF456',
        originalPlayerIndex: 3,
        playerIndex: 1,
        reconnectToken: 'restored-token',
    });
    assert.deepStrictEqual({
        host: restored.isRoomHost,
        name: restored.myPlayerName,
        roomId: restored.myRoomId,
        original: restored.myOriginalPlayerIndex,
        current: restored.myPlayerIndex,
        token: restored.reconnectToken,
    }, {
        host: true,
        name: 'Alice',
        roomId: 'DEF456',
        original: 3,
        current: 1,
        token: 'restored-token',
    });
});

runTest('online runtime stateのnamed transitionはboolean正規化とidentity clearを固定する', () => {
    const socket = { connected: true };
    const controller = OnlineRuntimeState.createController({
        myPlayerName: 'Alice',
        myRoomId: 'ABC123',
        reconnectToken: 'token',
        myPlayerIndex: 1,
        myOriginalPlayerIndex: 2,
        isRoomHost: true,
    });
    controller.setSocket(socket);
    controller.setOnline(1);
    controller.setHost('yes');
    controller.setReplaying(true);
    controller.setReconnecting(true);
    controller.setPlayerIndexes(4, 3);
    assert.deepStrictEqual(controller.snapshot(), {
        socket,
        isOnlineGame: false,
        isRoomHost: false,
        myPlayerIndex: 3,
        myOriginalPlayerIndex: 4,
        myPlayerName: 'Alice',
        myRoomId: 'ABC123',
        reconnectToken: 'token',
        isReplaying: true,
        isReconnectingOnline: true,
    });
    const cleared = controller.clearIdentity();
    assert.strictEqual(cleared.socket, socket);
    assert.strictEqual(cleared.isOnlineGame, false);
    assert.strictEqual(cleared.isReplaying, true);
    assert.strictEqual(cleared.isReconnectingOnline, true);
    assert.deepStrictEqual({
        host: cleared.isRoomHost,
        current: cleared.myPlayerIndex,
        original: cleared.myOriginalPlayerIndex,
        name: cleared.myPlayerName,
        roomId: cleared.myRoomId,
        token: cleared.reconnectToken,
    }, { host: false, current: -1, original: -1, name: '', roomId: null, token: '' });
});

runTest('app shellはonline sessionをruntime snapshot境界から読む', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'appShell.js'), 'utf8');
    assert.ok(source.includes('OnlineRuntimeState.runtime.snapshot()'));
    for (const field of OnlineRuntimeState.fields) {
        assert.strictEqual(source.includes(`typeof ${field}`), false, field);
    }
});
