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

runTest('turn policyはincome終了時の役所救済とphaseを一つのimmutable planにする', () => {
    const pendingState = {
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
    };
    const relief = GameTurnPolicy.incomeCompletionPlan({
        coins: 0,
        hasCityHall: true,
        pendingState,
        phases,
    });
    assert.deepStrictEqual(relief, { cityHallCoinDelta: 1, phase: 'build' });
    assert.ok(Object.isFrozen(relief));
    assert.deepStrictEqual(GameTurnPolicy.incomeCompletionPlan({
        coins: 1,
        hasCityHall: true,
        pendingState: { ...pendingState, pendingTV: 1 },
        phases,
    }), { cityHallCoinDelta: 0, phase: 'pending' });
    assert.deepStrictEqual(GameTurnPolicy.incomeCompletionPlan({
        coins: 0,
        hasCityHall: false,
        pendingState,
        phases,
    }), { cityHallCoinDelta: 0, phase: 'build' });
    let cityHallReads = 0;
    GameTurnPolicy.incomeCompletionPlan({
        coins: 1,
        hasCityHall: () => { cityHallReads++; return true; },
        pendingState,
        phases,
    });
    assert.strictEqual(cityHallReads, 0);
});

runTest('turn policyはplayer順に勝者を探索して最初のindexで短絡する', () => {
    const calls = [];
    const landmarks = new Set(['station', 'mall']);
    const players = [
        { hasWon: enabled => { calls.push(['first', enabled]); return false; } },
        { hasWon: enabled => { calls.push(['second', enabled]); return true; } },
        { hasWon: enabled => { calls.push(['third', enabled]); return true; } },
    ];
    assert.strictEqual(GameTurnPolicy.winnerIndex(players, landmarks), 1);
    assert.deepStrictEqual(calls, [
        ['first', ['station', 'mall']],
        ['second', ['station', 'mall']],
    ]);
    assert.deepStrictEqual(Array.from(landmarks), ['station', 'mall']);
    assert.strictEqual(GameTurnPolicy.winnerIndex([], landmarks), -1);
    assert.strictEqual(GameTurnPolicy.winnerIndex(null, landmarks), -1);
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

runTest('turn policyはIT解決を保存・不足・skipのimmutable planへ分ける', () => {
    const outcomes = GameTurnPolicy.itResolutionOutcomes;
    assert.deepStrictEqual(GameTurnPolicy.planItResolution({
        phase: 'pending', pendingPhase: 'pending', pendingIt: true, doSave: true, coins: 3,
    }), { ok: true, outcome: outcomes.SAVED, coinDelta: -1, ventureDelta: 1 });
    assert.deepStrictEqual(GameTurnPolicy.planItResolution({
        phase: 'pending', pendingPhase: 'pending', pendingIt: true, doSave: true, coins: 0,
    }), { ok: true, outcome: outcomes.INSUFFICIENT_COINS, coinDelta: 0, ventureDelta: 0 });
    const skipped = GameTurnPolicy.planItResolution({
        phase: 'pending', pendingPhase: 'pending', pendingIt: true, doSave: false, coins: 8,
    });
    assert.deepStrictEqual(skipped, { ok: true, outcome: outcomes.SKIPPED, coinDelta: 0, ventureDelta: 0 });
    assert.ok(Object.isFrozen(skipped));
    assert.ok(Object.isFrozen(outcomes));
});

runTest('turn policyはIT gateをfail-fastにし拒否・skipでcoinsを読まない', () => {
    let coinReads = 0;
    const coins = () => { coinReads++; return 5; };
    assert.deepStrictEqual(GameTurnPolicy.planItResolution({
        phase: 'build', pendingPhase: 'pending', pendingIt: true, doSave: true, coins,
    }), { ok: false, outcome: 'rejected', coinDelta: 0, ventureDelta: 0 });
    assert.deepStrictEqual(GameTurnPolicy.planItResolution({
        phase: 'pending', pendingPhase: 'pending', pendingIt: true, doSave: 0, coins,
    }), { ok: true, outcome: 'skipped', coinDelta: 0, ventureDelta: 0 });
    assert.strictEqual(coinReads, 0);
});


runTest('turn policyはpending初期状態をdetached immutable stateにする', () => {
    const first = GameTurnPolicy.pendingResetState();
    const second = GameTurnPolicy.pendingResetState();
    assert.deepStrictEqual(first, {
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        pendingActionQueue: [],
    });
    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first.pendingActionQueue, second.pendingActionQueue);
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.pendingActionQueue));
});

runTest('turn policyはturn resetの条件付きfieldと固定結果をpure planにする', () => {
    const preserved = GameTurnPolicy.turnResetPlan();
    const cleared = GameTurnPolicy.turnResetPlan({ clearLog: 1, clearDice: true });
    assert.deepStrictEqual(preserved, {
        clearLog: false,
        clearDice: false,
        lastDiceResult: 0,
        lastDice1: 0,
        lastDice2: 0,
        pendingTunaDice: null,
        builtThisTurn: false,
        usedReroll: false,
        pending: GameTurnPolicy.pendingResetState(),
        hadAmusementParkAtRoll: false,
    });
    assert.strictEqual(cleared.clearLog, true);
    assert.strictEqual(cleared.clearDice, true);
    assert.ok(Object.isFrozen(cleared));
    assert.ok(Object.isFrozen(cleared.pending));
});
