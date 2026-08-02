'use strict';

function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(name + ' must be a function');
    return value;
}

/**
 * Creates the HTTP request orchestration boundary for client-error reporting.
 * Authentication, normalization, throttling, dedupe, and notification policies
 * stay injected so this gateway owns only their existing order and responses.
 * @param {Object} dependencies
 * @returns {{
 *   handleClientErrorRequest: function(Object, Object, Object=): Promise<void>,
 *   buildClientErrorTestPayload: function(number=, string=): Object,
 *   handleClientErrorTestRequest: function(Object, Object, Object=): Promise<void>
 * }}
 */
function makeClientErrorGateway(dependencies = {}) {
    const authorizeRequest = requireFunction(
        dependencies.authorizeRequest,
        'authorizeRequest'
    );
    const reportRateKey = requireFunction(dependencies.reportRateKey, 'reportRateKey');
    const isRateLimited = requireFunction(dependencies.isRateLimited, 'isRateLimited');
    const normalizePayload = requireFunction(dependencies.normalizePayload, 'normalizePayload');
    const isDuplicate = requireFunction(dependencies.isDuplicate, 'isDuplicate');
    const notify = requireFunction(dependencies.notify, 'notify');
    const isTestEnabled = requireFunction(dependencies.isTestEnabled, 'isTestEnabled');
    const createTestPayload = requireFunction(
        dependencies.createTestPayload,
        'createTestPayload'
    );
    const defaultEnv = dependencies.defaultEnv || {};
    const defaultBuildHash = dependencies.defaultBuildHash || '';
    const warn = typeof dependencies.warn === 'function'
        ? dependencies.warn
        : (...args) => console.warn(...args);

    function buildClientErrorTestPayload(
        now = Date.now(),
        buildHash = defaultBuildHash
    ) {
        return createTestPayload(now, buildHash);
    }

    async function handleClientErrorRequest(req, res, options = {}) {
        const env = options.env || defaultEnv;
        const auth = authorizeRequest(req, env);
        if (!auth.ok) {
            res.status(403).json({ ok: false, error: auth.error });
            return;
        }
        const now = options.now || Date.now();
        const rateKey = reportRateKey(req);
        if (isRateLimited(
            rateKey,
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
        if (!duplicate) {
            await notify(normalized.report, {
                env,
                ...(options.notifyOptions || {}),
            });
        }
        res.status(202).json({ ok: true, duplicate });
    }

    async function handleClientErrorTestRequest(req, res, options = {}) {
        const env = options.env || defaultEnv;
        const auth = authorizeRequest(req, env, {
            allowSameOriginWithoutToken: false,
        });
        if (!auth.ok) {
            res.status(403).json({ ok: false, error: auth.error });
            return;
        }
        if (!isTestEnabled(env)) {
            res.status(404).json({
                ok: false,
                error: 'client_error_test_disabled',
            });
            return;
        }
        if (!env.NTFY_TOPIC &&
                !(options.notifyOptions && options.notifyOptions.topic)) {
            warn(
                '[client-error-test] NTFY_TOPIC is not set; ' +
                'test notification was not sent'
            );
            res.status(503).json({
                ok: false,
                error: 'missing_ntfy_topic',
                message: 'NTFY_TOPIC is not set',
            });
            return;
        }
        const now = options.now || Date.now();
        const normalized = normalizePayload(
            buildClientErrorTestPayload(
                now,
                options.buildHash || defaultBuildHash
            ),
            now
        );
        if (!normalized.ok) {
            res.status(500).json({ ok: false, error: normalized.reason });
            return;
        }
        const result = await notify(normalized.report, {
            env,
            ...(options.notifyOptions || {}),
        });
        res.status(result.sent ? 202 : 503).json({
            ok: result.sent,
            test: true,
            result,
        });
    }

    return Object.freeze({
        handleClientErrorRequest,
        buildClientErrorTestPayload,
        handleClientErrorTestRequest,
    });
}

module.exports = makeClientErrorGateway;
