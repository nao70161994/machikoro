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
    actionAckAgeMs,
    isActionAckTimedOut,
});

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineRetryPolicy;
if (typeof window !== 'undefined') window.OnlineRetryPolicy = OnlineRetryPolicy;
if (typeof globalThis !== 'undefined') globalThis.OnlineRetryPolicy = OnlineRetryPolicy;
