'use strict';

const assert = require('assert');
const OnlineSessionLifecycle = require('../js/onlineSessionLifecycle');
const { runTest } = require('./helpers/test-utils');

function effectsFor(steps, calls) {
    return Object.fromEntries(steps.map(step => [step, plan => {
        calls.push([step, plan.kind, plan.roomIdBeforeReset]);
    }]));
}

runTest('online session lifecycleは完了effect順をfrozen planで固定する', () => {
    const calls = [];
    const plan = OnlineSessionLifecycle.completedPlan();
    const result = OnlineSessionLifecycle.execute(
        plan,
        effectsFor(OnlineSessionLifecycle.completedSteps, calls)
    );
    assert.strictEqual(result, plan);
    assert.deepStrictEqual(calls.map(call => call[0]), OnlineSessionLifecycle.completedSteps);
    assert.strictEqual(Object.isFrozen(plan), true);
});

runTest('online session lifecycleはreset前room idと既存effect順を保持する', () => {
    const calls = [];
    const plan = OnlineSessionLifecycle.resetPlan('ROOM01');
    OnlineSessionLifecycle.execute(
        plan,
        effectsFor(OnlineSessionLifecycle.resetSteps, calls)
    );
    assert.strictEqual(plan.roomIdBeforeReset, 'ROOM01');
    assert.deepStrictEqual(calls.map(call => call[0]), OnlineSessionLifecycle.resetSteps);
    assert.ok(calls.find(call => call[0] === 'clearPendingOutboundAction').includes('ROOM01'));
});

runTest('online session lifecycleはeffect欠落を部分実行前に拒否する', () => {
    const calls = [];
    assert.throws(() => OnlineSessionLifecycle.execute(
        OnlineSessionLifecycle.completedPlan(),
        { markCompleted() { calls.push('mutated'); } }
    ), /leaveOnlineGame effect is required/);
    assert.deepStrictEqual(calls, []);
    assert.throws(() => OnlineSessionLifecycle.execute({ kind: 'unknown' }, {}), /plan is required/);
});
