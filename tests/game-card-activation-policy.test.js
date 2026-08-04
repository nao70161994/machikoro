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

runTest('card activation policyは青カードの条件と収入をdetached planにする', () => {
    const effects = { CORNFIELD: 'corn', HARBOR: 'harbor', TUNA: 'tuna' };
    assert.deepStrictEqual(GameCardActivationPolicy.blueIncomePlan({
        effect: effects.CORNFIELD, effects, income: 2, builtLandmarkCount: 2,
    }), { active: false, amount: 0, kind: 'cornfield', dice: null });
    assert.deepStrictEqual(GameCardActivationPolicy.blueIncomePlan({
        effect: effects.CORNFIELD, effects, income: 2, builtLandmarkCount: 1,
    }), { active: true, amount: 2, kind: 'cornfield', dice: null });
    assert.deepStrictEqual(GameCardActivationPolicy.blueIncomePlan({
        effect: effects.HARBOR, effects, income: 3, hasHarbor: false,
    }), { active: false, amount: 0, kind: 'harbor', dice: null });
    assert.deepStrictEqual(GameCardActivationPolicy.blueIncomePlan({
        effect: 'normal', effects, income: 4,
    }), { active: true, amount: 4, kind: 'normal', dice: null });
});

runTest('card activation policyはマグロdiceを港条件通過後だけ評価する', () => {
    const effects = { CORNFIELD: 'corn', HARBOR: 'harbor', TUNA: 'tuna' };
    let reads = 0;
    const blocked = GameCardActivationPolicy.blueIncomePlan({
        effect: effects.TUNA,
        effects,
        hasHarbor: false,
        tunaDice: () => { reads++; return [6, 5]; },
    });
    assert.strictEqual(blocked.active, false);
    assert.strictEqual(reads, 0);

    const plan = GameCardActivationPolicy.blueIncomePlan({
        effect: effects.TUNA,
        effects,
        hasHarbor: true,
        tunaDice: () => { reads++; return [6, 5]; },
    });
    assert.deepStrictEqual(plan, { active: true, amount: 11, kind: 'tuna', dice: [6, 5] });
    assert.strictEqual(reads, 1);
    assert.strictEqual(Object.isFrozen(plan.dice), true);
});
