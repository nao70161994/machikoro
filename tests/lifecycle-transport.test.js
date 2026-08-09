const assert = require('assert');
const LifecycleTransport = require('../js/lifecycleTransport');
const { runTest } = require('./helpers/test-utils');

function createSubject(overrides = {}) {
    const checkpoints = [];
    const fetchCalls = [];
    let buildCount = 0;
    const payload = {
        event: 'play-start',
        mode: 'local',
        playerCount: 4,
        cpuCount: 3,
        sessionId: 'session-1',
        appVersion: 'abc123',
    };
    const options = Object.assign({
        enabled: true,
        event: 'play-start',
        endpoint: '/api/game-lifecycle',
        buildPayload() {
            buildCount += 1;
            return payload;
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
        payload,
        buildCount: () => buildCount,
    };
}

runTest('lifecycle transportは無効・fetch不在時にpayloadを生成しない', () => {
    const disabled = createSubject({ enabled: false });
    assert.strictEqual(LifecycleTransport.send(disabled.options), false);
    assert.strictEqual(disabled.buildCount(), 0);
    assert.deepStrictEqual(disabled.checkpoints, [{
        event: 'game-lifecycle-disabled',
        details: { event: 'play-start' },
    }]);

    const unavailable = createSubject({ fetchImpl: null });
    assert.strictEqual(LifecycleTransport.send(unavailable.options), false);
    assert.strictEqual(unavailable.buildCount(), 0);
    assert.deepStrictEqual(unavailable.checkpoints, [{
        event: 'game-lifecycle-fetch-unavailable',
        details: { event: 'play-start' },
    }]);
});

runTest('lifecycle transportは既存POST payloadと開始checkpoint順を維持する', () => {
    const subject = createSubject();
    assert.strictEqual(LifecycleTransport.send(subject.options), true);
    assert.strictEqual(subject.buildCount(), 1);
    assert.deepStrictEqual(subject.fetchCalls, [{
        url: '/api/game-lifecycle',
        init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subject.payload),
            keepalive: true,
        },
    }]);
    assert.deepStrictEqual(subject.checkpoints, [{
        event: 'game-lifecycle-fetch-start',
        details: { event: 'play-start', mode: 'local', playerCount: 4, cpuCount: 3 },
    }]);
});

runTest('lifecycle transportは非同期成功と失敗を既存checkpointへ投影する', async () => {
    const success = createSubject({
        fetchImpl() {
            return Promise.resolve({ ok: true, status: 204 });
        },
    });
    assert.strictEqual(LifecycleTransport.send(success.options), true);
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual(success.checkpoints[1], {
        event: 'game-lifecycle-fetch-complete',
        details: { event: 'play-start', ok: true, status: 204 },
    });

    const failure = createSubject({
        fetchImpl() {
            return Promise.reject(new Error('network down'));
        },
    });
    assert.strictEqual(LifecycleTransport.send(failure.options), true);
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual(failure.checkpoints[1], {
        event: 'game-lifecycle-fetch-failed',
        details: { event: 'play-start', message: 'network down' },
    });
});

runTest('lifecycle transportは同期例外を既存checkpointへ変換する', () => {
    const subject = createSubject({
        fetchImpl() {
            throw new Error('fetch threw');
        },
    });
    assert.strictEqual(LifecycleTransport.send(subject.options), false);
    assert.deepStrictEqual(subject.checkpoints[1], {
        event: 'game-lifecycle-fetch-threw',
        details: { event: 'play-start', message: 'fetch threw' },
    });
});

runTest('lifecycle transportは失敗通知を永続化して再起動後に再送する', async () => {
    let stored = '[]';
    let now = 1000;
    const storage = {
        read: () => stored,
        write: value => { stored = value; },
        now: () => now,
    };
    const firstOutbox = LifecycleTransport.createOutbox(storage);
    const failed = createSubject({
        outbox: firstOutbox,
        fetchImpl() {
            return Promise.resolve({ ok: false, status: 503 });
        },
    });

    assert.strictEqual(LifecycleTransport.send(failed.options), true);
    await Promise.resolve();
    await Promise.resolve();
    const queued = JSON.parse(stored);
    assert.strictEqual(queued.length, 1);
    assert.strictEqual(queued[0].payload.event, 'play-start');
    assert.strictEqual(queued[0].attempts, 1);

    now = 6000;
    const restartedOutbox = LifecycleTransport.createOutbox(storage);
    const checkpoints = [];
    const sent = [];
    assert.strictEqual(LifecycleTransport.flush({
        endpoint: '/api/game-lifecycle',
        outbox: restartedOutbox,
        checkpoint: (...args) => checkpoints.push(args),
        fetchImpl(url, init) {
            sent.push({ url, init });
            return Promise.resolve({ ok: true, status: 202 });
        },
    }), 1);
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(sent.length, 1);
    assert.strictEqual(JSON.parse(sent[0].init.body).sessionId, 'session-1');
    assert.strictEqual(JSON.parse(stored).length, 0);
    assert.strictEqual(checkpoints[0][0], 'game-lifecycle-retry-start');
});

runTest('lifecycle transportはRetry-After後に自動flushを予約する', async () => {
    let stored = '[]';
    let now = 1000;
    const scheduled = [];
    const outbox = LifecycleTransport.createOutbox({
        read: () => stored,
        write: value => { stored = value; },
        now: () => now,
    });
    const subject = createSubject({
        outbox,
        scheduleRetry: delayMs => scheduled.push(delayMs),
        fetchImpl() {
            return Promise.resolve({
                ok: false,
                status: 503,
                headers: { get: name => name === 'Retry-After' ? '5' : null },
            });
        },
    });

    LifecycleTransport.send(subject.options);
    await Promise.resolve();
    await Promise.resolve();

    assert.deepStrictEqual(scheduled, [5000]);
    assert.strictEqual(JSON.parse(stored)[0].nextAttemptAt, 6000);
    now = 6000;
    assert.strictEqual(outbox.pending().length, 1);
});

runTest('lifecycle transportの自動flushはoutboxを一件ずつ送る', () => {
    let stored = '[]';
    const outbox = LifecycleTransport.createOutbox({
        read: () => stored,
        write: value => { stored = value; },
        now: () => 1000,
    });
    outbox.enqueue({ event: 'play-start', sessionId: 'one' });
    outbox.enqueue({ event: 'play-finish', sessionId: 'two' });
    let calls = 0;

    assert.strictEqual(LifecycleTransport.flush({
        endpoint: '/api/game-lifecycle',
        outbox,
        checkpoint() {},
        maxDeliveries: 1,
        fetchImpl() {
            calls += 1;
            return null;
        },
    }), 1);
    assert.strictEqual(calls, 1);
});

runTest('lifecycle transportは早く起きたtimerから次の再送時刻を再予約する', () => {
    let stored = JSON.stringify([{
        id: 'future-entry',
        createdAt: 1000,
        attempts: 2,
        nextAttemptAt: 9000,
        payload: { event: 'play-start', sessionId: 'future' },
    }]);
    const scheduled = [];
    const outbox = LifecycleTransport.createOutbox({
        read: () => stored,
        write: value => { stored = value; },
        now: () => 4000,
    });

    assert.strictEqual(LifecycleTransport.flush({
        endpoint: '/api/game-lifecycle',
        outbox,
        checkpoint() {},
        scheduleRetry: delayMs => scheduled.push(delayMs),
        fetchImpl() {
            throw new Error('future entry must not be sent early');
        },
    }), 0);
    assert.deepStrictEqual(scheduled, [5000]);
});

runTest('lifecycle transportはRetry-After秒数とHTTP日付を解釈する', () => {
    assert.strictEqual(LifecycleTransport.responseRetryAfterMs({
        status: 503,
        headers: { get: () => '12' },
    }, 1000), 12000);
    assert.strictEqual(LifecycleTransport.responseRetryAfterMs({
        status: 503,
        headers: { get: () => new Date(9000).toUTCString() },
    }, 1000), 8000);
    assert.strictEqual(LifecycleTransport.responseRetryAfterMs({
        status: 503,
        headers: { get: () => null },
    }, 1000), 5000);
});

runTest('lifecycle transport outboxは重複と上限を制御しfetch不在でも保持する', () => {
    let stored = '[]';
    const outbox = LifecycleTransport.createOutbox({
        read: () => stored,
        write: value => { stored = value; },
        now: () => 5000,
        maxEntries: 2,
    });
    const first = createSubject({ outbox, fetchImpl: null });
    assert.strictEqual(LifecycleTransport.send(first.options), false);
    assert.strictEqual(LifecycleTransport.send(first.options), false);
    assert.strictEqual(JSON.parse(stored).length, 1);

    outbox.enqueue({ ...first.payload, event: 'play-finish' });
    outbox.enqueue({ ...first.payload, sessionId: 'session-2' });
    const entries = JSON.parse(stored);
    assert.strictEqual(entries.length, 2);
    assert.deepStrictEqual(entries.map(entry => entry.payload.sessionId), [
        'session-1',
        'session-2',
    ]);
});
