'use strict';

const assert = require('assert');
const {
    SECURITY_HEADERS,
    CONTENT_SECURITY_POLICY_REPORT_ONLY,
    securityHeadersMiddleware,
} = require('../server/securityHeaders');

const headers = {};
let nextCalled = false;
securityHeadersMiddleware({}, {
    setHeader(name, value) {
        headers[name] = value;
    },
}, () => {
    nextCalled = true;
});

assert.deepStrictEqual(headers, {
    ...SECURITY_HEADERS,
    'Content-Security-Policy-Report-Only': CONTENT_SECURITY_POLICY_REPORT_ONLY,
});
assert.strictEqual(nextCalled, true);
assert.match(CONTENT_SECURITY_POLICY_REPORT_ONLY, /object-src 'none'/);
assert.match(CONTENT_SECURITY_POLICY_REPORT_ONLY, /script-src 'self' https:/);
assert.doesNotMatch(CONTENT_SECURITY_POLICY_REPORT_ONLY, /script-src[^;]*'unsafe-inline'/);
assert.strictEqual(SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');

console.log('security headers tests passed');
