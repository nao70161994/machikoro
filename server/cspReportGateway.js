'use strict';

function isPlainRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function readString(record, keys) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.length > 0 && value.length <= 2048) return value;
    }
    return '';
}

function normalizeBlockedOrigin(value) {
    const text = String(value || '').trim().slice(0, 2048);
    if (!text) return 'unknown';
    const keyword = text.toLowerCase();
    if (['inline', 'eval', 'wasm-eval', 'data', 'blob', 'filesystem'].includes(keyword)) {
        return keyword;
    }
    try {
        const parsed = new URL(text);
        if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
            return 'scheme:' + parsed.protocol.slice(0, 24);
        }
        return parsed.origin.slice(0, 300);
    } catch (_error) {
        return 'other';
    }
}

function normalizeCspViolation(payload) {
    if (!isPlainRecord(payload)) return null;
    const report = isPlainRecord(payload['csp-report']) ? payload['csp-report'] : payload;
    const rawDirective = readString(report, ['effective-directive', 'violated-directive', 'effectiveDirective']);
    const directive = rawDirective.toLowerCase().split(/[\s;]+/, 1)[0];
    if (!/^[a-z0-9-]{1,64}$/.test(directive)) return null;
    const disposition = readString(report, ['disposition']).toLowerCase() === 'enforce'
        ? 'enforce'
        : 'report';
    return Object.freeze({
        directive,
        blockedOrigin: normalizeBlockedOrigin(readString(report, ['blocked-uri', 'blockedURL', 'blockedUrl'])),
        disposition,
    });
}

function createCspReportCollector(options = {}) {
    const maxBuckets = Number.isInteger(options.maxBuckets) && options.maxBuckets > 0
        ? options.maxBuckets
        : 128;
    const maxLogsPerWindow = Number.isInteger(options.maxLogsPerWindow) && options.maxLogsPerWindow > 0
        ? options.maxLogsPerWindow
        : 20;
    const logWindowMs = Number.isInteger(options.logWindowMs) && options.logWindowMs > 0
        ? options.logWindowMs
        : 60 * 1000;
    const bucketLogIntervalMs = Number.isInteger(options.bucketLogIntervalMs) &&
        options.bucketLogIntervalMs > 0 ? options.bucketLogIntervalMs : 5 * 60 * 1000;
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const log = typeof options.log === 'function' ? options.log : (...args) => console.warn(...args);
    const buckets = new Map();
    let logWindowStartedAt = 0;
    let logsInWindow = 0;
    let totalReports = 0;

    function record(report) {
        if (!report || typeof report.directive !== 'string' ||
                typeof report.blockedOrigin !== 'string' ||
                !['report', 'enforce'].includes(report.disposition)) return false;
        const timestamp = now();
        if (timestamp - logWindowStartedAt >= logWindowMs) {
            logWindowStartedAt = timestamp;
            logsInWindow = 0;
        }
        const key = [report.directive, report.blockedOrigin, report.disposition].join('|');
        let bucket = buckets.get(key);
        if (!bucket) {
            if (buckets.size >= maxBuckets) buckets.delete(buckets.keys().next().value);
            bucket = { ...report, count: 0, lastLoggedAt: -Infinity };
            buckets.set(key, bucket);
        }
        bucket.count++;
        totalReports++;
        if (logsInWindow < maxLogsPerWindow &&
                timestamp - bucket.lastLoggedAt >= bucketLogIntervalMs) {
            bucket.lastLoggedAt = timestamp;
            logsInWindow++;
            log('[csp-report]', JSON.stringify({
                directive: bucket.directive,
                blockedOrigin: bucket.blockedOrigin,
                disposition: bucket.disposition,
                count: bucket.count,
            }));
        }
        return true;
    }

    function snapshot() {
        return Object.freeze({
            totalReports,
            buckets: Object.freeze(Array.from(buckets.values(), bucket => Object.freeze({
                directive: bucket.directive,
                blockedOrigin: bucket.blockedOrigin,
                disposition: bucket.disposition,
                count: bucket.count,
            }))),
        });
    }

    return Object.freeze({ record, snapshot });
}

function makeCspReportHandler(dependencies = {}) {
    if (typeof dependencies.isRateLimited !== 'function') {
        throw new TypeError('isRateLimited must be a function');
    }
    if (typeof dependencies.rateKey !== 'function') {
        throw new TypeError('rateKey must be a function');
    }
    if (!dependencies.collector || typeof dependencies.collector.record !== 'function') {
        throw new TypeError('collector.record must be a function');
    }
    const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now;

    return async function handleCspReportRequest(req, res) {
        if (dependencies.isRateLimited(dependencies.rateKey(req), now()) === true) {
            res.status(429).json({ ok: false, error: 'rate_limited' });
            return;
        }
        const report = normalizeCspViolation(req.body);
        if (report) dependencies.collector.record(report);
        res.setHeader('Cache-Control', 'no-store');
        res.status(204).end();
    };
}

module.exports = Object.freeze({
    createCspReportCollector,
    makeCspReportHandler,
    normalizeBlockedOrigin,
    normalizeCspViolation,
});
