const assert = require('assert');
const StoredOnlineReconnect = require('../js/storedOnlineReconnect');

const session = {
    roomId: 'ROOM01',
    playerName: 'Alice',
    playerIndex: 2,
    reconnectToken: 'token',
    isRoomHost: true,
};
const plan = StoredOnlineReconnect.plan(session);
assert.strictEqual(plan.session, session);
assert.deepStrictEqual(plan.runtime, {
    isRoomHost: true,
    playerName: 'Alice',
    roomId: 'ROOM01',
    originalPlayerIndex: 2,
    playerIndex: 2,
    reconnectToken: 'token',
});
assert.deepStrictEqual(StoredOnlineReconnect.plan({ roomId: 'R' }).runtime, {
    isRoomHost: false,
    playerName: '',
    roomId: 'R',
    originalPlayerIndex: -1,
    playerIndex: -1,
    reconnectToken: '',
});
assert.strictEqual(StoredOnlineReconnect.plan(null), null);

function handlers(calls, socketResult = true, emitResult = true) {
    return {
        setReconnecting(value) { calls.push(['setReconnecting', value]); },
        clearRetry() { calls.push(['clearRetry']); },
        setRuntime(value) { calls.push(['setRuntime', value]); },
        initializeSocket() { calls.push(['initializeSocket']); return socketResult; },
        setStatus(value) { calls.push(['setStatus', value]); },
        switchToOnlineTab() { calls.push(['switchToOnlineTab']); },
        emitRejoin(value) { calls.push(['emitRejoin', value]); return emitResult; },
    };
}

const successCalls = [];
assert.deepStrictEqual(StoredOnlineReconnect.execute(plan, handlers(successCalls)), {
    kind: 'rejoin-sent',
    rejoinSent: true,
});
assert.deepStrictEqual(successCalls.map(call => call[0]), StoredOnlineReconnect.EFFECT_STEPS);
assert.strictEqual(successCalls[2][1], plan.runtime);
assert.strictEqual(successCalls[6][1], session);

const failedSocketCalls = [];
assert.deepStrictEqual(StoredOnlineReconnect.execute(plan, handlers(failedSocketCalls, false)), {
    kind: 'socket-failed',
    rejoinSent: false,
});
assert.deepStrictEqual(failedSocketCalls.map(call => call[0]), [
    'setReconnecting', 'clearRetry', 'setRuntime', 'initializeSocket',
    'setReconnecting', 'setRuntime',
]);
assert.deepStrictEqual(failedSocketCalls[5][1], StoredOnlineReconnect.resetRuntime());

const failedEmitCalls = [];
assert.deepStrictEqual(StoredOnlineReconnect.execute(plan, handlers(failedEmitCalls, true, 0)), {
    kind: 'rejoin-send-failed',
    rejoinSent: false,
});
assert.throws(() => StoredOnlineReconnect.execute(plan, {}), /handler is required/);
assert.throws(() => StoredOnlineReconnect.execute(null, {}), /plan is required/);

console.log('stored-online-reconnect.test.js passed');
