'use strict';

const assert = require('assert');
const {
    SECURITY_HEADERS,
    CONTENT_SECURITY_POLICY_REPORT_ONLY,
    buildContentSecurityPolicyReportOnly,
    hashInlineScript,
    securityHeadersMiddleware,
} = require('../server/securityHeaders');
const { buildIndexBootstrapScripts, injectIndexBuildHash } = require('../server/staticAssets');

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
assert.match(CONTENT_SECURITY_POLICY_REPORT_ONLY, /report-uri \/api\/csp-report/);
assert.doesNotMatch(CONTENT_SECURITY_POLICY_REPORT_ONLY, /frame-ancestors/);
assert.match(CONTENT_SECURITY_POLICY_REPORT_ONLY,
    /script-src 'self' https:\/\/pagead2\.googlesyndication\.com/);
assert.doesNotMatch(CONTENT_SECURITY_POLICY_REPORT_ONLY, /script-src[^;]*https:\s*(?:;|$)/);
assert.doesNotMatch(CONTENT_SECURITY_POLICY_REPORT_ONLY, /script-src[^;]*'unsafe-inline'/);
assert.strictEqual(SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');

const bootstrapScripts = buildIndexBootstrapScripts('build-1', {
    gameSchemaNegotiationEnabled: true,
    onlineReconnectEventAuthorityEnabled: true,
});
const hashedPolicy = buildContentSecurityPolicyReportOnly(bootstrapScripts.map(hashInlineScript));
const index = injectIndexBuildHash('<html><head></head></html>', 'build-1', {
    gameSchemaNegotiationEnabled: true,
    onlineReconnectEventAuthorityEnabled: true,
});
for (const script of bootstrapScripts) {
    assert.ok(hashedPolicy.includes(`'sha256-${hashInlineScript(script)}'`));
    assert.ok(index.includes(`<script>${script}</script>`));
}
assert.doesNotMatch(hashedPolicy, /script-src[^;]*'unsafe-inline'/);

const customHeaders = {};
securityHeadersMiddleware({}, {
    setHeader(name, value) { customHeaders[name] = value; },
}, () => {}, { contentSecurityPolicyReportOnly: hashedPolicy });
assert.strictEqual(customHeaders['Content-Security-Policy-Report-Only'], hashedPolicy);

console.log('security headers tests passed');
