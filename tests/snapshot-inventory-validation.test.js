'use strict';

const assert = require('assert');
const SnapshotInventoryValidation = require('../js/snapshotInventoryValidation');
const { runTest } = require('./helpers/test-utils');

const cards = [
    { id: 'wheat', name: '麦畑', category: 'minor' },
    { id: 'bakery', name: 'パン屋', category: 'minor' },
    { id: 'cafe', name: 'カフェ', category: 'minor' },
    { id: 'stadium', name: 'スタジアム', category: 'major' },
];

function validator() {
    return SnapshotInventoryValidation.createValidator({
        cards,
        initialPlayerCardNames: ['麦畑', 'パン屋'],
        isMajorCard: card => card.category === 'major',
        getInitialCardStock: (card, playerCount) => card.category === 'major' ? playerCount : 6,
    });
}

function input(playerCount, overrides = {}) {
    return Object.assign({
        playerCount,
        playerCardNames: Array.from({ length: playerCount }, () => []),
        enabledCardNames: cards.map(card => card.name),
        shopStock: {},
    }, overrides);
}

runTest('snapshot inventoryは通常・初期配布・大施設の2人/10人上限を固定する', () => {
    const check = validator();
    for (const playerCount of [2, 10]) {
        const normal = input(playerCount);
        normal.playerCardNames[0] = Array(6).fill('カフェ');
        assert.strictEqual(check.validate(normal), true);
        normal.playerCardNames[0].push('カフェ');
        assert.strictEqual(check.validate(normal), false);

        const initial = input(playerCount);
        initial.playerCardNames[0] = Array(6 + playerCount).fill('麦畑');
        assert.strictEqual(check.validate(initial), true);
        initial.playerCardNames[0].push('麦畑');
        assert.strictEqual(check.validate(initial), false);

        const major = input(playerCount);
        major.playerCardNames.forEach(names => names.push('スタジアム'));
        assert.strictEqual(check.validate(major), true);
        major.playerCardNames[0].push('スタジアム');
        assert.strictEqual(check.validate(major), false);
    }
});

runTest('snapshot inventoryはcustom setで初期配布だけを例外にする', () => {
    const check = validator();
    assert.strictEqual(check.validate(input(2, {
        enabledCardNames: [],
        playerCardNames: [['麦畑'], ['パン屋']],
    })), true);
    assert.strictEqual(check.validate(input(2, {
        enabledCardNames: [],
        playerCardNames: [['カフェ'], []],
    })), false);
    assert.strictEqual(check.validate(input(2, {
        enabledCardNames: null,
        playerCardNames: [['カフェ'], []],
    })), true);
});

runTest('snapshot inventoryは明示在庫と所持合計をname/id共通で制限する', () => {
    const check = validator();
    assert.strictEqual(check.validate(input(2, {
        playerCardNames: [Array(5).fill('カフェ'), []],
        shopStock: { cafe: 1 },
    })), true);
    assert.strictEqual(check.validate(input(2, {
        playerCardNames: [Array(6).fill('カフェ'), []],
        shopStock: { カフェ: 1 },
    })), false);
    assert.strictEqual(check.validate(input(2, {
        shopStock: { cafe: 1, カフェ: 1 },
    })), false);
    assert.strictEqual(check.validate(input(2, { shopStock: { cafe: 7 } })), false);
    assert.strictEqual(check.validate(input(2, { shopStock: undefined })), true);
});

runTest('snapshot inventoryは不正shapeと未知cardをfail closedにする', () => {
    const check = validator();
    assert.strictEqual(check.validate(input(2, { playerCardNames: [[]] })), false);
    assert.strictEqual(check.validate(input(2, { playerCardNames: [['未知'], []] })), false);
    assert.strictEqual(check.validate(input(2, { enabledCardNames: ['未知'] })), false);
    assert.strictEqual(check.validate(input(2, { shopStock: { unknown: 0 } })), false);
});
