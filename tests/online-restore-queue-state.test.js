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

runTest('restore queue stateはdrain時に元queue参照を退避してlive queueを空にする', () => {
    const queue = [{ type: 'gameAction', payload: { seq: 1 }, generation: 5 }];
    const transition = OnlineRestoreQueueState.planDrain(queue);
    assert.strictEqual(transition.drainedQueue, queue);
    assert.deepStrictEqual(transition.queue, []);
    assert.notStrictEqual(transition.queue, queue);
    assert.deepStrictEqual(queue.map(event => event.generation), [5]);
});

runTest('restore queue stateは失敗event以降だけを入力非破壊で保持する', () => {
    const queue = [
        { type: 'gameAction', payload: { seq: 1 }, generation: 5 },
        { type: 'gameAction', payload: { seq: 2 }, generation: 5 },
        { type: 'hostChanged', payload: { host: 1 }, generation: 5 },
    ];
    const transition = OnlineRestoreQueueState.planFailureRemainder(queue, 1);
    assert.deepStrictEqual(transition.queue, [queue[1], queue[2]]);
    assert.strictEqual(transition.queue[0], queue[1]);
    assert.deepStrictEqual(queue.map(event => event.type), ['gameAction', 'gameAction', 'hostChanged']);
});

runTest('restore queue stateはclear transitionを新しい空queueとして返す', () => {
    const transition = OnlineRestoreQueueState.planClear();
    assert.strictEqual(transition.overflow, false);
    assert.deepStrictEqual(transition.queue, []);
    assert.strictEqual(Object.isFrozen(transition), true);
});

runTest('restore queue storeは状態参照とreplacementを外部ownerへ閉じ込める', () => {
    const initial = [{ type: 'gameAction', payload: { seq: 1 }, generation: 1 }];
    const replacement = [{ type: 'hostChanged', payload: { host: 1 }, generation: 2 }];
    const store = OnlineRestoreQueueState.createStore(initial);
    assert.strictEqual(store.read(), initial);
    assert.strictEqual(store.replace(replacement), replacement);
    assert.strictEqual(store.read(), replacement);
    const appended = { type: 'gameAction', payload: { seq: 2 }, generation: 2 };
    assert.strictEqual(store.append(appended), replacement);
    assert.strictEqual(store.read()[1], appended);
    assert.strictEqual(Object.isFrozen(store), true);
});

runTest('restore queue store read authorityは完全一致時だけshadowを選ぶ', () => {
    const payload = { seq: 1 };
    const legacy = [{ type: 'gameAction', payload, generation: 1 }];
    const shadow = [{ type: 'gameAction', payload, generation: 1 }];
    const selected = OnlineRestoreQueueState.selectRead(shadow, legacy, { authorityEnabled: true });
    assert.strictEqual(selected.source, 'store-read');
    assert.strictEqual(selected.queue, shadow);
    assert.strictEqual(selected.matched, true);
    const disabled = OnlineRestoreQueueState.selectRead(shadow, legacy);
    assert.strictEqual(disabled.source, 'legacy');
    assert.strictEqual(disabled.queue, legacy);
    const mismatch = OnlineRestoreQueueState.selectRead([], legacy, { authorityEnabled: true });
    assert.strictEqual(mismatch.source, 'legacy-fallback');
    assert.strictEqual(mismatch.queue, legacy);
    assert.strictEqual(mismatch.fallbackReason, 'restore-queue-store-mismatch');
});

runTest('restore queue store write authorityは完全一致時だけstore結果を選ぶ', () => {
    const payload = { seq: 1 };
    const legacy = [{ type: 'gameAction', payload, generation: 1 }];
    const store = [{ type: 'gameAction', payload, generation: 1 }];
    const selected = OnlineRestoreQueueState.selectWrite(store, legacy, { authorityEnabled: true });
    assert.strictEqual(selected.source, 'store-write');
    assert.strictEqual(selected.queue, store);
    const disabled = OnlineRestoreQueueState.selectWrite(store, legacy);
    assert.strictEqual(disabled.source, 'legacy');
    assert.strictEqual(disabled.queue, legacy);
    const mismatch = OnlineRestoreQueueState.selectWrite([], legacy, { authorityEnabled: true });
    assert.strictEqual(mismatch.source, 'legacy-fallback');
    assert.strictEqual(mismatch.queue, legacy);
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
    const drainedMismatch = OnlineRestoreQueueState.selectTransition(
        { overflow: false, queue: [], drainedQueue: legacy.queue },
        { overflow: false, queue: [], drainedQueue: [] },
        { authorityEnabled: true }
    );
    assert.strictEqual(drainedMismatch.source, 'legacy-fallback');
    assert.strictEqual(Object.isFrozen(OnlineRestoreQueueState), true);
});

runTest('restore queue diagnostic controllerは5種の選択結果を一箇所で所有する', () => {
    const keys = OnlineRestoreQueueState.diagnosticKeys;
    const initial = Object.freeze({ source: 'none' });
    const controller = OnlineRestoreQueueState.createDiagnosticController({
        [keys.STORE_READ]: initial,
    });
    assert.strictEqual(controller.read(keys.STORE_READ), initial);
    assert.strictEqual(controller.read(keys.EFFECT), null);
    const selected = Object.freeze({ source: 'pure-plan', matched: true });
    assert.strictEqual(controller.write(keys.PLAN, selected), selected);
    assert.strictEqual(controller.read(keys.PLAN), selected);
    assert.strictEqual(controller.snapshot()[keys.PLAN], selected);
    assert.throws(() => controller.read('unknown'), /unknown restore queue diagnostic key/);
    assert.throws(() => controller.write('unknown', {}), /unknown restore queue diagnostic key/);
    assert.ok(Object.isFrozen(keys));
    assert.ok(Object.isFrozen(controller));
    assert.ok(Object.isFrozen(controller.snapshot()));
});
