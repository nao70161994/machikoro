'use strict';

const assert = require('assert');
const GamePendingTransition = require('../js/gamePendingTransition');
const { runTest } = require('./helpers/test-utils');

runTest('pending transitionはTVの上限付きcoin移動をdetached planにする', () => {
    assert.deepStrictEqual(GamePendingTransition.tvTransferPlan(2, 9), {
        transfer: 5,
        actorCoins: 7,
        targetCoins: 4,
    });
    assert.deepStrictEqual(GamePendingTransition.tvTransferPlan(2, 3), {
        transfer: 3,
        actorCoins: 5,
        targetCoins: 0,
    });
    assert.strictEqual(Object.isFrozen(GamePendingTransition.tvTransferPlan(0, 0)), true);
});

runTest('pending transitionはBusiness Centerのindexと休業引継ぎを固定する', () => {
    const actorCard = { name: '麦畑' };
    const targetCard = { name: 'パン屋' };
    const plan = GamePendingTransition.businessExchangePlan(
        [{ name: '駅前' }, actorCard],
        [targetCard],
        actorCard,
        targetCard,
        { actor: true, target: false }
    );
    assert.deepStrictEqual(plan, {
        actorCard,
        targetCard,
        actorCardIndex: 1,
        targetCardIndex: 0,
        actorReceivesDormant: false,
        targetReceivesDormant: true,
    });
    assert.strictEqual(GamePendingTransition.businessExchangePlan([], [targetCard], actorCard, targetCard), null);
});

runTest('pending transitionは清掃対象をplayer/card順で一度だけ列挙する', () => {
    const active = { name: 'カフェ', category: 'restaurant' };
    const dormant = { name: 'カフェ', category: 'restaurant' };
    const major = { name: 'カフェ', category: 'major' };
    const players = [
        { cards: [active, dormant] },
        { cards: [major, active] },
    ];
    const plan = GamePendingTransition.cleaningPlan(
        players,
        'カフェ',
        'major',
        (_player, card) => card === dormant
    );
    assert.deepStrictEqual(plan.targets.map(target => [target.playerIndex, target.cardIndex]), [[0, 0], [1, 1]]);
    assert.deepStrictEqual(plan.requestedAmounts, [1, 1]);
    assert.strictEqual(Object.isFrozen(plan.targets), true);
    assert.strictEqual(Object.isFrozen(plan.requestedAmounts), true);
    assert.strictEqual(Object.isFrozen(plan.targets[0]), true);
});

runTest('pending transitionは引越しと改装の報酬結果を固定する', () => {
    const card = { name: '麦畑' };
    assert.deepStrictEqual(GamePendingTransition.moverPlan(3, [{}, card], card, true), {
        card,
        cardIndex: 1,
        dormant: true,
        reward: 4,
        actorCoins: 7,
    });
    assert.strictEqual(GamePendingTransition.moverPlan(3, [], card, false), null);
    assert.deepStrictEqual(GamePendingTransition.renovationPlan(3, { 駅: true }, '駅'), {
        landmarkName: '駅',
        reward: 8,
        actorCoins: 11,
    });
    assert.strictEqual(GamePendingTransition.renovationPlan(3, { 駅: false }, '駅'), null);
});
