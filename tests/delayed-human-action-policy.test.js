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
