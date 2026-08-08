'use strict';

const assert = require('assert');
const AppShellRuntimeEffects = require('../js/appShellRuntimeEffects');
const { runTest } = require('./helpers/test-utils');

function createRuntime(dependencies = {}, options = {}) {
    return AppShellRuntimeEffects.createFromResolver(name => dependencies[name], options);
}

runTest('app shell runtime effectsは遅延解決した必須・任意effectを呼ぶ', () => {
    const calls = [];
    const dependencies = {};
    const runtime = createRuntime(dependencies);
    dependencies.loadSettings = () => calls.push('loadSettings');
    dependencies.render = () => calls.push('render');
    dependencies.preloadLocalRlModels = reason => calls.push(reason);

    runtime.loadSettings();
    assert.strictEqual(runtime.render(), true);
    assert.strictEqual(runtime.preloadLocalRlModels('local-preload'), true);
    assert.strictEqual(runtime.renderBuildMenu(), false);
    assert.deepStrictEqual(calls, ['loadSettings', 'render', 'local-preload']);
    assert.throws(() => runtime.resumeGame(), /resumeGame effect is unavailable/);
});

runTest('app shell runtime effectsはscheduler healthを正規化して優先する', () => {
    const calls = [];
    const health = { blockedReason: 'busy', token: 3, scheduledUntil: 99, stepScheduled: true };
    const runtime = createRuntime({
        cpuTurnScheduler: {
            getHealth: () => health,
            schedule: reason => { calls.push(['schedule', reason]); return health; },
            cancel: reason => calls.push(['cancel', reason]),
        },
        scheduleCpu: () => calls.push(['legacy-schedule']),
        cancelCpuSchedule: () => calls.push(['legacy-cancel']),
    });

    assert.deepStrictEqual(runtime.schedulerSnapshot(), {
        ...health,
        stepActive: false,
        activeStep: null,
    });
    assert.deepStrictEqual(runtime.scheduleCpu('watchdog'), { source: 'scheduler', health });
    assert.strictEqual(runtime.cancelCpu('reset'), 'scheduler');
    assert.deepStrictEqual(calls, [['schedule', 'watchdog'], ['cancel', 'reset']]);
});

runTest('app shell runtime effectsはlegacy CPU scheduler契約を維持する', () => {
    const calls = [];
    const runtime = createRuntime({
        cpuSchedulerStateController: {
            snapshot: () => ({ scheduleToken: 7, scheduledUntil: 150 }),
            isStepScheduled: () => true,
        },
        scheduleCpu: (...args) => calls.push(['schedule', args]),
        cancelCpuSchedule: reason => calls.push(['cancel', reason]),
    }, { now: () => 100 });

    assert.deepStrictEqual(runtime.schedulerSnapshot(), {
        blockedReason: '', token: 7, scheduledUntil: 150, stepScheduled: true,
        stepActive: false, activeStep: null,
    });
    assert.deepStrictEqual(runtime.scheduleCpu('ignored-by-legacy'), { source: 'legacy', health: null });
    assert.strictEqual(runtime.cancelCpu('reset'), 'legacy');
    assert.deepStrictEqual(calls, [['schedule', []], ['cancel', 'reset']]);
});

runTest('app shell runtime effectsはonline action状態とtimeoutのfallbackを固定する', () => {
    const fallback = createRuntime({ onlineActionInFlight: 1, onlineActionInFlightAt: '42' });
    assert.deepStrictEqual(fallback.onlineActionFlightState(), { inFlight: true, startedAt: 42 });
    assert.deepStrictEqual(fallback.handleOnlineActionTimeout(), { available: false, value: undefined });

    const state = { inFlight: false, startedAt: 12 };
    const preferred = createRuntime({
        getOnlineActionFlightState: () => state,
        handleOnlineActionTimeout: () => true,
    });
    assert.strictEqual(preferred.onlineActionFlightState(), state);
    assert.deepStrictEqual(preferred.handleOnlineActionTimeout(), { available: true, value: true });
});

runTest('appShellは外部runtime effectをadapter経由だけで呼ぶ', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/appShell.js'), 'utf8');
    const directCalls = [
        'render', 'renderBuildMenu', 'resumeGame', 'loadSettings',
        'preloadLocalRlModelsInBackground', 'preloadOnlineRlModelsInBackground',
        'renderOnlinePlayerSettings', 'updateResumeButton', 'drawCitySkyline',
        'scheduleCPU', 'cancelCpuSchedule', '_handleOnlineActionTimeout',
    ];
    directCalls.forEach(name => {
        assert.strictEqual(new RegExp(`(?<![.\\w])${name}\\s*\\(`).test(source), false, `${name} direct call`);
    });
    assert.ok(source.includes('AppShellRuntimeEffects.createFromResolver'));
});
