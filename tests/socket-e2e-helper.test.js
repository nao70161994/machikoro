'use strict';

const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const {
    DEFAULT_SOCKET_E2E_PING_TIMEOUT_MS,
    DEFAULT_SOCKET_E2E_TIMEOUT_MS,
    configureSocketE2EHeartbeat,
    formatSocketEventTimeoutContext,
    makeOnceSocketEvent,
} = require('./helpers/socket-e2e');

function makeHarness() {
    const calls = [];
    let scheduled;
    let handler;
    const timer = { id: 'timer' };
    const socket = {
        once(event, callback) { calls.push(['once', event]); handler = callback; },
        off(event, callback) { calls.push(['off', event, callback]); },
    };
    const onceEvent = makeOnceSocketEvent({
        setTimeout(callback, timeoutMs) { calls.push(['set', timeoutMs]); scheduled = callback; return timer; },
        clearTimeout(received) { calls.push(['clear', received]); },
    });
    return { calls, socket, onceEvent, timer, get scheduled() { return scheduled; }, get handler() { return handler; } };
}

runTest('socket E2E event helperは15秒の共有既定値と受信時timer解除を固定する', async () => {
    const harness = makeHarness();
    const promise = harness.onceEvent(harness.socket, 'gameStart');
    assert.deepStrictEqual(harness.calls, [['set', DEFAULT_SOCKET_E2E_TIMEOUT_MS], ['once', 'gameStart']]);
    const payload = { ok: true };
    harness.handler(payload);
    assert.strictEqual(await promise, payload);
    assert.deepStrictEqual(harness.calls[2], ['clear', harness.timer]);
});

runTest('socket E2E event helperはtimeout時にlistenerを外してtraceを返す', async () => {
    const harness = makeHarness();
    const context = { seed: 103, actionCount: 287 };
    const promise = harness.onceEvent(harness.socket, 'actionAccepted', 7, context);
    harness.scheduled();
    await assert.rejects(promise, error => {
        assert.strictEqual(error.message, 'actionAccepted timed out context={"seed":103,"actionCount":287}');
        return true;
    });
    assert.strictEqual(harness.calls[0][1], 7);
    assert.deepStrictEqual(harness.calls[2], ['off', 'actionAccepted', harness.handler]);
});

runTest('socket E2E event helperは循環traceでもtimeout診断を失わない', () => {
    const context = {};
    context.self = context;
    assert.strictEqual(formatSocketEventTimeoutContext(context), ' context=[unserializable]');
});

runTest('socket E2E heartbeat helperはtest serverだけの猶予を変更して復元する', () => {
    const io = { engine: { opts: { pingTimeout: 20000 } } };
    const restore = configureSocketE2EHeartbeat(io);
    assert.strictEqual(io.engine.opts.pingTimeout, DEFAULT_SOCKET_E2E_PING_TIMEOUT_MS);
    restore();
    assert.strictEqual(io.engine.opts.pingTimeout, 20000);
    restore();
    assert.strictEqual(io.engine.opts.pingTimeout, 20000);
});

runTest('socket E2E heartbeat helperはEngine.IO境界がないserverを拒否する', () => {
    assert.throws(
        () => configureSocketE2EHeartbeat({}),
        /Socket.IO server with Engine.IO options is required/
    );
});
