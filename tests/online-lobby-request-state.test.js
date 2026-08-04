'use strict';

const assert = require('assert');
const OnlineLobbyRequestState = require('../js/onlineLobbyRequestState');
const { runTest } = require('./helpers/test-utils');

runTest('online lobby request controllerはcreate/join待機を排他的に所有する', () => {
    const controller = OnlineLobbyRequestState.createController();
    assert.deepStrictEqual(controller.snapshot(), {
        createPending: false,
        joinPending: false,
        kind: '',
        generation: 0,
        timerAttached: false,
    });
    const create = controller.begin(OnlineLobbyRequestState.kinds.CREATE);
    assert.deepStrictEqual(create.state, {
        createPending: true,
        joinPending: false,
        kind: 'create',
        generation: 2,
        timerAttached: false,
    });
    const join = controller.begin(OnlineLobbyRequestState.kinds.JOIN);
    assert.deepStrictEqual(join.state, {
        createPending: false,
        joinPending: true,
        kind: 'join',
        generation: 4,
        timerAttached: false,
    });
    assert.ok(Object.isFrozen(join.state));
});

runTest('online lobby request controllerは古いtimerとgenerationをfail closedにする', () => {
    const controller = OnlineLobbyRequestState.createController();
    const first = controller.begin('create');
    const oldTimer = { id: 1 };
    assert.strictEqual(controller.attachTimer('create', first.generation, oldTimer), true);
    assert.strictEqual(controller.snapshot().timerAttached, true);
    const second = controller.begin('join');
    assert.strictEqual(second.replacedTimer, oldTimer);
    assert.strictEqual(controller.isCurrent('create', first.generation), false);
    assert.strictEqual(controller.attachTimer('create', first.generation, { id: 2 }), false);
    assert.strictEqual(controller.isCurrent('join', second.generation), true);
});

runTest('online lobby request controllerはkind不一致finishを拒否し一致時だけ解除する', () => {
    const controller = OnlineLobbyRequestState.createController();
    const started = controller.begin('join');
    const timer = { id: 3 };
    controller.attachTimer('join', started.generation, timer);
    const mismatch = controller.finish('create');
    assert.strictEqual(mismatch.finished, false);
    assert.deepStrictEqual(mismatch.state, {
        createPending: false,
        joinPending: true,
        kind: 'join',
        generation: 2,
        timerAttached: true,
    });
    const finished = controller.finish('join');
    assert.strictEqual(finished.finished, true);
    assert.strictEqual(finished.timer, timer);
    assert.deepStrictEqual(finished.state, {
        createPending: false,
        joinPending: false,
        kind: '',
        generation: 3,
        timerAttached: false,
    });
});

runTest('online lobby request controllerはRL preload用pending projectionも保持する', () => {
    const controller = OnlineLobbyRequestState.createController();
    assert.strictEqual(controller.setCreatePending(true).createPending, true);
    assert.strictEqual(controller.setJoinPending(true).joinPending, true);
    const finished = controller.finish();
    assert.strictEqual(finished.state.createPending, false);
    assert.strictEqual(finished.state.joinPending, false);
    assert.throws(() => controller.begin('unknown'), /unknown online lobby request kind/);
});
