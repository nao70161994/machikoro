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
