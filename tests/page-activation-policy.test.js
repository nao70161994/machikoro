const assert = require('assert');
const PageActivationPolicy = require('../js/pageActivationPolicy');
const { runTest } = require('./helpers/test-utils');

runTest('page activation CPU outcomeは既存の優先順で全結果を分類する', () => {
    assert.strictEqual(PageActivationPolicy.cpuOutcome(null, null, true), 'page-hidden');
    assert.strictEqual(PageActivationPolicy.cpuOutcome(null, null, false), 'not-cpu-turn');
    assert.strictEqual(PageActivationPolicy.cpuOutcome({ isCpuTurn: false }, null, false), 'not-cpu-turn');
    assert.strictEqual(PageActivationPolicy.cpuOutcome({
        isCpuTurn: true,
        blockedReason: 'reconnecting',
        stepScheduled: true,
    }, { stepScheduled: true }, false), 'blocked:reconnecting');
    assert.strictEqual(PageActivationPolicy.cpuOutcome({
        isCpuTurn: true,
        stepScheduled: true,
    }, { stepScheduled: true }, false), 'already-scheduled');
    assert.strictEqual(PageActivationPolicy.cpuOutcome({
        isCpuTurn: true,
        stepScheduled: false,
    }, { stepScheduled: true }, false), 'rescheduled');
    assert.strictEqual(PageActivationPolicy.cpuOutcome({
        isCpuTurn: true,
        stepScheduled: false,
    }, { stepScheduled: false }, false), 'not-rescheduled');
});

runTest('page activation hidden durationは無効値を拒否し経過時間を0以上に丸める', () => {
    assert.strictEqual(PageActivationPolicy.hiddenDurationMs(Number.NaN, 100), null);
    assert.strictEqual(PageActivationPolicy.hiddenDurationMs(Number.POSITIVE_INFINITY, 100), null);
    assert.strictEqual(PageActivationPolicy.hiddenDurationMs(0, 100), null);
    assert.strictEqual(PageActivationPolicy.hiddenDurationMs(-1, 100), null);
    assert.strictEqual(PageActivationPolicy.hiddenDurationMs(100, 90), 0);
    assert.strictEqual(PageActivationPolicy.hiddenDurationMs(100, 100), 0);
    assert.strictEqual(PageActivationPolicy.hiddenDurationMs(100, 298231), 298131);
});


runTest('page activation lifecycle controllerはbindingとhidden期間を単独所有する', () => {
    const controller = PageActivationPolicy.createLifecycleController();

    assert.strictEqual(controller.claimBinding(), true);
    assert.strictEqual(controller.claimBinding(), false);
    assert.deepStrictEqual(controller.beginActivation(true, 100), {
        pageHidden: true, hiddenForMs: 0,
    });
    assert.deepStrictEqual(controller.beginActivation(true, 250), {
        pageHidden: true, hiddenForMs: 150,
    });
    controller.finishActivation(true);
    assert.strictEqual(controller.hiddenDurationMs(300), 200);
    controller.finishActivation(false);
    assert.strictEqual(controller.hiddenDurationMs(400), null);
    assert.ok(Object.isFrozen(controller));
    assert.ok(Object.isFrozen(controller.snapshot()));
});
