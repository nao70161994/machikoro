const assert = require('assert');
const DelayedHumanActionPolicy = require('../js/delayedHumanActionPolicy');
const { runTest } = require('./helpers/test-utils');

function decision(overrides = {}) {
    return DelayedHumanActionPolicy.resumeDecision({
        pageHidden: false,
        pending: true,
        hasState: true,
        canRun: true,
        now: 100,
        deadline: 200,
        ...overrides,
    });
}

runTest('delayed human action controllerはpending token state timerを単独所有する', () => {
    const controller = DelayedHumanActionPolicy.createScheduleController();
    const run = () => {};
    const first = controller.schedule({ action: 'rollDice', playerIndex: 1, deadline: 200, run });
    assert.deepStrictEqual(controller.snapshot(), { pending: true, token: 1, hasTimer: false, hasState: true });
    assert.ok(Object.isFrozen(first));
    const timer = { id: 1 };
    controller.setTimer(timer);
    const renewed = controller.renew();
    assert.strictEqual(renewed.token, 2);
    assert.strictEqual(renewed.run, run);
    assert.strictEqual(controller.take(first.token), null);
    controller.updateDeadline(0);
    assert.strictEqual(controller.getState().deadline, 0);
    const taken = controller.take(renewed.token);
    assert.strictEqual(taken.run, run);
    assert.deepStrictEqual(controller.snapshot(), { pending: false, token: 2, hasTimer: false, hasState: false });
    controller.schedule({ action: 'selectDice', playerIndex: 0, deadline: 300, run });
    controller.setTimer(timer);
    assert.strictEqual(controller.cancel(), timer);
    assert.deepStrictEqual(controller.snapshot(), { pending: false, token: 4, hasTimer: false, hasState: false });
    assert.ok(Object.isFrozen(controller));
});

runTest('delayed human action resumeは非表示・未予約・state欠落をidleにする', () => {
    assert.strictEqual(decision({ pageHidden: true, canRun: false, now: 300 }), 'idle');
    assert.strictEqual(decision({ pending: false, canRun: false, now: 300 }), 'idle');
    assert.strictEqual(decision({ hasState: false, canRun: false, now: 300 }), 'idle');
});

runTest('delayed human action resumeは実行不能をcancelへ分類する', () => {
    assert.strictEqual(decision({ canRun: false }), 'cancel');
});

runTest('delayed human action resumeはdeadline境界でrunし期限前だけ再予約する', () => {
    assert.strictEqual(decision({ now: 199, deadline: 200 }), 'reschedule');
    assert.strictEqual(decision({ now: 200, deadline: 200 }), 'run');
    assert.strictEqual(decision({ now: 201, deadline: 200 }), 'run');
    assert.strictEqual(Object.isFrozen(DelayedHumanActionPolicy), true);
});
