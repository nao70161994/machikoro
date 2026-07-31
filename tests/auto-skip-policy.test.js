const assert = require('assert');
const AutoSkipPolicy = require('../js/autoSkipPolicy');
const { runTest } = require('./helpers/test-utils');

function buildOptions(overrides = {}) {
    const current = {
        coins: 4,
        landmarks: { 駅: false, 役所: false, 空港: false },
        countCardIncludingDormant(name) {
            return name === 'スタジアム' ? 1 : 0;
        },
    };
    return {
        cards: [
            { name: '麦畑', color: 'blue', cost: 1 },
            { name: 'スタジアム', color: 'purple', cost: 4 },
        ],
        current,
        shopStock: { 麦畑: 1, スタジアム: 1 },
        getStockCount(stock, card) { return stock[card.name] || 0; },
        enabledLandmarks: new Set(['駅', '役所', '空港']),
        yakushoName: '役所',
        landmarkCost(name) { return name === '駅' ? 4 : 30; },
        ...overrides,
    };
}

runTest('auto skip availabilityは購入可能カードとランドマークをpureに判定する', () => {
    const options = buildOptions();
    const before = JSON.stringify(options.current);
    const result = AutoSkipPolicy.buildAvailability(options);

    assert.deepStrictEqual(result, {
        canAffordCard: true,
        canAffordLandmark: true,
        canAffordAny: true,
    });
    assert.strictEqual(Object.isFrozen(result), true);
    assert.strictEqual(JSON.stringify(options.current), before);
});

runTest('auto skip availabilityは在庫切れ・紫重複・役所・無効ランドマークを除外する', () => {
    const options = buildOptions({
        current: {
            coins: 20,
            landmarks: { 駅: false, 役所: false, 空港: false },
            countCardIncludingDormant() { return 1; },
        },
        shopStock: { 麦畑: 0, スタジアム: 1 },
        enabledLandmarks: new Set(['役所']),
    });

    assert.deepStrictEqual(AutoSkipPolicy.buildAvailability(options), {
        canAffordCard: false,
        canAffordLandmark: false,
        canAffordAny: false,
    });
});

runTest('auto skip availabilityはカード候補を既存順序で短絡評価する', () => {
    const visited = [];
    const options = buildOptions({
        getStockCount(stock, card) {
            visited.push(card.name);
            return stock[card.name] || 0;
        },
    });

    AutoSkipPolicy.buildAvailability(options);
    assert.deepStrictEqual(visited, ['麦畑']);
});
