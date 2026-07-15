const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const {
    EXPECTED_PRODUCTION_ORIGIN,
    USER_AGENT,
    parseArgs,
    validateProductionOrigin,
    validateTimeoutMs,
    checkSocketHandshake,
} = require('./online-delivery-handshake');

runTest('online delivery handshake は固定originとtimeoutを解析する', () => {
    assert.deepStrictEqual(parseArgs([
        '--origin', EXPECTED_PRODUCTION_ORIGIN,
        '--timeout-ms=1234',
    ]), {
        origin: EXPECTED_PRODUCTION_ORIGIN,
        timeoutMs: 1234,
    });
});

runTest('online delivery handshake はproduction origin以外を拒否する', () => {
    assert.strictEqual(validateProductionOrigin(EXPECTED_PRODUCTION_ORIGIN), EXPECTED_PRODUCTION_ORIGIN);
    for (const origin of [
        'http://machikoro-9jv2.onrender.com',
        'https://example.com',
        EXPECTED_PRODUCTION_ORIGIN + '/path',
        EXPECTED_PRODUCTION_ORIGIN + '?token=secret',
        'https://user:pass@machikoro-9jv2.onrender.com',
    ]) {
        assert.throws(() => validateProductionOrigin(origin), /must exactly match|valid URL/);
    }
});

runTest('online delivery handshake はtimeout上限を固定する', () => {
    assert.strictEqual(validateTimeoutMs(1000), 1000);
    assert.strictEqual(validateTimeoutMs(30000), 30000);
    for (const timeout of [999, 30001, 1.5, NaN]) {
        assert.throws(() => validateTimeoutMs(timeout), /timeout must be an integer/);
    }
});

runTest('online delivery handshake は状態変更eventを送らず接続だけ閉じる', async () => {
    let receivedOrigin = null;
    let receivedOptions = null;
    let closed = false;
    const connector = (origin, options) => {
        receivedOrigin = origin;
        receivedOptions = options;
        const handlers = {};
        const socket = {
            once(event, handler) {
                handlers[event] = handler;
            },
            close() {
                closed = true;
            },
        };
        queueMicrotask(() => handlers.connect());
        return socket;
    };

    const result = await checkSocketHandshake(EXPECTED_PRODUCTION_ORIGIN, 1000, connector);
    assert.deepStrictEqual(result, { origin: EXPECTED_PRODUCTION_ORIGIN });
    assert.strictEqual(receivedOrigin, EXPECTED_PRODUCTION_ORIGIN);
    assert.deepStrictEqual(receivedOptions.transports, ['websocket']);
    assert.strictEqual(receivedOptions.reconnection, false);
    assert.deepStrictEqual(receivedOptions.auth, {});
    assert.strictEqual(receivedOptions.extraHeaders['User-Agent'], USER_AGENT);
    assert.strictEqual(closed, true);
});

runTest('online delivery handshake は接続エラー本文を外へ出さない', async () => {
    const connector = () => {
        const handlers = {};
        const socket = {
            once(event, handler) {
                handlers[event] = handler;
            },
            close() {},
        };
        queueMicrotask(() => handlers.connect_error(new Error('token=do-not-log')));
        return socket;
    };
    await assert.rejects(
        checkSocketHandshake(EXPECTED_PRODUCTION_ORIGIN, 1000, connector),
        error => error.message === 'Socket.IO handshake failed' && !error.message.includes('do-not-log')
    );
});
