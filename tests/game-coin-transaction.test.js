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

runTest('coin transactionは銀行から不足分を補って全員へ均等分配する', () => {
    assert.deepStrictEqual(
        GameCoinTransaction.equalDistributionPlan([1, 2, 8, 0]),
        { balances: [3, 3, 3, 3], total: 11, each: 3, remainder: 3, bankContribution: 1 }
    );
});

runTest('coin transactionは不正なshapeを副作用前に拒否する', () => {
    assert.throws(() => GameCoinTransaction.collectionPlan([1], 0, []), /equal-length/);
    assert.throws(() => GameCoinTransaction.collectionPlan([1], 2, [0]), /receiverIndex/);
    assert.throws(() => GameCoinTransaction.equalDistributionPlan([]), /non-empty/);
});

runTest('coin transactionは同一playerへの連続徴収を入力順と残高上限で計画する', () => {
    const plan = GameCoinTransaction.sequentialCollectionPlan(5, [2, 5, 1]);
    assert.deepStrictEqual(plan, {
        remaining: 0,
        transfers: [2, 3, 0],
        total: 5,
    });
    assert.strictEqual(Object.isFrozen(plan), true);
    assert.strictEqual(Object.isFrozen(plan.transfers), true);
});

runTest('coin transactionは空の連続徴収をidentity planにする', () => {
    assert.deepStrictEqual(GameCoinTransaction.sequentialCollectionPlan(7, []), {
        remaining: 7,
        transfers: [],
        total: 0,
    });
});
runTest('表示用確定送金はendpoint・重複pair・safe integerを検証してコピーする', () => {
    const value = { owner: 0, subject: '公園', activation: 1, transfers: [{ from: null, to: 'pool', amount: 1 }, { from: 'pool', to: 0, amount: 0 }] };
    const normalized = GameCoinTransaction.readResolution(value, 2);
    assert.deepStrictEqual(normalized, value);
    assert.notStrictEqual(normalized.transfers, value.transfers);
    for (const transfers of [
        [{ from: 'other', to: 0, amount: 1 }],
        [{ from: 0, to: 0, amount: 1 }],
        [{ from: null, to: 1, amount: -1 }],
        [{ from: null, to: 1, amount: 1 }, { from: null, to: 1, amount: 2 }],
        [{ from: 0, to: 1, amount: Number.MAX_SAFE_INTEGER }, { from: null, to: 1, amount: 1 }],
    ]) assert.strictEqual(GameCoinTransaction.readResolution({ ...value, transfers }, 2), null);
});
