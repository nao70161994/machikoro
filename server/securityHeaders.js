'use strict';

const crypto = require('crypto');

const SECURITY_HEADERS = Object.freeze({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
    'X-Frame-Options': 'SAMEORIGIN',
});

// Report-only avoids runtime impact while inline bootstrap hashes and ad-host
// dependencies are being verified in desktop/mobile WebKit and TWA clients.
function hashInlineScript(script) {
    return crypto.createHash('sha256').update(String(script)).digest('base64');
}

function buildContentSecurityPolicyReportOnly(inlineScriptHashes = []) {
    const hashSources = (Array.isArray(inlineScriptHashes) ? inlineScriptHashes : [])
        .filter(hash => typeof hash === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(hash))
        .map(hash => `'sha256-${hash}'`);
    return [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        `script-src 'self' https://pagead2.googlesyndication.com${hashSources.length ? ' ' + hashSources.join(' ') : ''}`,
        "style-src 'self' 'unsafe-inline' https:",
        "img-src 'self' data: https:",
        "font-src 'self' data: https:",
        "connect-src 'self' http: https: ws: wss:",
        "frame-src 'self' https:",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
    ].join('; ');
}

const CONTENT_SECURITY_POLICY_REPORT_ONLY = buildContentSecurityPolicyReportOnly();

/**
 * @param {Object} req
 * @param {{setHeader: function(string, string): *}} res
 * @param {function(): *} next
 * @returns {void}
 */
function securityHeadersMiddleware(req, res, next, options = {}) {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        res.setHeader(name, value);
    }
    const policy = typeof options.contentSecurityPolicyReportOnly === 'string'
        ? options.contentSecurityPolicyReportOnly
        : CONTENT_SECURITY_POLICY_REPORT_ONLY;
    res.setHeader('Content-Security-Policy-Report-Only', policy);
    next();
}

module.exports = Object.freeze({
    SECURITY_HEADERS,
    CONTENT_SECURITY_POLICY_REPORT_ONLY,
    buildContentSecurityPolicyReportOnly,
    hashInlineScript,
    securityHeadersMiddleware,
});
