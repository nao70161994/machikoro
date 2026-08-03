'use strict';

const assert = require('assert');
const GameCardActivationPolicy = require('../js/gameCardActivationPolicy');
const { runTest } = require('./helpers/test-utils');

runTest('card activation policyはdice一致後だけpredicateを順番どおり評価する', () => {
    const first = { name: 'first', diceNums: [1] };
    const skipped = { name: 'skipped', diceNums: [2] };
    const third = { name: 'third', diceNums: [1, 3] };
    const dormant = new Set([first, skipped, third]);
    const checked = [];

    const eligible = GameCardActivationPolicy.eligibleDormantCards(dormant, 1, card => {
        checked.push(card.name);
        return card !== third;
    });

    assert.deepStrictEqual(eligible, [first]);
    assert.deepStrictEqual(checked, ['first', 'third']);
    assert.deepStrictEqual(Array.from(dormant), [first, skipped, third]);
    assert.strictEqual(Object.isFrozen(eligible), true);
});

runTest('card activation policyは同一card参照と入力順を維持する', () => {
    const cards = [
        { name: 'a', diceNums: [4] },
        { name: 'b', diceNums: [4] },
    ];
    const eligible = GameCardActivationPolicy.eligibleDormantCards(cards, 4, () => true);
    assert.strictEqual(eligible[0], cards[0]);
    assert.strictEqual(eligible[1], cards[1]);
});
