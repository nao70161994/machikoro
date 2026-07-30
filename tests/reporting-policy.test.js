'use strict';

const assert = require('assert');
const ReportingPolicy = require('../server/reportingPolicy');
const { runTest } = require('./helpers/test-utils');

runTest('reporting policyはtrust proxyの既存環境値を正規化する', () => {
    assert.strictEqual(ReportingPolicy.resolveTrustProxySetting({}), false);
    assert.strictEqual(ReportingPolicy.resolveTrustProxySetting({ TRUST_PROXY: 'off' }), false);
    assert.strictEqual(ReportingPolicy.resolveTrustProxySetting({ TRUST_PROXY: 'true' }), 1);
    assert.strictEqual(ReportingPolicy.resolveTrustProxySetting({ EXPRESS_TRUST_PROXY: 'loopback' }), 'loopback');
});

runTest('reporting policyはrate keyとntfy topicの既存fallbackを維持する', () => {
    assert.strictEqual(ReportingPolicy.clientReportRateKey({ ip: 'proxy-ip', socket: { remoteAddress: 'socket-ip' } }), 'proxy-ip');
    assert.strictEqual(ReportingPolicy.clientReportRateKey({ socket: { remoteAddress: 'socket-ip' } }), 'socket-ip');
    assert.strictEqual(ReportingPolicy.clientReportRateKey({}), 'unknown');
    assert.strictEqual(ReportingPolicy.resolveNtfyTopic({ topic: '' }, { NODE_ENV: 'production', NTFY_TOPIC: 'env-topic' }), '');
    assert.strictEqual(ReportingPolicy.resolveNtfyTopic({}, { NODE_ENV: 'production', NTFY_TOPIC: 'env-topic' }), 'env-topic');
    assert.strictEqual(ReportingPolicy.resolveNtfyTopic({}, { NODE_ENV: 'development', NTFY_TOPIC: 'env-topic' }), '');
});

runTest('reporting policyはdebug endpointとlifecycle dedupeの契約を固定する', () => {
    assert.strictEqual(ReportingPolicy.isClientErrorTestEnabled({ NODE_ENV: 'production' }), false);
    assert.strictEqual(ReportingPolicy.isClientErrorTestEnabled({ NODE_ENV: 'production', CLIENT_ERROR_TEST_ENABLED: 'yes' }), true);
    assert.strictEqual(ReportingPolicy.isClientErrorTestEnabled({ NODE_ENV: 'test' }), true);
    const payload = ReportingPolicy.createClientErrorTestPayload(1700000000000, 'build-1');
    assert.strictEqual(payload.timestamp, '2023-11-14T22:13:20.000Z');
    assert.strictEqual(payload.appVersion, 'build-1');
    assert.strictEqual(ReportingPolicy.gameLifecycleDedupeKey({ event: 'play-start', sessionId: 'session-1' }), 'play-start|session-1');
});
