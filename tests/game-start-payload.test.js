'use strict';

const assert = require('assert');
const makeGameStartPayload = require('../server/gameStartPayload');
const { runTest } = require('./helpers/test-utils');

function createBuilder(defaultSchemaNegotiationEnabled = false, schema = null) {
    return makeGameStartPayload({
        defaultSchemaNegotiationEnabled,
        gameSchemaStartMetadata: () => schema,
        buildGameStartPlayerNames: () => ['Alice', 'CPU1（普）'],
        shuffledPlayerOrder: (names, randomFn) => [randomFn() < 1 ? 1 : 0, names.length - 2],
        roomClientVersions: () => ['v1', 'v2'],
        roomReconnectTokenHashes: (_room, names) => names.map(name => `hash:${name}`),
        roomHostlessRestoreCapabilities: (_io, _room, names) => names.map((_, index) => index),
    }).buildGameStartPayload;
}

const room = {
    enabledCards: ['麦畑'],
    enabledLandmarks: ['駅'],
    playerSettings: [{ type: 'human' }, { type: 'cpu', difficulty: 'normal' }],
    cpuSpeed: 1500,
    hostPlayerIndex: 0,
    hostEpoch: 2,
    actionSeq: 7,
};

runTest('game start payloadは既存fieldと収集結果をそのまま組み立てる', () => {
    const payload = createBuilder()(Object.freeze({}), room, () => 0);
    assert.deepStrictEqual(payload, {
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        playerNames: ['Alice', 'CPU1（普）'],
        playerSettings: [{ type: 'human' }, { type: 'cpu', difficulty: 'normal' }],
        cpuSpeed: 1500,
        playerOrder: [1, 0],
        hostPlayerIndex: 0,
        hostEpoch: 2,
        actionSeq: 7,
        versions: ['v1', 'v2'],
        reconnectTokenHashes: ['hash:Alice', 'hash:CPU1（普）'],
        hostlessRestoreCapabilities: [0, 1],
        hostlessRestoreGeneration: 0,
        hostlessRestoreCount: 0,
    });
});

runTest('game start payloadはschema有効時だけmetadataを必須にする', () => {
    assert.strictEqual(createBuilder(true, null)({}, room, () => 0), null);
    const selection = Object.freeze({ actionVersion: 1, snapshotVersion: 1 });
    const versioned = createBuilder(true, selection)({}, room, () => 0);
    assert.strictEqual(versioned.gameSchema, selection);
    const legacyOverride = createBuilder(true, null)({}, room, () => 0, {
        gameSchemaNegotiationEnabled: false,
    });
    assert.ok(legacyOverride);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(legacyOverride, 'gameSchema'), false);
});

runTest('game start payloadはhost epoch/action seq欠落時の既存0 fallbackを維持する', () => {
    const payload = createBuilder()({}, { ...room, hostEpoch: undefined, actionSeq: undefined }, () => 0);
    assert.strictEqual(payload.hostEpoch, 0);
    assert.strictEqual(payload.actionSeq, 0);
});
