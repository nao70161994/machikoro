'use strict';

const assert = require('assert');
const {
    createCspReportCollector,
    makeCspReportHandler,
    normalizeBlockedOrigin,
    normalizeCspViolation,
} = require('../server/cspReportGateway');
const { runTest } = require('./helpers/test-utils');

runTest('CSP report normalization keeps only directive, disposition, and blocked origin', () => {
    const report = normalizeCspViolation({
        'csp-report': {
            'effective-directive': 'script-src-elem',
            'blocked-uri': 'https://cdn.example/assets/app.js?session=private#fragment',
            'document-uri': 'https://game.example/room?token=private',
            'source-file': 'https://game.example/js/main.js?secret=private',
            'original-policy': "script-src 'self'",
            disposition: 'report',
        },
    });
    assert.deepStrictEqual(report, {
        directive: 'script-src-elem',
        blockedOrigin: 'https://cdn.example',
        disposition: 'report',
    });
    assert.strictEqual(normalizeCspViolation({ 'csp-report': { 'blocked-uri': 'inline' } }), null);
    assert.strictEqual(normalizeCspViolation([]), null);
    assert.strictEqual(normalizeBlockedOrigin('inline'), 'inline');
    assert.strictEqual(normalizeBlockedOrigin('https://example.test/a?secret=1'), 'https://example.test');
    assert.strictEqual(normalizeBlockedOrigin('not a URL with spaces'), 'other');
});

runTest('CSP report collector aggregates identical violations and bounds memory and log volume', () => {
    let now = 1000;
    const logs = [];
    const collector = createCspReportCollector({
        maxBuckets: 2,
        maxLogsPerWindow: 1,
        logWindowMs: 60000,
        now: () => now,
        log: (...args) => logs.push(args),
    });
    const first = { directive: 'script-src', blockedOrigin: 'inline', disposition: 'report' };
    assert.strictEqual(collector.record(first), true);
    assert.strictEqual(collector.record(first), true);
    assert.strictEqual(collector.record({ directive: 'img-src', blockedOrigin: 'data', disposition: 'report' }), true);
    assert.strictEqual(collector.record({ directive: 'font-src', blockedOrigin: 'https://fonts.example', disposition: 'report' }), true);
    assert.strictEqual(collector.record({ directive: 'style-src', blockedOrigin: 'bad', disposition: 'invalid' }), false);
    assert.deepStrictEqual(collector.snapshot(), {
        totalReports: 4,
        buckets: [
            { directive: 'img-src', blockedOrigin: 'data', disposition: 'report', count: 1 },
            { directive: 'font-src', blockedOrigin: 'https://fonts.example', disposition: 'report', count: 1 },
        ],
    });
    assert.strictEqual(logs.length, 1);
    assert.ok(!JSON.stringify(logs).includes('private'));
    now += 60001;
    collector.record(first);
    assert.strictEqual(logs.length, 2);
});

runTest('CSP report handler rate limits and returns no-store 204 without echoing report data', async () => {
    const seen = [];
    let limited = false;
    const handler = makeCspReportHandler({
        rateKey: req => req.ip,
        isRateLimited(key, now) {
            seen.push(['rate', key, now]);
            return limited;
        },
        now: () => 1234,
        collector: { record(report) { seen.push(['record', report]); } },
    });
    function response() {
        const calls = [];
        return {
            calls,
            setHeader(name, value) { calls.push(['header', name, value]); },
            status(code) { calls.push(['status', code]); return this; },
            end() { calls.push(['end']); },
            json(body) { calls.push(['json', body]); },
        };
    }

    const accepted = response();
    await handler({ ip: '127.0.0.1', body: {
        'csp-report': { 'violated-directive': 'img-src', 'blocked-uri': 'https://bad.test/secret?token=x' },
    } }, accepted);
    assert.deepStrictEqual(accepted.calls, [
        ['header', 'Cache-Control', 'no-store'],
        ['status', 204],
        ['end'],
    ]);
    assert.deepStrictEqual(seen, [
        ['rate', '127.0.0.1', 1234],
        ['record', { directive: 'img-src', blockedOrigin: 'https://bad.test', disposition: 'report' }],
    ]);

    limited = true;
    const rejected = response();
    await handler({ ip: '127.0.0.1', body: {} }, rejected);
    assert.deepStrictEqual(rejected.calls, [
        ['status', 429],
        ['json', { ok: false, error: 'rate_limited' }],
    ]);
});

console.log('CSP report gateway tests passed');
