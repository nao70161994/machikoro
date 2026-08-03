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
