'use strict';

const assert = require('assert');
const GameSnapshot = require('../js/gameSnapshot');
const { runTest } = require('./helpers/test-utils');

function makeGameFixture() {
    const cafe = { name: 'カフェ' };
    const bakery = { name: 'パン屋' };
    return {
        players: [{
            name: 'Alice',
            coins: 7,
            cards: [cafe, bakery],
            dormantCards: [bakery, { name: '対象外' }],
            landmarks: { 駅: true, 遊園地: false },
            itVentureCoins: 2,
            hasYakusho: true,
        }],
        currentPlayerIndex: 0,
        phase: 'build',
        log: [{ text: 'old' }, { text: 'middle' }, { text: 'latest' }],
        lastDiceResult: 8,
        lastDice1: 3,
        lastDice2: 5,
        builtThisTurn: true,
        pendingTV: { playerIndex: 0 },
        pendingBusiness: null,
        pendingCleaning: null,
        pendingMover: null,
        pendingRenovation: null,
        pendingIT: null,
        usedReroll: true,
        pendingTunaDice: null,
        turnCount: 12,
        hadAmusementParkAtRoll: false,
    };
}

runTest('snapshot schema境界はlegacyと現行envelopeを明示的に判別する', () => {
    const legacy = { players: [], phase: 'roll' };
    const envelope = GameSnapshot.createSnapshotEnvelope(legacy);

    assert.ok(Object.isFrozen(GameSnapshot));
    assert.strictEqual(GameSnapshot.schemaVersion, 1);
    assert.strictEqual(GameSnapshot.legacyVersion, 0);
    assert.strictEqual(GameSnapshot.snapshotVersionOf(legacy), 0);
    assert.strictEqual(GameSnapshot.snapshotVersionOf(envelope), 1);
    assert.strictEqual(GameSnapshot.isSupportedSnapshotVersion(0), true);
    assert.strictEqual(GameSnapshot.isSupportedSnapshotVersion(1), true);
    assert.strictEqual(GameSnapshot.isSupportedSnapshotVersion(2), false);
    assert.deepStrictEqual(GameSnapshot.readSnapshotEnvelope(legacy), {
        ok: true,
        schemaVersion: 0,
        snapshot: legacy,
        legacy: true,
    });
    assert.deepStrictEqual(GameSnapshot.readSnapshotEnvelope(envelope), {
        ok: true,
        schemaVersion: 1,
        snapshot: legacy,
        legacy: false,
    });
});

runTest('snapshot schema境界はunknown versionとmalformed envelopeをfail closedにする', () => {
    const malformedValues = [
        null,
        [],
        { schemaVersion: '1', snapshot: {} },
        { schemaVersion: 1 },
        { schemaVersion: 1, snapshot: [] },
        { schemaVersion: 2, snapshot: {} },
    ];

    for (const value of malformedValues) {
        const result = GameSnapshot.readSnapshotEnvelope(value);
        assert.strictEqual(result.ok, false, JSON.stringify(value));
        assert.strictEqual(result.snapshot, null, JSON.stringify(value));
    }
});

runTest('共有serializerは既存のversionなしwire形状を保持する', () => {
    const game = makeGameFixture();
    const stock = { カフェ: 4, パン屋: 3 };
    const undoState = { marker: 'undo' };
    let pendingInput = null;
    const snapshot = GameSnapshot.serializeGameState(game, stock, {
        actionSeq: 0,
        undoState,
        logLimit: 2,
        pendingActionsFor(value) {
            pendingInput = value;
            return [{ action: 'nextTurn' }];
        },
    });

    assert.strictEqual(pendingInput, game);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(snapshot, 'schemaVersion'), false);
    assert.deepStrictEqual(snapshot, {
        players: [{
            name: 'Alice',
            coins: 7,
            cards: ['カフェ', 'パン屋'],
            dormantIndices: [1],
            landmarks: { 駅: true, 遊園地: false },
            itVentureCoins: 2,
            hasYakusho: true,
        }],
        currentPlayerIndex: 0,
        phase: 'build',
        log: [{ text: 'middle' }, { text: 'latest' }],
        lastDiceResult: 8,
        lastDice1: 3,
        lastDice2: 5,
        builtThisTurn: true,
        pendingTV: { playerIndex: 0 },
        pendingBusiness: null,
        pendingCleaning: null,
        pendingMover: null,
        pendingRenovation: null,
        pendingActions: [{ action: 'nextTurn' }],
        pendingIT: null,
        usedReroll: true,
        pendingTunaDice: null,
        turnCount: 12,
        hadAmusementParkAtRoll: false,
        shopStock: { カフェ: 4, パン屋: 3 },
        undoState,
        actionSeq: 0,
    });
    assert.notStrictEqual(snapshot.players[0].landmarks, game.players[0].landmarks);
    assert.notStrictEqual(snapshot.shopStock, stock);
});

runTest('共有undo serializerは既存形状とlog上限を保持する', () => {
    const game = makeGameFixture();
    const stock = { カフェ: 4 };
    const undo = GameSnapshot.serializeUndoState(game, stock, 1);

    assert.deepStrictEqual(undo, {
        playerCoins: [7],
        playerCardNames: [['カフェ', 'パン屋']],
        playerDormantIndices: [[1]],
        playerLandmarks: [{ 駅: true, 遊園地: false }],
        playerItVenture: [2],
        playerHasYakusho: [true],
        hadAmusementParkAtRoll: false,
        shopStock: { カフェ: 4 },
        builtThisTurn: true,
        log: [{ text: 'latest' }],
    });
    assert.deepStrictEqual(GameSnapshot.serializeUndoState(game, stock, 0).log, []);
});
