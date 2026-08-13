'use strict';

const assert = require('assert');
const {
    ONLINE_REMATCH_TIMEOUT_MS,
    createOnlineRematchRuntime,
} = require('../server/onlineRematchRuntime');
const { runTest } = require('./helpers/test-utils');

function createHarness() {
    const broadcasts = [];
    const appErrors = [];
    const timers = [];
    const sockets = new Map();
    const room = {
        roomId: 'ABC123',
        started: true,
        gameGeneration: 0,
        hostEpoch: 7,
        actionSeq: 42,
        acceptedClientActions: { old: {} },
        players: [
            { id: 's0', index: 0, reconnectTokenHash: 'old-0' },
            { id: 's1', index: 1, reconnectTokenHash: 'old-1' },
        ],
        canonicalMirror: { game: { checkWinner: () => ({ name: 'Alice' }) } },
    };
    const rooms = { ABC123: room };
    const io = {
        sockets: { sockets },
        to(roomId) {
            return { emit: (event, payload) => broadcasts.push({ roomId, event, payload }) };
        },
    };
    let tokenNumber = 0;
    const runtime = createOnlineRematchRuntime({
        rooms,
        io,
        emitAppError: (_socket, message) => appErrors.push(message),
        requirePlainSocketPayload: (_socket, payload) => !!payload &&
            typeof payload === 'object' && !Array.isArray(payload),
        isActiveRoomSocket: (targetRoom, socket) => targetRoom.players.some(player =>
            player.id === socket.id && player.index === socket.playerIndex),
        generateReconnectToken: () => `token-${++tokenNumber}`,
        hashReconnectToken: token => `hash:${token}`,
        buildGameStartPayload: (_io, targetRoom) => ({ playerNames: ['Alice', 'Bob'], gameGeneration: targetRoom.gameGeneration }),
        markRoomGameStarted: (targetRoom, payload, startedAt) => {
            targetRoom.started = true;
            targetRoom.gameStartPayload = payload;
            targetRoom.startedAt = startedAt;
            targetRoom.actionLog = [];
            targetRoom.fullActionLog = [];
            targetRoom.stateSnapshot = null;
            targetRoom.lastUndoState = null;
        },
        now: () => 1234,
        setTimeoutFn(fn, ms) {
            const timer = { fn, ms, cleared: false, unref() {} };
            timers.push(timer);
            return timer;
        },
        clearTimeoutFn(timer) { if (timer) timer.cleared = true; },
    });
    function socket(id, playerIndex) {
        const handlers = {};
        const privateEvents = [];
        const target = {
            id,
            roomId: 'ABC123',
            playerIndex,
            on: (event, handler) => { handlers[event] = handler; },
            emit: (event, payload) => privateEvents.push({ event, payload }),
        };
        sockets.set(id, target);
        return { target, handlers, privateEvents };
    }
    return { appErrors, broadcasts, room, runtime, socket, timers };
}

runTest('online rematchは全接続playerの明示同意後だけ世代とtokenを更新して新規開始する', () => {
    const h = createHarness();
    const first = h.socket('s0', 0);
    const second = h.socket('s1', 1);
    h.runtime.registerSocket(first.target);
    h.runtime.registerSocket(second.target);

    assert.strictEqual(first.handlers.requestOnlineRematch({ approved: true }), true);
    assert.strictEqual(h.room.gameGeneration, 0);
    assert.deepStrictEqual(h.broadcasts.at(-1).payload, { state: 'voting', votes: 1, required: 2 });

    assert.strictEqual(second.handlers.requestOnlineRematch({ approved: true }), true);
    assert.strictEqual(h.room.gameGeneration, 1);
    assert.strictEqual(h.room.hostEpoch, 0);
    assert.strictEqual(h.room.actionSeq, 0);
    assert.deepStrictEqual(h.room.acceptedClientActions, {});
    assert.deepStrictEqual(h.room.actionLog, []);
    assert.strictEqual(h.room.stateSnapshot, null);
    assert.strictEqual(first.privateEvents[0].event, 'onlineRematchIdentity');
    assert.strictEqual(first.privateEvents[0].payload.reconnectToken, 'token-1');
    assert.strictEqual(second.privateEvents[0].payload.reconnectToken, 'token-2');
    assert.strictEqual(h.broadcasts.at(-1).event, 'gameStart');
    assert.strictEqual(h.broadcasts.at(-1).payload.gameGeneration, 1);
    assert.strictEqual(h.timers[0].cleared, true);
});

runTest('online rematchは拒否・timeout・欠席をfail closedにする', () => {
    const rejected = createHarness();
    const first = rejected.socket('s0', 0);
    rejected.socket('s1', 1);
    assert.strictEqual(rejected.runtime.request(first.target, { approved: true }), true);
    assert.strictEqual(rejected.runtime.request(first.target, { approved: false }), true);
    assert.deepStrictEqual(rejected.broadcasts.at(-1).payload, { state: 'cancelled', reason: 'rejected' });
    assert.strictEqual(rejected.room.gameGeneration, 0);

    const timedOut = createHarness();
    const voter = timedOut.socket('s0', 0);
    timedOut.socket('s1', 1);
    timedOut.runtime.request(voter.target, { approved: true });
    assert.strictEqual(timedOut.timers[0].ms, ONLINE_REMATCH_TIMEOUT_MS);
    timedOut.timers[0].fn();
    assert.deepStrictEqual(timedOut.broadcasts.at(-1).payload, { state: 'cancelled', reason: 'timeout' });

    const missing = createHarness();
    const active = missing.socket('s0', 0);
    missing.room.players[1].id = null;
    assert.strictEqual(missing.runtime.request(active.target, { approved: true }), false);
    assert.deepStrictEqual(missing.appErrors, ['REMATCH_PLAYERS_MISSING']);
});

runTest('online rematchは勝利前・不正vote・古いsocketを拒否する', () => {
    const h = createHarness();
    const first = h.socket('s0', 0);
    h.socket('s1', 1);
    h.room.canonicalMirror.game.checkWinner = () => null;
    assert.strictEqual(h.runtime.request(first.target, { approved: true }), false);
    h.room.canonicalMirror.game.checkWinner = () => ({ name: 'Alice' });
    assert.strictEqual(h.runtime.request(first.target, {}), false);
    first.target.id = 'stale';
    assert.strictEqual(h.runtime.request(first.target, { approved: true }), false);
    assert.deepStrictEqual(h.appErrors, [
        'REMATCH_UNAVAILABLE', 'REMATCH_INVALID_VOTE', 'REMATCH_UNAVAILABLE',
    ]);
});

if (process.exitCode) throw new Error('online rematch runtimeテストで失敗が発生しました');
