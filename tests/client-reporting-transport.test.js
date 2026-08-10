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

runTest('client reporting outboxはroom IDを保存せず件数と期限を制限する', () => {
    let stored = 'not-json';
    let currentTime = 1000;
    const outbox = ClientReportingTransport.createOutbox({
        read: () => stored,
        write: value => { stored = value; },
        now: () => currentTime,
        maxEntries: 2,
        maxAgeMs: 100,
    });
    outbox.enqueue({ source: 'one', message: 'first', roomId: 'SECRET_ROOM' });
    outbox.enqueue({ source: 'two', message: 'second' });
    outbox.enqueue({ source: 'three', message: 'third' });
    let entries = outbox.pending();
    assert.deepStrictEqual(entries.map(entry => entry.report.source), ['two', 'three']);
    assert.strictEqual(Object.hasOwn(entries[0].report, 'roomId'), false);
    assert.strictEqual(stored.includes('SECRET_ROOM'), false);

    currentTime = 1200;
    entries = outbox.pending();
    assert.deepStrictEqual(entries, []);
    assert.strictEqual(stored, '[]');
});

runTest('client reporting transportは失敗をoutboxへ残し次回flush成功時に削除する', async () => {
    let stored = '[]';
    let currentTime = 1000;
    const outbox = ClientReportingTransport.createOutbox({
        read: () => stored,
        write: value => { stored = value; },
        now: () => currentTime,
    });
    const failure = createSubject({
        outbox,
        fetchImpl() {
            return Promise.resolve({ ok: false, status: 503 });
        },
    });
    failure.report.roomId = 'LIVE_ROOM';
    assert.strictEqual(ClientReportingTransport.send(failure.options), true);
    assert.strictEqual(JSON.parse(stored)[0].report.roomId, undefined);
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(JSON.parse(stored).length, 1);
    assert.strictEqual(outbox.pending().length, 0);

    const restartedOutbox = ClientReportingTransport.createOutbox({
        read: () => stored,
        write: value => { stored = value; },
        now: () => currentTime,
    });
    const retry = createSubject({
        outbox: restartedOutbox,
        fetchImpl() {
            return Promise.resolve({ ok: true, status: 202 });
        },
    });
    assert.strictEqual(ClientReportingTransport.flush(retry.options), 0);
    assert.strictEqual(restartedOutbox.nextDelayMs(), 1000);
    currentTime = 2000;
    assert.strictEqual(ClientReportingTransport.flush(retry.options), 1);
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual(outbox.pending(), []);
    assert.strictEqual(retry.checkpoints[0].event, 'client-error-retry-start');
});

runTest('client reporting flushは将来時刻の最短entryを自然再送予約する', () => {
    let stored = '[]';
    let currentTime = 1000;
    const scheduled = [];
    const outbox = ClientReportingTransport.createOutbox({
        read: () => stored,
        write: value => { stored = value; },
        now: () => currentTime,
    });
    const first = outbox.enqueue({ source: 'first', message: 'one' });
    outbox.begin(first.id);
    outbox.defer(first.id);
    currentTime = 1200;
    const second = outbox.enqueue({ source: 'second', message: 'two' });
    outbox.begin(second.id);
    outbox.defer(second.id);
    const subject = createSubject({ outbox, scheduleRetry: delay => scheduled.push(delay) });
    assert.strictEqual(ClientReportingTransport.flush(subject.options), 0);
    assert.deepStrictEqual(scheduled, [800]);
});

runTest('client reporting transportは失敗後に自然再送を予約し成功後に次件を流す', async () => {
    let stored = '[]';
    let currentTime = 1000;
    const scheduled = [];
    const outbox = ClientReportingTransport.createOutbox({
        read: () => stored,
        write: value => { stored = value; },
        now: () => currentTime,
    });
    const failed = createSubject({
        outbox,
        scheduleRetry: delayMs => scheduled.push(delayMs),
        fetchImpl() {
            return Promise.resolve({ ok: false, status: 503 });
        },
    });
    assert.strictEqual(ClientReportingTransport.send(failed.options), true);
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual(scheduled, [1000]);

    currentTime = 2000;
    const retry = createSubject({
        outbox,
        scheduleRetry: delayMs => scheduled.push(delayMs),
        fetchImpl() {
            return Promise.resolve({ ok: true, status: 202 });
        },
    });
    assert.strictEqual(ClientReportingTransport.flush(retry.options), 1);
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual(scheduled, [1000, 0]);
    assert.strictEqual(stored, '[]');
});

runTest('client reporting outboxは同一reportを重複保存せず失敗回数で再送を遅延する', () => {
    let stored = '[]';
    let currentTime = 1000;
    const outbox = ClientReportingTransport.createOutbox({
        read: () => stored,
        write: value => { stored = value; },
        now: () => currentTime,
    });
    const first = outbox.enqueue({ source: 'same', message: 'failure' });
    const duplicate = outbox.enqueue({ source: 'same', message: 'failure' });
    assert.strictEqual(duplicate.id, first.id);
    assert.strictEqual(JSON.parse(stored).length, 1);

    assert.strictEqual(outbox.begin(first.id), true);
    outbox.defer(first.id);
    assert.deepStrictEqual(outbox.pending(), []);
    currentTime = 1999;
    assert.deepStrictEqual(outbox.pending(), []);
    currentTime = 2000;
    assert.strictEqual(outbox.pending().length, 1);

    outbox.begin(first.id);
    outbox.defer(first.id);
    currentTime = 3999;
    assert.deepStrictEqual(outbox.pending(), []);
    currentTime = 4000;
    assert.strictEqual(outbox.pending().length, 1);
});

runTest('client reporting transportは拒否・rate limit・転送失敗を表駆動で保持する', async () => {
    for (const status of [403, 429, 503]) {
        let stored = '[]';
        const outbox = ClientReportingTransport.createOutbox({
            read: () => stored,
            write: value => { stored = value; },
            now: () => 1000,
        });
        const subject = createSubject({
            outbox,
            fetchImpl() {
                return Promise.resolve({ ok: false, status });
            },
        });
        assert.strictEqual(ClientReportingTransport.send(subject.options), true, String(status));
        await Promise.resolve();
        await Promise.resolve();
        const entries = JSON.parse(stored);
        assert.strictEqual(entries.length, 1, String(status));
        assert.strictEqual(entries[0].attempts, 1, String(status));
        assert.strictEqual(entries[0].nextAttemptAt, 2000, String(status));
    }
});

runTest('client reporting transportはoffline相当のfetch失敗を再起動後まで保持する', async () => {
    let stored = '[]';
    let currentTime = 1000;
    const createOutbox = () => ClientReportingTransport.createOutbox({
        read: () => stored,
        write: value => { stored = value; },
        now: () => currentTime,
    });
    const offline = createSubject({
        outbox: createOutbox(),
        fetchImpl() {
            return Promise.reject(new TypeError('Failed to fetch'));
        },
    });
    assert.strictEqual(ClientReportingTransport.send(offline.options), true);
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(JSON.parse(stored)[0].attempts, 1);

    currentTime = 2000;
    const restarted = createSubject({
        outbox: createOutbox(),
        fetchImpl() {
            return Promise.resolve({ ok: true, status: 202 });
        },
    });
    assert.strictEqual(ClientReportingTransport.flush(restarted.options), 1);
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(stored, '[]');
});
