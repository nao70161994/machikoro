'use strict';

const assert = require('assert');
const makeGameLifecycleGateway = require('../server/gameLifecycleGateway');
const { runTest } = require('./helpers/test-utils');

function responseRecorder() {
    return {
        statusCode: null,
        body: null,
        headers: {},
        set(name, value) {
            this.headers[name] = value;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

function makeGateway(overrides = {}) {
    const calls = [];
    const dependencies = {
        defaultEnv: { NODE_ENV: 'test' },
        defaultRateBuckets: new Map(),
        defaultDedupeCache: new Map(),
        authorizeRequest() {
            calls.push(['authorize']);
            return { ok: true };
        },
        reportRateKey() {
            calls.push(['rate-key']);
            return 'client-key';
        },
        isRateLimited(key, now, buckets) {
            calls.push(['rate-limit', key, now, buckets]);
            return false;
        },
        normalizePayload(payload, now) {
            calls.push(['normalize', payload, now]);
            return { ok: true, report: { event: 'play-start' } };
        },
        isDuplicate(report, now, cache) {
            calls.push(['dedupe', report, now, cache]);
            return false;
        },
        rememberDuplicate(report, now, cache) {
            calls.push(['remember', report, now, cache]);
        },
        async notify(report, options) {
            calls.push(['notify', report, options]);
            return { sent: true };
        },
    };
    Object.assign(dependencies, overrides);
    return {
        calls,
        dependencies,
        gateway: makeGameLifecycleGateway(dependencies),
    };
}

runTest('game lifecycle gateway preserves auth-rate-normalize-dedupe-notify order', async () => {
    const { gateway, calls, dependencies } = makeGateway();
    const res = responseRecorder();

    await gateway.handleGameLifecycleRequest(
        { body: { event: 'play-start' } },
        res,
        { now: 100, notifyOptions: { topic: 'topic' } }
    );

    assert.strictEqual(res.statusCode, 202);
    assert.deepStrictEqual(res.body, {
        ok: true,
        duplicate: false,
        result: { sent: true },
    });
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'authorize',
        'rate-key',
        'rate-limit',
        'normalize',
        'dedupe',
        'notify',
        'remember',
    ]);
    assert.strictEqual(calls[2][3], dependencies.defaultRateBuckets);
    assert.strictEqual(calls[4][3], dependencies.defaultDedupeCache);
    assert.deepStrictEqual(calls[5][2], {
        env: dependencies.defaultEnv,
        topic: 'topic',
    });
    assert.strictEqual(calls[6][3], dependencies.defaultDedupeCache);
});

runTest('game lifecycle gateway rejects auth rate and malformed input before notify', async () => {
    const cases = [
        {
            overrides: { authorizeRequest: () => ({ ok: false, error: 'forbidden_origin' }) },
            status: 403,
            body: { ok: false, error: 'forbidden_origin' },
        },
        {
            overrides: { isRateLimited: () => true },
            status: 429,
            body: { ok: false, error: 'rate_limited' },
        },
        {
            overrides: { normalizePayload: () => ({ ok: false, reason: 'bad-event' }) },
            status: 400,
            body: { ok: false, error: 'bad-event' },
        },
    ];

    for (const testCase of cases) {
        let notifications = 0;
        const { gateway } = makeGateway(Object.assign({}, testCase.overrides, {
            async notify() {
                notifications++;
                return { sent: true };
            },
        }));
        const res = responseRecorder();
        await gateway.handleGameLifecycleRequest({ body: {} }, res, { now: 5 });
        assert.strictEqual(res.statusCode, testCase.status);
        assert.deepStrictEqual(res.body, testCase.body);
        assert.strictEqual(notifications, 0);
    }
});

runTest('game lifecycle gateway suppresses duplicate delivery with stable result', async () => {
    let notifications = 0;
    const { gateway } = makeGateway({
        isDuplicate: () => true,
        async notify() {
            notifications++;
            return { sent: true };
        },
    });
    const res = responseRecorder();

    await gateway.handleGameLifecycleRequest({}, res, { now: 7 });

    assert.strictEqual(notifications, 0);
    assert.strictEqual(res.statusCode, 202);
    assert.deepStrictEqual(res.body, {
        ok: true,
        duplicate: true,
        result: { sent: false, reason: 'duplicate' },
    });
});

runTest('game lifecycle gatewayは通知失敗を503として返す', async () => {
    const cases = [
        { result: { sent: false, reason: 'missing-topic' }, reason: 'missing-topic' },
        { result: { sent: false, reason: 'ntfy-status' }, reason: 'ntfy-status' },
        { result: { sent: false, reason: 'ntfy-error' }, reason: 'ntfy-error' },
        { result: null, reason: 'invalid result' },
    ];
    for (const testCase of cases) {
        let remembered = 0;
        const { gateway } = makeGateway({
            async notify() {
                return testCase.result;
            },
            rememberDuplicate() { remembered++; },
        });
        const res = responseRecorder();

        await gateway.handleGameLifecycleRequest({}, res, {
            env: { NODE_ENV: 'production' },
            now: 9,
        });

        assert.strictEqual(res.statusCode, 503, testCase.reason);
        assert.strictEqual(res.body.ok, false, testCase.reason);
        assert.strictEqual(res.body.error, 'notification_failed', testCase.reason);
        assert.strictEqual(res.body.duplicate, false, testCase.reason);
        assert.deepStrictEqual(
            res.body.result,
            testCase.result || { sent: false, reason: 'invalid-delivery-result' },
            testCase.reason
        );
        assert.strictEqual(remembered, 0, testCase.reason);
    }
});

runTest('game lifecycle gatewayは通知元の再送待機時間をheaderへ伝播する', async () => {
    const { gateway } = makeGateway({
        async notify() {
            return {
                sent: false,
                reason: 'ntfy-status',
                status: 429,
                retryAfterMs: 5200,
            };
        },
    });
    const res = responseRecorder();

    await gateway.handleGameLifecycleRequest({}, res, { now: 10 });

    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.headers['Retry-After'], '6');
});
