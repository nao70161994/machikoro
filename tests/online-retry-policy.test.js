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

runTest('online retry timeout decisionは無視・再送・上限到達を純粋判定する', () => {
    const decisions = OnlineRetryPolicy.timeoutDecisions;
    assert.deepStrictEqual(decisions, {
        IGNORE: 'ignore',
        REJOIN: 'rejoin',
        EXHAUST: 'exhaust',
    });
    assert.strictEqual(OnlineRetryPolicy.rejoinTimeoutDecision(false, 0), decisions.IGNORE);
    assert.strictEqual(OnlineRetryPolicy.rejoinTimeoutDecision(undefined, 8), decisions.IGNORE);
    assert.strictEqual(OnlineRetryPolicy.rejoinTimeoutDecision(true, 0), decisions.REJOIN);
    assert.strictEqual(OnlineRetryPolicy.rejoinTimeoutDecision(true, 7), decisions.REJOIN);
    assert.strictEqual(OnlineRetryPolicy.rejoinTimeoutDecision(true, 8), decisions.EXHAUST);
});

runTest('online retry timer controllerはhandleとdeadlineだけを所有する', () => {
    let currentTime = 1000;
    const timers = [];
    const cleared = [];
    let callbackCount = 0;
    const controller = OnlineRetryPolicy.createRejoinTimerController({
        now: () => currentTime,
        setTimer(callback, delayMs) {
            timers.push({ callback, delayMs });
            return timers.length;
        },
        clearTimer(handle) { cleared.push(handle); },
    });

    assert.deepStrictEqual(controller.snapshot(), { pending: false, deadline: 0 });
    assert.deepStrictEqual(controller.arm(() => { callbackCount++; }), { armed: true, reason: '' });
    assert.deepStrictEqual(controller.snapshot(), { pending: true, deadline: 4000 });
    assert.strictEqual(timers[0].delayMs, 3000);
    assert.deepStrictEqual(controller.arm(() => {}), { armed: false, reason: 'already-armed' });

    currentTime = 4000;
    timers[0].callback();
    assert.strictEqual(callbackCount, 1);
    assert.deepStrictEqual(controller.snapshot(), { pending: false, deadline: 0 });

    controller.arm(() => {});
    controller.clear();
    assert.deepStrictEqual(cleared, [2]);
    assert.deepStrictEqual(controller.snapshot(), { pending: false, deadline: 0 });
});

runTest('online retry timer controllerはtimer不在と不正delayを安全に扱う', () => {
    const unavailable = OnlineRetryPolicy.createRejoinTimerController({ now: () => 50 });
    assert.deepStrictEqual(
        unavailable.arm(() => {}),
        { armed: false, reason: 'timer-unavailable' }
    );

    let recordedDelay = null;
    const controller = OnlineRetryPolicy.createRejoinTimerController({
        now: () => 100,
        setTimer(callback, delayMs) {
            recordedDelay = delayMs;
            return callback;
        },
    });
    assert.strictEqual(controller.arm(() => {}, NaN).armed, true);
    assert.strictEqual(recordedDelay, OnlineRetryPolicy.defaults.rejoinDelayMs);
    assert.strictEqual(controller.getDeadline(), 3100);
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
