'use strict';

const assert = require('assert');
const GameEngineRuntimeAdapter = require('../js/gameEngineRuntimeAdapter');
const GameEngine = require('../js/gameEngine');
const GameSnapshot = require('../js/gameSnapshot');
const CardBoardFeedback = require('../js/cardBoardFeedback');
const { loadGameRuntime } = require('./helpers/runtime-loaders');
const { runTest } = require('./helpers/test-utils');

runTest('出目確定メタデータはpure Engine遷移と新GameManager採用を通じて保持する', () => {
    const runtime = loadGameRuntime();
    const game = new runtime.GameManager(2);
    game.players[0].landmarks['電波塔'] = true;
    const adapter = GameEngineRuntimeAdapter.create({
        createGame: count => new runtime.GameManager(count),
        landmarkNames: () => runtime.Player.landmarkNames(),
        createCardByName: runtime.createCardByName,
        assignShopStockSnapshot: (target, source) => Object.assign(target, source),
        decrementShopStock: runtime.decrementShopStock,
        pendingActionsFor: value => runtime.GameManager.pendingActionsFor(value),
        logLimit: Number.MAX_SAFE_INTEGER,
    });
    let snapshot = GameSnapshot.serializeGameState(game, {});
    const feedback = CardBoardFeedback.create();
    const session = [];
    assert.strictEqual(feedback.refresh({ game, session }), false);
    for (const action of ['rollDice', 'rerollDice']) {
        const transitioned = GameEngine.transitionSnapshot({ snapshot, action, data: { forceDice: 3 },
            hydrate: adapter.hydrate, serialize: adapter.serialize });
        assert.strictEqual(transitioned.ok, true, action);
        snapshot = transitioned.snapshot;
        const adopted = adapter.hydrate(snapshot).game;
        assert.strictEqual(feedback.refresh({ game: adopted, session }), true, `${action}: 実際の採用後にも新規演出`);
        assert.strictEqual(feedback.refresh({ game: adopted, session }), false);
        assert.strictEqual(adopted.diceResolutionSequence, 0, '端末ローカルsequenceは新GMで初期化される');
        assert.deepStrictEqual(JSON.parse(JSON.stringify(adopted.log.find(entry => entry.diceResolution).diceResolution)), {
            dice1: 3, dice2: 0, result: 3, rerolled: action === 'rerollDice', turn: game.turnCount, actor: 0,
        });
    }
});

runTest('確定出目だけが既知メタデータを持ち駅選択途中や無効optionsへ付加しない', () => {
    const runtime = loadGameRuntime();
    const game = new runtime.GameManager(2);
    game.players[0].landmarks['駅'] = true;
    game.players[0].landmarks['電波塔'] = true;
    game.rollDice();
    assert.strictEqual(game.log.some(entry => entry.diceResolution), false);
    game.selectDiceCount(true, 5, 1);
    const first = game.log.find(entry => entry.diceResolution);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(first.diceResolution)), {
        dice1: 5, dice2: 1, result: 6, rerolled: false, turn: game.turnCount, actor: 0,
    });
    game.rerollDice();
    assert.strictEqual(game.log.some(entry => entry.diceResolution), false);
    game.selectDiceCount(false, 6);
    assert.strictEqual(game.log.filter(entry => entry.diceResolution).length, 1);
    assert.strictEqual(game.log.find(entry => entry.diceResolution).diceResolution.rerolled, true);
    const valid = { dice1: 1, dice2: 2, result: 3, rerolled: false, turn: 1, actor: 0, arbitrary: true };
    game.addLog('dice', '文言に依存しない', { diceResolution: valid });
    assert.deepStrictEqual(Object.keys(game.log.at(-1).diceResolution).sort(), ['actor', 'dice1', 'dice2', 'rerolled', 'result', 'turn']);
    for (const invalid of [{ ...valid, result: 4 }, { ...valid, dice2: 7 }, { ...valid, actor: 2 }, { ...valid, rerolled: 1 }]) {
        game.addLog('dice', '無効', { diceResolution: invalid });
        assert.strictEqual(game.log.at(-1).diceResolution, undefined);
    }
    game.addLog('system', '通常ログ', { diceResolution: valid });
    assert.strictEqual(game.log.at(-1).diceResolution, undefined);
});

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
            totalsComplete: true,
            counts: { dice: 0, gain: 0, lose: 0, build: 0, special: 0, system: 0, error: 0 },
            totals: { gain: 0, lose: 0 },
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
                totalsComplete: true,
                counts: { dice: 0, gain: 0, lose: 0, build: 0, special: 0, system: 0, error: 0 },
                totals: { gain: 0, lose: 0 },
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
