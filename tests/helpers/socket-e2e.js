'use strict';

const DEFAULT_SOCKET_E2E_TIMEOUT_MS = 15000;
const DEFAULT_SOCKET_E2E_PING_TIMEOUT_MS = 120000;

function formatSocketEventTimeoutContext(context) {
    if (!context) return '';
    try {
        return ` context=${JSON.stringify(context)}`;
    } catch (error) {
        return ' context=[unserializable]';
    }
}

function makeOnceSocketEvent(dependencies = {}) {
    const setTimer = dependencies.setTimeout || setTimeout;
    const clearTimer = dependencies.clearTimeout || clearTimeout;
    return function onceSocketEvent(socket, event, timeoutMs = DEFAULT_SOCKET_E2E_TIMEOUT_MS, context = null) {
        return new Promise((resolve, reject) => {
            const timer = setTimer(() => {
                socket.off(event, onEvent);
                reject(new Error(event + ' timed out' + formatSocketEventTimeoutContext(context)));
            }, timeoutMs);
            function onEvent(payload) {
                clearTimer(timer);
                resolve(payload);
            }
            socket.once(event, onEvent);
        });
    };
}

const onceSocketEvent = makeOnceSocketEvent();

function configureSocketE2EHeartbeat(io, pingTimeoutMs = DEFAULT_SOCKET_E2E_PING_TIMEOUT_MS) {
    if (!io || !io.engine || !io.engine.opts) {
        throw new TypeError('Socket.IO server with Engine.IO options is required');
    }
    const originalPingTimeout = io.engine.opts.pingTimeout;
    io.engine.opts.pingTimeout = pingTimeoutMs;
    let restored = false;
    return function restoreSocketE2EHeartbeat() {
        if (restored) return;
        restored = true;
        io.engine.opts.pingTimeout = originalPingTimeout;
    };
}

module.exports = Object.freeze({
    DEFAULT_SOCKET_E2E_PING_TIMEOUT_MS,
    DEFAULT_SOCKET_E2E_TIMEOUT_MS,
    configureSocketE2EHeartbeat,
    formatSocketEventTimeoutContext,
    makeOnceSocketEvent,
    onceSocketEvent,
});
