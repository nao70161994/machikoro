'use strict';

const StoredOnlineReconnect = (() => {
    const EFFECT_STEPS = Object.freeze([
        'setReconnecting',
        'clearRetry',
        'setRuntime',
        'initializeSocket',
        'setStatus',
        'switchToOnlineTab',
        'emitRejoin',
    ]);

    function plan(session) {
        if (!session || typeof session !== 'object') return null;
        const originalPlayerIndex = Number.isInteger(session.playerIndex)
            ? session.playerIndex
            : -1;
        return Object.freeze({
            session,
            runtime: Object.freeze({
                isRoomHost: session.isRoomHost || false,
                playerName: session.playerName || '',
                roomId: session.roomId,
                originalPlayerIndex,
                playerIndex: originalPlayerIndex,
                reconnectToken: session.reconnectToken || '',
            }),
        });
    }

    function resetRuntime() {
        return Object.freeze({
            isRoomHost: false,
            playerName: '',
            roomId: null,
            originalPlayerIndex: -1,
            playerIndex: -1,
            reconnectToken: '',
        });
    }

    function execute(reconnectPlan, handlers) {
        if (!reconnectPlan || !reconnectPlan.runtime) {
            throw new TypeError('stored online reconnect plan is required');
        }
        if (!handlers || typeof handlers !== 'object') {
            throw new TypeError('stored online reconnect handlers are required');
        }
        for (const step of EFFECT_STEPS) {
            if (typeof handlers[step] !== 'function') {
                throw new TypeError(`stored online reconnect handler is required: ${step}`);
            }
        }
        handlers.setReconnecting(true);
        handlers.clearRetry();
        handlers.setRuntime(reconnectPlan.runtime);
        if (!handlers.initializeSocket()) {
            handlers.setReconnecting(false);
            handlers.setRuntime(resetRuntime());
            return Object.freeze({ kind: 'socket-failed', rejoinSent: false });
        }
        handlers.setStatus('再接続中...');
        handlers.switchToOnlineTab();
        const rejoinSent = !!handlers.emitRejoin(reconnectPlan.session);
        return Object.freeze({
            kind: rejoinSent ? 'rejoin-sent' : 'rejoin-send-failed',
            rejoinSent,
        });
    }

    return Object.freeze({ EFFECT_STEPS, plan, resetRuntime, execute });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = StoredOnlineReconnect;
if (typeof window !== 'undefined') Object.assign(window, { StoredOnlineReconnect });
if (typeof globalThis !== 'undefined') globalThis.StoredOnlineReconnect = StoredOnlineReconnect;
