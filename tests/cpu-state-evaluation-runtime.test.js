const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CPUStateEvaluationRuntime } = require('../js/cpuStateEvaluationRuntime');
const { runTest } = require('./helpers/test-utils');

const DELEGATED_METHODS = Object.freeze([
    '_playerCountProfile',
    '_expertProfileName',
    '_syncExpertTuningForGame',
    '_expertCrowdNormalPlan',
    '_expertCrowdDisruptionBonus',
    '_expertCrowdCleaningWeight',
    '_expertDisruptionScale',
    '_closestLandmarkShortfall',
    '_lookaheadTerminalHeuristic',
    '_tvLandmarkDenialValue',
    '_expertCandidateTargetIndexes',
    '_expertCandidateCleaningNames',
    '_cardActivationValue',
    '_estimateRollScore',
    '_estimateOpponentRedRisk',
    '_estimateRiskAdjustedRollScore',
    '_expertV2CappedPositiveIncome',
    '_cardSelfIncomeValue',
    '_expectedDiceScore',
    '_expectedDiceScoreWithHarbor',
    '_diceOutcomeWeights',
    '_expertLookaheadSteps',
    '_crowdLeaderBonus',
    '_crowdCleaningBonus',
    '_remainingEnabledLandmarks',
    '_isEndgameMode',
    '_strongLiteUseHeuristicChoices',
    '_expertV2SimpleStrongCrowdDiceThreshold',
    '_scoreExpertV2SimpleTVTarget',
    '_scoreExpertV2SimpleCleaningValue',
    '_estimatePlayerTurnValue',
    '_estimatePlayerTurnScorePair',
    '_countReachableLandmarks',
    '_isProgressIncomeCard',
    '_estimateStableIncome',
    '_estimateProgressIncome',
    '_estimateWinDistance',
    '_estimateWinDistanceUncached',
    '_estimateRedPressure',
    '_estimateOpponentThreat',
    '_estimateOpponentThreatUncached',
    '_bestOpponentWinDistance',
    '_evaluatePosition',
    '_scoreExpertCardPenalty',
    '_scoreExpertLandmarkDelayPenalty',
    '_scoreExpertFutureLandmarkHoldPenalty',
    '_expertPremiumPurpleReady',
    '_expertBuildCandidateLimit',
    '_listExpertBuildOptions',
    '_listStrongBuildOptions',
]);

runTest('CPU state evaluation runtime は移行した盤面評価APIを一つの境界で所有する', () => {
    assert.deepStrictEqual(Object.keys(CPUStateEvaluationRuntime), [...DELEGATED_METHODS]);
});

runTest('CPU state evaluation runtime はstrong liteとcrowd thresholdの既存短絡を維持する', () => {
    assert.strictEqual(
        CPUStateEvaluationRuntime._strongLiteUseHeuristicChoices({ difficulty: 'strong', simulationMode: 'lite' }),
        true
    );
    assert.strictEqual(
        CPUStateEvaluationRuntime._strongLiteUseHeuristicChoices({ difficulty: 'expert', simulationMode: 'lite' }),
        false
    );
    const game = {
        currentPlayerIndex: 0,
        players: [
            { difficulty: 'expert' },
            { difficulty: 'strong' },
            { difficulty: 'normal' },
            { difficulty: 'strong' },
        ],
    };
    assert.strictEqual(
        CPUStateEvaluationRuntime._expertV2SimpleStrongCrowdDiceThreshold({ expertOpponentDifficulties: null }, game),
        true
    );
});

runTest('CPU.jsの盤面・roll・勝利距離評価APIはruntime境界への薄いdelegateになる', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/CPU.js'), 'utf8');
    for (const name of DELEGATED_METHODS) {
        const marker = `return CPUStateEvaluationRuntime.${name}(this`;
        assert.strictEqual(source.split(marker).length - 1, 1, `${name} delegate`);
    }
});
