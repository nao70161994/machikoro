'use strict';

const CpuSchedulerState = (() => {
    function waitDuration(delay) {
        return Number.isFinite(Number(delay)) ? Math.max(0, Number(delay)) : 0;
    }

    function scheduledUntil(now, delay, leaseMs = 1500) {
        return now + waitDuration(delay) + leaseMs;
    }

    function refreshedUntil(now, leaseMs = 1500) {
        return now + leaseMs;
    }

    function tokenIsScheduled(pendingToken, scheduleToken) {
        return pendingToken !== null && pendingToken === scheduleToken;
    }

    function blockedReason(input = {}) {
        if (input.isReplaying) return 'replaying';
        if (input.isOnlineGame && input.isRoomHost === false) return 'non-host';
        if (input.isOnlineGame) {
            if (input.isReconnecting) return 'reconnecting';
            if (input.onlineActionInFlight) return 'online-in-flight';
            if (input.socketConnected === false) return 'socket-disconnected';
        }
        if (!input.hasGame) return 'no-game';
        if (input.hasWinner) return 'winner';
        if (!input.isCpuTurn) return 'human-turn';
        return '';
    }

    function shouldRunPhaseStep(stepName, state = {}, phases = {}) {
        if (!state.hasGame) return false;
        if (stepName === 'roll') return state.phase === phases.ROLL;
        if (stepName === 'selectDice') return state.phase === phases.SELECT_DICE;
        if (stepName === 'rerollConfirm') return state.phase === phases.REROLL_CONFIRM;
        if (stepName === 'harborChoice') return state.phase === phases.HARBOR_CHOICE;
        if (stepName === 'pending') return state.phase === phases.PENDING;
        if (stepName === 'build') return state.phase === phases.BUILD && !state.pendingIT && !state.builtThisTurn;
        if (stepName === 'nextTurn') return state.phase === phases.BUILD && !state.pendingIT;
        if (stepName === 'resolveIT') return !!state.pendingIT;
        return true;
    }
    function buildHealth(input = {}) {
        const blockedReason = input.blockedReason || '';
        return {
            token: input.scheduleToken,
            scheduledUntil: input.scheduledUntil,
            stepScheduled: !blockedReason &&
                tokenIsScheduled(input.pendingToken, input.scheduleToken) &&
                input.now < input.scheduledUntil,
            isCpuTurn: !!input.isCpuTurn,
            currentPlayerIndex: input.currentPlayerIndex,
            blockedReason,
        };
    }

    return Object.freeze({
        waitDuration,
        scheduledUntil,
        refreshedUntil,
        tokenIsScheduled,
        blockedReason,
        shouldRunPhaseStep,
        buildHealth,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CpuSchedulerState;
if (typeof window !== 'undefined') window.CpuSchedulerState = CpuSchedulerState;
if (typeof globalThis !== 'undefined') globalThis.CpuSchedulerState = CpuSchedulerState;
