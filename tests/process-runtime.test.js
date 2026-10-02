'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const {
    registerServerProcessHandlers,
    startHttpServer,
} = require('../server/processRuntime');
const { runTest } = require('./helpers/test-utils');

runTest('server process runtimeはfatal eventを記録して終了コード1で停止する', () => {
    const calls = [];
    const callbacks = {};
    const handlers = registerServerProcessHandlers({
        processTarget: {
            on(event, callback) {
                calls.push(['on', event]);
                callbacks[event] = callback;
            },
            exit(code) {
                calls.push(['exit', code]);
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
        ['exit', 1],
    ]);
});

runTest('server process runtimeはunhandledRejection単独でも終了する', () => {
    const calls = [];
    let onUnhandledRejection;
    registerServerProcessHandlers({
        processTarget: {
            on(event, callback) {
                if (event === 'unhandledRejection') onUnhandledRejection = callback;
            },
            exit(code) {
                calls.push(['exit', code]);
            },
        },
        logger: { error(...args) { calls.push(['error', ...args]); } },
    });

    onUnhandledRejection('reason');
    assert.deepStrictEqual(calls, [
        ['error', 'unhandledRejection:', 'reason'],
        ['exit', 1],
    ]);
});

runTest('server process runtimeのfatal handlersは実node processを終了させる', () => {
    for (const trigger of [
        "setImmediate(() => { throw new Error('uncaught-child-marker'); });",
        "Promise.reject(new Error('rejection-child-marker'));",
    ]) {
        const child = spawnSync(process.execPath, ['-e', [
            "const { registerServerProcessHandlers } = require('./server/processRuntime');",
            'registerServerProcessHandlers();',
            'setInterval(() => {}, 1000);',
            trigger,
        ].join('\n')], {
            cwd: require('path').join(__dirname, '..'),
            encoding: 'utf8',
            timeout: 5000,
        });
        assert.strictEqual(child.error, undefined, child.error && child.error.message);
        assert.strictEqual(child.status, 1, child.stderr);
        assert.match(child.stderr, /uncaughtException:|unhandledRejection:/);
    }
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
    assert.throws(() => registerServerProcessHandlers({ processTarget: null }), /processTarget.on and processTarget.exit are required/);
    let calls = 0;
    assert.throws(() => registerServerProcessHandlers({
        processTarget: { on() { calls++; }, exit() {} },
        logger: null,
    }), /logger.error is required/);
    assert.strictEqual(calls, 0);
    assert.throws(() => registerServerProcessHandlers({
        processTarget: { on() {} },
    }), /processTarget.on and processTarget.exit are required/);
    assert.throws(() => startHttpServer({ server: null }), /server.listen is required/);
    assert.throws(() => startHttpServer({ server: { listen() {} }, logger: null }), /logger.log is required/);
});
