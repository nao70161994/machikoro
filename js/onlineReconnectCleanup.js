'use strict';

const ONLINE_RECONNECT_TERMINAL_CLEANUP_STEPS = Object.freeze([
    'clearPendingOutboundAction',
    'clearReconnectFlag',
    'removeOnlineSession',
    'clearRestoreBundle',
    'updateResumeButton',
    'disconnectSocket',
]);

/**
 * Runs the existing terminal reconnect cleanup effects in their fixed order.
 * Every dependency is validated before the first effect so wiring failures cannot
 * leave a partially cleaned session.
 * @param {Object<string, function(): void>} handlers
 * @returns {{ok: true, steps: ReadonlyArray<string>}}
 */
function executeOnlineReconnectTerminalCleanup(handlers) {
    if (!handlers || typeof handlers !== 'object') {
        throw new TypeError('online reconnect cleanup handlers are required');
    }
    for (const step of ONLINE_RECONNECT_TERMINAL_CLEANUP_STEPS) {
        if (typeof handlers[step] !== 'function') {
            throw new TypeError(`online reconnect cleanup handler is required: ${step}`);
        }
    }
    for (const step of ONLINE_RECONNECT_TERMINAL_CLEANUP_STEPS) {
        handlers[step]();
    }
    return Object.freeze({
        ok: true,
        steps: ONLINE_RECONNECT_TERMINAL_CLEANUP_STEPS,
    });
}

const OnlineReconnectCleanup = Object.freeze({
    steps: ONLINE_RECONNECT_TERMINAL_CLEANUP_STEPS,
    executeTerminal: executeOnlineReconnectTerminalCleanup,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineReconnectCleanup };
}
