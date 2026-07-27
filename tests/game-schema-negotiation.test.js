'use strict';

const assert = require('assert');
const GameSchemaNegotiation = require('../js/gameSchemaNegotiation');
const { runTest } = require('./helpers/test-utils');

runTest('schema negotiationは全peer対応時に最高共通versionを選ぶ', () => {
    const result = GameSchemaNegotiation.negotiateGameSchemaCapabilities([
        { actionVersions: [0, 1], snapshotVersions: [0, 1] },
        { actionVersions: [1, 0, 1], snapshotVersions: [1, 0] },
    ]);
    assert.deepStrictEqual(result, {
        ok: true, reason: '', actionVersion: 1, snapshotVersion: 1, legacyOnly: false,
    });
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(GameSchemaNegotiation.capabilities.actionVersions));
});

runTest('schema negotiationはcapability欠落peerをlegacy v0として扱う', () => {
    const result = GameSchemaNegotiation.negotiateGameSchemaCapabilities([
        { actionVersions: [0, 1], snapshotVersions: [0, 1] },
        null,
    ]);
    assert.deepStrictEqual(result, {
        ok: true, reason: '', actionVersion: 0, snapshotVersion: 0, legacyOnly: true,
    });
});

runTest('schema negotiationはactionとsnapshotを独立した共通versionで選ぶ', () => {
    const result = GameSchemaNegotiation.negotiateGameSchemaCapabilities([
        { actionVersions: [0, 1], snapshotVersions: [0] },
    ]);
    assert.deepStrictEqual(result, {
        ok: true, reason: '', actionVersion: 1, snapshotVersion: 0, legacyOnly: false,
    });
});

runTest('schema negotiationは壊れた明示capabilityと共通versionなしをfail closedにする', () => {
    const reasons = GameSchemaNegotiation.failureReasons;
    assert.strictEqual(
        GameSchemaNegotiation.negotiateGameSchemaCapabilities(null).reason,
        reasons.INVALID_PEER_CAPABILITIES
    );
    assert.strictEqual(
        GameSchemaNegotiation.negotiateGameSchemaCapabilities([{}]).reason,
        reasons.INVALID_PEER_CAPABILITIES
    );
    assert.strictEqual(
        GameSchemaNegotiation.negotiateGameSchemaCapabilities([
            { actionVersions: [2], snapshotVersions: [0] },
        ]).reason,
        reasons.NO_COMMON_ACTION_VERSION
    );
    assert.strictEqual(
        GameSchemaNegotiation.negotiateGameSchemaCapabilities([
            { actionVersions: [0], snapshotVersions: [2] },
        ]).reason,
        reasons.NO_COMMON_SNAPSHOT_VERSION
    );
});
