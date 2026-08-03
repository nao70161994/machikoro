'use strict';

const assert = require('assert');
const {
    registerServerProcessHandlers,
    startHttpServer,
} = require('../server/processRuntime');
const { runTest } = require('./helpers/test-utils');

runTest('server process runtimeは既存2 eventを順番どおり購読してerrorへ渡す', () => {
    const calls = [];
    const callbacks = {};
    const handlers = registerServerProcessHandlers({
        processTarget: {
            on(event, callback) {
                calls.push(['on', event]);
                callbacks[event] = callback;
            },
        },
        logger: {
            error(...args) {
                calls.push(['error', ...args]);
            },
        },
    });
    assert.ok(Object.isFrozen(handlers));
    assert.deepStrictEqual(calls, [
        ['on', 'uncaughtException'],
        ['on', 'unhandledRejection'],
    ]);
    const error = new Error('boom');
    callbacks.uncaughtException(error);
    callbacks.unhandledRejection('reason');
    assert.deepStrictEqual(calls.slice(2), [
        ['error', 'uncaughtException:', error],
        ['error', 'unhandledRejection:', 'reason'],
    ]);
});

runTest('server HTTP runtimeは既存port/host/listen callbackを無変換で維持する', () => {
    const calls = [];
    const handle = {};
    const result = startHttpServer({
        server: {
            listen(port, host, callback) {
                calls.push(['listen', port, host]);
                callback();
                return handle;
            },
        },
        port: '3000',
        logger: {
            log(message) {
                calls.push(['log', message]);
            },
        },
    });
    assert.strictEqual(result, handle);
    assert.deepStrictEqual(calls, [
        ['listen', '3000', '0.0.0.0'],
        ['log', 'サーバー起動: http://localhost:3000'],
    ]);
});

runTest('server process runtimeは不完全な配線を副作用前に拒否する', () => {
    assert.throws(() => registerServerProcessHandlers({ processTarget: null }), /processTarget.on is required/);
    let calls = 0;
    assert.throws(() => registerServerProcessHandlers({
        processTarget: { on() { calls++; } },
        logger: null,
    }), /logger.error is required/);
    assert.strictEqual(calls, 0);
    assert.throws(() => startHttpServer({ server: null }), /server.listen is required/);
    assert.throws(() => startHttpServer({ server: { listen() {} }, logger: null }), /logger.log is required/);
});
