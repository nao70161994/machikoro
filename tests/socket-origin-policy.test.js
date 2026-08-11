'use strict';

const assert = require('assert');
const connectClient = require('socket.io-client');
const fs = require('fs');
const path = require('path');
const { runTest } = require('./helpers/test-utils');
const { onceSocketEvent } = require('./helpers/socket-e2e');
const SocketOriginPolicy = require('../server/socketOriginPolicy');

process.env.CANONICAL_STATE_STORE = 'noop';
process.env.SOCKET_ALLOWED_ORIGINS = 'https://allowed.example/path, invalid';
const serverModule = require('../server');

function request(headers = {}, encrypted = false) {
    return { headers, socket: { encrypted } };
}

function connect(origin, extraHeaders) {
    return connectClient(origin, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        extraHeaders,
    });
}

function connectResult(socket) {
    return new Promise(resolve => {
        socket.once('connect', () => resolve({ connected: true, error: null }));
        socket.once('connect_error', error => resolve({ connected: false, error }));
    });
}

runTest('socket origin policyはOrigin欠落・same-origin・専用allowlistだけを許可する', () => {
    const req = request({
        host: 'game.example',
        origin: 'https://game.example/path',
        'x-forwarded-proto': 'https,http',
    });
    assert.strictEqual(SocketOriginPolicy.socketRequestBaseOrigin(req), 'https://game.example');
    assert.deepStrictEqual(
        SocketOriginPolicy.socketAllowedOrigins(req, {
            SOCKET_ALLOWED_ORIGINS: 'https://allowed.example/path, invalid, https://allowed.example',
            CLIENT_ERROR_ALLOWED_ORIGINS: 'https://reporting-only.example',
        }),
        ['https://allowed.example', 'https://game.example']
    );
    assert.strictEqual(SocketOriginPolicy.isSocketOriginAllowed(req, {}), true);
    assert.strictEqual(SocketOriginPolicy.isSocketOriginAllowed(request({ host: 'game.example' }), {}), true);
    assert.strictEqual(SocketOriginPolicy.isSocketOriginAllowed(request({
        host: 'game.example',
        origin: 'https://evil.example',
    }), {}), false);
    assert.strictEqual(SocketOriginPolicy.isSocketOriginAllowed(request({
        host: 'game.example',
        origin: 'null',
    }), {}), false);
    assert.strictEqual(SocketOriginPolicy.isSocketOriginAllowed(request({
        host: 'game.example',
        origin: 'https://allowed.example',
    }), { SOCKET_ALLOWED_ORIGINS: 'https://allowed.example/path' }), true);
});

runTest('socket origin policyはX-Forwarded-Proto先頭とHostだけで公開originを組み立てる', () => {
    const req = request({
        host: 'public.example:443',
        'x-forwarded-host': 'spoofed.example',
        'x-forwarded-proto': 'https,http',
    });
    assert.strictEqual(SocketOriginPolicy.socketRequestBaseOrigin(req), 'https://public.example');
    assert.strictEqual(
        SocketOriginPolicy.socketRequestBaseOrigin(request({ host: 'secure.example' }, true)),
        'https://secure.example'
    );
});

runTest('Socket.IO websocket admissionはcross-originを拒否し既存接続を維持する', async () => {
    const httpServer = serverModule.__io.httpServer;
    await new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(0, '127.0.0.1', resolve);
    });
    const origin = 'http://127.0.0.1:' + httpServer.address().port;
    const clients = [];

    try {
        const noOrigin = connect(origin);
        clients.push(noOrigin);
        assert.strictEqual((await connectResult(noOrigin)).connected, true);

        const sameOrigin = connect(origin, { Origin: origin });
        clients.push(sameOrigin);
        assert.strictEqual((await connectResult(sameOrigin)).connected, true);
        const roomCreated = onceSocketEvent(sameOrigin, 'roomCreated');
        sameOrigin.emit('createRoom', {
            playerName: 'SameOrigin',
            playerCount: 2,
            playerSettings: [{ type: 'human' }, { type: 'human' }],
        });
        assert.ok((await roomCreated).roomId);

        const allowlisted = connect(origin, { Origin: 'https://allowed.example' });
        clients.push(allowlisted);
        assert.strictEqual((await connectResult(allowlisted)).connected, true);

        const proxySameOrigin = connect(origin, {
            Origin: 'https://public.example',
            Host: 'public.example',
            'X-Forwarded-Proto': 'https,http',
            'X-Forwarded-Host': 'spoofed.example',
        });
        clients.push(proxySameOrigin);
        assert.strictEqual((await connectResult(proxySameOrigin)).connected, true);

        const crossOrigin = connect(origin, { Origin: 'https://evil.example' });
        clients.push(crossOrigin);
        const rejected = await connectResult(crossOrigin);
        assert.strictEqual(rejected.connected, false);
        assert.ok(rejected.error);
    } finally {
        for (const client of clients) client.close();
        await new Promise(resolve => serverModule.__io.close(resolve));
    }
});

runTest('socket origin policyはserver export・運用docs・静的登録へ同期する', () => {
    assert.strictEqual(serverModule.isSocketOriginAllowed, SocketOriginPolicy.isSocketOriginAllowed);
    assert.strictEqual(serverModule.socketRequestBaseOrigin, SocketOriginPolicy.socketRequestBaseOrigin);
    const operations = fs.readFileSync(path.join(__dirname, '..', 'docs', 'OPERATIONS.md'), 'utf8');
    const releaseChecklist = fs.readFileSync(path.join(__dirname, '..', 'docs', 'RELEASE_CHECKLIST.md'), 'utf8');
    assert.ok(operations.includes('SOCKET_ALLOWED_ORIGINS'));
    assert.ok(releaseChecklist.includes('SOCKET_ALLOWED_ORIGINS'));
});
