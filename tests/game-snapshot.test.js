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
        reviewSummary: {
            complete: true,
            counts: { dice: 0, gain: 0, lose: 0, build: 0, special: 0, system: 0, error: 0 },
        },
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

runTest('local save serializerは既存savedGame形状をversion fieldなしで保持する', () => {
    const game = makeGameFixture();
    const state = GameSnapshot.serializeLocalSaveState(game, { カフェ: 4 }, {
        logLimit: 1,
        pendingActionsFor: () => [{ action: 'resolveTV', field: 'pendingTV' }],
        cpuSettings: [null, { difficulty: 'normal', rlModelId: null }],
        cpuSpeed: 800,
        enabledCardsList: ['カフェ'],
        enabledLandmarksList: ['駅'],
    });

    assert.strictEqual(Object.prototype.hasOwnProperty.call(state, 'schemaVersion'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(state, 'undoState'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(state, 'actionSeq'), false);
    assert.deepStrictEqual(state.log, [{ text: 'latest' }]);
    assert.deepStrictEqual(state.pendingActions, [{ action: 'resolveTV', field: 'pendingTV' }]);
    assert.deepStrictEqual(state.cpuSettings, [null, { difficulty: 'normal', rlModelId: null }]);
    assert.strictEqual(state.cpuSpeed, 800);
    assert.deepStrictEqual(state.enabledCardsList, ['カフェ']);
    assert.deepStrictEqual(state.enabledLandmarksList, ['駅']);
});

runTest('local save schema境界はlegacyとv1を同じstateへdecodeする', () => {
    const game = makeGameFixture();
    const options = {
        cpuSettings: [null],
        cpuSpeed: 800,
        enabledCardsList: ['カフェ'],
        enabledLandmarksList: ['駅'],
    };
    const legacy = GameSnapshot.serializeLocalSaveState(game, { カフェ: 4 }, options);
    const versioned = GameSnapshot.serializeVersionedLocalSaveState(game, { カフェ: 4 }, options);

    assert.deepStrictEqual(versioned, { schemaVersion: 1, snapshot: legacy });
    assert.deepStrictEqual(GameSnapshot.readLocalSaveState(legacy), {
        ok: true, schemaVersion: 0, state: legacy, legacy: true,
    });
    assert.deepStrictEqual(GameSnapshot.readLocalSaveState(versioned), {
        ok: true, schemaVersion: 1, state: versioned.snapshot, legacy: false,
    });
    assert.ok(Object.isFrozen(GameSnapshot.readLocalSaveState(versioned)));
});

runTest('local save schema境界はunknown versionとmalformed envelopeをfail closedにする', () => {
    for (const value of [
        null,
        [],
        { schemaVersion: 1 },
        { schemaVersion: 1, snapshot: [] },
        { schemaVersion: 2, snapshot: {} },
    ]) {
        const decoded = GameSnapshot.readLocalSaveState(value);
        assert.strictEqual(decoded.ok, false, JSON.stringify(value));
        assert.strictEqual(decoded.state, null, JSON.stringify(value));
        assert.strictEqual(decoded.legacy, false, JSON.stringify(value));
        assert.ok(Object.isFrozen(decoded));
    }
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
        reviewSummary: {
            complete: true,
            counts: { dice: 0, gain: 0, lose: 0, build: 0, special: 0, system: 0, error: 0 },
        },
    });
    assert.deepStrictEqual(GameSnapshot.serializeUndoState(game, stock, 0).log, []);
});

runTest('共有undo hydrate境界はcallerのlandmarkと在庫policyを維持する', () => {
    const cafe = { name: 'カフェ' };
    const game = {
        players: [{
            coins: 3,
            cards: [],
            dormantCards: [],
            landmarks: { 駅: false, 港: true },
            itVentureCoins: 9,
            hasYakusho: false,
        }],
        builtThisTurn: false,
        log: [{ text: 'before' }],
        hadAmusementParkAtRoll: true,
    };
    const shopStock = {};
    const hydrated = GameSnapshot.hydrateUndoState({
        game,
        shopStock,
        state: {
            playerCoins: [7],
            playerCardNames: [['カフェ', 'unknown']],
            playerDormantIndices: [[0]],
            playerLandmarks: [{ 駅: true }],
            playerItVenture: [2],
            playerHasYakusho: [true],
            shopStock: { カフェ: 4 },
            builtThisTurn: true,
            log: [{ text: 'restored' }],
            hadAmusementParkAtRoll: false,
        },
        createCardByName: name => name === 'カフェ' ? cafe : null,
        assignShopStockSnapshot: (target, value) => Object.assign(target, value),
        mergePlayerLandmarks: (current, saved) => Object.assign({}, current, saved),
    });

    assert.strictEqual(hydrated, true);
    assert.strictEqual(game.players[0].coins, 7);
    assert.deepStrictEqual(game.players[0].cards, [cafe]);
    assert.deepStrictEqual(game.players[0].dormantCards, [cafe]);
    assert.deepStrictEqual(game.players[0].landmarks, { 駅: true, 港: true });
    assert.strictEqual(game.players[0].itVentureCoins, 2);
    assert.strictEqual(game.players[0].hasYakusho, true);
    assert.deepStrictEqual(shopStock, { カフェ: 4 });
    assert.strictEqual(game.builtThisTurn, true);
    assert.deepStrictEqual(game.log, [{ text: 'restored' }]);
    assert.strictEqual(game.hadAmusementParkAtRoll, false);
    assert.strictEqual(GameSnapshot.hydrateUndoState({ game, state: {} }), false);
});

runTest('共有hydrate境界は復元policyと副作用adapterをcallerへ明示する', () => {
    const cafe = { name: 'カフェ' };
    const game = {
        players: [{
            name: 'Before', coins: 3, cards: [], dormantCards: [],
            landmarks: { 駅: false }, itVentureCoins: 9, hasYakusho: true,
        }],
        currentPlayerIndex: 0, phase: 'roll', log: [],
        resetPendingState() { this.resetCount = (this.resetCount || 0) + 1; },
        rebuildPendingActionsFromFields() { this.rebuildCount = (this.rebuildCount || 0) + 1; },
    };
    const shopStock = {};
    const undoState = { marker: 'undo' };
    let restoredUndo = null;
    const hydrated = GameSnapshot.hydrateMutableGameState({
        game,
        shopStock,
        state: {
            players: [{
                name: 'Alice', coins: 'invalid', cards: ['カフェ', 'unknown'],
                dormantIndices: 'adapter-owned', landmarks: 'adapter-owned',
                itVentureCoins: 2, hasYakusho: false,
            }],
            shopStock: { カフェ: 4 }, currentPlayerIndex: 9, phase: 'build',
            log: 'adapter-owned', builtThisTurn: true, pendingTV: 1,
            pendingActions: [], turnCount: 7, undoState,
        },
        createCardByName: name => name === 'カフェ' ? cafe : null,
        assignShopStockSnapshot: (target, value) => Object.assign(target, value),
        normalizePlayerCoins: (_value, currentValue) => currentValue,
        readDormantIndices: () => [0],
        readLandmarks: () => ({ 駅: true }),
        readLog: () => [{ text: 'restored' }],
        normalizeCurrentPlayerIndex: (_value, currentValue) => currentValue,
        onUndoState: value => { restoredUndo = value; },
    });

    assert.strictEqual(hydrated, true);
    assert.strictEqual(game.players[0].name, 'Alice');
    assert.strictEqual(game.players[0].coins, 3);
    assert.deepStrictEqual(game.players[0].cards, [cafe]);
    assert.deepStrictEqual(game.players[0].dormantCards, [cafe]);
    assert.deepStrictEqual(game.players[0].landmarks, { 駅: true });
    assert.strictEqual(game.players[0].itVentureCoins, 2);
    assert.strictEqual(game.players[0].hasYakusho, false);
    assert.deepStrictEqual(shopStock, { カフェ: 4 });
    assert.strictEqual(game.currentPlayerIndex, 0);
    assert.strictEqual(game.phase, 'build');
    assert.deepStrictEqual(game.log, [{ text: 'restored' }]);
    assert.strictEqual(game.resetCount, 1);
    assert.strictEqual(game.rebuildCount, 1);
    assert.strictEqual(restoredUndo, undoState);
    assert.strictEqual(GameSnapshot.hydrateMutableGameState({ game, state: {} }), false);
});

runTest('共有snapshotは固定サイズの対戦集計をsave・Undo・hydrateで保持する', () => {
    const game = makeGameFixture();
    game.reviewSummary = {
        complete: true,
        counts: { dice: 9, gain: 7, lose: 3, build: 4, special: 2, system: 5, error: 1 },
    };
    const snapshot = GameSnapshot.serializeGameState(game, {});
    const undo = GameSnapshot.serializeUndoState(game, {});
    assert.deepStrictEqual(snapshot.reviewSummary, game.reviewSummary);
    assert.deepStrictEqual(undo.reviewSummary, game.reviewSummary);
    assert.notStrictEqual(snapshot.reviewSummary, game.reviewSummary);
    assert.strictEqual(GameSnapshot.isValidReviewSummary(snapshot.reviewSummary), true);
    assert.strictEqual(GameSnapshot.isValidReviewSummary({ complete: true, counts: { gain: -1 } }), false);

    const target = makeGameFixture();
    assert.strictEqual(GameSnapshot.hydrateUndoState({
        game: target,
        shopStock: {},
        state: Object.assign(undo, {
            playerCoins: [7], playerCardNames: [['カフェ']], playerLandmarks: [{ 駅: true }],
            shopStock: {},
        }),
        createCardByName: name => ({ name }),
        assignShopStockSnapshot: () => {},
        mergePlayerLandmarks: (_current, saved) => saved,
    }), true);
    assert.deepStrictEqual(target.reviewSummary, game.reviewSummary);
});
