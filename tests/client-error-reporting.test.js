const assert = require('assert');
const { makeClientErrorReporting } = require('../server/clientErrorReporting');
const {
    requestBaseOrigin,
    clientErrorAllowedOrigins,
    authorizeClientErrorRequest,
} = require('../server/clientErrorAuth');
const { runTest } = require('./helpers/test-utils');

const reporting = makeClientErrorReporting({
    isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    },
    limits: {
        maxMessageLength: 500,
        maxStackLength: 2400,
    },
    buildHash: 'test-build',
});

runTest('server client error reporting は既存payload fieldと数値範囲を維持する', () => {
    const normalized = reporting.normalizeClientErrorPayload({
        source: 'window.onerror',
        message: 'boom',
        stack: 'stack',
        filename: 'js/ui.js',
        line: 12,
        column: 3,
        playerIndex: 2,
        phase: 'build',
        roomId: 'ROOM',
    }, 1700000000000);

    assert.strictEqual(normalized.ok, true);
    assert.strictEqual(normalized.report.appVersion, 'test-build');
    assert.strictEqual(normalized.report.line, 12);
    assert.strictEqual(normalized.report.column, 3);
    assert.strictEqual(normalized.report.playerIndex, 2);
    assert.strictEqual(normalized.report.receivedAt, '2023-11-14T22:13:20.000Z');
    assert.strictEqual(reporting.normalizeClientErrorNumber(1000001), null);
    assert.strictEqual(reporting.normalizeClientErrorPlayerIndex(21), null);
});

runTest('server client error reporting はURL queryとtoken値を正規化前に除去する', () => {
    const normalized = reporting.normalizeClientErrorPayload({
        message: 'token=secret https://example.com/play?room=SECRET#hash',
        stack: 'sessionId:"private"',
        filename: 'https://example.com/app.js?cache=SECRET',
        url: 'https://example.com/?token=SECRET',
    }, 1700000000000);

    const serialized = JSON.stringify(normalized.report);
    assert.ok(serialized.includes('[redacted]'));
    assert.ok(serialized.includes('https://example.com/play'));
    assert.ok(!serialized.includes('secret'));
    assert.ok(!serialized.includes('private'));
    assert.ok(!serialized.includes('SECRET'));
});

runTest('server client error reporting はobject以外と空payloadを拒否する', () => {
    assert.strictEqual(reporting.normalizeClientErrorPayload([]).ok, false);
    assert.strictEqual(reporting.normalizeClientErrorPayload({}).ok, false);
});

runTest('server client error reporting は分類と匿名room表現をpure helperで固定する', () => {
    const localReporting = makeClientErrorReporting({
        isPlainObject(value) {
            return !!value && typeof value === 'object' && !Array.isArray(value);
        },
        limits: {
            maxMessageLength: 500,
            maxStackLength: 2400,
        },
        hashRoomId(roomId) {
            assert.strictEqual(roomId, 'ROOM42');
            return '0123456789abcdef';
        },
    });
    const report = localReporting.normalizeClientErrorPayload({
        message: 'human-turn-ui-locked after 5000ms',
        stack: 'FREEZE_SUMMARY {"freezeKind":"human-turn-ui-locked","phase":"build"}',
        roomId: 'ROOM42',
        appVersion: 'current-build',
    }, 1700000000000).report;

    assert.deepStrictEqual(localReporting.classifyClientErrorReport(report), {
        classification: 'known-pattern',
        priority: '3',
        tags: 'warning,known,ui_lock',
        freezeKind: 'human-turn-ui-locked',
        knownPatternId: 'human-turn-ui-locked',
    });
    assert.strictEqual(localReporting.redactedClientErrorRoomId('ROOM42'), 'hash:01234567');
    assert.ok(!localReporting.formatNtfyClientErrorMessage(report).includes('ROOM42'));
});

runTest('server client error reporting はstale判定とfreeze要約の本文順を維持する', () => {
    const report = reporting.normalizeClientErrorPayload({
        message: 'post-build-ui-blocked after 5000ms',
        stack: 'FREEZE_SUMMARY {"freezeKind":"post-build-ui-blocked","allowedActions":["buildCard"],"recovery":{"attempted":true,"success":false}}',
        phase: 'build',
        appVersion: '86136c7-extra',
    }, 1700000000000).report;
    const message = reporting.formatNtfyClientErrorMessage(report);

    assert.strictEqual(reporting.isStaleClientErrorVersion(report.appVersion), true);
    assert.strictEqual(reporting.classifyClientErrorReport(report).classification, 'stale-client');
    assert.ok(message.startsWith('UI_LOCK_SUMMARY\n'));
    assert.ok(message.includes('actions=buildCard'));
    assert.ok(message.includes('recovery=failed'));
    assert.ok(message.indexOf('UI_LOCK_SUMMARY') < message.indexOf('classification=stale-client'));
});

runTest('server client error auth はsame-originと設定originを正規化する', () => {
    const req = {
        protocol: 'https',
        headers: {
            host: 'example.com',
            origin: 'https://example.com/path',
            'x-forwarded-proto': 'https,http',
        },
    };

    assert.strictEqual(requestBaseOrigin(req), 'https://example.com');
    assert.deepStrictEqual(
        clientErrorAllowedOrigins(req, {
            CLIENT_ERROR_ALLOWED_ORIGINS: 'https://other.example/path, invalid',
        }),
        ['https://other.example', 'https://example.com']
    );
    assert.deepStrictEqual(authorizeClientErrorRequest(req, {}), { ok: true });
});

runTest('server client error auth はproduction no-originと不正tokenをfail closedする', () => {
    const noOrigin = { headers: { host: 'example.com' }, protocol: 'https' };
    const production = { NODE_ENV: 'production', NTFY_TOPIC: 'topic' };
    assert.deepStrictEqual(authorizeClientErrorRequest(noOrigin, production), {
        ok: false,
        error: 'forbidden_origin',
    });

    const tokenEnv = Object.assign({}, production, { CLIENT_ERROR_SHARED_TOKEN: 'secret' });
    assert.deepStrictEqual(authorizeClientErrorRequest(noOrigin, tokenEnv), {
        ok: false,
        error: 'invalid_client_error_token',
    });
    const bearer = {
        headers: {
            host: 'example.com',
            authorization: 'Bearer secret',
        },
        protocol: 'https',
    };
    assert.deepStrictEqual(authorizeClientErrorRequest(bearer, tokenEnv), { ok: true });
});
