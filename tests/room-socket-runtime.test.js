const assert = require('assert');
const makeRoomSocketRuntime = require('../server/roomSocketRuntime');
const { runTest } = require('./helpers/test-utils');

function makeHarness(socketEntries = []) {
    const calls = [];
    const sockets = new Map(socketEntries);
    const defaultIo = {
        sockets: { sockets },
        to(roomId) {
            calls.push(['to', roomId]);
            return { emit: (event, payload) => calls.push(['emit', event, payload]) };
        },
    };
    const runtime = makeRoomSocketRuntime({
        defaultIo,
        emitAppError: (socket, message) => calls.push(['error', socket.id, message]),
        buildRoomHostChangedPayload: room => ({ newHostPlayerIndex: room.hostPlayerIndex, hostEpoch: room.hostEpoch }),
        isRoomHostConnectedForSockets: (room, receivedSockets) => {
            calls.push(['host-connected', room, receivedSockets]);
            return receivedSockets === sockets;
        },
    });
    return { calls, sockets, defaultIo, runtime };
}

runTest('room socket runtimeはhostChanged event名とpayloadを維持する', () => {
    const harness = makeHarness();
    const room = { hostPlayerIndex: 2, hostEpoch: 5 };
    harness.runtime.emitRoomHostChanged('ROOM01', room);
    assert.deepStrictEqual(harness.calls, [
        ['to', 'ROOM01'],
        ['emit', 'hostChanged', { newHostPlayerIndex: 2, hostEpoch: 5 }],
    ]);

    const overrideCalls = [];
    const overrideIo = { to: roomId => ({ emit: (event, payload) => overrideCalls.push([roomId, event, payload]) }) };
    harness.runtime.emitRoomHostChanged('ROOM02', room, overrideIo);
    assert.deepStrictEqual(overrideCalls, [['ROOM02', 'hostChanged', { newHostPlayerIndex: 2, hostEpoch: 5 }]]);
});

runTest('room socket runtimeはerror通知→leave→同room identity clear順を維持する', () => {
    const calls = [];
    const oldSocket = {
        id: 'old',
        roomId: 'ROOM01',
        playerIndex: 1,
        leave(roomId) { calls.push(['leave', roomId, this.roomId, this.playerIndex]); },
    };
    const harness = makeHarness([['old', oldSocket]]);
    const originalPush = harness.calls.push.bind(harness.calls);
    harness.calls.push = entry => { calls.push(entry); return originalPush(entry); };

    harness.runtime.detachSocketFromRoom('old', 'ROOM01');
    assert.deepStrictEqual(calls, [
        ['error', 'old', 'INVALID_SESSION'],
        ['leave', 'ROOM01', 'ROOM01', 1],
    ]);
    assert.strictEqual(oldSocket.roomId, null);
    assert.strictEqual(oldSocket.playerIndex, null);
});

runTest('room socket runtimeは別room identityをclearせず対象playerだけを切り離す', () => {
    const oldSocket = { id: 'old', roomId: 'OTHER', playerIndex: 1, leave() {} };
    const harness = makeHarness([['old', oldSocket]]);
    const room = { players: [{ index: 1, id: 'old' }] };

    harness.runtime.detachExistingPlayerSocket(room, 'ROOM01', 1, 'new');
    assert.strictEqual(oldSocket.roomId, 'OTHER');
    assert.strictEqual(oldSocket.playerIndex, 1);
    assert.deepStrictEqual(harness.calls, [['error', 'old', 'INVALID_SESSION']]);
    harness.calls.length = 0;
    harness.runtime.detachExistingPlayerSocket(room, 'ROOM01', 1, 'old');
    assert.deepStrictEqual(harness.calls, []);
});

runTest('room socket runtimeはroom全player idを通知有無に関係なくclearする', () => {
    const first = { id: 'first', roomId: 'ROOM01', playerIndex: 0, leave() {} };
    const harness = makeHarness([['first', first]]);
    const room = { players: [{ index: 0, id: 'first' }, { index: 1, id: 'missing' }, { index: 2, id: null }] };

    harness.runtime.detachRoomSockets('ROOM01', room);
    assert.deepStrictEqual(room.players.map(player => player.id), [null, null, null]);
    assert.deepStrictEqual(harness.calls, [['error', 'first', 'ROOM_REPLACED']]);
});

runTest('room socket runtimeはhost接続判定へ既定socket mapを渡す', () => {
    const harness = makeHarness();
    const room = { hostPlayerIndex: 0 };
    assert.strictEqual(harness.runtime.isRoomHostConnected(room), true);
    assert.deepStrictEqual(harness.calls, [['host-connected', room, harness.sockets]]);
});

runTest('room socket runtimeは不正依存をeffects前に拒否する', () => {
    const required = { defaultIo: { sockets: { sockets: new Map() } }, emitAppError() {}, buildRoomHostChangedPayload() {}, isRoomHostConnectedForSockets() {} };
    assert.throws(() => makeRoomSocketRuntime({ ...required, defaultIo: null }), /defaultIo socket map/);
    assert.throws(() => makeRoomSocketRuntime({ ...required, emitAppError: null }), /emitAppError/);
    assert.throws(() => makeRoomSocketRuntime({ ...required, buildRoomHostChangedPayload: null }), /buildRoomHostChangedPayload/);
    assert.throws(() => makeRoomSocketRuntime({ ...required, isRoomHostConnectedForSockets: null }), /isRoomHostConnectedForSockets/);
 });
