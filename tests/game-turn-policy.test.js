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

runTest('turn policyはnextTurn admissionをphase優先でfail closedにする', () => {
    const reasons = GameTurnPolicy.nextTurnRejectionReasons;
    let winnerReads = 0;
    assert.deepStrictEqual(GameTurnPolicy.planNextTurnAdmission({
        phase: 'roll',
        buildPhase: 'build',
        hasWinner: () => { winnerReads++; return true; },
    }), { ok: false, reason: reasons.WRONG_PHASE });
    assert.strictEqual(winnerReads, 0);
    assert.deepStrictEqual(GameTurnPolicy.planNextTurnAdmission({
        phase: 'build', buildPhase: 'build', hasWinner: true,
    }), { ok: false, reason: reasons.WINNER_DECIDED });
    assert.deepStrictEqual(GameTurnPolicy.planNextTurnAdmission({
        phase: 'build', buildPhase: 'build', hasWinner: false,
    }), { ok: true, reason: '' });
});

runTest('turn policyは空港bonus条件を建設有無と所有だけで判定する', () => {
    assert.strictEqual(GameTurnPolicy.shouldAwardAirportBonus({ builtThisTurn: false, hasAirport: true }), true);
    assert.strictEqual(GameTurnPolicy.shouldAwardAirportBonus({ builtThisTurn: true, hasAirport: true }), false);
    assert.strictEqual(GameTurnPolicy.shouldAwardAirportBonus({ builtThisTurn: false, hasAirport: false }), false);
});

runTest('turn policyはIT pendingと通常進行を排他的なfrozen planにする', () => {
    const pending = GameTurnPolicy.planNextTurnContinuation({ hasActiveItStartup: true });
    const advance = GameTurnPolicy.planNextTurnContinuation({ hasActiveItStartup: false });
    assert.deepStrictEqual(pending, { startPendingIt: true, advanceTurn: false });
    assert.deepStrictEqual(advance, { startPendingIt: false, advanceTurn: true });
    assert.ok(Object.isFrozen(pending));
    assert.ok(Object.isFrozen(GameTurnPolicy.nextTurnRejectionReasons));
});
