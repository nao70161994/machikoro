'use strict';

const assert = require('assert');
const OnlineRetryPolicy = require('../js/onlineRetryPolicy');
const { runTest } = require('./helpers/test-utils');

runTest('online retry policy freezes the existing timeout and attempt contract', () => {
    assert.deepStrictEqual(OnlineRetryPolicy.defaults, {
        rejoinDelayMs: 3000,
        rejoinMaxAttempts: 8,
        actionAckTimeoutMs: 15000,
    });
    assert.ok(Object.isFrozen(OnlineRetryPolicy));
    assert.ok(Object.isFrozen(OnlineRetryPolicy.defaults));
});

runTest('online retry policy preserves the exact exhaustion boundary', () => {
    assert.strictEqual(OnlineRetryPolicy.isRejoinExhausted(7), false);
    assert.strictEqual(OnlineRetryPolicy.isRejoinExhausted(8), true);
    assert.strictEqual(OnlineRetryPolicy.isRejoinExhausted(9), true);
    assert.strictEqual(OnlineRetryPolicy.isRejoinExhausted(NaN), false);
});

runTest('online retry policy preserves deadline and waiting text', () => {
    assert.strictEqual(OnlineRetryPolicy.rejoinDeadline(1000), 4000);
    assert.strictEqual(
        OnlineRetryPolicy.rejoinWaitingMessage(0),
        '⏳ ホストの復元を待っています... (1/8)'
    );
    assert.strictEqual(
        OnlineRetryPolicy.rejoinWaitingMessage(7),
        '⏳ ホストの復元を待っています... (8/8)'
    );
});

runTest('online retry policy uses the ACK timeout boundary for stall detection', () => {
    const startedAt = 1000;

    assert.strictEqual(OnlineRetryPolicy.actionAckAgeMs(startedAt, 15999), 14999);
    assert.strictEqual(OnlineRetryPolicy.isActionAckTimedOut(startedAt, 15999), false);
    assert.strictEqual(OnlineRetryPolicy.isActionAckTimedOut(startedAt, 16000), true);
    assert.strictEqual(OnlineRetryPolicy.isActionAckTimedOut(startedAt, 16001), true);
    assert.strictEqual(OnlineRetryPolicy.isActionAckTimedOut(0, 20000), false);
    assert.strictEqual(OnlineRetryPolicy.isActionAckTimedOut(NaN, 20000), false);
    assert.strictEqual(OnlineRetryPolicy.isActionAckTimedOut(startedAt, 20000, NaN), false);
});
