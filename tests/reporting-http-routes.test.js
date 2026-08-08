'use strict';

const assert = require('assert');
const registerReportingHttpRoutes = require('../server/reportingHttpRoutes');
const { runTest } = require('./helpers/test-utils');

function makeRuntime(overrides = {}) {
    const calls = [];
    const app = {
        use(...args) { calls.push(['use', ...args]); },
        post(...args) { calls.push(['post', ...args]); },
    };
    const json = options => {
        const middleware = { kind: 'json', options };
        calls.push(['json', options, middleware]);
        return middleware;
    };
    const dependencies = {
        app,
        json,
        clientErrorJsonLimit: 8192,
        handleClientErrorRequest(req, res) {
            calls.push(['client-handler', req, res]);
            return Promise.resolve();
        },
        handleClientErrorTestRequest(req, res) {
            calls.push(['test-handler', req, res]);
            return Promise.resolve();
        },
        handleGameLifecycleRequest(req, res) {
            calls.push(['lifecycle-handler', req, res]);
            return Promise.resolve();
        },
        warn(...args) { calls.push(['warn', ...args]); },
    };
    Object.assign(dependencies, overrides);
    const handlers = registerReportingHttpRoutes(dependencies);
    return { calls, handlers };
}

function responseRecorder(calls) {
    return {
        status(code) {
            calls.push(['status', code]);
            return this;
        },
        json(body) {
            calls.push(['response-json', body]);
            return this;
        },
    };
}

runTest('reporting HTTP routes は既存path・JSON limit・登録順を維持する', () => {
    const { calls, handlers } = makeRuntime();
    const registrations = calls.filter(call => call[0] === 'use' || call[0] === 'post');
    assert.deepStrictEqual(registrations.map(call => [call[0], call[1]]), [
        ['use', '/api/client-error'],
        ['post', '/api/client-error'],
        ['post', '/api/client-error-test'],
        ['use', '/api/game-lifecycle'],
        ['post', '/api/game-lifecycle'],
    ]);
    assert.deepStrictEqual(calls.filter(call => call[0] === 'json').map(call => call[1]), [
        { limit: 8192 },
        { limit: '1kb' },
        { limit: '8kb' },
    ]);
    assert.strictEqual(registrations[1][2], handlers.clientError);
    assert.strictEqual(registrations[2][3], handlers.clientErrorTest);
    assert.strictEqual(registrations[4][2], handlers.gameLifecycle);
    assert.ok(Object.isFrozen(handlers));
});

runTest('reporting HTTP route handler はgatewayへreq/resを同一参照で渡す', async () => {
    const { calls, handlers } = makeRuntime();
    const req = { id: 'request' };
    const res = { id: 'response' };
    assert.strictEqual(handlers.clientError(req, res), undefined);
    assert.strictEqual(handlers.clientErrorTest(req, res), undefined);
    assert.strictEqual(handlers.gameLifecycle(req, res), undefined);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepStrictEqual(calls.filter(call => call[0].endsWith('-handler')).map(call => call.slice(1)), [
        [req, res],
        [req, res],
        [req, res],
    ]);
});

runTest('reporting HTTP routes は各gateway失敗時のstatus・body・logを維持する', async () => {
    const rejected = message => () => Promise.reject(new Error(message));
    const { calls, handlers } = makeRuntime({
        handleClientErrorRequest: rejected('client boom'),
        handleClientErrorTestRequest: rejected('test boom'),
        handleGameLifecycleRequest: rejected('lifecycle boom'),
    });
    handlers.clientError({}, responseRecorder(calls));
    handlers.clientErrorTest({}, responseRecorder(calls));
    handlers.gameLifecycle({}, responseRecorder(calls));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepStrictEqual(calls.filter(call => call[0] === 'warn'), [
        ['warn', '[client-error] handler failed:', 'client boom'],
        ['warn', '[client-error-test] handler failed:', 'test boom'],
        ['warn', '[game-lifecycle] handler failed:', 'lifecycle boom'],
    ]);
    assert.deepStrictEqual(calls.filter(call => call[0] === 'status').map(call => call[1]), [503, 503, 202]);
    assert.deepStrictEqual(calls.filter(call => call[0] === 'response-json').map(call => call[1]), [
        { ok: false, error: 'notification_failed' },
        { ok: false, error: 'client_error_test_failed' },
        { ok: true, notificationFailed: true },
    ]);
});

runTest('reporting HTTP routes は依存不正時にrouteを部分登録しない', () => {
    const calls = [];
    assert.throws(() => registerReportingHttpRoutes({
        app: { use() { calls.push('use'); }, post() { calls.push('post'); } },
        json() {},
        handleClientErrorRequest() { return Promise.resolve(); },
        handleClientErrorTestRequest: null,
        handleGameLifecycleRequest() { return Promise.resolve(); },
    }), /handleClientErrorTestRequest must be a function/);
    assert.deepStrictEqual(calls, []);
});
