const assert = require('assert');
const { ActionUiRegistry } = require('../js/actionUiRegistry');
const { loadGameRuntime } = require('./helpers/runtime-loaders');
const { runTest } = require('./helpers/test-utils');

runTest('action UI registry covers every game action exactly once with matching phases', () => {
    const runtime = loadGameRuntime();
    const rows = ActionUiRegistry.snapshot();
    const actions = rows.flatMap(row => row.actions);

    assert.deepStrictEqual(actions.slice().sort(), Object.values(runtime.GAME_ACTIONS).sort());
    assert.strictEqual(new Set(actions).size, actions.length);

    for (const row of rows) {
        assert.ok(row.targetId);
        for (const action of row.actions) {
            assert.strictEqual(runtime.GAME_ACTION_REGISTRY[action].phase, row.phase, action);
        }
    }
});

runTest('action UI registry requires child selectors for content-backed actions', () => {
    const contentActions = ActionUiRegistry.containers
        .filter(row => row.requiresContent)
        .flatMap(row => row.actions);

    assert.deepStrictEqual(
        Object.keys(ActionUiRegistry.childSelectors).sort(),
        contentActions.sort()
    );
    for (const [action, spec] of Object.entries(ActionUiRegistry.childSelectors)) {
        assert.ok(Object.isFrozen(spec), action);
        assert.ok(Object.isFrozen(spec.actions), action);
        assert.ok(spec.actions.length > 0, action);
        for (const renderedAction of spec.actions) {
            assert.ok(spec.selector.includes('data-action="' + renderedAction + '"'), action);
        }
    }
});

runTest('action UI registry exposes detached diagnostic snapshots', () => {
    const snapshot = ActionUiRegistry.snapshot();
    snapshot[0].actions.push('futureAction');
    snapshot[0].targetId = 'changed';

    const next = ActionUiRegistry.snapshot();
    assert.deepStrictEqual(next[0].actions, ['rollDice']);
    assert.strictEqual(next[0].targetId, 'btnRoll');
    assert.ok(Object.isFrozen(ActionUiRegistry.containers));
    assert.ok(Object.isFrozen(ActionUiRegistry.childSelectors));
});

runTest('action UI registry detects phase mismatch and missing actions without DOM access', () => {
    assert.strictEqual(ActionUiRegistry.containerSpecForAction({
        phase: 'build',
        pendingFields: {},
    }, 'rollDice'), null);
    assert.strictEqual(ActionUiRegistry.containerSpecForAction({
        phase: 'roll',
        pendingFields: { pendingIT: true },
    }, 'resolveIT').targetId, 'pendingMenu');
    assert.deepStrictEqual(ActionUiRegistry.missingContainerEntries({
        phase: 'build',
        allowedActions: ['buildCard', 'futureAction'],
    }), [{ action: 'futureAction', phase: 'build' }]);
});
