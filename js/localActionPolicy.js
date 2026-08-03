'use strict';

const LocalActionPolicy = (() => {
    /** @param {Record<string, any>} input */
    function humanActionBlockedReason(input = {}) {
        if (!input.hasGame) return 'no-game';
        if (input.hasWinner) return 'winner';
        if (input.expectedPlayerIndex !== null && input.expectedPlayerIndex !== undefined &&
                input.currentPlayerIndex !== input.expectedPlayerIndex) return 'stale-player';
        if (input.isCpuTurn) return 'cpu-turn';
        if (input.isOnlineGame && input.currentPlayerIndex !== input.myPlayerIndex) return 'not-my-turn';
        if (input.isOnlineGame && input.isReconnecting) return 'reconnecting';
        if (input.isOnlineGame && input.onlineActionInFlight) return 'online-in-flight';
        if (input.isOnlineGame && input.socketConnected === false) return 'socket-disconnected';
        return '';
    }

    /** @param {Record<string, any>} input */
    function canRunHumanAction(input = {}) {
        return humanActionBlockedReason(input) === '';
    }

    return Object.freeze({
        humanActionBlockedReason,
        canRunHumanAction,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalActionPolicy;
if (typeof window !== 'undefined') window.LocalActionPolicy = LocalActionPolicy;
if (typeof globalThis !== 'undefined') globalThis.LocalActionPolicy = LocalActionPolicy;
