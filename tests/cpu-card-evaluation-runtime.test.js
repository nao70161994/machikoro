const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CPUCardEvaluationRuntime } = require('../js/cpuCardEvaluationRuntime');
const { runTest } = require('./helpers/test-utils');

const DELEGATED_METHODS = Object.freeze([
    'evalCard',
    '_expertRollIncomeCap',
    '_estimateOwnRollIncome',
    '_scoreExpertRollCapPenalty',
    '_singleDiceFreq',
    '_doubleDiceFreq',
    '_diceFreqForRoller',
    '_cardDiceFreq',
    '_diceFreq',
    '_baseCardEfficiency',
    'sortAffordable',
    '_scoreExpertCardCandidate',
    '_cardSpamPenalty',
    '_duplicateRenovationPenalty',
    '_strongRolePressure',
    '_normalSafetyAdjustment',
    '_economyBalancePenalty',
    '_strongConditionalCardAdjustment',
    '_strongLandmarkThresholdPenalty',
    '_strongTempoValueBonus',
    '_strongCrowdOneDieOpponents',
    '_strongCrowdAttackScale',
    '_isStrongCrowd',
    '_strongPurpleAdjustment',
    '_landmarkCardSynergyBonus',
    '_strongPremiumPurpleReady',
    '_strongCrowdPurchaseScore',
    '_strongLandmarkUrgencyBonus',
    '_strongSoftCapValue',
    '_strongCrowdDisruptionReady',
    '_strongCrowdPremiumPurple',
    '_scoreAffordablePurchase',
    '_sortAffordableForDifficulty',
    '_bestAffordableLandmark',
    '_strongTargetLandmark',
    '_strongAttackUnlocked',
    '_bestStrongEconomyCard',
    '_shouldStrongBuyAttackCard',
    '_bestCrowdEconomyCard',
    '_scoreExpertCrowdAffordable',
    '_landmarkUrgency',
    '_coinsTowardsNextLandmark',
    '_estimateCleaningValue',
    '_estimateMoverValue',
    '_estimateTvTargetValue',
    '_estimateTvValue',
    '_estimateBusinessValue',
    '_estimatePublisherValue',
    '_estimateTaxOfficeValue',
    '_estimateItStartupValue',
    '_estimateConditionalRedValue',
    '_estimateRenovationValue',
    '_estimateParkValue',
    '_estimateLoanBurdenValue',
    '_exchangeReceivedCardValue',
    '_exchangeOwnedCardValue',
    '_opponentDilutionFactor',
    '_receivedCardValue',
    '_cardDependencyValue',
    '_ownedCardValue',
    '_builtLandmarkValue',
]);

runTest('CPU card evaluation runtime は移行した評価APIを一つの境界で所有する', () => {
    assert.deepStrictEqual(Object.keys(CPUCardEvaluationRuntime), [...DELEGATED_METHODS]);
});

runTest('CPU card evaluation runtime は基本頻度と人数希釈をpure helperへ同値委譲する', () => {
    const calls = [];
    global.CPUEvaluation = {
        singleDiceFrequency(values) { calls.push(['dice', values]); return 0.5; },
        opponentDilutionFactor(count) { calls.push(['players', count]); return 0.25; },
    };
    const diceNums = [1, 2];
    assert.strictEqual(CPUCardEvaluationRuntime._singleDiceFreq({}, diceNums), 0.5);
    assert.strictEqual(CPUCardEvaluationRuntime._opponentDilutionFactor({}, { players: [{}, {}, {}, {}] }), 0.25);
    assert.deepStrictEqual(calls, [['dice', diceNums], ['players', 4]]);
});

runTest('CPU.jsのカード・購入・妨害評価APIはruntime境界への薄いdelegateになる', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/CPU.js'), 'utf8');
    for (const name of DELEGATED_METHODS) {
        const marker = `return CPUCardEvaluationRuntime.${name}(this`;
        assert.strictEqual(source.split(marker).length - 1, 1, `${name} delegate`);
    }
});
