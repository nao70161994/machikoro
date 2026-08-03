'use strict';

const assert = require('assert');
const UiRenderRuntime = require('../js/uiRenderRuntime');
const { runTest } = require('./helpers/test-utils');

runTest('UI render runtimeはgame/winner factsを3つのfrozen branchへ投影する', () => {
    const current = { name: 'current' };
    const winner = { name: 'winner' };
    const none = UiRenderRuntime.plan();
    const active = UiRenderRuntime.plan({ hasGame: true, current, winner: null });
    const terminal = UiRenderRuntime.plan({ hasGame: true, current, winner });

    assert.deepStrictEqual(none, { branch: UiRenderRuntime.branches.NONE, current: null, winner: null });
    assert.strictEqual(active.branch, UiRenderRuntime.branches.ACTIVE);
    assert.strictEqual(active.current, current);
    assert.strictEqual(terminal.branch, UiRenderRuntime.branches.WINNER);
    assert.strictEqual(terminal.current, current);
    assert.strictEqual(terminal.winner, winner);
    assert.ok([none, active, terminal].every(Object.isFrozen));
});

runTest('UI render runtimeはactive描画後だけpersistする', () => {
    const calls = [];
    const current = { name: 'current' };
    UiRenderRuntime.execute(
        UiRenderRuntime.plan({ hasGame: true, current }),
        {
            syncTutorialControls: () => calls.push(['sync']),
            renderActiveGameState: value => calls.push(['active', value]),
            persistAfterRender: () => calls.push(['persist']),
        }
    );
    assert.deepStrictEqual(calls, [['sync'], ['active', current], ['persist']]);
});

runTest('UI render runtimeはwinner描画でactive/persistへ進まない', () => {
    const calls = [];
    const winner = { name: 'winner' };
    UiRenderRuntime.execute(
        UiRenderRuntime.plan({ hasGame: true, current: {}, winner }),
        {
            syncTutorialControls: () => calls.push(['sync']),
            renderWinnerState: value => calls.push(['winner', value]),
        }
    );
    assert.deepStrictEqual(calls, [['sync'], ['winner', winner]]);
});

runTest('UI render runtimeはno-gameを無作用にし不完全配線をeffect前に拒否する', () => {
    UiRenderRuntime.execute(UiRenderRuntime.plan(), null);
    const calls = [];
    assert.throws(
        () => UiRenderRuntime.execute(
            UiRenderRuntime.plan({ hasGame: true, current: {} }),
            { syncTutorialControls: () => calls.push('sync') }
        ),
        /renderActiveGameState effect is required/
    );
    assert.throws(() => UiRenderRuntime.execute({ branch: 'unknown' }), /valid render plan/);
    assert.deepStrictEqual(calls, []);
    assert.ok(Object.isFrozen(UiRenderRuntime));
    assert.ok(Object.isFrozen(UiRenderRuntime.branches));
    assert.ok(Object.isFrozen(UiRenderRuntime.requiredEffects));
});
