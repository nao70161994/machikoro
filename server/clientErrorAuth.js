'use strict';

function requestHeader(req, name) {
    if (!req) return '';
    if (typeof req.get === 'function') return req.get(name) || '';
    const headers = req.headers || {};
    return headers[name.toLowerCase()] || headers[name] || '';
}

function normalizeOriginValue(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    try {
        const parsed = new URL(text);
        return parsed.origin;
    } catch (_error) {
        return '';
    }
}

function requestBaseOrigin(req) {
    const host = requestHeader(req, 'host');
    if (!host) return '';
    const forwardedProto = requestHeader(req, 'x-forwarded-proto').split(',')[0].trim();
    const proto = forwardedProto || req?.protocol || 'http';
    return normalizeOriginValue(proto + '://' + host);
}

function clientErrorAllowedOrigins(req, env = process.env) {
    const configured = String(env.CLIENT_ERROR_ALLOWED_ORIGINS || env.CLIENT_ERROR_ALLOWED_ORIGIN || '')
        .split(',')
        .map(normalizeOriginValue)
        .filter(Boolean);
    const sameOrigin = requestBaseOrigin(req);
    if (sameOrigin) configured.push(sameOrigin);
    return Array.from(new Set(configured));
}

function hasClientReportOrigin(req) {
    return !!(normalizeOriginValue(requestHeader(req, 'origin')) ||
        normalizeOriginValue(requestHeader(req, 'referer')));
}

function isClientErrorOriginAllowed(req, env = process.env) {
    const origin = normalizeOriginValue(requestHeader(req, 'origin')) ||
        normalizeOriginValue(requestHeader(req, 'referer'));
    if (!origin) return true;
    return clientErrorAllowedOrigins(req, env).includes(origin);
}

function clientErrorSharedToken(env = process.env) {
    return String(env.CLIENT_ERROR_SHARED_TOKEN || env.CLIENT_ERROR_TOKEN || '').trim();
}

function isProductionNoOriginClientErrorBlocked(req, env = process.env) {
    if (hasClientReportOrigin(req)) return false;
    if (clientErrorSharedToken(env)) return false;
    if (String(env.CLIENT_ERROR_ALLOW_NO_ORIGIN || '').trim()) return false;
    return String(env.NODE_ENV || '').toLowerCase() === 'production' &&
        !!String(env.NTFY_TOPIC || '').trim();
}

function requestClientErrorToken(req) {
    const headerToken = String(requestHeader(req, 'x-client-error-token') || '').trim();
    if (headerToken) return headerToken;
    const authorization = String(requestHeader(req, 'authorization') || '').trim();
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

function authorizeClientErrorRequest(req, env = process.env, authOptions = {}) {
    if (!isClientErrorOriginAllowed(req, env)) return { ok: false, error: 'forbidden_origin' };
    if (isProductionNoOriginClientErrorBlocked(req, env)) {
        return { ok: false, error: 'forbidden_origin' };
    }
    const expectedToken = clientErrorSharedToken(env);
    if (!expectedToken) return { ok: true };
    if (authOptions.allowSameOriginWithoutToken !== false && hasClientReportOrigin(req)) {
        return { ok: true };
    }
    return requestClientErrorToken(req) === expectedToken
        ? { ok: true }
        : { ok: false, error: 'invalid_client_error_token' };
}

module.exports = {
    requestHeader,
    normalizeOriginValue,
    requestBaseOrigin,
    clientErrorAllowedOrigins,
    hasClientReportOrigin,
    isClientErrorOriginAllowed,
    clientErrorSharedToken,
    isProductionNoOriginClientErrorBlocked,
    requestClientErrorToken,
    authorizeClientErrorRequest,
};
