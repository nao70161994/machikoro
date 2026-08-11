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

runTest('recreateの一時的appErrorをstable reasonへ分類する', () => {
    const reasons = OnlineRetryPolicy.recreateRetryableReasons;
    assert.deepStrictEqual(reasons, {
        RECREATE_COOLDOWN: 'recreate-cooldown',
        ROOM_CAPACITY: 'room-capacity',
        SOCKET_RATE_LIMIT: 'socket-rate-limit',
        IP_RATE_LIMIT: 'ip-rate-limit',
        ATTEMPT_RATE_LIMIT: 'attempt-rate-limit',
    });
    const cases = [
        ['復元処理を続けて実行できません', reasons.RECREATE_COOLDOWN],
        ['ルーム数が上限に達しています。しばらくしてから再試行してください', reasons.ROOM_CAPACITY],
        ['ルーム作成が短時間に連続しています。少し待ってから再試行してください', reasons.SOCKET_RATE_LIMIT],
        ['ルーム作成が短時間に集中しています。少し待ってから再試行してください', reasons.IP_RATE_LIMIT],
        ['復元処理が短時間に集中しています。少し待ってから再試行してください', reasons.ATTEMPT_RATE_LIMIT],
    ];
    for (const [message, reason] of cases) {
        assert.strictEqual(OnlineRetryPolicy.recreateRetryableAppErrorReason(message), reason);
    }
    assert.strictEqual(OnlineRetryPolicy.recreateRetryableAppErrorReason('INVALID_TOKEN'), '');
    assert.strictEqual(OnlineRetryPolicy.recreateRetryableAppErrorReason(null), '');
    assert.ok(Object.isFrozen(reasons));
});

runTest('recreate appError planは通常hostとhostless選出中だけ一時拒否を保持扱いにする', () => {
    const decisions = OnlineRetryPolicy.recreateAppErrorDecisions;
    const message = 'ルーム数が上限に達しています。しばらくしてから再試行してください';
    assert.deepStrictEqual(OnlineRetryPolicy.recreateAppErrorPlan(message, {
        isReconnectingOnline: true,
        isRoomHost: true,
    }), {
        decision: decisions.RETRYABLE,
        reason: OnlineRetryPolicy.recreateRetryableReasons.ROOM_CAPACITY,
        clearHostlessPending: false,
    });
    assert.deepStrictEqual(OnlineRetryPolicy.recreateAppErrorPlan(message, {
        isReconnectingOnline: true,
        isRoomHost: false,
        hostlessRestorePending: true,
    }), {
        decision: decisions.RETRYABLE,
        reason: OnlineRetryPolicy.recreateRetryableReasons.ROOM_CAPACITY,
        clearHostlessPending: true,
    });
    for (const state of [
        { isReconnectingOnline: false, isRoomHost: true },
        { isReconnectingOnline: true, isRoomHost: false, hostlessRestorePending: false },
    ]) {
        assert.strictEqual(
            OnlineRetryPolicy.recreateAppErrorPlan(message, state).decision,
            decisions.TERMINAL
        );
    }
    assert.deepStrictEqual(OnlineRetryPolicy.recreateAppErrorPlan('INVALID_TOKEN', {
        isReconnectingOnline: true,
        hostlessRestorePending: true,
    }), {
        decision: decisions.TERMINAL,
        reason: '',
        clearHostlessPending: false,
    });
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

runTest('online retry action timeout planは無視・clearのみ・再同期をpureに判定する', () => {
    const decisions = OnlineRetryPolicy.actionTimeoutDecisions;
    assert.deepStrictEqual(decisions, {
        IGNORE: 'ignore',
        CLEAR_ONLY: 'clear-only',
        REJOIN: 'rejoin',
    });
    assert.deepStrictEqual(OnlineRetryPolicy.actionTimeoutPlan(false, true), { decision: decisions.IGNORE });
    assert.deepStrictEqual(OnlineRetryPolicy.actionTimeoutPlan(true, false), { decision: decisions.CLEAR_ONLY });
    assert.deepStrictEqual(OnlineRetryPolicy.actionTimeoutPlan(true, true), { decision: decisions.REJOIN });
    assert.ok(Object.isFrozen(OnlineRetryPolicy.actionTimeoutPlan(true, true)));
});

runTest('online retry action timeout authorityはlegacy完全一致時だけpure planを採用する', () => {
    const legacy = Object.freeze({ decision: 'rejoin' });
    assert.strictEqual(OnlineRetryPolicy.selectActionTimeoutPlan(true, true, legacy).source, 'legacy');
    const selected = OnlineRetryPolicy.selectActionTimeoutPlan(true, true, legacy, { authorityEnabled: true });
    assert.strictEqual(selected.source, 'pure-plan');
    assert.strictEqual(selected.matched, true);
    const mismatch = Object.freeze({ decision: 'clear-only' });
    assert.deepStrictEqual(
        OnlineRetryPolicy.selectActionTimeoutPlan(true, true, mismatch, { authorityEnabled: true }),
        {
            plan: mismatch,
            source: 'legacy-fallback',
            matched: false,
            fallbackReason: 'action-timeout-plan-mismatch',
        }
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

runTest('online retry rejoin request planは拒否・待機・上限・送信をpureに判定する', () => {
    const decisions = OnlineRetryPolicy.requestDecisions;
    const base = {
        hasSocket: true,
        roomId: 'ROOM01',
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken: 'token',
        socketConnected: true,
        attemptCount: 3,
    };
    assert.deepStrictEqual(OnlineRetryPolicy.rejoinRequestPlan({ ...base, hasSocket: false }), {
        decision: decisions.REJECT,
        result: false,
        nextAttemptCount: 3,
    });
    assert.deepStrictEqual(OnlineRetryPolicy.rejoinRequestPlan({ ...base, socketConnected: false }), {
        decision: decisions.WAIT_FOR_SOCKET,
        result: true,
        nextAttemptCount: 3,
    });
    assert.deepStrictEqual(OnlineRetryPolicy.rejoinRequestPlan({ ...base, attemptCount: 8 }), {
        decision: decisions.EXHAUST,
        result: true,
        nextAttemptCount: 8,
    });
    assert.deepStrictEqual(OnlineRetryPolicy.rejoinRequestPlan(base), {
        decision: decisions.EMIT,
        result: true,
        nextAttemptCount: 4,
    });
    assert.ok(Object.isFrozen(OnlineRetryPolicy.rejoinRequestPlan(base)));
});

runTest('online retry rejoin request planはlegacy完全一致時だけauthorityを採用する', () => {
    const input = {
        hasSocket: true,
        roomId: 'ROOM01',
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken: 'token',
        socketConnected: true,
        attemptCount: 0,
    };
    const legacy = Object.freeze({ decision: 'emit', result: true, nextAttemptCount: 1 });
    assert.deepStrictEqual(OnlineRetryPolicy.selectRejoinRequestPlan(input, legacy), {
        plan: legacy,
        source: 'legacy',
        matched: true,
        fallbackReason: '',
    });
    const selected = OnlineRetryPolicy.selectRejoinRequestPlan(input, legacy, { authorityEnabled: true });
    assert.strictEqual(selected.source, 'pure');
    assert.deepStrictEqual(selected.plan, legacy);
    const mismatch = Object.freeze({ decision: 'emit', result: true, nextAttemptCount: 2 });
    assert.deepStrictEqual(
        OnlineRetryPolicy.selectRejoinRequestPlan(input, mismatch, { authorityEnabled: true }),
        {
            plan: mismatch,
            source: 'legacy-fallback',
            matched: false,
            fallbackReason: 'request-plan-mismatch',
        }
    );
});

runTest('online action flight controllerはflag・開始時刻・timeoutを一括所有する', () => {
    let currentTime = 1200;
    const timers = [];
    const cleared = [];
    let timeoutCount = 0;
    const controller = OnlineRetryPolicy.createActionFlightController({
        now: () => currentTime,
        setTimer(callback, delayMs) {
            timers.push({ callback, delayMs });
            return timers.length;
        },
        clearTimer(handle) { cleared.push(handle); },
    });

    assert.deepStrictEqual(controller.snapshot(), {
        inFlight: false,
        startedAt: 0,
        timeoutPending: false,
    });
    assert.deepStrictEqual(controller.set(true, () => { timeoutCount++; }), {
        inFlight: true,
        startedAt: 1200,
        timeoutPending: true,
    });
    assert.strictEqual(controller.isInFlight(), true);
    assert.strictEqual(controller.getStartedAt(), 1200);
    assert.strictEqual(timers[0].delayMs, OnlineRetryPolicy.defaults.actionAckTimeoutMs);

    currentTime = 1300;
    assert.deepStrictEqual(controller.set(true, () => { timeoutCount++; }, 25), {
        inFlight: true,
        startedAt: 1300,
        timeoutPending: true,
    });
    assert.deepStrictEqual(cleared, [1]);
    assert.strictEqual(timers[1].delayMs, 25);
    timers[1].callback();
    assert.strictEqual(timeoutCount, 1);
    assert.deepStrictEqual(controller.snapshot(), {
        inFlight: true,
        startedAt: 1300,
        timeoutPending: false,
    });

    assert.deepStrictEqual(controller.clear(), {
        inFlight: false,
        startedAt: 0,
        timeoutPending: false,
    });
    assert.strictEqual(controller.isInFlight(), false);
    assert.strictEqual(controller.getStartedAt(), 0);
});

runTest('online action flight controllerはtimer不在でもflight時刻を保持する', () => {
    const controller = OnlineRetryPolicy.createActionFlightController({ now: () => 42 });
    assert.deepStrictEqual(controller.set(true, () => {}), {
        inFlight: true,
        startedAt: 42,
        timeoutPending: false,
    });
    assert.strictEqual(Object.isFrozen(controller.snapshot()), true);
    assert.deepStrictEqual(controller.set(false), {
        inFlight: false,
        startedAt: 0,
        timeoutPending: false,
    });
});

runTest('online retry attempt controllerは回数と上限到達を一つのstateとして所有する', () => {
    const controller = OnlineRetryPolicy.createRejoinAttemptController();
    assert.deepStrictEqual(controller.snapshot(), { attemptCount: 0, exhausted: false });
    assert.strictEqual(controller.getAttemptCount(), 0);
    assert.strictEqual(controller.isExhausted(), false);
    assert.deepStrictEqual(controller.setAttemptCount(3), { attemptCount: 3, exhausted: false });
    assert.strictEqual(controller.getAttemptCount(), 3);
    assert.deepStrictEqual(controller.markExhausted(), { attemptCount: 3, exhausted: true });
    assert.strictEqual(controller.isExhausted(), true);
    assert.deepStrictEqual(controller.reset(), { attemptCount: 0, exhausted: false });
    assert.strictEqual(Object.isFrozen(controller.snapshot()), true);
    assert.throws(() => controller.setAttemptCount(-1), /non-negative integer/);
    assert.throws(() => controller.setAttemptCount(1.5), /non-negative integer/);
});

runTest('online retry attempt controllerは明示した初期stateを正規化する', () => {
    assert.deepStrictEqual(
        OnlineRetryPolicy.createRejoinAttemptController({ attemptCount: 7, exhausted: true }).snapshot(),
        { attemptCount: 7, exhausted: true }
    );
    assert.deepStrictEqual(
        OnlineRetryPolicy.createRejoinAttemptController({ attemptCount: -1, exhausted: 'yes' }).snapshot(),
        { attemptCount: 0, exhausted: false }
    );
});
