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
        const activeStep = input.activeStep && input.activeStep.token === input.scheduleToken
            ? input.activeStep
            : null;
        const stepActive = !!(activeStep && input.now < activeStep.activeUntil);
        return {
            token: input.scheduleToken,
            scheduledUntil: input.scheduledUntil,
            stepScheduled: !blockedReason &&
                ((tokenIsScheduled(input.pendingToken, input.scheduleToken) &&
                    input.now < input.scheduledUntil) || stepActive),
            stepActive,
            activeStep: activeStep ? Object.freeze({ ...activeStep }) : null,
            isCpuTurn: !!input.isCpuTurn,
            currentPlayerIndex: input.currentPlayerIndex,
            blockedReason,
        };
    }

    function createController(initial = {}) {
        let scheduleToken = Number.isInteger(initial.scheduleToken) ? initial.scheduleToken : 0;
        let pendingToken = Number.isInteger(initial.pendingToken) ? initial.pendingToken : null;
        let scheduledUntilValue = Number.isFinite(initial.scheduledUntil) ? initial.scheduledUntil : 0;
        let activeStep = initial.activeStep && typeof initial.activeStep === 'object'
            ? Object.freeze({ ...initial.activeStep })
            : null;

        function snapshot() {
            return Object.freeze({
                scheduleToken,
                pendingToken,
                scheduledUntil: scheduledUntilValue,
                activeStep,
            });
        }

        function invalidate() {
            scheduleToken++;
            return snapshot();
        }

        function cancel() {
            scheduleToken++;
            pendingToken = null;
            scheduledUntilValue = 0;
            activeStep = null;
            return snapshot();
        }

        function markScheduled(now, delay, leaseMs = 1500) {
            scheduledUntilValue = scheduledUntil(now, delay, leaseMs);
            return snapshot();
        }

        function refreshLease(now, leaseMs = 1500) {
            scheduledUntilValue = refreshedUntil(now, leaseMs);
            return snapshot();
        }

        function setPendingToken(token) {
            pendingToken = token;
            return snapshot();
        }

        function clearPendingToken() {
            pendingToken = null;
            return snapshot();
        }

        function markActive(details) {
            activeStep = Object.freeze({ ...details });
            return snapshot();
        }

        function clearActive(stepExecutionId = '') {
            if (!activeStep || (stepExecutionId && activeStep.stepExecutionId !== stepExecutionId)) {
                return snapshot();
            }
            activeStep = null;
            return snapshot();
        }

        function isCurrent(token) {
            return token === scheduleToken;
        }

        function isStepScheduled() {
            return tokenIsScheduled(pendingToken, scheduleToken);
        }

        function expireLease(deadline = 0) {
            scheduledUntilValue = Number.isFinite(deadline) ? deadline : 0;
            return snapshot();
        }

        return Object.freeze({
            snapshot,
            invalidate,
            cancel,
            markScheduled,
            refreshLease,
            setPendingToken,
            clearPendingToken,
            markActive,
            clearActive,
            isCurrent,
            isStepScheduled,
            expireLease,
        });
    }

    return Object.freeze({
        waitDuration,
        scheduledUntil,
        refreshedUntil,
        tokenIsScheduled,
        blockedReason,
        shouldRunPhaseStep,
        buildHealth,
        createController,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CpuSchedulerState;
if (typeof window !== 'undefined') window.CpuSchedulerState = CpuSchedulerState;
if (typeof globalThis !== 'undefined') globalThis.CpuSchedulerState = CpuSchedulerState;
