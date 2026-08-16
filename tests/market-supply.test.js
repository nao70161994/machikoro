'use strict';

const assert = require('assert');
const MarketSupply = require('../js/marketSupply');
const { runTest } = require('./helpers/test-utils');

function cards(count) {
    return Array.from({ length: count }, (_, index) => ({
        name: `施設${index + 1}`,
        color: index % 5 === 0 ? 'purple' : 'blue',
    }));
}

function initialize(options = {}) {
    const definitions = options.cards || cards(12);
    const shopStock = {};
    const state = MarketSupply.initialize({
        mode: options.mode || MarketSupply.MODES.TEN_TYPE,
        seed: options.seed ?? 12345,
        cards: definitions,
        enabledCardNames: options.enabledCardNames || definitions.map(card => card.name),
        playerCount: options.playerCount || 4,
        shopStock,
        initialStock: card => card.color === 'purple' ? (options.playerCount || 4) : 6,
    });
    return { definitions, shopStock, state };
}

runTest('公式10種類市場はseedから決定論的な山札と公開市場を作る', () => {
    const left = initialize({ seed: 987654321 });
    const right = initialize({ seed: 987654321 });
    assert.deepStrictEqual(left.state, right.state);
    assert.deepStrictEqual(left.shopStock, right.shopStock);
    assert.strictEqual(MarketSupply.marketTypeCount(left.shopStock), 10);
    const total = Object.values(left.shopStock).reduce((sum, count) => sum + count, 0) + left.state.deck.length;
    assert.strictEqual(total, left.definitions.reduce((sum, card) => sum + (card.color === 'purple' ? 4 : 6), 0));
});

runTest('公式市場は同名をstackし、種類が9以下になると10種類まで補充する', () => {
    const shopStock = Object.fromEntries(cards(11).map(card => [card.name, 0]));
    for (let index = 0; index < 10; index++) shopStock[`施設${index + 1}`] = 1;
    const state = {
        mode: MarketSupply.MODES.TEN_TYPE,
        seed: 1,
        targetTypeCount: 10,
        deck: ['施設1', '施設11'],
    };
    assert.strictEqual(MarketSupply.purchase(state, shopStock, '施設10'), true);
    assert.strictEqual(shopStock['施設1'], 2, '先に公開済みの同名カードへ重ねる');
    assert.strictEqual(shopStock['施設11'], 1, '10種類へ戻るまで続けて公開する');
    assert.strictEqual(MarketSupply.marketTypeCount(shopStock), 10);
    assert.deepStrictEqual(state.deck, []);
});

runTest('公式市場は補充で公開した施設名を山札順で返す', () => {
    const shopStock = Object.fromEntries(cards(11).map(card => [card.name, 0]));
    for (let index = 0; index < 10; index++) shopStock[`施設${index + 1}`] = 1;
    const state = {
        mode: MarketSupply.MODES.TEN_TYPE,
        seed: 1,
        targetTypeCount: 10,
        deck: ['施設1', '施設1', '施設11'],
    };
    const result = MarketSupply.purchaseResult(state, shopStock, '施設10');
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.revealedNames, ['施設1', '施設1', '施設11']);
    assert.strictEqual(shopStock['施設1'], 3);
    assert.strictEqual(shopStock['施設11'], 1);
    assert.strictEqual(state.refillSequence, 1);
    assert.deepStrictEqual(state.refillHistory, [{
        sequence: 1,
        cardNames: ['施設1', '施設1', '施設11'],
    }]);
    assert.strictEqual(state.revealedCardCount, 3);
    assert.deepStrictEqual(MarketSupply.consumePendingHighlightNames(state), [
        '施設1', '施設1', '施設11',
    ]);
    assert.deepStrictEqual(MarketSupply.consumePendingHighlightNames(state), []);
    assert.strictEqual(MarketSupply.summarizeCardNames(result.revealedNames), '施設1×2、施設11');
});

runTest('ゲーム市場の補充履歴はターンと建設プレイヤーを保持する', () => {
    const shopStock = Object.fromEntries(cards(11).map(card => [card.name, 0]));
    for (let index = 0; index < 10; index++) shopStock[`施設${index + 1}`] = 1;
    const game = {
        turnCount: 14,
        currentPlayerIndex: 2,
        marketSupply: {
            mode: 'ten-type', seed: 1, targetTypeCount: 10,
            deck: ['施設11'], refillSequence: 0, refillHistory: [],
            revealedCardCount: 10, totalsComplete: true,
        },
        addMarketRefillLog() {},
        addMarketDeckStatusLog() {},
    };
    assert.strictEqual(MarketSupply.decrementGameShopStock(game, shopStock, '施設10'), true);
    assert.deepStrictEqual(game.marketSupply.refillHistory, [{
        sequence: 1, turnCount: 14, playerIndex: 2, cardNames: ['施設11'],
    }]);
    assert.strictEqual(game.marketSupply.revealedCardCount, 11);
});

runTest('公式市場は補充履歴を20件に制限しsnapshotへ一時強調を含めない', () => {
    const state = {
        mode: MarketSupply.MODES.TEN_TYPE,
        seed: 1,
        targetTypeCount: 1,
        deck: Array.from({ length: 21 }, () => '施設1'),
        refillSequence: 0,
        refillHistory: [],
    };
    const shopStock = { 施設1: 1 };
    for (let index = 0; index < 21; index++) {
        assert.strictEqual(MarketSupply.purchase(state, shopStock, '施設1'), true);
    }
    assert.strictEqual(state.refillSequence, 21);
    assert.strictEqual(state.refillHistory.length, 20);
    assert.strictEqual(state.refillHistory[0].sequence, 2);
    assert.deepStrictEqual(MarketSupply.copyState(state), {
        mode: 'ten-type', seed: 1, targetTypeCount: 1, deck: [],
        refillSequence: 21,
        refillHistory: state.refillHistory,
        revealedCardCount: 21,
        totalsComplete: false,
    });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(
        MarketSupply.copyState(state), 'pendingHighlightNames'
    ), false);
});

runTest('公式市場は山札10枚以下と山札切れの境界を一度だけ通知する', () => {
    const logs = [];
    const game = {
        marketSupply: {
            mode: 'ten-type', seed: 1, targetTypeCount: 1,
            deck: Array(11).fill('施設1'), refillSequence: 0, refillHistory: [],
        },
        addMarketRefillLog() {},
        addMarketDeckStatusLog(status, count) { logs.push([status, count]); },
    };
    const stock = { 施設1: 1 };
    MarketSupply.decrementGameShopStock(game, stock, '施設1');
    assert.deepStrictEqual(logs, [['low', 10]]);
    for (let index = 0; index < 10; index++) MarketSupply.decrementGameShopStock(game, stock, '施設1');
    assert.deepStrictEqual(logs, [['low', 10], ['empty', 0]]);
});

runTest('使用施設が10種類未満なら全種類を公開して山札残数を保持する', () => {
    const definitions = cards(7);
    const result = initialize({ cards: definitions, seed: 7 });
    assert.strictEqual(result.state.targetTypeCount, 7);
    assert.strictEqual(MarketSupply.marketTypeCount(result.shopStock), 7);
    assert.ok(result.state.deck.length > 0);
});

runTest('公式市場は2〜10人とcard set境界でも物量と10種類を保つ', () => {
    for (const playerCount of [2, 10]) {
        for (const enabledCount of [0, 7, 10, 12]) {
            const definitions = cards(12);
            const enabledCardNames = definitions.slice(0, enabledCount).map(card => card.name);
            const result = initialize({ definitions, cards: definitions, enabledCardNames, playerCount });
            const expectedTypes = Math.min(10, enabledCount);
            assert.strictEqual(result.state.targetTypeCount, expectedTypes);
            assert.strictEqual(MarketSupply.marketTypeCount(result.shopStock), expectedTypes);
            const actualTotal = Object.values(result.shopStock)
                .reduce((sum, count) => sum + count, 0) + result.state.deck.length;
            const expectedTotal = definitions.slice(0, enabledCount)
                .reduce((sum, card) => sum + (card.color === 'purple' ? playerCount : 6), 0);
            assert.strictEqual(actualTotal, expectedTotal);
        }
    }
});

runTest('通常市場は従来どおり全在庫を公開し山札を持たない', () => {
    const result = initialize({ mode: MarketSupply.MODES.STANDARD });
    assert.deepStrictEqual(result.state, {
        mode: MarketSupply.MODES.STANDARD,
        seed: 12345,
        targetTypeCount: 0,
        deck: [],
    });
    assert.strictEqual(MarketSupply.marketTypeCount(result.shopStock), 12);
});

runTest('市場snapshotは未知カード・不正seed・過大山札を拒否する', () => {
    const valid = initialize().state;
    const known = cards(12).map(card => card.name);
    assert.strictEqual(MarketSupply.isValidState(valid, known), true);
    assert.strictEqual(MarketSupply.isValidState(Object.assign({}, valid, { deck: ['未知'] }), known), false);
    assert.strictEqual(MarketSupply.isValidState(Object.assign({}, valid, { seed: -1 }), known), false);
    assert.strictEqual(MarketSupply.isValidState(Object.assign({}, valid, { deck: Array(1001).fill('施設1') }), known), false);
    assert.strictEqual(MarketSupply.isValidState(Object.assign({}, valid, {
        refillHistory: [{ sequence: 1, cardNames: ['未知'] }],
    }), known), false);
    assert.strictEqual(MarketSupply.isValidState(Object.assign({}, valid, {
        refillHistory: Array(21).fill({ sequence: 1, cardNames: ['施設1'] }),
    }), known), false);
    assert.strictEqual(MarketSupply.isValidState(null, known), true, 'legacy snapshotを許可');
});
