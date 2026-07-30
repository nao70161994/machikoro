'use strict';

const CLIENT_ERROR_TEST_ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function resolveTrustProxySetting(env = {}) {
    const value = String(env.TRUST_PROXY || env.EXPRESS_TRUST_PROXY || '').trim();
    if (!value) return false;
    const lower = value.toLowerCase();
    if (['0', 'false', 'no', 'off'].includes(lower)) return false;
    if (['1', 'true', 'yes', 'on'].includes(lower)) return 1;
    return value;
}

function clientReportRateKey(req) {
    return req?.ip || req?.socket?.remoteAddress || 'unknown';
}

function isNtfyConfigured(env = {}) {
    return String(env.NODE_ENV || '').toLowerCase() === 'production' &&
        !!String(env.NTFY_TOPIC || '').trim();
}

function resolveNtfyTopic(options = {}, env = {}) {
    if (Object.prototype.hasOwnProperty.call(options, 'topic')) return options.topic;
    return isNtfyConfigured(env) ? env.NTFY_TOPIC : '';
}

function isClientErrorTestEnabled(env = {}) {
    const explicit = String(env.CLIENT_ERROR_TEST_ENABLED || '').toLowerCase();
    if (CLIENT_ERROR_TEST_ENABLED_VALUES.has(explicit)) return true;
    const nodeEnv = String(env.NODE_ENV || '').toLowerCase();
    return nodeEnv === 'development' || nodeEnv === 'test';
}

function createClientErrorTestPayload(now, buildHash) {
    return {
        source: 'manual-test-endpoint',
        message: 'ダイスシティ ntfy test notification',
        stack: 'Manual test via /api/client-error-test; no real client error occurred.',
        filename: 'server.js',
        line: null,
        column: null,
        userAgent: 'server-side test endpoint',
        phase: 'test',
        roomId: 'TEST01',
        playerIndex: 0,
        timestamp: new Date(now).toISOString(),
        appVersion: buildHash,
    };
}

function gameLifecycleDedupeKey(report) {
    return [report.event, report.sessionId].join('|');
}

module.exports = {
    resolveTrustProxySetting,
    clientReportRateKey,
    isNtfyConfigured,
    resolveNtfyTopic,
    isClientErrorTestEnabled,
    createClientErrorTestPayload,
    gameLifecycleDedupeKey,
};
