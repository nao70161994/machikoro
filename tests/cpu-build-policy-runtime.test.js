const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CPUBuildPolicyRuntime } = require('../js/cpuBuildPolicyRuntime');
const { runTest } = require('./helpers/test-utils');

const DELEGATED_METHODS = Object.freeze([
    '_tryEndgameBuild',
    '_chooseExpertV2SimpleITInvest',
    '_buyWinningLandmark',
    '_listExpertV2SimpleAffordableLandmarks',
    '_listExpertV2SimpleAffordableCards',
    '_shouldCompareExpertV2SimpleLandmarkWithCards',
    '_shouldForceExpertV2SimpleLandmarkProgress',
    '_expertV2SimpleLandmarkOverrideMargin',
    '_scoreExpertV2SimpleCardOptionForLandmarkComparison',
    '_expertV2SimpleLandmarkCardPenalty',
    '_scoreExpertV2SimpleLandmarkOption',
    '_expertV2SimpleLandmarkEffectBonus',
    '_sameExpertV2SimpleBuildOption',
    '_expertV2SimpleLateBasicDuplicatePenalty',
    '_expertV2SimpleRedOpponentTurnBonus',
    '_expertV2SimpleRedOpponentFutureValue',
    '_expertV2SimpleRenovationRiskPenalty',
    '_expertV2SimpleBuildTempoBonus',
    '_expertV2SimpleComboUnlockBonus',
    '_expertV2SimpleFuturePayoffCards',
    '_expertV2SimpleMarginalComboIncome',
    '_buyLateGameLandmark',
    '_shouldExpertForceLandmarkPlan',
    '_shouldExpertStopBuyingCards',
    '_shouldHoldForLandmark',
    '_maybeBuyLandmark',
    '_trySynergy',
]);

runTest('CPU build policy runtime は移行したbuild判断APIを一つの境界で所有する', () => {
    assert.deepStrictEqual(Object.keys(CPUBuildPolicyRuntime), [...DELEGATED_METHODS]);
});

runTest('CPU build policy runtime はlandmark比較targetの既存分岐を維持する', () => {
    global.LANDMARK_NAMES = Object.freeze({ HARBOR: 'harbor', SHOPPING_MALL: 'mall' });
    const cpu = { expertLandmarkCardCompareTargets: 'harbor' };
    assert.strictEqual(CPUBuildPolicyRuntime._shouldCompareExpertV2SimpleLandmarkWithCards(cpu, 'harbor'), true);
    assert.strictEqual(CPUBuildPolicyRuntime._shouldCompareExpertV2SimpleLandmarkWithCards(cpu, 'mall'), false);
    cpu.expertLandmarkCardCompareTargets = 'all';
    assert.strictEqual(CPUBuildPolicyRuntime._shouldCompareExpertV2SimpleLandmarkWithCards(cpu, 'other'), true);
    cpu.expertLandmarkCardCompareTargets = 'none';
    assert.strictEqual(CPUBuildPolicyRuntime._shouldCompareExpertV2SimpleLandmarkWithCards(cpu, 'harbor'), false);
});

runTest('CPU.jsのbuild policy APIはruntime境界への薄いdelegateになる', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/CPU.js'), 'utf8');
    for (const name of DELEGATED_METHODS) {
        const marker = `return CPUBuildPolicyRuntime.${name}(this`;
        assert.strictEqual(source.split(marker).length - 1, 1, `${name} delegate`);
    }
});
