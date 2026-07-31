const assert = require('assert');
const { OnlineRestoreQueueState } = require('../js/onlineRestoreQueueState');
const { runTest } = require('./helpers/test-utils');

runTest('restore queue stateは上限未満だけ入力非破壊でeventを追加する', () => {
    const first = { type: 'gameAction', payload: { seq: 1 }, generation: 2 };
    const second = { type: 'hostChanged', payload: { host: 1 }, generation: 2 };
    const queue = [first];
    const transition = OnlineRestoreQueueState.planEnqueue(queue, second, 2);
    assert.strictEqual(transition.overflow, false);
    assert.deepStrictEqual(transition.queue, [first, second]);
    assert.deepStrictEqual(queue, [first]);
    assert.notStrictEqual(transition.queue, queue);
});

runTest('restore queue stateは上限到達時にqueue参照を保ってoverflowにする', () => {
    const queue = [{ type: 'gameAction', payload: {}, generation: 1 }];
    const transition = OnlineRestoreQueueState.planEnqueue(
        queue,
        { type: 'gameAction', payload: {}, generation: 1 },
        1
    );
    assert.strictEqual(transition.overflow, true);
    assert.strictEqual(transition.queue, queue);
});

runTest('restore queue stateはcarry対象だけpayload参照と順序を保って世代更新する', () => {
    const payloadA = { seq: 1 };
    const payloadB = { host: 2 };
    const queue = [
        { type: 'gameAction', payload: payloadA, generation: 3 },
        { type: 'hostChanged', payload: payloadB, generation: 3 },
    ];
    const carried = OnlineRestoreQueueState.planCarry(queue, true, 4);
    assert.deepStrictEqual(carried.queue.map(event => event.type), ['gameAction', 'hostChanged']);
    assert.strictEqual(carried.queue[0].payload, payloadA);
    assert.strictEqual(carried.queue[1].payload, payloadB);
    assert.deepStrictEqual(carried.queue.map(event => event.generation), [4, 4]);
    assert.deepStrictEqual(OnlineRestoreQueueState.planCarry(queue, false, 4).queue, []);
});

runTest('restore queue state authorityは完全一致時だけpure transitionを選ぶ', () => {
    const payload = { seq: 1 };
    const legacy = { overflow: false, queue: [{ type: 'gameAction', payload, generation: 1 }] };
    const pure = { overflow: false, queue: [{ type: 'gameAction', payload, generation: 1 }] };
    const selected = OnlineRestoreQueueState.selectTransition(pure, legacy, { authorityEnabled: true });
    assert.strictEqual(selected.source, 'pure-transition');
    assert.strictEqual(selected.transition, pure);
    const mismatch = OnlineRestoreQueueState.selectTransition(
        { overflow: false, queue: [{ type: 'gameAction', payload: {}, generation: 1 }] },
        legacy,
        { authorityEnabled: true }
    );
    assert.strictEqual(mismatch.source, 'legacy-fallback');
    assert.strictEqual(mismatch.transition, legacy);
    assert.strictEqual(mismatch.fallbackReason, 'restore-queue-state-mismatch');
    assert.strictEqual(Object.isFrozen(OnlineRestoreQueueState), true);
});
