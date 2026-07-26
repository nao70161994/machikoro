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

const OnlineRetryPolicy = Object.freeze({
    defaults: ONLINE_RETRY_DEFAULTS,
    isRejoinExhausted,
    rejoinDeadline,
    rejoinWaitingMessage,
});

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineRetryPolicy;
if (typeof window !== 'undefined') window.OnlineRetryPolicy = OnlineRetryPolicy;
if (typeof globalThis !== 'undefined') globalThis.OnlineRetryPolicy = OnlineRetryPolicy;
