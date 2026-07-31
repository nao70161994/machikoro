'use strict';

const assert = require('assert');
const { OnlinePendingResend } = require('../js/onlinePendingResend');
const { runTest } = require('./helpers/test-utils');

function handlers(calls) {
    return Object.fromEntries(OnlinePendingResend.steps.map(step => [
        step,
        value => calls.push([step, value]),
    ]));
}

runTest('online pending resend planは復元後の既存guard順をpureに固定する', () => {
    const pending = { action: 'nextTurn', data: {}, clientActionId: 'a-1' };
    assert.deepStrictEqual(OnlinePendingResend.plan({ pending }), {
        decision: OnlinePendingResend.decisions.NONE,
        pending: null,
    });
    assert.deepStrictEqual(OnlinePendingResend.plan({
        pending,
        acceptedPending: false,
        currentPendingMatches: true,
        socketConnected: true,
        canResend: false,
    }), {
        decision: OnlinePendingResend.decisions.CLEAR,
        pending: null,
    });
    const resend = OnlinePendingResend.plan({
        pending,
        acceptedPending: false,
        currentPendingMatches: true,
        socketConnected: true,
        canResend: true,
    });
    assert.deepStrictEqual(resend, {
        decision: OnlinePendingResend.decisions.RESEND,
        pending,
    });
    assert.strictEqual(resend.pending, pending);
    assert.strictEqual(Object.isFrozen(resend), true);
});

runTest('online pending resend plan authorityはpending参照まで完全一致時だけpure planを選ぶ', () => {
    const pending = { action: 'nextTurn', data: {} };
    const input = {
        pending,
        acceptedPending: false,
        currentPendingMatches: true,
        socketConnected: true,
        canResend: true,
    };
    const legacy = Object.freeze({
        decision: OnlinePendingResend.decisions.RESEND,
        pending,
    });
    assert.strictEqual(OnlinePendingResend.selectPlan(input, legacy).source, 'legacy');
    assert.strictEqual(OnlinePendingResend.selectPlan(
        input, legacy, { authorityEnabled: true }
    ).source, 'pure-plan');
    const mismatch = Object.freeze({
        decision: OnlinePendingResend.decisions.RESEND,
        pending: Object.assign({}, pending),
    });
    assert.deepStrictEqual(OnlinePendingResend.selectPlan(
        input, mismatch, { authorityEnabled: true }
    ), {
        plan: mismatch,
        source: 'legacy-fallback',
        fallbackReason: 'pending-resend-plan-mismatch',
    });
});

runTest('online pending resend executorはstale pendingだけを消去する', () => {
    const calls = [];
    const result = OnlinePendingResend.execute({
        decision: OnlinePendingResend.decisions.CLEAR,
        pending: null,
    }, handlers(calls));
    assert.deepStrictEqual(calls, [['clearPendingOutboundAction', undefined]]);
    assert.deepStrictEqual(result.steps, ['clearPendingOutboundAction']);
});

runTest('online pending resend executorはflight設定後に同じpending参照を送信する', () => {
    const calls = [];
    const pending = { action: 'nextTurn', data: {}, clientActionId: 'a-1' };
    OnlinePendingResend.execute({
        decision: OnlinePendingResend.decisions.RESEND,
        pending,
    }, handlers(calls));
    assert.deepStrictEqual(calls, [
        ['setActionFlight', undefined],
        ['emitAction', pending],
    ]);
    assert.strictEqual(calls[1][1], pending);
});

runTest('online pending resend executorはnoneでも全handlerをeffect前に検証する', () => {
    const calls = [];
    const incomplete = handlers(calls);
    delete incomplete.emitAction;
    assert.throws(() => OnlinePendingResend.execute({
        decision: OnlinePendingResend.decisions.NONE,
        pending: null,
    }, incomplete), /emitAction/);
    assert.deepStrictEqual(calls, []);
});
