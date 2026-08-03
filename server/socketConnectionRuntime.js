'use strict';

const SOCKET_HANDLER_FAMILIES = Object.freeze([
    'hostlessRestore',
    'lobby',
    'action',
    'rejoin',
    'recreate',
    'disconnect',
]);

function registerSocketConnectionRuntime(options = {}) {
    const { io, logger } = options;
    if (!io || typeof io.on !== 'function') {
        throw new TypeError('io.on must be a function');
    }
    if (!logger || typeof logger.log !== 'function') {
        throw new TypeError('logger.log must be a function');
    }
    const registrations = {};
    for (const family of SOCKET_HANDLER_FAMILIES) {
        const register = options[family];
        if (typeof register !== 'function') {
            throw new TypeError(`${family} must be a function`);
        }
        registrations[family] = register;
    }

    const connectionHandler = socket => {
        logger.log('接続:', socket.id);
        for (const family of SOCKET_HANDLER_FAMILIES) {
            registrations[family](socket);
        }
    };
    io.on('connection', connectionHandler);
    return connectionHandler;
}

module.exports = {
    SOCKET_HANDLER_FAMILIES,
    registerSocketConnectionRuntime,
};
