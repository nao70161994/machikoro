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
        buildHealth,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CpuSchedulerState;
if (typeof window !== 'undefined') window.CpuSchedulerState = CpuSchedulerState;
if (typeof globalThis !== 'undefined') globalThis.CpuSchedulerState = CpuSchedulerState;
