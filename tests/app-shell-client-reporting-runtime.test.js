'use strict';

const assert = require('assert');
const AppShellClientReportingRuntime = require('../js/appShellClientReportingRuntime');
const { ClientReporting } = require('../js/clientReporting');
const ClientReportingTransport = require('../js/clientReportingTransport');
const { runTest } = require('./helpers/test-utils');

function createHarness(overrides = {}) {
    const checkpoints = [];
    const fetchCalls = [];
    let currentTime = 1000;
    const dependencies = {
        buildSnapshot: reason => ({ reason, phase: 'build', token: 'not-in-report-context' }),
        checkpoint: (event, details) => checkpoints.push({ event, details }),
        endpoint: '/api/client-error',
        getFetch: () => (url, options) => { fetchCalls.push({ url, options }); return { ok: true, status: 204 }; },
        getGameSnapshot: () => ({ game: { phase: 'build' } }),
        getLocation: () => ({ origin: 'https://example.test', pathname: '/game', href: 'https://example.test/game?secret=1#room' }),
        getOnlineSnapshot: () => ({ myRoomId: 'ROOM01', myPlayerIndex: 0 }),
        getUserAgent: () => 'Safari iPhone',
        getVersion: () => 'abc1234',
        messageLimit: 500,
        now: () => currentTime,
        reporting: ClientReporting,
        schemaVersion: 2,
        stackLimit: 2400,
        suppressMs: 10000,
        transport: ClientReportingTransport,
        ...overrides,
    };
    return {
        checkpoints,
        fetchCalls,
        setTime(value) { currentTime = value; },
        runtime: AppShellClientReportingRuntime.createRuntime(dependencies),
    };
}

runTest('app shell client reporting runtimeはruntime contextを正規化して既存endpointへ送る', () => {
    const { fetchCalls, runtime } = createHarness();
    assert.strictEqual(runtime.report({ source: 'window.onerror', message: 'boom', filename: 'app.js', line: 4 }), true);
    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(fetchCalls[0].url, '/api/client-error');
    const report = JSON.parse(fetchCalls[0].options.body);
    assert.strictEqual(report.phase, 'build');
    assert.strictEqual(report.roomId, 'ROOM01');
    assert.strictEqual(report.playerIndex, 0);
    assert.strictEqual(report.url, 'https://example.test/game');
    assert.strictEqual(report.userAgent, 'Safari iPhone');
    assert.strictEqual(report.appVersion, 'abc1234');
});

runTest('app shell client reporting runtimeは同一reportを既存window内で抑止する', () => {
    const { checkpoints, fetchCalls, runtime, setTime } = createHarness();
    const input = { source: 'console.error', message: 'same error' };
    assert.strictEqual(runtime.report(input), true);
    setTime(10999);
    assert.strictEqual(runtime.report(input), false);
    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(checkpoints.some(entry => entry.event === 'client-error-suppressed'));
});

runTest('app shell client reporting runtimeはdebug reportのcheckpointとsnapshotを維持する', () => {
    const { checkpoints, fetchCalls, runtime } = createHarness();
    assert.strictEqual(runtime.sendDebugReport('manual test'), true);
    assert.strictEqual(checkpoints[0].event, 'debug-client-error-report-start');
    const report = JSON.parse(fetchCalls[0].options.body);
    assert.strictEqual(report.source, 'debug-client-test');
    assert.strictEqual(report.message, 'manual test');
    assert.ok(report.stack.includes('debug-client-test'));
});

runTest('app shell client reporting runtimeは必須依存欠落を初期化時に拒否する', () => {
    assert.throws(() => AppShellClientReportingRuntime.createRuntime(), /buildSnapshot is required/);
});

runTest('app shell client reporting runtimeは保存済みreportの再送をtransportへ委譲する', () => {
    const calls = [];
    const outbox = { pending() { return []; } };
    const scheduleRetry = () => true;
    const { runtime } = createHarness({
        outbox,
        scheduleRetry,
        transport: {
            send: ClientReportingTransport.send,
            flush(options) {
                calls.push(options);
                return 2;
            },
        },
    });
    assert.strictEqual(runtime.flush(), 2);
    assert.strictEqual(calls[0].outbox, outbox);
    assert.strictEqual(calls[0].endpoint, '/api/client-error');
    assert.strictEqual(typeof calls[0].fetchImpl, 'function');
    assert.strictEqual(calls[0].scheduleRetry, scheduleRetry);
});
