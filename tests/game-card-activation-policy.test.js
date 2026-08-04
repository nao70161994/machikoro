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

runTest('card activation policyは赤カードの条件と徴収額をdetached planにする', () => {
    const effects = { HARBOR_RED: 'harbor-red', FRENCHR: 'french', MEMBERBAR: 'member' };
    assert.deepStrictEqual(GameCardActivationPolicy.redActivationPlan({
        effect: effects.HARBOR_RED, effects, income: 3, hasHarbor: false,
    }), { active: false, kind: 'normal', requested: 0 });
    assert.deepStrictEqual(GameCardActivationPolicy.redActivationPlan({
        effect: effects.FRENCHR, effects, income: 5, currentLandmarkCount: 2,
    }), { active: true, kind: 'french', requested: 5 });
    assert.deepStrictEqual(GameCardActivationPolicy.redActivationPlan({
        effect: effects.MEMBERBAR, effects, currentLandmarkCount: 3, currentCoins: 11,
    }), { active: true, kind: 'member-bar', requested: 11 });
    assert.deepStrictEqual(GameCardActivationPolicy.redActivationPlan({
        effect: 'normal', effects, income: 2, hasShoppingMall: true, isRestaurantOrShop: true,
    }), { active: true, kind: 'normal', requested: 3 });
});

runTest('card activation policyは赤カードkind確定後だけ条件factを読む', () => {
    const effects = { HARBOR_RED: 'harbor-red', FRENCHR: 'french', MEMBERBAR: 'member' };
    const reads = [];
    const facts = {
        effects,
        income: 2,
        currentLandmarkCount: () => { reads.push('landmarks'); return 2; },
        currentCoins: () => { reads.push('coins'); return 8; },
        isRestaurantOrShop: () => { reads.push('category'); return true; },
    };
    GameCardActivationPolicy.redActivationPlan({ ...facts, effect: 'normal', hasShoppingMall: false });
    assert.deepStrictEqual(reads, []);
    GameCardActivationPolicy.redActivationPlan({ ...facts, effect: effects.FRENCHR });
    assert.deepStrictEqual(reads, ['landmarks']);
    reads.length = 0;
    const blockedMember = GameCardActivationPolicy.redActivationPlan({
        ...facts,
        effect: effects.MEMBERBAR,
        currentLandmarkCount: () => { reads.push('landmarks'); return 2; },
    });
    assert.strictEqual(blockedMember.active, false);
    assert.deepStrictEqual(reads, ['landmarks']);
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

runTest('card activation policyは緑カードの収入・pending・休業をdetached planにする', () => {
    const effects = {
        WINERY: 'winery',
        MOVER: 'mover',
        LOAN: 'loan',
        RENOVATION: 'renovation',
    };
    assert.deepStrictEqual(GameCardActivationPolicy.greenActivationPlan({
        effect: effects.WINERY, effects, income: 6,
    }), {
        kind: 'winery', amount: 6, pendingField: '', shouldDormant: true, hasTarget: false,
    });
    assert.deepStrictEqual(GameCardActivationPolicy.greenActivationPlan({
        effect: effects.MOVER, effects,
    }), {
        kind: 'mover', amount: 0, pendingField: 'pendingMover',
        shouldDormant: false, hasTarget: false,
    });
    assert.deepStrictEqual(GameCardActivationPolicy.greenActivationPlan({
        effect: effects.RENOVATION, effects, hasRenovationTarget: true,
    }), {
        kind: 'renovation', amount: 0, pendingField: 'pendingRenovation',
        shouldDormant: false, hasTarget: true,
    });
    assert.deepStrictEqual(GameCardActivationPolicy.greenActivationPlan({
        effect: 'normal', effects, income: 4,
    }), {
        kind: 'normal', amount: 4, pendingField: '', shouldDormant: false, hasTarget: false,
    });
});

runTest('card activation policyは緑カードkind確定後だけ必要なfactを読む', () => {
    const effects = {
        WINERY: 'winery',
        MOVER: 'mover',
        LOAN: 'loan',
        RENOVATION: 'renovation',
    };
    let incomeReads = 0;
    let targetReads = 0;
    const facts = {
        effects,
        income: () => { incomeReads++; return 3; },
        hasRenovationTarget: () => { targetReads++; return false; },
    };

    GameCardActivationPolicy.greenActivationPlan({ ...facts, effect: effects.MOVER });
    GameCardActivationPolicy.greenActivationPlan({ ...facts, effect: effects.LOAN });
    assert.deepStrictEqual({ incomeReads, targetReads }, { incomeReads: 0, targetReads: 0 });

    const renovation = GameCardActivationPolicy.greenActivationPlan({
        ...facts, effect: effects.RENOVATION,
    });
    assert.strictEqual(renovation.hasTarget, false);
    assert.deepStrictEqual({ incomeReads, targetReads }, { incomeReads: 0, targetReads: 1 });

    const normal = GameCardActivationPolicy.greenActivationPlan({ ...facts, effect: 'normal' });
    assert.strictEqual(normal.amount, 3);
    assert.deepStrictEqual({ incomeReads, targetReads }, { incomeReads: 1, targetReads: 1 });
    assert.strictEqual(Object.isFrozen(normal), true);
});

runTest('card activation policyは紫カードのeffect・pending・対象有無をdetached planにする', () => {
    const effects = {
        STADIUM: 'stadium', TV: 'tv', BUSINESS: 'business', PUBLISHER: 'publisher',
        TAXOFFICE: 'taxoffice', CLEANING: 'cleaning', ITSTARTUP: 'itstartup', PARK: 'park',
    };
    assert.deepStrictEqual(GameCardActivationPolicy.purpleActivationPlan({
        effect: effects.STADIUM, effects,
    }), { kind: 'stadium', pendingField: '', hasTarget: false });
    assert.deepStrictEqual(GameCardActivationPolicy.purpleActivationPlan({
        effect: effects.TV, effects,
    }), { kind: 'tv', pendingField: 'pendingTV', hasTarget: true });
    assert.deepStrictEqual(GameCardActivationPolicy.purpleActivationPlan({
        effect: effects.BUSINESS, effects, hasBusinessExchange: true,
    }), { kind: 'business', pendingField: 'pendingBusiness', hasTarget: true });
    assert.deepStrictEqual(GameCardActivationPolicy.purpleActivationPlan({
        effect: effects.CLEANING, effects, hasCleaningTarget: false,
    }), { kind: 'cleaning', pendingField: '', hasTarget: false });
    assert.deepStrictEqual(GameCardActivationPolicy.purpleActivationPlan({
        effect: 'unknown', effects,
    }), { kind: 'unknown', pendingField: '', hasTarget: false });
});

runTest('card activation policyは紫カードの徴収要求をplayer順のfrozen配列にする', () => {
    assert.deepStrictEqual(
        GameCardActivationPolicy.fixedCollectionRequests(4, 1, 2),
        [2, 0, 2, 2]
    );
    const players = [
        { id: 'a', count: 3 },
        { id: 'b', count: 8 },
        { id: 'c', count: 1 },
    ];
    const reads = [];
    const publisher = GameCardActivationPolicy.publisherCollectionRequests(
        players,
        1,
        player => { reads.push(player.id); return player.count; }
    );
    assert.deepStrictEqual(publisher, [3, 0, 1]);
    assert.deepStrictEqual(reads, ['a', 'c']);
    assert.deepStrictEqual(
        GameCardActivationPolicy.taxOfficeCollectionRequests([9, 10, 21, 40], 2),
        [0, 5, 0, 20]
    );
    assert.ok(Object.isFrozen(publisher));
});

runTest('card activation policyは紫カードkind確定後だけ対象factを読む', () => {
    const effects = {
        STADIUM: 'stadium', TV: 'tv', BUSINESS: 'business', PUBLISHER: 'publisher',
        TAXOFFICE: 'taxoffice', CLEANING: 'cleaning', ITSTARTUP: 'itstartup', PARK: 'park',
    };
    const reads = [];
    const facts = {
        effects,
        hasBusinessExchange: () => { reads.push('business'); return true; },
        hasCleaningTarget: () => { reads.push('cleaning'); return true; },
    };
    GameCardActivationPolicy.purpleActivationPlan({ ...facts, effect: effects.STADIUM });
    GameCardActivationPolicy.purpleActivationPlan({ ...facts, effect: effects.TV });
    assert.deepStrictEqual(reads, []);
    GameCardActivationPolicy.purpleActivationPlan({ ...facts, effect: effects.BUSINESS });
    GameCardActivationPolicy.purpleActivationPlan({ ...facts, effect: effects.CLEANING });
    assert.deepStrictEqual(reads, ['business', 'cleaning']);
});

runTest('card activation policyは貸金業の支払額を5・6と所持金上限からpureに計画する', () => {
    assert.deepStrictEqual(GameCardActivationPolicy.loanRepaymentPlan({
        dice: 5,
        loanCount: 3,
        coins: 10,
    }), { active: true, loanCount: 3, amount: 6 });
    assert.deepStrictEqual(GameCardActivationPolicy.loanRepaymentPlan({
        dice: 6,
        loanCount: 3,
        coins: 4,
    }), { active: true, loanCount: 3, amount: 4 });
    assert.deepStrictEqual(GameCardActivationPolicy.loanRepaymentPlan({
        dice: 6,
        loanCount: 0,
        coins: 4,
    }), { active: false, loanCount: 0, amount: 0 });
});

runTest('card activation policyは5・6以外で貸金業枚数を読まない', () => {
    assert.deepStrictEqual(GameCardActivationPolicy.loanRepaymentPlan({
        dice: 4,
        loanCount() { throw new Error('loan count must stay lazy'); },
        coins: 10,
    }), { active: false, loanCount: 0, amount: 0 });
});
