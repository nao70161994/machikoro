'use strict';

const assert = require('assert');
const LocalResumePreloadState = require('../js/localResumePreloadState');
const LocalResumePreloadRuntime = require('../js/localResumePreloadRuntime');
const LocalResumeView = require('../js/localResumeView');
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

runTest('local resume preload runtimeはstate遷移を表示へ反映し古い完了を表示しない', () => {
    const calls = [];
    const runtime = LocalResumePreloadRuntime.create({
        controller: LocalResumePreloadState.create(),
        view: LocalResumeView,
        effects: { applyPendingButton: view => { calls.push(view); return true; } },
    });
    const first = runtime.start();
    const second = runtime.start();
    assert.strictEqual(runtime.finish(first), false);
    assert.deepStrictEqual(runtime.snapshot(), { pending: true, generation: second });
    assert.strictEqual(runtime.finish(second), true);
    assert.deepStrictEqual(runtime.snapshot(), { pending: false, generation: second });
    assert.deepStrictEqual(calls, [
        { disabled: true, textContent: 'モデル読み込み中' },
        { disabled: true, textContent: 'モデル読み込み中' },
        { disabled: false, textContent: '続きから再開' },
    ]);
});

runTest('local resume preload runtimeは不正な依存を初期化前に拒否する', () => {
    assert.throws(() => LocalResumePreloadRuntime.create({}), TypeError);
});

runTest('local resume取消は古い成功・失敗callbackを拒否し次の要求を維持する', () => {
    const state = LocalResumePreloadState.create();
    const first = state.start();
    const cancelled = state.cancel();
    assert.strictEqual(cancelled.pending, false);
    assert.strictEqual(state.finish(first.generation).accepted, false);
    const current = state.start();
    assert.strictEqual(state.finish(first.generation).accepted, false);
    assert.strictEqual(state.snapshot().pending, true);
    assert.strictEqual(state.finish(current.generation).accepted, true);
});

runTest('local resume取消はボタン待機表示も解除する', () => {
    const calls = [];
    const runtime = LocalResumePreloadRuntime.create({
        controller: LocalResumePreloadState.create(), view: LocalResumeView,
        effects: { applyPendingButton: view => { calls.push(view); return true; } },
    });
    const generation = runtime.start();
    runtime.cancel();
    assert.strictEqual(runtime.snapshot().pending, false);
    assert.strictEqual(runtime.finish(generation), false);
    assert.deepStrictEqual(calls.at(-1), { disabled: false, textContent: '続きから再開' });
});
