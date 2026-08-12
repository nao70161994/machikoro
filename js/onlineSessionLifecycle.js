'use strict';

const COMPLETED_STEPS = Object.freeze([
    'markCompleted',
    'leaveOnlineGame',
    'disconnectSocket',
    'clearReconnectFlag',
    'clearActionInFlight',
    'clearRejoinRetry',
    'observeCompleted',
]);
const RESET_STEPS = Object.freeze([
    'markNotCompleted',
    'resetEngineShadow',
    'finishLobbyRequest',
    'incrementCpuScheduleToken',
    'disconnectSocket',
    'leaveOnlineGame',
    'clearHost',
    'clearPlayerIndexes',
    'clearRoom',
    'clearReconnectToken',
    'clearSchemaSelection',
    'clearReplayFlag',
    'clearReconnectFlag',
    'clearActionInFlight',
    'clearPendingOutboundAction',
    'clearRejoinRetry',
    'clearHostlessPending',
    'incrementRestoreGeneration',
    'clearRestoreInProgress',
    'clearRestoreQueue',
    'resetLastAppliedSequence',
    'clearRestoreFlushFlag',
    'clearRestoreQuarantine',
    'clearPendingMemory',
    'observeReset',
]);

function completedPlan() {
    return Object.freeze({ kind: 'completed', steps: COMPLETED_STEPS });
}

function resetPlan(roomIdBeforeReset) {
    return Object.freeze({ kind: 'reset', roomIdBeforeReset, steps: RESET_STEPS });
}

function execute(plan, effects = {}) {
    const steps = plan && plan.kind === 'completed'
        ? COMPLETED_STEPS
        : (plan && plan.kind === 'reset' ? RESET_STEPS : null);
    if (!steps) throw new TypeError('online session lifecycle plan is required');
    for (const step of steps) {
        if (typeof effects[step] !== 'function') {
            throw new TypeError(step + ' effect is required');
        }
    }
    for (const step of steps) effects[step](plan);
    return plan;
}

const OnlineSessionLifecycle = Object.freeze({
    completedSteps: COMPLETED_STEPS,
    resetSteps: RESET_STEPS,
    completedPlan,
    resetPlan,
    execute,
});

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineSessionLifecycle;
if (typeof globalThis !== 'undefined') globalThis.OnlineSessionLifecycle = OnlineSessionLifecycle;
