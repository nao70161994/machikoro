'use strict';

const assert = require('assert');
const GameActionContract = require('../js/actionContract');
const GameEngine = require('../js/gameEngine');
const { runTest } = require('./helpers/test-utils');

function makeRecorder(returnValues = {}) {
    const calls = [];
    const game = {};
    const methodNames = [
        'rollDice', 'selectDiceCount', 'skipReroll', 'rerollDice',
        'resolveHarbor', 'resolveTV', 'resolveBusiness', 'resolveCleaning',
        'resolveMover', 'resolveRenovation', 'resolveIT', 'buildLandmark', 'nextTurn',
    ];
    for (const method of methodNames) {
        game[method] = (...args) => {
            calls.push([method, args]);
            return returnValues[method];
        };
    }
    return { calls, game };
}

runTest('共有Game Engine executorはAction Contractを過不足なく網羅する', () => {
    assert.ok(Object.isFrozen(GameEngine));
    assert.ok(Object.isFrozen(GameEngine.handledActions));
    assert.deepStrictEqual(
        Array.from(GameEngine.handledActions).sort(),
        GameActionContract.entries.map(entry => entry.action).sort()
    );
});

runTest('共有Game Engine executorはcanonical payloadを既存GameManager引数へ写像する', () => {
    const cases = [
        ['rollDice', { forceDice: 7, tunaDice: 2 }, 'rollDice', [7, 2]],
        ['selectDice', { useTwo: true, d1: 3, d2: 4, tunaDice: 1 }, 'selectDiceCount', [true, 3, 4, 1]],
        ['skipReroll', {}, 'skipReroll', []],
        ['rerollDice', { forceDice: 8, tunaDice: 3 }, 'rerollDice', [8, 3]],
        ['resolveHarbor', { useBonus: true }, 'resolveHarbor', [true]],
        ['resolveTV', { targetIndex: 2 }, 'resolveTV', [2]],
        ['resolveBusiness', { myCard: 1, targetIndex: 2, theirCard: 3 }, 'resolveBusiness', [1, 2, 3]],
        ['resolveCleaning', { cardName: 'カフェ' }, 'resolveCleaning', ['カフェ']],
        ['resolveMover', { cardIndex: 4, cardName: 'ignored', targetIndex: 1 }, 'resolveMover', [4, 1]],
        ['resolveMover', { cardName: 'パン屋', targetIndex: 1 }, 'resolveMover', ['パン屋', 1]],
        ['resolveRenovation', { landmarkName: '駅' }, 'resolveRenovation', ['駅']],
        ['resolveIT', { doSave: false }, 'resolveIT', [false]],
        ['buildLandmark', { name: '駅' }, 'buildLandmark', ['駅']],
        ['nextTurn', {}, 'nextTurn', []],
    ];

    for (const [action, data, method, args] of cases) {
        const recorder = makeRecorder();
        assert.strictEqual(GameEngine.applyMutableAction({
            game: recorder.game,
            action,
            data,
        }), true, action);
        assert.deepStrictEqual(recorder.calls, [[method, args]], action);
    }
});

runTest('共有Game Engine executorは失敗結果・建設在庫・Undo adapter契約を保持する', () => {
    const failed = makeRecorder({ resolveTV: false });
    assert.strictEqual(GameEngine.applyMutableAction({
        game: failed.game,
        action: 'resolveTV',
        data: { targetIndex: 1 },
    }), false);

    const calls = [];
    const card = { name: 'カフェ' };
    const shopStock = { カフェ: 3 };
    const game = {
        buildCard(value) {
            calls.push(['buildCard', value]);
            return true;
        },
    };
    assert.strictEqual(GameEngine.applyMutableAction({
        game,
        shopStock,
        action: 'buildCard',
        data: { cardName: 'カフェ' },
        createCardByName(name) {
            calls.push(['createCardByName', name]);
            return card;
        },
        decrementShopStock(stock, value) {
            calls.push(['decrementShopStock', stock, value]);
            stock[value.name]--;
        },
    }), true);
    assert.deepStrictEqual(calls, [
        ['createCardByName', 'カフェ'],
        ['buildCard', card],
        ['decrementShopStock', shopStock, card],
    ]);
    assert.strictEqual(shopStock.カフェ, 2);

    const undoState = { playerCoins: [3] };
    let restored = null;
    assert.strictEqual(GameEngine.applyMutableAction({
        game,
        action: 'undoBuild',
        data: { state: undoState },
        restoreUndoState(state) {
            restored = state;
            return true;
        },
    }), true);
    assert.strictEqual(restored, undoState);
});

runTest('共有Game Engine executorは未知actionと非object payloadを副作用なく拒否する', () => {
    const recorder = makeRecorder();
    for (const [action, data] of [['unknown', {}], ['rollDice', null], ['rollDice', []]]) {
        assert.strictEqual(GameEngine.applyMutableAction({ game: recorder.game, action, data }), false);
    }
    assert.deepStrictEqual(recorder.calls, []);
});
