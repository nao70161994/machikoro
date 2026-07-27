'use strict';

const assert = require('assert');
const GameSchemaCodec = require('../js/gameSchemaCodec');
const { runTest } = require('./helpers/test-utils');

const LEGACY = Object.freeze({ actionVersion: 0, snapshotVersion: 0 });
const CURRENT = Object.freeze({ actionVersion: 1, snapshotVersion: 1 });

runTest('game schema codecはselection欠落をlegacy wireとしてroundtripする', () => {
    const data = { cardName: '麦畑' };
    const snapshot = { phase: 'build', players: [] };
    const encodedAction = GameSchemaCodec.encodeAction(null, 'buildCard', data);
    const encodedSnapshot = GameSchemaCodec.encodeSnapshot(null, snapshot);
    assert.deepStrictEqual(encodedAction.value, { action: 'buildCard', data });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(encodedAction.value, 'schemaVersion'), false);
    assert.strictEqual(encodedSnapshot.value, snapshot);
    assert.deepStrictEqual(GameSchemaCodec.decodeAction(LEGACY, encodedAction.value).value, { action: 'buildCard', data });
    assert.strictEqual(GameSchemaCodec.decodeSnapshot(LEGACY, encodedSnapshot.value).value, snapshot);
});

runTest('game schema codecはcurrent selectionをversion付きenvelopeでroundtripする', () => {
    const data = { useBonus: true };
    const snapshot = { phase: 'harborChoice', players: [{ coins: 3 }] };
    const encodedAction = GameSchemaCodec.encodeAction(CURRENT, 'resolveHarbor', data);
    const encodedSnapshot = GameSchemaCodec.encodeSnapshot(CURRENT, snapshot);
    assert.deepStrictEqual(encodedAction.value, { schemaVersion: 1, action: 'resolveHarbor', data });
    assert.deepStrictEqual(encodedSnapshot.value, { schemaVersion: 1, snapshot });
    assert.deepStrictEqual(GameSchemaCodec.decodeAction(CURRENT, encodedAction.value).value, { action: 'resolveHarbor', data });
    assert.strictEqual(GameSchemaCodec.decodeSnapshot(CURRENT, encodedSnapshot.value).value, snapshot);
});

runTest('game schema codecはActionとSnapshotの独立version選択を維持する', () => {
    const mixed = { actionVersion: 1, snapshotVersion: 0 };
    assert.strictEqual(GameSchemaCodec.encodeAction(mixed, 'nextTurn', {}).value.schemaVersion, 1);
    assert.strictEqual(GameSchemaCodec.encodeSnapshot(mixed, { phase: 'build' }).value.schemaVersion, undefined);
});

runTest('game schema codecは選択versionとwire versionの不一致をfail closedにする', () => {
    const v1Action = { schemaVersion: 1, action: 'nextTurn', data: {} };
    const v1Snapshot = { schemaVersion: 1, snapshot: { phase: 'build' } };
    assert.strictEqual(GameSchemaCodec.decodeAction(LEGACY, v1Action).reason, GameSchemaCodec.failureReasons.VERSION_MISMATCH);
    assert.strictEqual(GameSchemaCodec.decodeSnapshot(LEGACY, v1Snapshot).reason, GameSchemaCodec.failureReasons.VERSION_MISMATCH);
    assert.strictEqual(GameSchemaCodec.decodeAction(CURRENT, { action: 'nextTurn', data: {} }).reason, GameSchemaCodec.failureReasons.VERSION_MISMATCH);
    assert.strictEqual(GameSchemaCodec.decodeSnapshot(CURRENT, { phase: 'build' }).reason, GameSchemaCodec.failureReasons.VERSION_MISMATCH);
});

runTest('game schema codecは未知selectionと不正payloadを安定reasonで拒否する', () => {
    const unknown = { actionVersion: 2, snapshotVersion: 1 };
    assert.strictEqual(GameSchemaCodec.encodeAction(unknown, 'nextTurn', {}).reason, GameSchemaCodec.failureReasons.INVALID_SELECTION);
    assert.strictEqual(GameSchemaCodec.encodeAction(CURRENT, 'unknown', {}).reason, GameSchemaCodec.failureReasons.INVALID_ACTION);
    assert.strictEqual(GameSchemaCodec.decodeAction(CURRENT, {}).reason, GameSchemaCodec.failureReasons.INVALID_ACTION);
    assert.strictEqual(GameSchemaCodec.encodeSnapshot(CURRENT, []).reason, GameSchemaCodec.failureReasons.INVALID_SNAPSHOT);
    assert.strictEqual(GameSchemaCodec.decodeSnapshot(CURRENT, { schemaVersion: 1 }).reason, GameSchemaCodec.failureReasons.INVALID_SNAPSHOT);
});
