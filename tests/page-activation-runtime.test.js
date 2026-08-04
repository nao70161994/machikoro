'use strict';
const assert = require('assert');
const DelayedHumanActionPolicy = require('../js/delayedHumanActionPolicy');
const PageActivationPolicy = require('../js/pageActivationPolicy');
const PageActivationRuntime = require('../js/pageActivationRuntime');
const { runTest } = require('./helpers/test-utils');

function createHarness() {
    const calls = [];
    const handlers = {};
    const timers = new Map();
    let timerId = 0;
    let now = 100;
    let canRun = true;
    let health = { isCpuTurn: true, blockedReason: '', stepScheduled: false, scheduledUntil: 0 };
    const document = { hidden: false, addEventListener: (name, fn) => { handlers['document:' + name] = fn; } };
    const window = { addEventListener: (name, fn) => { handlers['window:' + name] = fn; } };
    const runtime = PageActivationRuntime.createRuntime({
        canRunHumanAction: () => canRun,
        cancelCpuSchedule: reason => calls.push(['cancelCpu', reason]),
        checkpoint: (event, details) => calls.push(['checkpoint', event, details]),
        clearTimeout: id => { calls.push(['clearTimeout', id]); timers.delete(id); },
        currentCpuHealth: () => ({ ...health }),
        delayedPolicy: DelayedHumanActionPolicy,
        getDocument: () => document,
        getWindow: () => window,
        now: () => now,
        pagePolicy: PageActivationPolicy,
        resumeOnline: () => calls.push(['resumeOnline']),
        resumeRlLoads: () => calls.push(['resumeRl']),
        scheduleCpuTurn: reason => { calls.push(['scheduleCpu', reason]); health = { ...health, stepScheduled: true, scheduledUntil: now + 1000 }; },
        setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, fn); calls.push(['setTimeout', id, delay]); return id; },
    });
    return {
        calls, document, handlers, runtime, timers,
        setCanRun: value => { canRun = value; },
        setHealth: value => { health = value; },
        setNow: value => { now = value; },
    };
}

runTest('page activation runtimeは遅延human actionを期限前に再予約し期限後一度だけ実行する', () => {
    const h = createHarness();
    let runs = 0;
    h.runtime.scheduleDelayed('selectDice', 1, () => { runs++; }, 600);
    h.setNow(200);
    assert.strictEqual(h.runtime.resumeDelayed(), 'reschedule');
    assert.strictEqual(h.calls.filter(call => call[0] === 'clearTimeout').length, 1);
    assert.strictEqual(h.calls.at(-1)[2], 500);
    h.setNow(700);
    assert.strictEqual(h.runtime.resumeDelayed(), 'run');
    assert.strictEqual(runs, 1);
    assert.strictEqual(h.runtime.resumeDelayed(), 'idle');
    assert.strictEqual(runs, 1);
});

runTest('page activation runtimeはRL・human・online・CPU・checkpoint順で復帰する', () => {
    const h = createHarness();
    h.runtime.setHiddenAt(50);
    h.runtime.resume('pageshow-resume');
    assert.deepStrictEqual(h.calls.map(call => call[0]), [
        'resumeRl', 'resumeOnline', 'cancelCpu', 'scheduleCpu', 'checkpoint',
    ]);
    assert.deepStrictEqual(h.calls[2], ['cancelCpu', 'pageshow-resume-expire-stale']);
    assert.strictEqual(h.calls[4][1], 'page-activation-resume');
    assert.strictEqual(h.calls[4][2].hiddenForMs, 50);
    assert.strictEqual(h.calls[4][2].cpuOutcome, 'rescheduled');
});

runTest('page activation runtimeはlistenerを一度だけbindしhidden時はCPUを再予約しない', () => {
    const h = createHarness();
    assert.strictEqual(h.runtime.bind(), true);
    assert.strictEqual(h.runtime.bind(), false);
    h.document.hidden = true;
    h.setNow(300);
    h.handlers['document:visibilitychange']();
    assert.strictEqual(h.calls.some(call => call[0] === 'scheduleCpu'), false);
    const checkpoint = h.calls.find(call => call[0] === 'checkpoint');
    assert.strictEqual(checkpoint[1], 'page-activation-hidden');
    assert.strictEqual(checkpoint[2].cpuOutcome, 'page-hidden');
});

runTest('page activation runtimeは必須依存欠落を初期化前に拒否する', () => {
    assert.throws(() => PageActivationRuntime.createRuntime(), /dependency is required/);
});
