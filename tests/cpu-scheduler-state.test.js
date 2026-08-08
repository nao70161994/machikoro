'use strict';

const assert = require('assert');
const CpuSchedulerState = require('../js/cpuSchedulerState');
const { runTest } = require('./helpers/test-utils');

runTest('CPU scheduler stateは既存wait正規化とlease期限をpureに計算する', () => {
    assert.strictEqual(CpuSchedulerState.waitDuration(600), 600);
    assert.strictEqual(CpuSchedulerState.waitDuration('600'), 600);
    assert.strictEqual(CpuSchedulerState.waitDuration(-1), 0);
    assert.strictEqual(CpuSchedulerState.waitDuration('bad'), 0);
    assert.strictEqual(CpuSchedulerState.scheduledUntil(1000, 600, 1500), 3100);
    assert.strictEqual(CpuSchedulerState.scheduledUntil(1000, 'bad', 1500), 2500);
    assert.strictEqual(CpuSchedulerState.refreshedUntil(1000, 1500), 2500);
});

runTest('CPU scheduler stateはnullを予約扱いせずtoken完全一致だけを許可する', () => {
    assert.strictEqual(CpuSchedulerState.tokenIsScheduled(null, 0), false);
    assert.strictEqual(CpuSchedulerState.tokenIsScheduled(2, 1), false);
    assert.strictEqual(CpuSchedulerState.tokenIsScheduled(2, 2), true);
});

runTest('CPU scheduler healthはtoken・期限・block理由を既存優先度で投影する', () => {
    const input = {
        scheduleToken: 3,
        pendingToken: 3,
        scheduledUntil: 2000,
        now: 1500,
        isCpuTurn: true,
        currentPlayerIndex: 1,
        blockedReason: '',
    };
    assert.deepStrictEqual(CpuSchedulerState.buildHealth(input), {
        token: 3,
        scheduledUntil: 2000,
        stepScheduled: true,
        stepActive: false,
        activeStep: null,
        isCpuTurn: true,
        currentPlayerIndex: 1,
        blockedReason: '',
    });
    assert.deepStrictEqual(input, {
        scheduleToken: 3,
        pendingToken: 3,
        scheduledUntil: 2000,
        now: 1500,
        isCpuTurn: true,
        currentPlayerIndex: 1,
        blockedReason: '',
    });

    assert.strictEqual(CpuSchedulerState.buildHealth({
        ...input,
        now: 2000,
    }).stepScheduled, false);
    assert.strictEqual(CpuSchedulerState.buildHealth({
        ...input,
        blockedReason: 'reconnecting',
    }).stepScheduled, false);
    assert.strictEqual(CpuSchedulerState.buildHealth({
        ...input,
        pendingToken: 2,
    }).stepScheduled, false);
});

runTest('CPU scheduler block理由は既存の優先順位をpureに固定する', () => {
    const ready = {
        hasGame: true,
        isCpuTurn: true,
        socketConnected: true,
    };
    assert.strictEqual(CpuSchedulerState.blockedReason({ ...ready, isReplaying: true }), 'replaying');
    assert.strictEqual(CpuSchedulerState.blockedReason({ ...ready, isOnlineGame: true, isRoomHost: false, isReconnecting: true }), 'non-host');
    assert.strictEqual(CpuSchedulerState.blockedReason({ ...ready, isOnlineGame: true, isRoomHost: true, isReconnecting: true }), 'reconnecting');
    assert.strictEqual(CpuSchedulerState.blockedReason({ ...ready, isOnlineGame: true, isRoomHost: true, onlineActionInFlight: true }), 'online-in-flight');
    assert.strictEqual(CpuSchedulerState.blockedReason({ ...ready, isOnlineGame: true, isRoomHost: true, socketConnected: false }), 'socket-disconnected');
    assert.strictEqual(CpuSchedulerState.blockedReason({ ...ready, hasGame: false }), 'no-game');
    assert.strictEqual(CpuSchedulerState.blockedReason({ ...ready, hasWinner: true }), 'winner');
    assert.strictEqual(CpuSchedulerState.blockedReason({ ...ready, isCpuTurn: false }), 'human-turn');
    assert.strictEqual(CpuSchedulerState.blockedReason(ready), '');
});

runTest('CPU scheduler phase eligibilityは既存phase・pending・built条件を固定する', () => {
    const phases = {
        ROLL: 'roll',
        SELECT_DICE: 'selectDice',
        REROLL_CONFIRM: 'rerollConfirm',
        HARBOR_CHOICE: 'harborChoice',
        PENDING: 'pending',
        BUILD: 'build',
    };
    assert.strictEqual(CpuSchedulerState.shouldRunPhaseStep('roll', { hasGame: true, phase: 'roll' }, phases), true);
    assert.strictEqual(CpuSchedulerState.shouldRunPhaseStep('roll', { hasGame: true, phase: 'build' }, phases), false);
    assert.strictEqual(CpuSchedulerState.shouldRunPhaseStep('build', { hasGame: true, phase: 'build', pendingIT: false, builtThisTurn: false }, phases), true);
    assert.strictEqual(CpuSchedulerState.shouldRunPhaseStep('build', { hasGame: true, phase: 'build', builtThisTurn: true }, phases), false);
    assert.strictEqual(CpuSchedulerState.shouldRunPhaseStep('nextTurn', { hasGame: true, phase: 'build', pendingIT: true }, phases), false);
    assert.strictEqual(CpuSchedulerState.shouldRunPhaseStep('resolveIT', { hasGame: true, phase: 'pending', pendingIT: true }, phases), true);
    assert.strictEqual(CpuSchedulerState.shouldRunPhaseStep('unknown', { hasGame: true }, phases), true);
    assert.strictEqual(CpuSchedulerState.shouldRunPhaseStep('unknown', { hasGame: false }, phases), false);
});

runTest('CPU scheduler controllerはtoken・pending・leaseを一つの状態として所有する', () => {
    const controller = CpuSchedulerState.createController({
        scheduleToken: 4,
        pendingToken: 4,
        scheduledUntil: 900,
        activeStep: null,
    });
    assert.deepStrictEqual(controller.snapshot(), {
        scheduleToken: 4,
        pendingToken: 4,
        scheduledUntil: 900,
        activeStep: null,
    });
    assert.strictEqual(controller.isCurrent(4), true);
    assert.strictEqual(controller.isStepScheduled(), true);

    const invalidated = controller.invalidate();
    assert.deepStrictEqual(invalidated, {
        scheduleToken: 5,
        pendingToken: 4,
        scheduledUntil: 900,
        activeStep: null,
    });
    assert.strictEqual(controller.isCurrent(4), false);
    assert.strictEqual(controller.isStepScheduled(), false);

    controller.markScheduled(1000, 600, 1500);
    controller.setPendingToken(5);
    assert.deepStrictEqual(controller.snapshot(), {
        scheduleToken: 5,
        pendingToken: 5,
        scheduledUntil: 3100,
        activeStep: null,
    });
    controller.refreshLease(2000, 1500);
    assert.strictEqual(controller.snapshot().scheduledUntil, 3500);
    controller.clearPendingToken();
    assert.strictEqual(controller.snapshot().pendingToken, null);
    controller.markActive({
        token: 5,
        step: 'build',
        stepExecutionId: '5:build',
        activeUntil: 4000,
    });
    assert.strictEqual(controller.snapshot().activeStep.step, 'build');
    controller.clearActive('other');
    assert.strictEqual(controller.snapshot().activeStep.step, 'build');
    controller.clearActive('5:build');
    assert.strictEqual(controller.snapshot().activeStep, null);

    const cancelled = controller.cancel();
    assert.deepStrictEqual(cancelled, {
        scheduleToken: 6,
        pendingToken: null,
        scheduledUntil: 0,
        activeStep: null,
    });
    assert.ok(Object.isFrozen(controller));
    assert.ok(Object.isFrozen(controller.snapshot()));
});

runTest('CPU scheduler healthは実行中stepを期限内だけ予約中として扱う', () => {
    const base = {
        scheduleToken: 8,
        pendingToken: null,
        scheduledUntil: 0,
        activeStep: {
            token: 8,
            step: 'build',
            stepExecutionId: '8:build',
            activeUntil: 5000,
        },
        now: 4000,
        isCpuTurn: true,
        currentPlayerIndex: 1,
        blockedReason: '',
    };
    const active = CpuSchedulerState.buildHealth(base);
    assert.strictEqual(active.stepScheduled, true);
    assert.strictEqual(active.stepActive, true);
    assert.strictEqual(active.activeStep.stepExecutionId, '8:build');
    assert.strictEqual(CpuSchedulerState.buildHealth({ ...base, now: 5000 }).stepScheduled, false);
    assert.strictEqual(CpuSchedulerState.buildHealth({
        ...base,
        activeStep: { ...base.activeStep, token: 7 },
    }).stepActive, false);
});

runTest('CPU scheduler controllerは初期値とlease期限の不正値を安全に正規化する', () => {
    const controller = CpuSchedulerState.createController({
        scheduleToken: 'bad',
        pendingToken: 'bad',
        scheduledUntil: Infinity,
    });
    assert.deepStrictEqual(controller.snapshot(), {
        scheduleToken: 0,
        pendingToken: null,
        scheduledUntil: 0,
        activeStep: null,
    });
    controller.expireLease(123);
    assert.strictEqual(controller.snapshot().scheduledUntil, 123);
    controller.expireLease(Infinity);
    assert.strictEqual(controller.snapshot().scheduledUntil, 0);
});
