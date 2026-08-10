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
        getPendingAction: current => current.pendingActionQueue?.[0]?.action || '',
        getPhaseHandlers: () => handlers,
        isReconnectBlocked: () => false,
        now: () => now,
        policy: CpuSchedulerState,
        recoverBuildError: details => {
            calls.push(['recoverBuildError', details]);
            if (typeof options.recoverBuildError === 'function') {
                return options.recoverBuildError(details);
            }
            return options.recoverBuildResult === true;
        },
        reportSlowStep: options.reportSlowStep || (details => calls.push(['slow-report', details])),
        setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
        slowStepThresholdMs: options.slowStepThresholdMs,
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
    assert.strictEqual(harness.timers.length, 0);
});

runTest('CPU turn scheduler runtimeは遅いstepをpending actionと完了結果付きで通知する', () => {
    let harness;
    harness = createHarness({
        handlers: [{
            name: 'pending',
            run() {
                harness.setNow(1900);
                harness.game.phase = 'build';
                return true;
            },
        }],
    });
    harness.cpu.difficulty = 'strong';
    harness.game.phase = 'pending';
    harness.game.pendingActionQueue = [{ action: 'resolveBusiness' }];
    harness.runtime.schedule('slow-step-contract');
    harness.setNow(700);
    harness.timers.shift().fn();

    const report = harness.calls.find(call => call[0] === 'slow-report')[1];
    assert.deepStrictEqual({
        step: report.step,
        phase: report.phase,
        pendingAction: report.pendingAction,
        difficulty: report.difficulty,
        durationMs: report.durationMs,
        thresholdMs: report.thresholdMs,
        outcome: report.outcome,
    }, {
        step: 'pending',
        phase: 'pending',
        pendingAction: 'resolveBusiness',
        difficulty: 'strong',
        durationMs: 1200,
        thresholdMs: 1000,
        outcome: 'completed',
    });
    assert.strictEqual(
        harness.calls.filter(call => call[1] === 'scheduleCPU-step-slow').length,
        1
    );
});

runTest('CPU turn scheduler runtimeは遅延通知失敗をCPU進行から隔離する', () => {
    let harness;
    harness = createHarness({
        slowStepThresholdMs: 0,
        reportSlowStep() { throw new Error('report unavailable'); },
        handlers: [{
            name: 'roll',
            run() {
                harness.game.phase = 'build';
                return true;
            },
        }],
    });
    harness.runtime.schedule();
    harness.timers.shift().fn();

    assert.ok(harness.calls.some(call => call[1] === 'scheduleCPU-step-slow-report-error'));
    assert.strictEqual(harness.timers.length, 1);
});

runTest('CPU turn scheduler runtimeはonline hostのstep例外を再予約しない', () => {
    const harness = createHarness({
        online: { isOnlineGame: true, isRoomHost: true, socket: { connected: true } },
        handlers: [{ name: 'roll', run() { throw new Error('online decision failed'); } }],
    });
    harness.runtime.schedule();
    harness.timers.shift().fn();

    assert.strictEqual(harness.timers.length, 0);
    assert.ok(harness.calls.some(call => call[1] === 'scheduleCPU-step-error'));
});

for (const online of [false, true]) {
    runTest(`CPU turn scheduler runtimeは${online ? 'online' : 'local'} build例外を${online ? '自動復旧しない' : '注入action境界だけで復旧する'}`, () => {
        const harness = createHarness({
            online: online
                ? { isOnlineGame: true, isRoomHost: true, socket: { connected: true } }
                : undefined,
            recoverBuildResult: true,
            handlers: [{ name: 'build', run() { throw new Error('build failed'); } }],
        });
        harness.game.phase = 'build';
        harness.runtime.schedule();
        harness.timers.shift().fn();

        assert.strictEqual(
            harness.calls.filter(call => call[0] === 'recoverBuildError').length,
            online ? 0 : 1
        );
        assert.strictEqual(harness.calls.some(call => call[0] === 'nextTurn'), false);
        assert.strictEqual(
            harness.calls.some(call => call[1] === 'scheduleCPU-build-error-recovery'),
            !online
        );
    });
}

runTest('CPU turn scheduler runtimeはbuild例外復旧の例外を隔離して停止する', () => {
    const harness = createHarness({
        recoverBuildError() { throw new Error('recovery failed'); },
        handlers: [{ name: 'build', run() { throw new Error('build failed'); } }],
    });
    harness.game.phase = 'build';
    harness.runtime.schedule();
    harness.timers.shift().fn();
    assert.ok(harness.calls.some(call => call[1] === 'scheduleCPU-build-error-recovery-error'));
    const result = harness.calls.find(call => call[1] === 'scheduleCPU-build-error-recovery')[2];
    assert.strictEqual(result.recovered, false);
    assert.strictEqual(harness.timers.length, 0);
});

runTest('CPU turn scheduler runtimeは拒否されたbuild例外復旧を成功扱いしない', () => {
    const harness = createHarness({
        recoverBuildResult: false,
        handlers: [{ name: 'build', run() { throw new Error('build failed'); } }],
    });
    harness.game.phase = 'build';
    harness.runtime.schedule();
    harness.timers.shift().fn();

    const result = harness.calls.find(call => call[1] === 'scheduleCPU-build-error-recovery')[2];
    assert.strictEqual(result.recovered, false);
    assert.strictEqual(harness.timers.length, 0);
});

runTest('CPU turn scheduler runtimeはstep実行中だけexecution leaseをhealthへ公開する', () => {
    let harness;
    let activeHealth;
    harness = createHarness({
        handlers: [{
            name: 'roll',
            run() {
                activeHealth = harness.runtime.health();
                harness.game.phase = 'build';
                return true;
            },
        }],
    });
    harness.runtime.schedule();
    harness.setNow(700);
    harness.timers.shift().fn();
    assert.strictEqual(activeHealth.stepActive, true);
    assert.strictEqual(activeHealth.stepScheduled, true);
    assert.strictEqual(activeHealth.activeStep.step, 'roll');
    assert.strictEqual(activeHealth.activeStep.activeUntil, 15700);
    assert.strictEqual(harness.runtime.health().stepActive, false);
    assert.strictEqual(harness.runtime.controller.snapshot().activeStep, null);
});

for (const online of [false, true]) {
    runTest(`CPU turn scheduler runtimeは${online ? 'online host' : 'local'} pending no-progressを1回だけ再試行する`, () => {
        const calls = [];
        const h = createHarness({
            online: online ? { isOnlineGame: true, isRoomHost: true, socket: { connected: true } } : undefined,
            handlers: [{ name: 'pending', run() { calls.push('pending'); return false; } }],
        });
        h.game.phase = 'pending';
        h.runtime.schedule();

        h.timers.shift().fn();
        assert.strictEqual(calls.length, 1);
        const retryTimer = h.timers.shift();
        assert.strictEqual(retryTimer.delay, 500);
        retryTimer.fn();
        const secondStepTimer = h.timers.shift();
        assert.strictEqual(secondStepTimer.delay, 600);
        secondStepTimer.fn();

        assert.strictEqual(calls.length, 2);
        assert.strictEqual(h.timers.length, 0);
        assert.strictEqual(
            h.calls.filter(call => call[1] === 'scheduleCPU-pending-no-progress-retry').length,
            1
        );
        assert.strictEqual(
            h.calls.filter(call => call[1] === 'scheduleCPU-pending-no-progress-exhausted').length,
            1
        );
    });
}

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
