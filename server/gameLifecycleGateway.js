'use strict';

function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(name + ' must be a function');
    return value;
}

/**
 * Creates the HTTP request orchestration boundary for lifecycle reports.
 * Authentication, normalization, throttling, dedupe, and delivery remain
 * injected policies; this gateway owns only their established order/response.
 * @param {Object} dependencies
 * @returns {{handleGameLifecycleRequest: function(Object, Object, Object=): Promise<void>}}
 */
function makeGameLifecycleGateway(dependencies = {}) {
    const authorizeRequest = requireFunction(
        dependencies.authorizeRequest,
        'authorizeRequest'
    );
    const reportRateKey = requireFunction(dependencies.reportRateKey, 'reportRateKey');
    const isRateLimited = requireFunction(dependencies.isRateLimited, 'isRateLimited');
    const normalizePayload = requireFunction(dependencies.normalizePayload, 'normalizePayload');
    const isDuplicate = requireFunction(dependencies.isDuplicate, 'isDuplicate');
    const notify = requireFunction(dependencies.notify, 'notify');
    const defaultEnv = dependencies.defaultEnv || {};

    async function handleGameLifecycleRequest(req, res, options = {}) {
        const env = options.env || defaultEnv;
        const auth = authorizeRequest(req, env);
        if (!auth.ok) {
            res.status(403).json({ ok: false, error: auth.error });
            return;
        }
        const now = options.now || Date.now();
        if (isRateLimited(
            reportRateKey(req),
            now,
            options.rateBuckets || dependencies.defaultRateBuckets
        )) {
            res.status(429).json({ ok: false, error: 'rate_limited' });
            return;
        }
        const normalized = normalizePayload(req.body, now);
        if (!normalized.ok) {
            res.status(400).json({ ok: false, error: normalized.reason });
            return;
        }
        const duplicate = isDuplicate(
            normalized.report,
            now,
            options.dedupeCache || dependencies.defaultDedupeCache
        );
        if (duplicate) {
            res.status(202).json({
                ok: true,
                duplicate: true,
                result: { sent: false, reason: 'duplicate' },
            });
            return;
        }
        const result = await notify(normalized.report, {
            env,
            ...(options.notifyOptions || {}),
        });
        if (!result || result.sent !== true) {
            if (result && Number.isFinite(result.retryAfterMs) &&
                result.retryAfterMs > 0 && typeof res.set === 'function') {
                res.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
            }
            res.status(503).json({
                ok: false,
                error: 'notification_failed',
                duplicate: false,
                result: result || { sent: false, reason: 'invalid-delivery-result' },
            });
            return;
        }
        res.status(202).json({ ok: true, duplicate: false, result });
    }

    return Object.freeze({ handleGameLifecycleRequest });
}

module.exports = makeGameLifecycleGateway;
