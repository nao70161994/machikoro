'use strict';

const ONLINE_RETRY_DEFAULTS = Object.freeze({
    rejoinDelayMs: 3000,
    rejoinMaxAttempts: 8,
    actionAckTimeoutMs: 15000,
});

function isRejoinExhausted(attemptCount, maxAttempts = ONLINE_RETRY_DEFAULTS.rejoinMaxAttempts) {
    return Number.isInteger(attemptCount) && attemptCount >= maxAttempts;
}

function rejoinDeadline(now, delayMs = ONLINE_RETRY_DEFAULTS.rejoinDelayMs) {
    return now + delayMs;
}

function rejoinWaitingMessage(attemptCount, maxAttempts = ONLINE_RETRY_DEFAULTS.rejoinMaxAttempts) {
    return '⏳ ホストの復元を待っています... (' + (attemptCount + 1) + '/' + maxAttempts + ')';
}

const REJOIN_REQUEST_DECISIONS = Object.freeze({
    REJECT: 'reject',
    WAIT_FOR_SOCKET: 'wait-for-socket',
    EXHAUST: 'exhaust',
    EMIT: 'emit',
});

/**
 * Builds the side-effect-free decision for one rejoin request attempt.
 * `socketConnected` preserves the legacy `connected === false` check: only an
 * explicit false waits, while older/mocked sockets without the field can emit.
 * @param {{hasSocket?: boolean, roomId?: *, playerIndex?: *, playerName?: *, reconnectToken?: *, socketConnected?: *, attemptCount?: number}} input
 * @returns {{decision: string, result: boolean, nextAttemptCount: number}}
 */
function rejoinRequestPlan(input = {}) {
    const attemptCount = Number.isInteger(input.attemptCount) ? input.attemptCount : 0;
    const eligible = input.hasSocket === true && !!input.roomId &&
        !(input.playerIndex < 0) && !!input.playerName && !!input.reconnectToken;
    /** @type {string} */
    let decision = REJOIN_REQUEST_DECISIONS.REJECT;
    if (eligible && input.socketConnected === false) {
        decision = REJOIN_REQUEST_DECISIONS.WAIT_FOR_SOCKET;
    } else if (eligible && isRejoinExhausted(attemptCount)) {
        decision = REJOIN_REQUEST_DECISIONS.EXHAUST;
    } else if (eligible) {
        decision = REJOIN_REQUEST_DECISIONS.EMIT;
    }
    return Object.freeze({
        decision,
        result: decision !== REJOIN_REQUEST_DECISIONS.REJECT,
        nextAttemptCount: decision === REJOIN_REQUEST_DECISIONS.EMIT
            ? attemptCount + 1
            : attemptCount,
    });
}

function rejoinRequestPlansEqual(left, right) {
    return !!left && !!right && left.decision === right.decision &&
        left.result === right.result && left.nextAttemptCount === right.nextAttemptCount;
}

/**
 * Selects the pure request plan only after an independent legacy projection
 * matches it exactly.
 * @param {Object} input
 * @param {{decision: string, result: boolean, nextAttemptCount: number}} legacyPlan
 * @param {{authorityEnabled?: boolean}} [options]
 * @returns {{plan: Object, source: string, matched: boolean, fallbackReason: string}}
 */
function selectRejoinRequestPlan(input, legacyPlan, options = {}) {
    const purePlan = rejoinRequestPlan(input);
    const matched = rejoinRequestPlansEqual(purePlan, legacyPlan);
    const enabled = options.authorityEnabled === true;
    const usePure = enabled && matched;
    return Object.freeze({
        plan: usePure ? purePlan : legacyPlan,
        source: usePure ? 'pure' : (enabled ? 'legacy-fallback' : 'legacy'),
        matched,
        fallbackReason: matched ? '' : 'request-plan-mismatch',
    });
}

const REJOIN_TIMEOUT_DECISIONS = Object.freeze({
    IGNORE: 'ignore',
    REJOIN: 'rejoin',
    EXHAUST: 'exhaust',
});

function rejoinTimeoutDecision(reconnecting, attemptCount) {
    if (reconnecting !== true) return REJOIN_TIMEOUT_DECISIONS.IGNORE;
    return isRejoinExhausted(attemptCount)
        ? REJOIN_TIMEOUT_DECISIONS.EXHAUST
        : REJOIN_TIMEOUT_DECISIONS.REJOIN;
}

function createRejoinTimerController(options = {}) {
    const setTimer = typeof options.setTimer === 'function' ? options.setTimer : null;
    const clearTimer = typeof options.clearTimer === 'function' ? options.clearTimer : null;
    const now = typeof options.now === 'function' ? options.now : Date.now;
    let timerHandle = null;
    let deadline = 0;

    function clear() {
        if (timerHandle !== null && clearTimer) clearTimer(timerHandle);
        timerHandle = null;
        deadline = 0;
    }

    function arm(callback, delayMs = ONLINE_RETRY_DEFAULTS.rejoinDelayMs) {
        if (timerHandle !== null) return Object.freeze({ armed: false, reason: 'already-armed' });
        if (!setTimer || typeof callback !== 'function') {
            return Object.freeze({ armed: false, reason: 'timer-unavailable' });
        }
        const effectiveDelay = Number.isFinite(delayMs) && delayMs >= 0
            ? delayMs
            : ONLINE_RETRY_DEFAULTS.rejoinDelayMs;
        deadline = rejoinDeadline(now(), effectiveDelay);
        timerHandle = setTimer(() => {
            timerHandle = null;
            deadline = 0;
            callback();
        }, effectiveDelay);
        return Object.freeze({ armed: true, reason: '' });
    }

    return Object.freeze({
        arm,
        clear,
        hasPending() { return timerHandle !== null; },
        getDeadline() { return deadline; },
        snapshot() {
            return Object.freeze({ pending: timerHandle !== null, deadline });
        },
    });
}

function actionAckAgeMs(startedAt, now = Date.now()) {
    if (!Number.isFinite(startedAt) || startedAt <= 0 || !Number.isFinite(now)) return 0;
    return Math.max(0, now - startedAt);
}

function isActionAckTimedOut(startedAt, now = Date.now(), timeoutMs = ONLINE_RETRY_DEFAULTS.actionAckTimeoutMs) {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) return false;
    return Number.isFinite(startedAt) && startedAt > 0 &&
        actionAckAgeMs(startedAt, now) >= timeoutMs;
}

const OnlineRetryPolicy = Object.freeze({
    defaults: ONLINE_RETRY_DEFAULTS,
    isRejoinExhausted,
    rejoinDeadline,
    rejoinWaitingMessage,
    requestDecisions: REJOIN_REQUEST_DECISIONS,
    rejoinRequestPlan,
    selectRejoinRequestPlan,
    timeoutDecisions: REJOIN_TIMEOUT_DECISIONS,
    rejoinTimeoutDecision,
    createRejoinTimerController,
    actionAckAgeMs,
    isActionAckTimedOut,
});

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineRetryPolicy;
if (typeof window !== 'undefined') window.OnlineRetryPolicy = OnlineRetryPolicy;
if (typeof globalThis !== 'undefined') globalThis.OnlineRetryPolicy = OnlineRetryPolicy;
