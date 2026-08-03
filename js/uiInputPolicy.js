'use strict';

const UiInputPolicy = (() => {
    const BLOCK_REASONS = Object.freeze({
        RECONNECTING: 'reconnecting',
        ACTION_IN_FLIGHT: 'action-in-flight',
        DISCONNECTED: 'disconnected',
    });

    function onlineBlockReason(input = {}) {
        if (!input.isOnlineGame) return '';
        if (input.isReconnecting) return BLOCK_REASONS.RECONNECTING;
        if (input.actionInFlight) return BLOCK_REASONS.ACTION_IN_FLIGHT;
        if (!input.socketAvailable || input.socketConnected === false) {
            return BLOCK_REASONS.DISCONNECTED;
        }
        return '';
    }

    function isHumanTurn(input = {}) {
        if (!input.hasGame || input.isCpuTurn || input.onlineBlockReason) return false;
        return !input.isOnlineGame || input.currentPlayerIndex === input.myPlayerIndex;
    }

    function canShowAction(action, humanTurn, allowedActions) {
        return !!action && humanTurn === true && !!allowedActions && allowedActions.has(action);
    }

    return Object.freeze({ BLOCK_REASONS, onlineBlockReason, isHumanTurn, canShowAction });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiInputPolicy;
if (typeof window !== 'undefined') window.UiInputPolicy = UiInputPolicy;
if (typeof globalThis !== 'undefined') globalThis.UiInputPolicy = UiInputPolicy;
