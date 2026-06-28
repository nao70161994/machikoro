const assert = require('assert');
const http = require('http');
const { runTest } = require('./helpers/test-utils');
const {
    parseArgs,
    assertOkResponse,
    assertHeaderIncludes,
    checkOnlineDelivery,
} = require('../scripts/check-online-delivery');

function withMockDeliveryServer(handler) {
    const server = http.createServer((req, res) => {
        if (req.url === '/api/version') {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ hash: 'testhash' }));
            return;
        }
        if (req.url === '/socket.io/socket.io.js') {
            res.setHeader('Content-Type', 'application/javascript');
            res.end('/* socket.io */ window.io = function io() {};');
            return;
        }
        if (req.url === '/sw.js') {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Content-Type', 'application/javascript');
            res.end("const CACHE_NAME = 'machikoro-testhash';");
            return;
        }
        if (req.url === '/') {
            res.setHeader('Content-Type', 'text/html');
            res.end('<script>window.MACHIKORO_CLIENT_VERSION="testhash";</script><script src="/socket.io/socket.io.js"></script>');
            return;
        }
        res.statusCode = 404;
        res.end('not found');
    });
    return new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', async () => {
            const address = server.address();
            const origin = 'http://127.0.0.1:' + address.port;
            try {
                resolve(await handler(origin));
            } catch (error) {
                reject(error);
            } finally {
                server.close();
            }
        });
    });
}

runTest('online delivery smoke parseArgs は origin 指定時に内蔵server起動を止める', () => {
    const options = parseArgs(['--origin', 'https://example.test/', '--timeout-ms', '1234']);
    assert.strictEqual(options.origin, 'https://example.test');
    assert.strictEqual(options.timeoutMs, 1234);
    assert.strictEqual(options.startServer, false);
});

runTest('online delivery smoke parseArgs は port から local origin を作る', () => {
    const options = parseArgs(['--port=3333']);
    assert.strictEqual(options.origin, 'http://127.0.0.1:3333');
    assert.strictEqual(options.startServer, true);
});

runTest('online delivery smoke assertions は status と cache header を検査する', () => {
    assertOkResponse({ status: 200 }, '/ok');
    assertHeaderIncludes({ headers: { 'cache-control': 'no-store' } }, 'Cache-Control', 'no-store', '/ok');
    assert.throws(() => assertOkResponse({ status: 404 }, '/missing'), /returned status 404/);
    assert.throws(() => assertHeaderIncludes({ headers: {} }, 'Cache-Control', 'no-store', '/missing'), /missing Cache-Control/);
});

runTest('online delivery smoke は同一origin配信に必要なendpointを検査する', async () => {
    const result = await withMockDeliveryServer(origin => checkOnlineDelivery(origin, 1000));
    assert.strictEqual(result.hash, 'testhash');
    assert.deepStrictEqual(result.checks, {
        version: 200,
        socketIo: 200,
        index: 200,
        serviceWorker: 200,
    });
});
