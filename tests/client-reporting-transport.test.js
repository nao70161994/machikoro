const assert = require('assert');
const ClientReportingTransport = require('../js/clientReportingTransport');
const { runTest } = require('./helpers/test-utils');

function createSubject(overrides = {}) {
    const checkpoints = [];
    const fetchCalls = [];
    let buildCount = 0;
    let shouldSendCount = 0;
    const report = {
        source: 'window.onerror',
        message: 'render failed',
        stack: 'Error: render failed',
    };
    const options = Object.assign({
        source: 'window.onerror',
        endpoint: '/api/client-error',
        buildReport() {
            buildCount += 1;
            return report;
        },
        shouldSend(value) {
            shouldSendCount += 1;
            return value === report;
        },
        fetchImpl(url, init) {
            fetchCalls.push({ url, init });
            return null;
        },
        checkpoint(event, details) {
            checkpoints.push({ event, details });
        },
    }, overrides);
    return {
        options,
        checkpoints,
        fetchCalls,
        report,
        buildCount: () => buildCount,
        shouldSendCount: () => shouldSendCount,
    };
}

runTest('client reporting transportはfetch不在時にreportを生成しない', () => {
    const subject = createSubject({ fetchImpl: null });
    assert.strictEqual(ClientReportingTransport.send(subject.options), false);
    assert.strictEqual(subject.buildCount(), 0);
    assert.strictEqual(subject.shouldSendCount(), 0);
    assert.deepStrictEqual(subject.checkpoints, [{
        event: 'client-error-fetch-unavailable',
        details: { source: 'window.onerror' },
    }]);
});

runTest('client reporting transportは送信判定で抑止されたreportを送らない', () => {
    const subject = createSubject({
        shouldSend() {
            return false;
        },
    });
    assert.strictEqual(ClientReportingTransport.send(subject.options), false);
    assert.strictEqual(subject.buildCount(), 1);
    assert.deepStrictEqual(subject.fetchCalls, []);
    assert.deepStrictEqual(subject.checkpoints, []);
});

runTest('client reporting transportは既存POST payloadと開始checkpoint順を維持する', () => {
    const subject = createSubject();
    assert.strictEqual(ClientReportingTransport.send(subject.options), true);
    assert.strictEqual(subject.buildCount(), 1);
    assert.strictEqual(subject.shouldSendCount(), 1);
    assert.deepStrictEqual(subject.fetchCalls, [{
        url: '/api/client-error',
        init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subject.report),
            keepalive: true,
        },
    }]);
    assert.deepStrictEqual(subject.checkpoints, [{
        event: 'client-error-fetch-start',
        details: { source: 'window.onerror', message: 'render failed' },
    }]);
});

runTest('client reporting transportは非同期成功と失敗を既存checkpointへ投影する', async () => {
    const success = createSubject({
        fetchImpl() {
            return Promise.resolve({ ok: true, status: 204 });
        },
    });
    assert.strictEqual(ClientReportingTransport.send(success.options), true);
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual(success.checkpoints[1], {
        event: 'client-error-fetch-complete',
        details: { source: 'window.onerror', ok: true, status: 204 },
    });

    const failure = createSubject({
        fetchImpl() {
            return Promise.reject(new Error('network down'));
        },
    });
    assert.strictEqual(ClientReportingTransport.send(failure.options), true);
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual(failure.checkpoints[1], {
        event: 'client-error-fetch-failed',
        details: { source: 'window.onerror', message: 'network down' },
    });
});

runTest('client reporting transportは同期例外を既存checkpointへ変換する', () => {
    const subject = createSubject({
        fetchImpl() {
            throw new Error('fetch threw');
        },
    });
    assert.strictEqual(ClientReportingTransport.send(subject.options), false);
    assert.deepStrictEqual(subject.checkpoints[1], {
        event: 'client-error-fetch-threw',
        details: { source: 'window.onerror', message: 'fetch threw' },
    });
});
