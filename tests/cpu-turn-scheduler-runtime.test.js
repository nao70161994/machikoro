'use strict';
const assert = require('assert');
const CpuSchedulerState = require('../js/cpuSchedulerState');
const CpuTurnSchedulerRuntime = require('../js/cpuTurnSchedulerRuntime');
const { runTest } = require('./helpers/test-utils');

function createHarness(options = {}) {
    const calls = [];
    const timers = [];
    let now = 100;
    const cpu = { id: 'cpu' };
    const game = {
        phase: 'roll', currentPlayerIndex: 0, pendingIT: false, builtThisTurn: false,
        checkWinner: () => false, nextTurn: () => calls.push(['nextTurn']),
    };
    let online = Object.assign({ isReplaying: false, isOnlineGame: false, isRoomHost: false, socket: null }, options.online);
    const handlers = options.handlers || [{ name: 'roll', run(value) { calls.push(['step', value]); game.phase = 'build'; return true; } }];
    const runtime = CpuTurnSchedulerRuntime.createRuntime({
        checkpoint: (event, details) => calls.push(['checkpoint', event, details]),
        console: { error: (...args) => calls.push(['error', ...args]) },
        gamePhases: { ROLL: 'roll', SELECT_DICE: 'selectDice', REROLL_CONFIRM: 'rerollConfirm', HARBOR_CHOICE: 'harborChoice', PENDING: 'pending', BUILD: 'build' },
        getActionFlightState: () => ({ inFlight: false }),
        getCpuSpeed: () => 600,
        getGameState: () => ({ game, cpuPlayers: [cpu] }),
        getOnlineState: () => online,
        getPhaseHandlers: () => handlers,
        isReconnectBlocked: () => false,
        now: () => now,
        policy: CpuSchedulerState,
        setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
        unlockHumanTurn: reason => calls.push(['unlock', reason]),
    });
    return { calls, cpu, game, runtime, timers, setNow: value => { now = value; }, setOnline: value => { online = value; } };
}

runTest('CPU turn scheduler runtimeはphase stepをCPU速度後に一度実行してcooldownを予約する', () => {
    const h = createHarness();
    const health = h.runtime.schedule('test');
    assert.strictEqual(health.isCpuTurn, true);
    assert.strictEqual(h.timers.length, 1);
    assert.strictEqual(h.timers[0].delay, 600);
    h.setNow(700);
    h.timers.shift().fn();
    assert.deepStrictEqual(h.calls.filter(call => call[0] === 'step'), [['step', h.cpu]]);
    assert.strictEqual(h.timers.length, 1);
    assert.strictEqual(h.timers[0].delay, 500);
    assert.ok(h.calls.some(call => call[0] === 'checkpoint' && call[1] === 'scheduleCPU-step-result'));
});

runTest('CPU turn scheduler runtimeはstep開始と完了を同じ実行ID・難易度・所要時間で記録する', () => {
    const h = createHarness();
    h.cpu.difficulty = 'strong';
    h.runtime.schedule('diagnostic-contract');
    h.setNow(700);
    h.timers.shift().fn();

    const started = h.calls.find(call => call[1] === 'scheduleCPU-step-run')[2];
    const completed = h.calls.find(call => call[1] === 'scheduleCPU-step-result')[2];
    assert.deepStrictEqual(
        {
            step: started.step,
            phase: started.phase,
            difficulty: started.difficulty,
            currentPlayerIndex: started.currentPlayerIndex,
            token: started.token,
            startedAt: started.startedAt,
        },
        {
            step: 'roll',
            phase: 'roll',
            difficulty: 'strong',
            currentPlayerIndex: 0,
            token: 1,
            startedAt: 700,
        }
    );
    assert.strictEqual(completed.stepExecutionId, started.stepExecutionId);
    assert.strictEqual(completed.durationMs, 0);
    assert.strictEqual(completed.stepResult, true);
});

runTest('CPU turn scheduler runtimeはstep例外にも開始情報と所要時間を保持する', () => {
    let harness;
    harness = createHarness({
        handlers: [{ name: 'roll', run() { harness.setNow(745); throw new Error('decision failed'); } }],
    });
    harness.cpu.difficulty = 'strong';
    harness.runtime.schedule();
    harness.setNow(700);
    harness.timers.shift().fn();

    const started = harness.calls.find(call => call[1] === 'scheduleCPU-step-run')[2];
    const failed = harness.calls.find(call => call[1] === 'scheduleCPU-step-error')[2];
    assert.strictEqual(failed.stepExecutionId, started.stepExecutionId);
    assert.strictEqual(failed.difficulty, 'strong');
    assert.strictEqual(failed.durationMs, 45);
    assert.strictEqual(failed.message, 'decision failed');
});

runTest('CPU turn scheduler runtimeはonline non-hostをeffect前に拒否する', () => {
    const h = createHarness({ online: { isOnlineGame: true, isRoomHost: false, socket: { connected: true } } });
    h.runtime.schedule();
    assert.strictEqual(h.timers.length, 0);
    assert.ok(h.calls.some(call => call[1] === 'scheduleCPU-skip-non-host'));
    assert.strictEqual(h.calls.some(call => call[0] === 'step'), false);
});

runTest('CPU turn scheduler runtimeはcancel後のstale timerを実行しない', () => {
    const h = createHarness();
    h.runtime.schedule();
    const timer = h.timers[0];
    h.runtime.cancel('test-cancel');
    timer.fn();
    assert.strictEqual(h.calls.some(call => call[0] === 'step'), false);
});

runTest('CPU turn scheduler runtimeは必須依存欠落を初期化前に拒否する', () => {
    assert.throws(() => CpuTurnSchedulerRuntime.createRuntime(), /dependency is required/);
});
