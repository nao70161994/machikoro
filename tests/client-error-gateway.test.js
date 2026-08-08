'use strict';

const assert = require('assert');
const makeClientErrorGateway = require('../server/clientErrorGateway');
const { runTest } = require('./helpers/test-utils');

function responseRecorder() {
    return {
        statusCode: null,
        body: null,
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
        defaultBuildHash: 'default-hash',
        defaultRateBuckets: new Map(),
        defaultDedupeCache: new Map(),
        warn(message) { calls.push(['warn', message]); },
        authorizeRequest() {
            calls.push(['authorize']);
            return { ok: true };
        },
        reportRateKey() {
            calls.push(['rate-key']);
            return 'rate-key';
        },
        isRateLimited(key, now, buckets) {
            calls.push(['rate-limit', key, now, buckets]);
            return false;
        },
        normalizePayload(payload, now) {
            calls.push(['normalize', payload, now]);
            return { ok: true, report: { message: 'report' } };
        },
        isDuplicate(report, now, cache) {
            calls.push(['dedupe', report, now, cache]);
            return false;
        },
        async notify(report, options) {
            calls.push(['notify', report, options]);
            return { sent: true };
        },
        isTestEnabled() {
            calls.push(['test-enabled']);
            return true;
        },
        createTestPayload(now, buildHash) {
            calls.push(['test-payload', now, buildHash]);
            return { source: 'test', now, buildHash };
        },
        healthSnapshot(env, fetchAvailable, buildHash) {
            calls.push(['health', env, fetchAvailable, buildHash]);
            return {
                ok: true,
                production: true,
                ntfyConfigured: true,
                transportAvailable: true,
                buildHash,
            };
        },
    };
    Object.assign(dependencies, overrides);
    return {
        calls,
        gateway: makeClientErrorGateway(dependencies),
        dependencies,
    };
}

runTest('client error gateway preserves auth-rate-normalize-dedupe-notify order', async () => {
    const { gateway, calls, dependencies } = makeGateway();
    const res = responseRecorder();

    await gateway.handleClientErrorRequest(
        { body: { source: 'browser' } },
        res,
        { now: 123, notifyOptions: { topic: 'topic' } }
    );

    assert.strictEqual(res.statusCode, 202);
    assert.deepStrictEqual(res.body, {
        ok: true,
        duplicate: false,
        delivery: { sent: true },
    });
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'authorize',
        'rate-key',
        'rate-limit',
        'normalize',
        'dedupe',
        'notify',
    ]);
    assert.strictEqual(calls[2][3], dependencies.defaultRateBuckets);
    assert.strictEqual(calls[4][3], dependencies.defaultDedupeCache);
    assert.deepStrictEqual(calls[5][2], {
        env: dependencies.defaultEnv,
        topic: 'topic',
    });
});

runTest('client error gateway fails before later stages for auth rate and payload errors', async () => {
    const cases = [
        {
            overrides: { authorizeRequest: () => ({ ok: false, error: 'denied' }) },
            status: 403,
            body: { ok: false, error: 'denied' },
        },
        {
            overrides: { isRateLimited: () => true },
            status: 429,
            body: { ok: false, error: 'rate_limited' },
        },
        {
            overrides: { normalizePayload: () => ({ ok: false, reason: 'bad' }) },
            status: 400,
            body: { ok: false, error: 'bad' },
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
        await gateway.handleClientErrorRequest({ body: {} }, res, { now: 10 });
        assert.strictEqual(res.statusCode, testCase.status);
        assert.deepStrictEqual(res.body, testCase.body);
        assert.strictEqual(notifications, 0);
    }
});

runTest('client error gateway skips duplicate notification but keeps accepted response', async () => {
    let notifications = 0;
    const { gateway } = makeGateway({
        isDuplicate: () => true,
        async notify() {
            notifications++;
            return { sent: true };
        },
    });
    const res = responseRecorder();

    await gateway.handleClientErrorRequest({ body: {} }, res, { now: 20 });

    assert.strictEqual(notifications, 0);
    assert.strictEqual(res.statusCode, 202);
    assert.deepStrictEqual(res.body, { ok: true, duplicate: true });
});

runTest('client error gatewayはntfy転送失敗を503と理由付きで返す', async () => {
    const cases = [
        { delivery: { sent: false, reason: 'missing-topic' }, reason: 'missing-topic' },
        { delivery: { sent: false, reason: 'ntfy-status' }, reason: 'ntfy-status' },
        { delivery: { sent: false, reason: 'ntfy-error' }, reason: 'ntfy-error' },
        { delivery: undefined, reason: 'invalid-delivery-result' },
    ];
    for (const testCase of cases) {
        const { gateway } = makeGateway({
            async notify() { return testCase.delivery; },
        });
        const res = responseRecorder();
        await gateway.handleClientErrorRequest({ body: {} }, res, { now: 30 });
        assert.strictEqual(res.statusCode, 503, testCase.reason);
        assert.strictEqual(res.body.ok, false, testCase.reason);
        assert.strictEqual(res.body.error, 'notification_failed', testCase.reason);
        assert.strictEqual(res.body.duplicate, false, testCase.reason);
        assert.strictEqual(res.body.delivery.reason, testCase.reason, testCase.reason);
    }
});

runTest('client error test gateway preserves strict auth and availability gates', async () => {
    const authOptions = [];
    const auth = makeGateway({
        authorizeRequest(req, env, options) {
            authOptions.push(options);
            return { ok: false, error: 'invalid_client_error_token' };
        },
    });
    const blocked = responseRecorder();
    await auth.gateway.handleClientErrorTestRequest({}, blocked);
    assert.deepStrictEqual(authOptions, [{ allowSameOriginWithoutToken: false }]);
    assert.strictEqual(blocked.statusCode, 403);

    const disabled = makeGateway({ isTestEnabled: () => false });
    const disabledRes = responseRecorder();
    await disabled.gateway.handleClientErrorTestRequest({}, disabledRes);
    assert.strictEqual(disabledRes.statusCode, 404);
    assert.deepStrictEqual(disabledRes.body, {
        ok: false,
        error: 'client_error_test_disabled',
    });

    const missing = makeGateway();
    const missingRes = responseRecorder();
    await missing.gateway.handleClientErrorTestRequest({}, missingRes);
    assert.strictEqual(missingRes.statusCode, 503);
    assert.strictEqual(missingRes.body.error, 'missing_ntfy_topic');
    assert.strictEqual(missing.calls.filter(call => call[0] === 'warn').length, 1);
});

runTest('client error test gateway builds normalized payload and mirrors delivery result', async () => {
    const { gateway, calls } = makeGateway({
        async notify(report, options) {
            calls.push(['delivered', report, options]);
            return { sent: false, reason: 'http' };
        },
    });
    const res = responseRecorder();

    await gateway.handleClientErrorTestRequest({}, res, {
        env: { CLIENT_ERROR_TEST_ENABLED: '1' },
        now: 456,
        buildHash: 'explicit-hash',
        notifyOptions: { topic: 'topic' },
    });

    assert.strictEqual(res.statusCode, 503);
    assert.deepStrictEqual(res.body, {
        ok: false,
        test: true,
        result: { sent: false, reason: 'http' },
    });
    assert.deepStrictEqual(
        calls.find(call => call[0] === 'test-payload'),
        ['test-payload', 456, 'explicit-hash']
    );
    const normalized = calls.find(call => call[0] === 'normalize');
    assert.deepStrictEqual(normalized[1], {
        source: 'test',
        now: 456,
        buildHash: 'explicit-hash',
    });
    assert.strictEqual(normalized[2], 456);
});

runTest('client error health gatewayはstrict auth後に非送信readinessだけを返す', async () => {
    const authOptions = [];
    const { gateway, calls } = makeGateway({
        authorizeRequest(req, env, options) {
            authOptions.push(options);
            return { ok: true };
        },
    });
    const res = responseRecorder();
    await gateway.handleClientErrorHealthRequest({}, res, {
        env: { NODE_ENV: 'production', NTFY_TOPIC: 'topic' },
        buildHash: 'health-build',
        fetchImpl: async () => {},
    });
    assert.deepStrictEqual(authOptions, [{ allowSameOriginWithoutToken: false }]);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, true);
    assert.ok(calls.some(call => call[0] === 'health' && call[2] === true &&
        call[3] === 'health-build'));

    const unavailable = makeGateway({
        healthSnapshot() {
            return { ok: false, ntfyConfigured: false, transportAvailable: true };
        },
    });
    const unavailableRes = responseRecorder();
    await unavailable.gateway.handleClientErrorHealthRequest({}, unavailableRes);
    assert.strictEqual(unavailableRes.statusCode, 503);
});

runTest('client error test gateway reports normalization failure before notification', async () => {
    let notifications = 0;
    const { gateway } = makeGateway({
        normalizePayload: () => ({ ok: false, reason: 'invalid-test-payload' }),
        async notify() {
            notifications++;
            return { sent: true };
        },
    });
    const res = responseRecorder();

    await gateway.handleClientErrorTestRequest({}, res, {
        env: { CLIENT_ERROR_TEST_ENABLED: '1' },
        notifyOptions: { topic: 'topic' },
    });

    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, {
        ok: false,
        error: 'invalid-test-payload',
    });
    assert.strictEqual(notifications, 0);
});

runTest('client error gateway builds test payload with explicit and default hash', () => {
    const { gateway } = makeGateway();
    assert.deepStrictEqual(gateway.buildClientErrorTestPayload(1, 'explicit'), {
        source: 'test',
        now: 1,
        buildHash: 'explicit',
    });
    assert.deepStrictEqual(gateway.buildClientErrorTestPayload(2), {
        source: 'test',
        now: 2,
        buildHash: 'default-hash',
    });
});
