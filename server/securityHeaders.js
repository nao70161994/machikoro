'use strict';

const SECURITY_HEADERS = Object.freeze({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
    'X-Frame-Options': 'SAMEORIGIN',
});

// Report-only is transitional: the app currently has a large inline bootstrap
// and third-party ad scripts. Keep the report policy strict enough to expose
// those dependencies without changing the current page's execution behavior.
const CONTENT_SECURITY_POLICY_REPORT_ONLY = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "script-src 'self' https://pagead2.googlesyndication.com",
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' http: https: ws: wss:",
    "frame-src 'self' https:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
].join('; ');

/**
 * @param {Object} req
 * @param {{setHeader: function(string, string): *}} res
 * @param {function(): *} next
 * @returns {void}
 */
function securityHeadersMiddleware(req, res, next) {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        res.setHeader(name, value);
    }
    res.setHeader('Content-Security-Policy-Report-Only', CONTENT_SECURITY_POLICY_REPORT_ONLY);
    next();
}

module.exports = Object.freeze({
    SECURITY_HEADERS,
    CONTENT_SECURITY_POLICY_REPORT_ONLY,
    securityHeadersMiddleware,
});
