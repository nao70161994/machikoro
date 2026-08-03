'use strict';

const assert = require('assert');
const GameTurnPolicy = require('../js/gameTurnPolicy');
const { runTest } = require('./helpers/test-utils');

const phases = Object.freeze({ BUILD: 'build', PENDING: 'pending' });

runTest('turn policyはincome後のpending有無だけでphaseを決める', () => {
    const clear = {
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
    };
    assert.strictEqual(GameTurnPolicy.phaseAfterIncome(clear, phases), 'build');
    for (const field of Object.keys(clear)) {
        assert.strictEqual(GameTurnPolicy.phaseAfterIncome({ ...clear, [field]: 1 }, phases), 'pending', field);
    }
    assert.deepStrictEqual(clear, {
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
    });
});

runTest('turn policyは遊園地の既存ゾロ目条件を厳密に維持する', () => {
    assert.strictEqual(GameTurnPolicy.shouldRepeatAmusementParkTurn({
        hadAmusementParkAtRoll: true,
        lastDice1: 4,
        lastDice2: 4,
    }), true);
    assert.strictEqual(GameTurnPolicy.shouldRepeatAmusementParkTurn({
        hadAmusementParkAtRoll: false,
        lastDice1: 4,
        lastDice2: 4,
    }), false);
    assert.strictEqual(GameTurnPolicy.shouldRepeatAmusementParkTurn({
        hadAmusementParkAtRoll: true,
        lastDice1: 0,
        lastDice2: 0,
    }), false);
    assert.strictEqual(GameTurnPolicy.shouldRepeatAmusementParkTurn({
        hadAmusementParkAtRoll: true,
        lastDice1: 3,
        lastDice2: 4,
    }), false);
});

runTest('turn policyはplayer indexを循環し不正入力をfail closedにする', () => {
    assert.strictEqual(GameTurnPolicy.nextPlayerIndex(0, 4), 1);
    assert.strictEqual(GameTurnPolicy.nextPlayerIndex(3, 4), 0);
    assert.strictEqual(GameTurnPolicy.nextPlayerIndex(-1, 4), 0);
    assert.strictEqual(GameTurnPolicy.nextPlayerIndex(0, 0), 0);
    assert.ok(Object.isFrozen(GameTurnPolicy));
});
