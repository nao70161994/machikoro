'use strict';

const assert = require('assert');
const LocalResumePreloadState = require('../js/localResumePreloadState');
const { runTest } = require('./helpers/test-utils');

runTest('local resume preload stateはpendingとgenerationを一つのcontrollerで所有する', () => {
    const state = LocalResumePreloadState.create();
    assert.deepStrictEqual(state.snapshot(), { pending: false, generation: 0 });
    assert.deepStrictEqual(state.start(), { pending: true, generation: 1 });
    assert.deepStrictEqual(state.setPending(false), { pending: false, generation: 1 });
    assert.deepStrictEqual(state.setPending(true), { pending: true, generation: 1 });
    assert.strictEqual(Object.isFrozen(state.snapshot()), true);
});

runTest('local resume preload stateは古い非同期完了を拒否して現行世代だけ完了する', () => {
    const state = LocalResumePreloadState.create();
    const first = state.start();
    const second = state.start();

    const stale = state.finish(first.generation);
    assert.deepStrictEqual(stale, {
        accepted: false,
        state: { pending: true, generation: second.generation },
    });
    assert.deepStrictEqual(state.snapshot(), { pending: true, generation: 2 });

    const current = state.finish(second.generation);
    assert.deepStrictEqual(current, {
        accepted: true,
        state: { pending: false, generation: second.generation },
    });
    assert.deepStrictEqual(state.snapshot(), { pending: false, generation: 2 });
    assert.strictEqual(Object.isFrozen(current), true);
    assert.strictEqual(Object.isFrozen(current.state), true);
});
