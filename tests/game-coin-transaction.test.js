'use strict';

const assert = require('assert');
const GameCoinTransaction = require('../js/gameCoinTransaction');
const { runTest } = require('./helpers/test-utils');

runTest('coin transactionは各playerの所持額を上限に回収する', () => {
    const plan = GameCoinTransaction.collectionPlan([4, 1, 8, 0], 0, [0, 2, 2, 2]);
    assert.deepStrictEqual(plan, {
        balances: [7, 0, 6, 0],
        transfers: [0, 1, 2, 0],
        total: 3,
    });
    assert.strictEqual(Object.isFrozen(plan), true);
    assert.strictEqual(Object.isFrozen(plan.balances), true);
    assert.strictEqual(Object.isFrozen(plan.transfers), true);
});

runTest('coin transactionは要求額の異なる複数人回収を一つのplanにする', () => {
    assert.deepStrictEqual(
        GameCoinTransaction.collectionPlan([3, 12, 9], 1, [5, 0, 4]),
        { balances: [0, 19, 5], transfers: [3, 0, 4], total: 7 }
    );
});

runTest('coin transactionは端数を指定playerへ残して均等分配する', () => {
    assert.deepStrictEqual(
        GameCoinTransaction.equalDistributionPlan([1, 2, 8, 0], 2),
        { balances: [2, 2, 5, 2], total: 11, each: 2, remainder: 3 }
    );
});

runTest('coin transactionは不正なshapeを副作用前に拒否する', () => {
    assert.throws(() => GameCoinTransaction.collectionPlan([1], 0, []), /equal-length/);
    assert.throws(() => GameCoinTransaction.collectionPlan([1], 2, [0]), /receiverIndex/);
    assert.throws(() => GameCoinTransaction.equalDistributionPlan([], 0), /non-empty/);
});
