'use strict';

const assert = require('assert');
const GameBuildPolicy = require('../js/gameBuildPolicy');
const { runTest } = require('./helpers/test-utils');

const validCard = Object.freeze({
    phase: 'build',
    buildPhase: 'build',
    builtThisTurn: false,
    cardValid: true,
    coins: 5,
    cost: 3,
    isMajor: false,
    ownsMajor: false,
});

runTest('game build policyはcard拒否優先順と成功をpure planにする', () => {
    const reasons = GameBuildPolicy.reasons;
    const cases = [
        [{ ...validCard, phase: 'roll', builtThisTurn: true }, reasons.WRONG_PHASE],
        [{ ...validCard, builtThisTurn: true, cardValid: false }, reasons.ALREADY_BUILT],
        [{ ...validCard, cardValid: false, coins: 0 }, reasons.INVALID_CARD],
        [{ ...validCard, coins: 2, isMajor: true, ownsMajor: true }, reasons.INSUFFICIENT_COINS],
        [{ ...validCard, isMajor: true, ownsMajor: true }, reasons.DUPLICATE_MAJOR],
    ];
    for (const [facts, reason] of cases) {
        assert.deepStrictEqual(GameBuildPolicy.planCardBuild(facts), { ok: false, reason });
    }
    assert.deepStrictEqual(GameBuildPolicy.planCardBuild(validCard), { ok: true, reason: '' });
    assert.deepStrictEqual(validCard, {
        phase: 'build', buildPhase: 'build', builtThisTurn: false, cardValid: true,
        coins: 5, cost: 3, isMajor: false, ownsMajor: false,
    });
});

runTest('game build policyはlandmark拒否優先順と成功をpure planにする', () => {
    const reasons = GameBuildPolicy.reasons;
    const valid = {
        phase: 'build', buildPhase: 'build', builtThisTurn: false,
        knownLandmark: true, enabledLandmark: true, coins: 10, cost: 4,
        landmarkBuilt: false,
    };
    const cases = [
        [{ ...valid, phase: 'roll', builtThisTurn: true }, reasons.WRONG_PHASE],
        [{ ...valid, builtThisTurn: true, knownLandmark: false }, reasons.ALREADY_BUILT],
        [{ ...valid, knownLandmark: false, enabledLandmark: false }, reasons.UNKNOWN_LANDMARK],
        [{ ...valid, enabledLandmark: false, coins: 0 }, reasons.DISABLED_LANDMARK],
        [{ ...valid, coins: 3, landmarkBuilt: true }, reasons.INSUFFICIENT_COINS],
        [{ ...valid, landmarkBuilt: true }, reasons.LANDMARK_ALREADY_BUILT],
    ];
    for (const [facts, reason] of cases) {
        assert.deepStrictEqual(GameBuildPolicy.planLandmarkBuild(facts), { ok: false, reason });
    }
    assert.deepStrictEqual(GameBuildPolicy.planLandmarkBuild(valid), { ok: true, reason: '' });
});


runTest('game build policyは拒否後のfactを読まず既存検証順を維持する', () => {
    const calls = [];
    const fact = (name, value) => () => { calls.push(name); return value; };
    const cardResult = GameBuildPolicy.planCardBuild({
        phase: fact('phase', 'roll'),
        buildPhase: fact('buildPhase', 'build'),
        builtThisTurn: fact('builtThisTurn', false),
        cardValid: fact('cardValid', true),
        coins: fact('coins', 10),
        cost: fact('cost', 1),
        isMajor: fact('isMajor', true),
        ownsMajor: fact('ownsMajor', true),
    });
    assert.strictEqual(cardResult.reason, GameBuildPolicy.reasons.WRONG_PHASE);
    assert.deepStrictEqual(calls, ['phase', 'buildPhase']);

    calls.length = 0;
    const landmarkResult = GameBuildPolicy.planLandmarkBuild({
        phase: fact('phase', 'build'),
        buildPhase: fact('buildPhase', 'build'),
        builtThisTurn: fact('builtThisTurn', false),
        cost: fact('cost', 4),
        knownLandmark: fact('knownLandmark', false),
        enabledLandmark: fact('enabledLandmark', true),
        coins: fact('coins', 10),
        landmarkBuilt: fact('landmarkBuilt', false),
    });
    assert.strictEqual(landmarkResult.reason, GameBuildPolicy.reasons.UNKNOWN_LANDMARK);
    assert.deepStrictEqual(calls, ['phase', 'buildPhase', 'builtThisTurn', 'cost', 'knownLandmark']);
});

runTest('game build policyのcontractと結果は外部変更できない', () => {
    const result = GameBuildPolicy.planCardBuild(validCard);
    assert.ok(Object.isFrozen(GameBuildPolicy));
    assert.ok(Object.isFrozen(GameBuildPolicy.reasons));
    assert.ok(Object.isFrozen(result));
});


runTest('game build policyはcard購入と貸金業bonusをdetached transitionにする', () => {
    assert.deepStrictEqual(GameBuildPolicy.cardBuildTransition(3), {
        purchaseCoinDelta: -3,
        loanCoinDelta: 0,
        builtThisTurn: true,
    });
    assert.deepStrictEqual(GameBuildPolicy.cardBuildTransition(2, 5), {
        purchaseCoinDelta: -2,
        loanCoinDelta: 5,
        builtThisTurn: true,
    });
    assert.throws(() => GameBuildPolicy.cardBuildTransition(NaN), /must be finite/);
    assert.strictEqual(Object.isFrozen(GameBuildPolicy.cardBuildTransition(1)), true);
});

runTest('game build policyはlandmark購入結果をdetached transitionにする', () => {
    assert.deepStrictEqual(GameBuildPolicy.landmarkBuildTransition('駅', 4), {
        landmarkName: '駅',
        coinDelta: -4,
        builtThisTurn: true,
    });
    assert.throws(() => GameBuildPolicy.landmarkBuildTransition(null, 4), /required/);
    assert.throws(() => GameBuildPolicy.landmarkBuildTransition('駅', Infinity), /required/);
});
