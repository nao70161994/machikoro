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
        /** @type {{sent: boolean, reason?: string}} */
        let result = {
            sent: false,
            reason: duplicate ? 'duplicate' : 'not-sent',
        };
        if (!duplicate) {
            result = await notify(normalized.report, {
                env,
                ...(options.notifyOptions || {}),
            });
        }
        res.status(202).json({ ok: true, duplicate, result });
    }

    return Object.freeze({ handleGameLifecycleRequest });
}

module.exports = makeGameLifecycleGateway;
