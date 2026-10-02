'use strict';

function registerServerProcessHandlers(options = {}) {
    const processTarget = options.processTarget === undefined ? process : options.processTarget;
    const logger = options.logger === undefined ? console : options.logger;
    if (!processTarget || typeof processTarget.on !== 'function' || typeof processTarget.exit !== 'function') {
        throw new TypeError('processTarget.on and processTarget.exit are required');
    }
    if (!logger || typeof logger.error !== 'function') {
        throw new TypeError('logger.error is required');
    }
    let fatalExitStarted = false;
    function terminateForFatalError(event, reason) {
        if (fatalExitStarted) return;
        fatalExitStarted = true;
        try {
            logger.error(`${event}:`, reason);
        } finally {
            // Continuing after either fatal event can leave room and replay state inconsistent.
            processTarget.exit(1);
        }
    }

    const handlers = Object.freeze({
        uncaughtException(error) {
            terminateForFatalError('uncaughtException', error);
        },
        unhandledRejection(reason) {
            terminateForFatalError('unhandledRejection', reason);
        },
    });
    processTarget.on('uncaughtException', handlers.uncaughtException);
    processTarget.on('unhandledRejection', handlers.unhandledRejection);
    return handlers;
}

function startHttpServer(options = {}) {
    const server = options.server;
    const logger = options.logger === undefined ? console : options.logger;
    const host = options.host === undefined ? '0.0.0.0' : options.host;
    const port = options.port;
    if (!server || typeof server.listen !== 'function') {
        throw new TypeError('server.listen is required');
    }
    if (!logger || typeof logger.log !== 'function') {
        throw new TypeError('logger.log is required');
    }
    return server.listen(port, host, () => {
        logger.log(`サーバー起動: http://localhost:${port}`);
    });
}

module.exports = Object.freeze({ registerServerProcessHandlers, startHttpServer });
