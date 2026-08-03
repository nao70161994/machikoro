'use strict';

function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(name + ' must be a function');
    return value;
}

function requireApp(value) {
    if (!value || typeof value.use !== 'function' || typeof value.post !== 'function') {
        throw new TypeError('app must provide use and post');
    }
    return value;
}

function makeRouteHandler(handler, failure, warn) {
    return (req, res) => {
        handler(req, res).catch(error => {
            warn(failure.logPrefix, error?.message || error);
            res.status(failure.status).json(failure.body);
        });
    };
}

/**
 * Registers the existing reporting HTTP surface through injected Express adapters.
 * Gateway behavior, route names, JSON limits, and fallback responses remain unchanged.
 * @param {Object} dependencies
 * @returns {Object}
 */
function registerReportingHttpRoutes(dependencies = {}) {
    const app = requireApp(dependencies.app);
    const json = requireFunction(dependencies.json, 'json');
    const handleClientErrorRequest = requireFunction(
        dependencies.handleClientErrorRequest,
        'handleClientErrorRequest'
    );
    const handleClientErrorTestRequest = requireFunction(
        dependencies.handleClientErrorTestRequest,
        'handleClientErrorTestRequest'
    );
    const handleGameLifecycleRequest = requireFunction(
        dependencies.handleGameLifecycleRequest,
        'handleGameLifecycleRequest'
    );
    const warn = typeof dependencies.warn === 'function'
        ? dependencies.warn
        : (...args) => console.warn(...args);
    const failures = Object.freeze({
        clientError: Object.freeze({
            logPrefix: '[client-error] handler failed:',
            status: 202,
            body: Object.freeze({ ok: true, notificationFailed: true }),
        }),
        clientErrorTest: Object.freeze({
            logPrefix: '[client-error-test] handler failed:',
            status: 503,
            body: Object.freeze({ ok: false, error: 'client_error_test_failed' }),
        }),
        gameLifecycle: Object.freeze({
            logPrefix: '[game-lifecycle] handler failed:',
            status: 202,
            body: Object.freeze({ ok: true, notificationFailed: true }),
        }),
    });
    const handlers = Object.freeze({
        clientError: makeRouteHandler(handleClientErrorRequest, failures.clientError, warn),
        clientErrorTest: makeRouteHandler(
            handleClientErrorTestRequest,
            failures.clientErrorTest,
            warn
        ),
        gameLifecycle: makeRouteHandler(
            handleGameLifecycleRequest,
            failures.gameLifecycle,
            warn
        ),
    });

    app.use('/api/client-error', json({ limit: dependencies.clientErrorJsonLimit }));
    app.post('/api/client-error', handlers.clientError);
    app.post('/api/client-error-test', json({ limit: '1kb' }), handlers.clientErrorTest);
    app.use('/api/game-lifecycle', json({ limit: '8kb' }));
    app.post('/api/game-lifecycle', handlers.gameLifecycle);

    return handlers;
}

module.exports = registerReportingHttpRoutes;
