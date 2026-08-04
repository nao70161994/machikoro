'use strict';

const assert = require('assert');
const UiWatchdogAsyncRecovery = require('../js/uiWatchdogAsyncRecovery');
const { runTest } = require('./helpers/test-utils');

function createHarness(overrides = {}) {
    const calls = [];
    const dependencies = {
        buildSnapshot: reason => { calls.push(['snapshot', reason]); return { cpuStepScheduled: true }; },
        checkpoint: (event, details) => calls.push(['checkpoint', event, details]),
        compactSnapshot: snapshot => ({ marker: snapshot.marker || '' }),
        runtimeEffects: {
            scheduleCpu: reason => ({ source: 'scheduler', health: { stepScheduled: true, reason } }),
            handleOnlineActionTimeout: () => ({ available: true, value: true }),
        },
        ...overrides,
    };
    return { calls, runtime: UiWatchdogAsyncRecovery.createRuntime(dependencies) };
}

runTest('watchdog async recoveryはCPU scheduler回復と診断順を維持する', () => {
    const { calls, runtime } = createHarness();
    assert.strictEqual(runtime.recoverCpuTurnStall({ isCpuTurn: true, marker: 'before' }), true);
    assert.deepStrictEqual(calls.map(call => call.slice(0, 2)), [
        ['snapshot', 'cpu-turn-stall-recovery-after'],
        ['checkpoint', 'freeze-watchdog-cpu-reschedule'],
    ]);
    assert.strictEqual(calls[1][2].schedulerHealth.stepScheduled, true);
    assert.deepStrictEqual(calls[1][2].before, { marker: 'before' });
});

runTest('watchdog async recoveryはlegacy scheduler後のsnapshot結果を使う', () => {
    const { calls, runtime } = createHarness({
        runtimeEffects: {
            scheduleCpu: () => ({ source: 'legacy', health: null }),
            handleOnlineActionTimeout: () => ({ available: false }),
        },
    });
    assert.strictEqual(runtime.recoverCpuTurnStall({ isCpuTurn: true }), true);
    assert.strictEqual(calls[1][2].schedulerHealth, undefined);
});

runTest('watchdog async recoveryはCPU不適格状態とeffect失敗を副作用なしで拒否する', () => {
    const { calls, runtime } = createHarness();
    assert.strictEqual(runtime.recoverCpuTurnStall(null), false);
    assert.strictEqual(runtime.recoverCpuTurnStall({ isCpuTurn: true, onlineActionInFlight: true }), false);
    assert.strictEqual(runtime.recoverCpuTurnStall({ isCpuTurn: true, isOnlineGame: true, isRoomHost: false }), false);
    assert.deepStrictEqual(calls, []);

    const failed = createHarness({
        runtimeEffects: {
            scheduleCpu: () => { throw new Error('schedule failed'); },
            handleOnlineActionTimeout: () => ({ available: false }),
        },
    });
    assert.strictEqual(failed.runtime.recoverCpuTurnStall({ isCpuTurn: true }), false);
    assert.deepStrictEqual(failed.calls, []);
});

runTest('watchdog async recoveryはonline timeout結果とcheckpointを維持する', () => {
    const { calls, runtime } = createHarness();
    const snapshot = { onlineActionInFlight: true, onlineActionInFlightAt: 42, marker: 'online' };
    assert.strictEqual(runtime.recoverOnlineActionInFlightStall(snapshot), true);
    assert.deepStrictEqual(calls.map(call => call.slice(0, 2)), [
        ['snapshot', 'online-action-stall-recovery-after'],
        ['checkpoint', 'freeze-watchdog-online-action-resync'],
    ]);
    assert.strictEqual(calls[1][2].onlineActionInFlightAt, 42);
});

runTest('watchdog async recoveryはonline timeout不在と例外をfail closedにする', () => {
    const unavailable = createHarness({
        runtimeEffects: {
            scheduleCpu: () => ({ source: 'none' }),
            handleOnlineActionTimeout: () => ({ available: false }),
        },
    });
    assert.strictEqual(unavailable.runtime.recoverOnlineActionInFlightStall({ onlineActionInFlight: true }), false);
    assert.deepStrictEqual(unavailable.calls, []);

    assert.throws(() => UiWatchdogAsyncRecovery.createRuntime(), /buildSnapshot is required/);
});
