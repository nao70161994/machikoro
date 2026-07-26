'use strict';

const assert = require('assert');
const GameActionContract = require('../js/actionContract');
const { CANONICAL_ACTION_PAYLOAD_KEYS, ACTION_PAYLOAD_VALIDATORS } = require('../server');
const { ActionUiRegistry } = require('../js/actionUiRegistry');
const { loadGameRuntime } = require('./helpers/runtime-loaders');
const { runTest } = require('./helpers/test-utils');

runTest('action contract is a frozen manifest for all 15 runtime actions', () => {
    const runtime = loadGameRuntime();
    const actions = Object.values(GameActionContract.actions);

    assert.strictEqual(actions.length, 15);
    assert.strictEqual(new Set(actions).size, actions.length);
    assert.deepStrictEqual(actions, Object.values(runtime.GAME_ACTIONS));
    assert.deepStrictEqual(Object.keys(GameActionContract.byAction), actions);
    assert.ok(Object.isFrozen(GameActionContract));
    assert.ok(Object.isFrozen(GameActionContract.entries));

    for (const entry of GameActionContract.entries) {
        assert.ok(Object.isFrozen(entry), entry.action);
        assert.ok(Object.isFrozen(entry.canonicalPayloadKeys), entry.action);
        assert.ok(Object.isFrozen(entry.ui), entry.action);
        assert.strictEqual(entry.actorAuthority, 'current-player-or-host-cpu', entry.action);
        assert.strictEqual(entry.serverPayload, true, entry.action);
        assert.strictEqual(entry.serverReplay, true, entry.action);
        assert.strictEqual(entry.restoreReplay, true, entry.action);
        assert.strictEqual(entry.clientApply, true, entry.action);
        assert.strictEqual(typeof ACTION_PAYLOAD_VALIDATORS[entry.action], 'function', entry.action);
    }
});

runTest('runtime, canonical payload, and phase projections match the manifest exactly', () => {
    const runtime = loadGameRuntime();

    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(runtime.GAME_ACTION_REGISTRY)),
        GameActionContract.registry
    );
    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(runtime.GAME_PHASE_ACTIONS)),
        GameActionContract.phaseActions
    );
    assert.deepStrictEqual(CANONICAL_ACTION_PAYLOAD_KEYS, GameActionContract.canonicalPayloadKeys);

    for (const [phase, actions] of Object.entries(GameActionContract.phaseActions)) {
        const ordered = GameActionContract.entries
            .filter(entry => entry.phase === phase)
            .sort((left, right) => left.phaseOrder - right.phaseOrder)
            .map(entry => entry.action);
        assert.deepStrictEqual(actions, ordered, phase);
    }
});

runTest('UI registry is a lossless projection of action contract targets', () => {
    assert.deepStrictEqual(ActionUiRegistry.containers, GameActionContract.uiContainers);
    assert.deepStrictEqual(ActionUiRegistry.childSelectors, GameActionContract.uiChildSelectors);

    const uiActions = ActionUiRegistry.containers.flatMap(container => container.actions);
    assert.deepStrictEqual(uiActions.slice().sort(), Object.keys(GameActionContract.byAction).sort());
    assert.strictEqual(new Set(uiActions).size, uiActions.length);

    for (const entry of GameActionContract.entries) {
        const container = ActionUiRegistry.containers.find(row => row.actions.includes(entry.action));
        assert.ok(container, entry.action);
        assert.strictEqual(container.phase, entry.phase, entry.action);
        assert.strictEqual(container.targetId, entry.ui.targetId, entry.action);
    }
});
