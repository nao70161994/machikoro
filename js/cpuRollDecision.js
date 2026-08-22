'use strict';

const CPURollProfileApi = typeof module !== 'undefined' && module.exports
    ? require('./cpuProfile').CPUProfile
    : globalThis.CPUProfile;
const CPUReasonCodes = typeof module !== 'undefined' && module.exports
    ? require('./cpuActionProposal').CPU_DECISION_REASON_CODES
    : globalThis.CPUActionProposal.reasonCodes;

function largeCrowdRollMode(cpu, game) {
    const playerCount = game && Array.isArray(game.players) ? game.players.length : 0;
    if (cpu && cpu.difficulty === 'strong' && cpu.largeCrowdRollMode === 'normal' &&
            CPURollProfileApi.strongUsesNormalTrioPolicy(playerCount)) return 'normal';
    if (cpu && cpu.difficulty === 'expert' &&
            typeof cpu._isLiveExpert === 'function' && cpu._isLiveExpert() &&
            CPURollProfileApi.expertUsesStrongCrowdPolicy(playerCount)) return 'normal';
    return CPURollProfileApi.largeCrowdMode(playerCount, cpu.largeCrowdRollMode);
}

function recordScoreDecision(cpu, code, values, choice) {
    if (cpu && typeof cpu._recordDecisionReason === 'function') {
        cpu._recordDecisionReason(code, values);
    }
    return choice;
}

function recordDiceScoreDecision(cpu, oneScore, twoScore, threshold, choice) {
    return recordScoreDecision(cpu, CPUReasonCodes.DICE_SCORE_COMPARISON, {
        oneScore,
        twoScore,
        threshold,
    }, choice);
}

function recordRerollScoreDecision(cpu, keepScore, rerollScore, threshold, choice) {
    return recordScoreDecision(cpu, CPUReasonCodes.REROLL_SCORE_COMPARISON, {
        keepScore,
        rerollScore,
        threshold,
    }, choice);
}

function recordHarborScoreDecision(cpu, keepScore, bonusScore, threshold, choice) {
    return recordScoreDecision(cpu, CPUReasonCodes.HARBOR_SCORE_COMPARISON, {
        keepScore,
        bonusScore,
        threshold,
    }, choice);
}

const CPURollDecision = Object.freeze({
    chooseDiceCount(cpu, game) {
        return cpu._profileDecision("chooseDiceCount", () => {
            if (largeCrowdRollMode(cpu, game) === "normal") {
                const oneScore = cpu._expectedDiceScore(game, false);
                const twoScore = cpu._expectedDiceScore(game, true);
                return recordDiceScoreDecision(cpu, oneScore, twoScore, 0.8, twoScore > oneScore + 0.8);
            }
            if (cpu._isExpertV2Simple()) {
                const current = game.currentPlayer();
                if (!current.landmarks[LANDMARK_NAMES.STATION]) return false;
                if (cpu.expertDiceMode === "random") {
                    return recordScoreDecision(cpu, CPUReasonCodes.RANDOM_CHOICE, { optionCount: 2 }, Math.random() < 0.5);
                }
                const oneScore = cpu._expectedDiceScoreWithHarbor(game, false);
                const twoScore = cpu._expectedDiceScoreWithHarbor(game, true);
                if (cpu.expertDiceMode === "crowdThreshold" && game.players.length >= 4) {
                    const threshold = cpu._strongCrowdOneDieOpponents(game) >= 2 ? 1.5 : 0.8;
                    return recordDiceScoreDecision(cpu, oneScore, twoScore, threshold, twoScore > oneScore + threshold);
                }
                if (cpu.expertDiceMode === "strongCrowdThreshold" && cpu._expertV2SimpleStrongCrowdDiceThreshold(game)) {
                    const threshold = cpu._strongCrowdOneDieOpponents(game) >= 2 ? 1.5 : 0.8;
                    return recordDiceScoreDecision(cpu, oneScore, twoScore, threshold, twoScore > oneScore + threshold);
                }
                return recordDiceScoreDecision(cpu, oneScore, twoScore, 0, twoScore >= oneScore);
            }
            cpu._syncExpertTuningForGame(game);
            if (cpu.difficulty === "weak") {
                return recordScoreDecision(cpu, CPUReasonCodes.RANDOM_CHOICE, { optionCount: 2 }, Math.random() < 0.5);
            }
            if (cpu.difficulty === "expert") {
                if (cpu._expertCrowdNormalPlan(game)) {
                    const oneScore = cpu._expectedDiceScore(game, false);
                    const twoScore = cpu._expectedDiceScore(game, true);
                    return recordDiceScoreDecision(cpu, oneScore, twoScore, 0.8, twoScore > oneScore + 0.8);
                }
                const focusIndex = game.currentPlayerIndex;
                const oneScore = cpu._expectedExpertChoiceValue(
                    game,
                    focusIndex,
                    cpu._diceOutcomeWeights(false),
                    (clone, outcome) => clone.selectDiceCount(false, outcome.dice1, null, [outcome.dice1, outcome.dice1])
                );
                const twoScore = cpu._expectedExpertChoiceValue(
                    game,
                    focusIndex,
                    cpu._diceOutcomeWeights(true),
                    (clone, outcome) => clone.selectDiceCount(true, outcome.dice1, outcome.dice2, [outcome.dice1, outcome.dice2])
                );
                if (cpu._expertFlagEnabled("diceCloserDiscipline")) {
                    const current = game.players[focusIndex];
                    const shortfall = cpu._closestLandmarkShortfall(current, game);
                    const remainingLandmarks = [...game.enabledLandmarks].filter(name => !current.landmarks[name]).length;
                    if (remainingLandmarks <= 2 && shortfall <= 3 && twoScore <= oneScore + 1.2) {
                        return recordDiceScoreDecision(cpu, oneScore, twoScore, 1.2, false);
                    }
                }
                return recordDiceScoreDecision(cpu, oneScore, twoScore, 0, twoScore >= oneScore);
            }
            if (cpu.difficulty === "strong") {
                if (cpu._strongLiteUseHeuristicChoices()) {
                    const oneScore = cpu._expectedDiceScoreWithHarbor(game, false);
                    const twoScore = cpu._expectedDiceScoreWithHarbor(game, true);
                    if (game.players.length >= 4) {
                        const threshold = cpu._strongCrowdOneDieOpponents(game) >= 2 ? 1.5 : 0.8;
                        return recordDiceScoreDecision(cpu, oneScore, twoScore, threshold, twoScore > oneScore + threshold);
                    }
                    return recordDiceScoreDecision(cpu, oneScore, twoScore, 0, twoScore >= oneScore);
                }
                if (game.players.length >= 4) {
                    const oneScore = cpu._expectedDiceScore(game, false);
                    const twoScore = cpu._expectedDiceScore(game, true);
                    const threshold = cpu._strongCrowdOneDieOpponents(game) >= 2 ? 1.5 : 0.8;
                    return recordDiceScoreDecision(cpu, oneScore, twoScore, threshold, twoScore > oneScore + threshold);
                }
                const focusIndex = game.currentPlayerIndex;
                const oneScore = cpu._profileMeasure("strong.chooseDiceCount.oneScore", () =>
                    cpu._expectedStrongChoiceValue(
                        game,
                        focusIndex,
                        cpu._diceOutcomeWeights(false),
                        (clone, outcome) => clone.selectDiceCount(false, outcome.dice1, null, [outcome.dice1, outcome.dice1])
                    )
                );
                const twoScore = cpu._profileMeasure("strong.chooseDiceCount.twoScore", () =>
                    cpu._expectedStrongChoiceValue(
                        game,
                        focusIndex,
                        cpu._diceOutcomeWeights(true),
                        (clone, outcome) => clone.selectDiceCount(true, outcome.dice1, outcome.dice2, [outcome.dice1, outcome.dice2])
                    )
                );
                return recordDiceScoreDecision(cpu, oneScore, twoScore, 0, twoScore >= oneScore);
            }
            const oneScore = cpu._expectedDiceScore(game, false);
            const twoScore = cpu._expectedDiceScore(game, true);
            if (cpu.difficulty === "normal") {
                return recordDiceScoreDecision(cpu, oneScore, twoScore, 0.8, twoScore > oneScore + 0.8);
            }
            return recordDiceScoreDecision(cpu, oneScore, twoScore, 0, twoScore >= oneScore);
        });
    },

    chooseReroll(cpu, game) {
        return cpu._profileDecision("chooseReroll", () => {
            if (largeCrowdRollMode(cpu, game) === "normal") {
                const currentScore = cpu._estimateRollScore(game, game.lastDiceResult);
                const rerollScore = cpu._expectedDiceScore(game, game.lastDice2 > 0);
                return recordRerollScoreDecision(cpu, currentScore, rerollScore, 1.2, rerollScore > currentScore + 1.2);
            }
            if (cpu._isExpertV2Simple()) {
                if (cpu.expertRerollMode === "random") {
                    return recordScoreDecision(cpu, CPUReasonCodes.RANDOM_CHOICE, { optionCount: 2 }, Math.random() < 0.5);
                }
                const dice = game.lastDiceResult;
                const usingTwoDice = game.lastDice2 > 0;
                const keepScore = (currentDice => {
                    if (game.currentPlayer().landmarks[LANDMARK_NAMES.HARBOR] && currentDice >= 10) {
                        return Math.max(cpu._estimateRiskAdjustedRollScore(game, currentDice), cpu._estimateRiskAdjustedRollScore(game, currentDice + 2));
                    }
                    return cpu._estimateRiskAdjustedRollScore(game, currentDice);
                })(dice);
                const rerollScore = cpu._expectedDiceScoreWithHarbor(game, usingTwoDice);
                return recordRerollScoreDecision(cpu, keepScore, rerollScore, cpu.expertRerollMargin, rerollScore > keepScore + cpu.expertRerollMargin);
            }
            cpu._syncExpertTuningForGame(game);
            const dice = game.lastDiceResult;
            if (cpu.difficulty === "weak") {
                return recordScoreDecision(cpu, CPUReasonCodes.RANDOM_CHOICE, { optionCount: 2 }, Math.random() < 0.5);
            }
            if (cpu.difficulty === "expert") {
                if (cpu._expertCrowdNormalPlan(game)) {
                    const currentScore = cpu._estimateRollScore(game, dice);
                    const usingTwoDice = game.lastDice2 > 0;
                    const rerollScore = cpu._expectedDiceScore(game, usingTwoDice);
                    return recordRerollScoreDecision(cpu, currentScore, rerollScore, 1.2, rerollScore > currentScore + 1.2);
                }
                const focusIndex = game.currentPlayerIndex;
                const usingTwoDice = game.lastDice2 > 0;
                const keepScore = cpu._expectedExpertChoiceValue(
                    game,
                    focusIndex,
                    [{ weight: 1, dice1: game.lastDice1 || game.lastDiceResult, dice2: game.lastDice2 || 0 }],
                    (clone) => clone.skipReroll()
                );
                const rerollScore = cpu._expectedExpertChoiceValue(
                    game,
                    focusIndex,
                    cpu._diceOutcomeWeights(usingTwoDice),
                    (clone, outcome) => clone.rerollDice(outcome.total, [outcome.dice1, outcome.dice2 || outcome.dice1])
                );
                if (cpu._expertFlagEnabled("rerollCloserDiscipline")) {
                    const current = game.players[focusIndex];
                    const remainingLandmarks = [...game.enabledLandmarks].filter(name => !current.landmarks[name]).length;
                    const shortfall = cpu._closestLandmarkShortfall(current, game);
                    if (remainingLandmarks <= 2 && shortfall <= 3 && keepScore >= rerollScore - 1.5) {
                        return recordRerollScoreDecision(cpu, keepScore, rerollScore, -1.5, false);
                    }
                }
                return recordRerollScoreDecision(cpu, keepScore, rerollScore, 0, rerollScore > keepScore);
            }
            if (cpu.difficulty === "strong") {
                if (cpu._strongLiteUseHeuristicChoices()) {
                    const currentScore = cpu._estimateRollScore(game, dice);
                    const usingTwoDice = game.lastDice2 > 0;
                    const rerollScore = cpu._expectedDiceScoreWithHarbor(game, usingTwoDice);
                    if (game.players.length >= 4) {
                        if (!usingTwoDice && dice <= 6 && cpu._strongCrowdOneDieOpponents(game) >= 2) {
                            return recordRerollScoreDecision(cpu, currentScore, rerollScore, 2.2, rerollScore > currentScore + 2.2);
                        }
                        return recordRerollScoreDecision(cpu, currentScore, rerollScore, 1.2, rerollScore > currentScore + 1.2);
                    }
                    return recordRerollScoreDecision(cpu, currentScore, rerollScore, 0.2, rerollScore > currentScore + 0.2);
                }
                if (game.players.length >= 4) {
                    const currentScore = cpu._estimateRollScore(game, dice);
                    const usingTwoDice = game.lastDice2 > 0;
                    const rerollScore = cpu._expectedDiceScore(game, usingTwoDice);
                    if (!usingTwoDice && dice <= 6 && cpu._strongCrowdOneDieOpponents(game) >= 2) {
                        return recordRerollScoreDecision(cpu, currentScore, rerollScore, 2.2, rerollScore > currentScore + 2.2);
                    }
                    return recordRerollScoreDecision(cpu, currentScore, rerollScore, 1.2, rerollScore > currentScore + 1.2);
                }
                const focusIndex = game.currentPlayerIndex;
                const usingTwoDice = game.lastDice2 > 0;
                const keepScore = cpu._profileMeasure("strong.chooseReroll.keepScore", () =>
                    cpu._expectedStrongChoiceValue(
                        game,
                        focusIndex,
                        [{ weight: 1, dice1: game.lastDice1 || game.lastDiceResult, dice2: game.lastDice2 || 0 }],
                        (clone) => clone.skipReroll()
                    )
                );
                const rerollScore = cpu._profileMeasure("strong.chooseReroll.rerollScore", () =>
                    cpu._expectedStrongChoiceValue(
                        game,
                        focusIndex,
                        cpu._diceOutcomeWeights(usingTwoDice),
                        (clone, outcome) => clone.rerollDice(outcome.total, [outcome.dice1, outcome.dice2 || outcome.dice1])
                    )
                );
                return recordRerollScoreDecision(cpu, keepScore, rerollScore, 0.2, rerollScore > keepScore + 0.2);
            }
            const currentScore = cpu._estimateRollScore(game, dice);
            const usingTwoDice = game.lastDice2 > 0;
            const rerollScore = cpu._expectedDiceScore(game, usingTwoDice);
            if (cpu.difficulty === "normal") {
                return recordRerollScoreDecision(cpu, currentScore, rerollScore, 1.2, rerollScore > currentScore + 1.2);
            }
            return recordRerollScoreDecision(cpu, currentScore, rerollScore, 0.3, rerollScore > currentScore + 0.3);
        });
    },

    chooseHarbor(cpu, game) {
        return cpu._profileDecision("chooseHarbor", () => {
            if (largeCrowdRollMode(cpu, game) === "normal") {
                const keepScore = cpu._estimateRollScore(game, game.lastDiceResult);
                const bonusScore = cpu._estimateRollScore(game, game.lastDiceResult + 2);
                return recordHarborScoreDecision(cpu, keepScore, bonusScore, 0.5, bonusScore > keepScore + 0.5);
            }
            if (cpu._isExpertV2Simple()) {
                if (cpu.expertHarborMode === "random") {
                    return recordScoreDecision(cpu, CPUReasonCodes.RANDOM_CHOICE, { optionCount: 2 }, Math.random() < 0.5);
                }
                const keepScore = cpu._estimateRiskAdjustedRollScore(game, game.lastDiceResult);
                const bonusScore = cpu._estimateRiskAdjustedRollScore(game, game.lastDiceResult + 2);
                return recordHarborScoreDecision(cpu, keepScore, bonusScore, cpu.expertHarborMargin, bonusScore >= keepScore + cpu.expertHarborMargin);
            }
            cpu._syncExpertTuningForGame(game);
            if (cpu.difficulty === "weak") {
                return recordScoreDecision(cpu, CPUReasonCodes.RANDOM_CHOICE, { optionCount: 2 }, Math.random() < 0.5);
            }
            if (cpu.difficulty === "expert") {
                if (cpu._expertCrowdNormalPlan(game)) {
                    const keepScore = cpu._estimateRollScore(game, game.lastDiceResult);
                    const bonusScore = cpu._estimateRollScore(game, game.lastDiceResult + 2);
                    return recordHarborScoreDecision(cpu, keepScore, bonusScore, 0.5, bonusScore > keepScore + 0.5);
                }
                const focusIndex = game.currentPlayerIndex;
                const outcomes = [{ weight: 1, tunaDice: game.pendingTunaDice || [game.lastDice1 || 1, game.lastDice2 || 1] }];
                const keepScore = cpu._expectedExpertChoiceValue(
                    game,
                    focusIndex,
                    outcomes,
                    (clone, outcome) => clone.resolveHarbor(false, outcome.tunaDice)
                );
                const bonusScore = cpu._expectedExpertChoiceValue(
                    game,
                    focusIndex,
                    outcomes,
                    (clone, outcome) => clone.resolveHarbor(true, outcome.tunaDice)
                );
                return recordHarborScoreDecision(cpu, keepScore, bonusScore, 0, bonusScore >= keepScore);
            }
            if (cpu.difficulty === "strong") {
                if (cpu._strongLiteUseHeuristicChoices()) {
                    const keepScore = cpu._estimateRollScore(game, game.lastDiceResult);
                    const bonusScore = cpu._estimateRollScore(game, game.lastDiceResult + 2);
                    if (game.players.length >= 4) {
                        const threshold = cpu._strongCrowdOneDieOpponents(game) >= 2 && game.lastDiceResult <= 6 ? 0.8 : 0.3;
                        return recordHarborScoreDecision(cpu, keepScore, bonusScore, threshold, bonusScore > keepScore + threshold);
                    }
                    return recordHarborScoreDecision(cpu, keepScore, bonusScore, 0, bonusScore >= keepScore);
                }
                if (game.players.length >= 4) {
                    const keepScore = cpu._estimateRollScore(game, game.lastDiceResult);
                    const bonusScore = cpu._estimateRollScore(game, game.lastDiceResult + 2);
                    const threshold = cpu._strongCrowdOneDieOpponents(game) >= 2 && game.lastDiceResult <= 6 ? 0.8 : 0.3;
                    return recordHarborScoreDecision(cpu, keepScore, bonusScore, threshold, bonusScore > keepScore + threshold);
                }
                const focusIndex = game.currentPlayerIndex;
                const outcomes = [{ weight: 1, tunaDice: game.pendingTunaDice || [game.lastDice1 || 1, game.lastDice2 || 1] }];
                const keepScore = cpu._expectedStrongChoiceValue(
                    game,
                    focusIndex,
                    outcomes,
                    (clone, outcome) => clone.resolveHarbor(false, outcome.tunaDice)
                );
                const bonusScore = cpu._expectedStrongChoiceValue(
                    game,
                    focusIndex,
                    outcomes,
                    (clone, outcome) => clone.resolveHarbor(true, outcome.tunaDice)
                );
                return recordHarborScoreDecision(cpu, keepScore, bonusScore, 0, bonusScore >= keepScore);
            }
            const keepScore = cpu._estimateRollScore(game, game.lastDiceResult);
            const bonusScore = cpu._estimateRollScore(game, game.lastDiceResult + 2);
            if (cpu.difficulty === "normal") {
                return recordHarborScoreDecision(cpu, keepScore, bonusScore, 0.5, bonusScore > keepScore + 0.5);
            }
            return recordHarborScoreDecision(cpu, keepScore, bonusScore, 0, bonusScore >= keepScore);
        });
    }
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPURollDecision };
if (typeof globalThis !== 'undefined') globalThis.CPURollDecision = CPURollDecision;
