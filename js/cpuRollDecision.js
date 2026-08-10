'use strict';

const CPURollDecision = Object.freeze({
    chooseDiceCount(cpu, game) {
        return cpu._profileDecision("chooseDiceCount", () => {
            if (cpu._isExpertV2Simple()) {
                const current = game.currentPlayer();
                if (!current.landmarks[LANDMARK_NAMES.STATION]) return false;
                if (cpu.expertDiceMode === "random") return Math.random() < 0.5;
                const oneScore = cpu._expectedDiceScoreWithHarbor(game, false);
                const twoScore = cpu._expectedDiceScoreWithHarbor(game, true);
                if (cpu.expertDiceMode === "crowdThreshold" && game.players.length >= 4) {
                    const threshold = cpu._strongCrowdOneDieOpponents(game) >= 2 ? 1.5 : 0.8;
                    return twoScore > oneScore + threshold;
                }
                if (cpu.expertDiceMode === "strongCrowdThreshold" && cpu._expertV2SimpleStrongCrowdDiceThreshold(game)) {
                    const threshold = cpu._strongCrowdOneDieOpponents(game) >= 2 ? 1.5 : 0.8;
                    return twoScore > oneScore + threshold;
                }
                return twoScore >= oneScore;
            }
            cpu._syncExpertTuningForGame(game);
            if (cpu.difficulty === "weak") return Math.random() < 0.5;
            if (cpu.difficulty === "expert") {
                if (cpu._expertCrowdNormalPlan(game)) {
                    const oneScore = cpu._expectedDiceScore(game, false);
                    const twoScore = cpu._expectedDiceScore(game, true);
                    return twoScore > oneScore + 0.8;
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
                        return false;
                    }
                }
                return twoScore >= oneScore;
            }
            if (cpu.difficulty === "strong") {
                if (cpu._strongLiteUseHeuristicChoices()) {
                    const oneScore = cpu._expectedDiceScoreWithHarbor(game, false);
                    const twoScore = cpu._expectedDiceScoreWithHarbor(game, true);
                    if (game.players.length >= 4) {
                        const threshold = cpu._strongCrowdOneDieOpponents(game) >= 2 ? 1.5 : 0.8;
                        return twoScore > oneScore + threshold;
                    }
                    return twoScore >= oneScore;
                }
                if (game.players.length >= 4) {
                    const oneScore = cpu._expectedDiceScore(game, false);
                    const twoScore = cpu._expectedDiceScore(game, true);
                    const threshold = cpu._strongCrowdOneDieOpponents(game) >= 2 ? 1.5 : 0.8;
                    return twoScore > oneScore + threshold;
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
                return twoScore >= oneScore;
            }
            const oneScore = cpu._expectedDiceScore(game, false);
            const twoScore = cpu._expectedDiceScore(game, true);
            if (cpu.difficulty === "normal") {
                return twoScore > oneScore + 0.8;
            }
            return twoScore >= oneScore;
        });
    },

    chooseReroll(cpu, game) {
        return cpu._profileDecision("chooseReroll", () => {
            if (cpu._isExpertV2Simple()) {
                if (cpu.expertRerollMode === "random") return Math.random() < 0.5;
                const dice = game.lastDiceResult;
                const usingTwoDice = game.lastDice2 > 0;
                const keepScore = (currentDice => {
                    if (game.currentPlayer().landmarks[LANDMARK_NAMES.HARBOR] && currentDice >= 10) {
                        return Math.max(cpu._estimateRiskAdjustedRollScore(game, currentDice), cpu._estimateRiskAdjustedRollScore(game, currentDice + 2));
                    }
                    return cpu._estimateRiskAdjustedRollScore(game, currentDice);
                })(dice);
                const rerollScore = cpu._expectedDiceScoreWithHarbor(game, usingTwoDice);
                return rerollScore > keepScore + cpu.expertRerollMargin;
            }
            cpu._syncExpertTuningForGame(game);
            const dice = game.lastDiceResult;
            if (cpu.difficulty === "weak") return Math.random() < 0.5;
            if (cpu.difficulty === "expert") {
                if (cpu._expertCrowdNormalPlan(game)) {
                    const currentScore = cpu._estimateRollScore(game, dice);
                    const usingTwoDice = game.lastDice2 > 0;
                    const rerollScore = cpu._expectedDiceScore(game, usingTwoDice);
                    return rerollScore > currentScore + 1.2;
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
                        return false;
                    }
                }
                return rerollScore > keepScore;
            }
            if (cpu.difficulty === "strong") {
                if (cpu._strongLiteUseHeuristicChoices()) {
                    const currentScore = cpu._estimateRollScore(game, dice);
                    const usingTwoDice = game.lastDice2 > 0;
                    const rerollScore = cpu._expectedDiceScoreWithHarbor(game, usingTwoDice);
                    if (game.players.length >= 4) {
                        if (!usingTwoDice && dice <= 6 && cpu._strongCrowdOneDieOpponents(game) >= 2) {
                            return rerollScore > currentScore + 2.2;
                        }
                        return rerollScore > currentScore + 1.2;
                    }
                    return rerollScore > currentScore + 0.2;
                }
                if (game.players.length >= 4) {
                    const currentScore = cpu._estimateRollScore(game, dice);
                    const usingTwoDice = game.lastDice2 > 0;
                    const rerollScore = cpu._expectedDiceScore(game, usingTwoDice);
                    if (!usingTwoDice && dice <= 6 && cpu._strongCrowdOneDieOpponents(game) >= 2) {
                        return rerollScore > currentScore + 2.2;
                    }
                    return rerollScore > currentScore + 1.2;
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
                return rerollScore > keepScore + 0.2;
            }
            const currentScore = cpu._estimateRollScore(game, dice);
            const usingTwoDice = game.lastDice2 > 0;
            const rerollScore = cpu._expectedDiceScore(game, usingTwoDice);
            if (cpu.difficulty === "normal") return rerollScore > currentScore + 1.2;
            return rerollScore > currentScore + 0.3;
        });
    },

    chooseHarbor(cpu, game) {
        return cpu._profileDecision("chooseHarbor", () => {
            if (cpu._isExpertV2Simple()) {
                if (cpu.expertHarborMode === "random") return Math.random() < 0.5;
                const keepScore = cpu._estimateRiskAdjustedRollScore(game, game.lastDiceResult);
                const bonusScore = cpu._estimateRiskAdjustedRollScore(game, game.lastDiceResult + 2);
                return bonusScore >= keepScore + cpu.expertHarborMargin;
            }
            cpu._syncExpertTuningForGame(game);
            if (cpu.difficulty === "weak") return Math.random() < 0.5;
            if (cpu.difficulty === "expert") {
                if (cpu._expertCrowdNormalPlan(game)) {
                    const keepScore = cpu._estimateRollScore(game, game.lastDiceResult);
                    const bonusScore = cpu._estimateRollScore(game, game.lastDiceResult + 2);
                    return bonusScore > keepScore + 0.5;
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
                return bonusScore >= keepScore;
            }
            if (cpu.difficulty === "strong") {
                if (cpu._strongLiteUseHeuristicChoices()) {
                    const keepScore = cpu._estimateRollScore(game, game.lastDiceResult);
                    const bonusScore = cpu._estimateRollScore(game, game.lastDiceResult + 2);
                    if (game.players.length >= 4) {
                        const threshold = cpu._strongCrowdOneDieOpponents(game) >= 2 && game.lastDiceResult <= 6 ? 0.8 : 0.3;
                        return bonusScore > keepScore + threshold;
                    }
                    return bonusScore >= keepScore;
                }
                if (game.players.length >= 4) {
                    const keepScore = cpu._estimateRollScore(game, game.lastDiceResult);
                    const bonusScore = cpu._estimateRollScore(game, game.lastDiceResult + 2);
                    const threshold = cpu._strongCrowdOneDieOpponents(game) >= 2 && game.lastDiceResult <= 6 ? 0.8 : 0.3;
                    return bonusScore > keepScore + threshold;
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
                return bonusScore >= keepScore;
            }
            const keepScore = cpu._estimateRollScore(game, game.lastDiceResult);
            const bonusScore = cpu._estimateRollScore(game, game.lastDiceResult + 2);
            if (cpu.difficulty === "normal") return bonusScore > keepScore + 0.5;
            return bonusScore >= keepScore;
        });
    }
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPURollDecision };
if (typeof globalThis !== 'undefined') globalThis.CPURollDecision = CPURollDecision;
