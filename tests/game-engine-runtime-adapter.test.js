'use strict';

const assert = require('assert');
const GameEngineRuntimeAdapter = require('../js/gameEngineRuntimeAdapter');
const { runTest } = require('./helpers/test-utils');

function makePlayer(index) {
    return {
        name: 'P' + index,
        coins: 3,
        cards: [],
        dormantCards: [],
        landmarks: {},
        itVentureCoins: 0,
        hasYakusho: true,
    };
}

function makeGame(playerCount) {
    return {
        players: Array.from({ length: playerCount }, (_, index) => makePlayer(index)),
        currentPlayerIndex: 0,
        phase: 'roll',
        log: [],
        lastDiceResult: 0,
        lastDice1: 0,
        lastDice2: 0,
        builtThisTurn: false,
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingActionQueue: [],
        pendingIT: false,
        usedReroll: false,
        pendingTunaDice: null,
        turnCount: 0,
        hadAmusementParkAtRoll: false,
        resetPendingState() {
            this.pendingTV = 0;
            this.pendingBusiness = 0;
            this.pendingCleaning = 0;
            this.pendingMover = 0;
            this.pendingRenovation = 0;
            this.pendingActionQueue = [];
        },
        rebuildPendingActionsFromFields() {},
    };
}

function makeAdapter(enabledLandmarks = new Set(['駅'])) {
    return GameEngineRuntimeAdapter.create({
        createGame: makeGame,
        enabledLandmarks,
        landmarkNames: () => ['駅', '空港'],
        createCardByName: name => ({ name }),
        assignShopStockSnapshot(target, source) {
            Object.assign(target, source);
        },
        decrementShopStock(stock, card) {
            stock[card.name]--;
        },
        pendingActionsFor: game => game.pendingActionQueue.map(value => Object.assign({}, value)),
        logLimit: 30,
    });
}

function makeSnapshot() {
    return {
        players: [{
            name: 'Alice',
            coins: 8,
            cards: ['パン屋'],
            dormantIndices: [0],
            landmarks: { 駅: true },
            itVentureCoins: 2,
            hasYakusho: true,
        }],
        currentPlayerIndex: 0,
        phase: 'build',
        log: [{ type: 'system', message: 'turn' }],
        reviewSummary: {
            complete: false,
            counts: { dice: 0, gain: 0, lose: 0, build: 0, special: 0, system: 0, error: 0 },
        },
        lastDiceResult: 6,
        lastDice1: 2,
        lastDice2: 4,
        builtThisTurn: true,
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingActions: [],
        pendingIT: false,
        usedReroll: true,
        pendingTunaDice: [1, 2],
        turnCount: 4,
        hadAmusementParkAtRoll: false,
        shopStock: { パン屋: 3 },
        undoState: {
            playerCoins: [7],
            playerCardNames: [[]],
            playerDormantIndices: [[]],
            playerLandmarks: [{ 駅: false }],
            playerItVenture: [0],
            playerHasYakusho: [true],
            hadAmusementParkAtRoll: false,
            shopStock: { パン屋: 4 },
            builtThisTurn: false,
            log: [],
            reviewSummary: {
                complete: false,
                counts: { dice: 0, gain: 0, lose: 0, build: 0, special: 0, system: 0, error: 0 },
            },
        },
        actionSeq: 9,
    };
}

runTest('Engine runtime adapterはsnapshot互換policyを一箇所でhydrate/serializeする', () => {
    const source = makeSnapshot();
    const adapter = makeAdapter();
    const runtime = adapter.hydrate(source);

    assert.ok(Object.isFrozen(adapter));
    assert.strictEqual(runtime.game.players[0].name, 'Alice');
    assert.strictEqual(runtime.game.players[0].cards[0].name, 'パン屋');
    assert.strictEqual(runtime.game.players[0].dormantCards[0], runtime.game.players[0].cards[0]);
    assert.deepStrictEqual(Array.from(runtime.game.enabledLandmarks), ['駅']);
    assert.deepStrictEqual(runtime.shopStock, { パン屋: 3 });
    assert.strictEqual(runtime.actionSeq, 9);
    assert.notStrictEqual(runtime.game.log, source.log);
    assert.deepStrictEqual(adapter.serialize(runtime), source);
});

runTest('Engine runtime adapterのUndo adapterはlandmark既定値を補完してruntime所有状態を消す', () => {
    const adapter = makeAdapter(new Set());
    const runtime = adapter.hydrate(makeSnapshot());
    const undo = runtime.undoState;

    runtime.game.players[0].coins = 99;
    runtime.game.players[0].landmarks = { 駅: true, 空港: true };
    assert.strictEqual(runtime.restoreUndoState(undo), true);
    assert.strictEqual(runtime.game.players[0].coins, 7);
    assert.deepStrictEqual(runtime.game.players[0].landmarks, { 駅: false, 空港: true });
    assert.deepStrictEqual(runtime.shopStock, { パン屋: 4 });
    assert.strictEqual(runtime.undoState, null);
    assert.deepStrictEqual(Array.from(runtime.game.enabledLandmarks), []);
});

runTest('Engine runtime adapterは不完全adapterとplayerなしsnapshotをfail closedにする', () => {
    assert.throws(() => GameEngineRuntimeAdapter.create({}), /createGame/);
    const adapter = makeAdapter();
    assert.throws(() => adapter.hydrate({ players: [] }), /invalid engine runtime snapshot/);
});
