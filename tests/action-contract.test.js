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
        assert.ok(Object.isFrozen(entry.canonicalPayloadVariants), entry.action);
        assert.ok(entry.canonicalPayloadVariants.every(Object.isFrozen), entry.action);
        assert.ok(Object.isFrozen(entry.ui), entry.action);
        assert.strictEqual(entry.actorAuthority, 'current-player-or-host-cpu', entry.action);
        assert.strictEqual(entry.serverPayload, true, entry.action);
        assert.strictEqual(entry.serverReplay, true, entry.action);
        assert.strictEqual(entry.restoreReplay, true, entry.action);
        assert.strictEqual(entry.clientApply, true, entry.action);
        assert.strictEqual(typeof ACTION_PAYLOAD_VALIDATORS[entry.action], 'function', entry.action);
    }
    assert.deepStrictEqual(GameActionContract.canonicalPayloadVariants.resolveMover, [
        ['cardName', 'targetIndex'],
        ['cardIndex', 'targetIndex'],
    ]);
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

runTest('action schema境界はlegacyとversion 1を同じaction/data形状で読む', () => {
    const legacy = { action: 'nextTurn', data: {} };
    const current = GameActionContract.createActionEnvelope('nextTurn', {});

    assert.strictEqual(GameActionContract.schemaVersion, 1);
    assert.strictEqual(GameActionContract.legacySchemaVersion, 0);
    assert.strictEqual(GameActionContract.actionSchemaVersionOf(legacy), 0);
    assert.strictEqual(GameActionContract.actionSchemaVersionOf(current), 1);
    assert.deepStrictEqual(current, { schemaVersion: 1, action: 'nextTurn', data: {} });
    assert.deepStrictEqual(GameActionContract.readActionEnvelope(legacy), {
        ok: true,
        schemaVersion: 0,
        action: 'nextTurn',
        data: legacy.data,
        legacy: true,
    });
    assert.deepStrictEqual(GameActionContract.readActionEnvelope(current), {
        ok: true,
        schemaVersion: 1,
        action: 'nextTurn',
        data: current.data,
        legacy: false,
    });
});

runTest('action schema境界は全Action Contract entryをversion付きで表現できる', () => {
    for (const entry of GameActionContract.entries) {
        const envelope = GameActionContract.createActionEnvelope(entry.action, {});
        const read = GameActionContract.readActionEnvelope(envelope);
        assert.strictEqual(read.ok, true, entry.action);
        assert.strictEqual(read.action, entry.action);
        assert.strictEqual(read.schemaVersion, GameActionContract.schemaVersion);
    }
});

runTest('action schema境界はunknown version/actionとmalformed dataをfail closedにする', () => {
    assert.strictEqual(GameActionContract.createActionEnvelope('unknown', {}), null);
    assert.strictEqual(GameActionContract.createActionEnvelope('nextTurn', []), null);

    const malformedValues = [
        null,
        [],
        { action: 'unknown', data: {} },
        { action: 'nextTurn' },
        { action: 'nextTurn', data: [] },
        { schemaVersion: '1', action: 'nextTurn', data: {} },
        { schemaVersion: 2, action: 'nextTurn', data: {} },
    ];
    for (const value of malformedValues) {
        const result = GameActionContract.readActionEnvelope(value);
        assert.strictEqual(result.ok, false, JSON.stringify(value));
        assert.strictEqual(result.action, null, JSON.stringify(value));
        assert.strictEqual(result.data, null, JSON.stringify(value));
    }
});
