'use strict';

const ONLINE_RETRY_DEFAULTS = Object.freeze({
    rejoinDelayMs: 3000,
    rejoinMaxAttempts: 8,
    actionAckTimeoutMs: 15000,
});

const RECREATE_RETRYABLE_APP_ERROR_REASONS = Object.freeze({
    RECREATE_COOLDOWN: 'recreate-cooldown',
    ROOM_CAPACITY: 'room-capacity',
    SOCKET_RATE_LIMIT: 'socket-rate-limit',
    IP_RATE_LIMIT: 'ip-rate-limit',
    ATTEMPT_RATE_LIMIT: 'attempt-rate-limit',
});

const RECREATE_RETRYABLE_APP_ERROR_MESSAGES = Object.freeze({
    '復元処理を続けて実行できません':
        RECREATE_RETRYABLE_APP_ERROR_REASONS.RECREATE_COOLDOWN,
    'ルーム数が上限に達しています。しばらくしてから再試行してください':
        RECREATE_RETRYABLE_APP_ERROR_REASONS.ROOM_CAPACITY,
    'ルーム作成が短時間に連続しています。少し待ってから再試行してください':
        RECREATE_RETRYABLE_APP_ERROR_REASONS.SOCKET_RATE_LIMIT,
    'ルーム作成が短時間に集中しています。少し待ってから再試行してください':
        RECREATE_RETRYABLE_APP_ERROR_REASONS.IP_RATE_LIMIT,
    '復元処理が短時間に集中しています。少し待ってから再試行してください':
        RECREATE_RETRYABLE_APP_ERROR_REASONS.ATTEMPT_RATE_LIMIT,
});

function recreateRetryableAppErrorReason(message) {
    return typeof message === 'string'
        ? RECREATE_RETRYABLE_APP_ERROR_MESSAGES[message] || ''
        : '';
}

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

const ACTION_TIMEOUT_DECISIONS = Object.freeze({
    IGNORE: 'ignore',
    CLEAR_ONLY: 'clear-only',
    REJOIN: 'rejoin',
});

function actionTimeoutPlan(actionInFlight, onlineGame) {
    /** @type {string} */
    let decision = ACTION_TIMEOUT_DECISIONS.IGNORE;
    if (actionInFlight === true && onlineGame !== true) {
        decision = ACTION_TIMEOUT_DECISIONS.CLEAR_ONLY;
    } else if (actionInFlight === true) {
        decision = ACTION_TIMEOUT_DECISIONS.REJOIN;
    }
    return Object.freeze({ decision });
}

function selectActionTimeoutPlan(actionInFlight, onlineGame, legacyPlan, options = {}) {
    const purePlan = actionTimeoutPlan(actionInFlight, onlineGame);
    const matched = !!legacyPlan && purePlan.decision === legacyPlan.decision;
    const enabled = options.authorityEnabled === true;
    const usePure = enabled && matched;
    return Object.freeze({
        plan: usePure ? purePlan : legacyPlan,
        source: usePure ? 'pure-plan' : (enabled ? 'legacy-fallback' : 'legacy'),
        matched,
        fallbackReason: matched ? '' : 'action-timeout-plan-mismatch',
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

function createRejoinAttemptController(initial = {}) {
    let attemptCount = Number.isInteger(initial.attemptCount) && initial.attemptCount >= 0
        ? initial.attemptCount
        : 0;
    let exhausted = initial.exhausted === true;

    function snapshot() {
        return Object.freeze({ attemptCount, exhausted });
    }

    function reset() {
        attemptCount = 0;
        exhausted = false;
        return snapshot();
    }

    function setAttemptCount(value) {
        if (!Number.isInteger(value) || value < 0) {
            throw new TypeError('attemptCount must be a non-negative integer');
        }
        attemptCount = value;
        return snapshot();
    }

    function markExhausted() {
        exhausted = true;
        return snapshot();
    }

    return Object.freeze({
        getAttemptCount() { return attemptCount; },
        isExhausted() { return exhausted; },
        snapshot,
        reset,
        setAttemptCount,
        markExhausted,
    });
}

function createActionFlightController(options = {}) {
    const setTimer = typeof options.setTimer === 'function' ? options.setTimer : null;
    const clearTimer = typeof options.clearTimer === 'function' ? options.clearTimer : null;
    const now = typeof options.now === 'function' ? options.now : Date.now;
    let inFlight = false;
    let startedAt = 0;
    let timerHandle = null;

    function clear() {
        if (timerHandle !== null && clearTimer) clearTimer(timerHandle);
        inFlight = false;
        startedAt = 0;
        timerHandle = null;
        return snapshot();
    }

    function set(value, onTimeout, delayMs = ONLINE_RETRY_DEFAULTS.actionAckTimeoutMs) {
        clear();
        inFlight = value === true;
        if (!inFlight) return snapshot();
        startedAt = now();
        if (setTimer && typeof onTimeout === 'function') {
            const effectiveDelay = Number.isFinite(delayMs) && delayMs >= 0
                ? delayMs
                : ONLINE_RETRY_DEFAULTS.actionAckTimeoutMs;
            timerHandle = setTimer(() => {
                timerHandle = null;
                onTimeout();
            }, effectiveDelay);
        }
        return snapshot();
    }

    function snapshot() {
        return Object.freeze({
            inFlight,
            startedAt,
            timeoutPending: timerHandle !== null,
        });
    }

    return Object.freeze({
        isInFlight() { return inFlight; },
        getStartedAt() { return startedAt; },
        set,
        clear,
        snapshot,
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
    recreateRetryableReasons: RECREATE_RETRYABLE_APP_ERROR_REASONS,
    recreateRetryableAppErrorReason,
    isRejoinExhausted,
    rejoinDeadline,
    rejoinWaitingMessage,
    requestDecisions: REJOIN_REQUEST_DECISIONS,
    rejoinRequestPlan,
    selectRejoinRequestPlan,
    actionTimeoutDecisions: ACTION_TIMEOUT_DECISIONS,
    actionTimeoutPlan,
    selectActionTimeoutPlan,
    timeoutDecisions: REJOIN_TIMEOUT_DECISIONS,
    rejoinTimeoutDecision,
    createRejoinTimerController,
    createRejoinAttemptController,
    createActionFlightController,
    actionAckAgeMs,
    isActionAckTimedOut,
});

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineRetryPolicy;
if (typeof window !== 'undefined') window.OnlineRetryPolicy = OnlineRetryPolicy;
if (typeof globalThis !== 'undefined') globalThis.OnlineRetryPolicy = OnlineRetryPolicy;
