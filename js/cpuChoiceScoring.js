'use strict';

const CPUChoiceScoring = Object.freeze({
    scoreExpertChoiceState(cpu, game, focusIndex) {
        return cpu._profileMeasure("expert.choiceState", () =>
            CPUEvaluation.expertChoiceScore({
                positionScore: () => cpu._evaluatePosition(game, focusIndex),
                hasWinner: () => !!game.checkWinner(),
                shouldUseLookahead: () => cpu._shouldUseExpertChoiceLookahead(game, focusIndex),
                lookaheadScore: () => cpu._profileMeasure("expert.choiceLookahead", () =>
                    cpu._simulateLookahead(
                        game,
                        cpu._simulationShopStock(game.players.length),
                        focusIndex,
                        cpu._expertLookaheadSteps(game, focusIndex, game.players.length * 2)
                    )
                ),
                lookaheadWeight: cpu.expertTuning.lookaheadWeight,
            })
        );
    },

    shouldUseExpertChoiceLookahead(cpu, game, focusIndex) {
        const player = game.players[focusIndex];
        const remainingLandmarks = [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length;
        return CPUEvaluation.shouldUseExpertChoiceLookahead(
            game.players.length, remainingLandmarks, game.phase, GAME_PHASES.BUILD, cpu.simulationMode
        );
    },

    expectedExpertChoiceValue(cpu, game, focusIndex, outcomes, applyOutcome) {
        return cpu._profileMeasure("expert.expectedChoiceValue", () =>
            CPUEvaluation.expectedOutcomeValue(outcomes, outcome => {
                const clone = cpu._cloneGame(game);
                applyOutcome(clone, outcome);
                return cpu._scoreExpertChoiceState(clone, focusIndex);
            })
        );
    },

    scoreExpertPendingChoice(cpu, game, applyChoice) {
        const focusIndex = game.currentPlayerIndex;
        const clone = cpu._cloneGame(game);
        applyChoice(clone);
        return cpu._scoreExpertChoiceState(clone, focusIndex);
    },

    scoreStrongPendingChoice(cpu, game, applyChoice) {
        const focusIndex = game.currentPlayerIndex;
        const clone = cpu._cloneGame(game);
        applyChoice(clone);
        return cpu._scoreStrongChoiceState(clone, focusIndex);
    },

    estimatePurchasePlanValue(cpu, player, game, difficulty = cpu.difficulty) {
        const playerIndex = game && game.players ? game.players.indexOf(player) : -1;
        const cacheKey = playerIndex >= 0 ? `${difficulty}:${playerIndex}` : null;
        if (cacheKey) {
            const cache = cpu._stateEvaluationCache(game);
            if (cacheKey in cache.purchasePlanValues) return cache.purchasePlanValues[cacheKey];
            const value = cpu._estimatePurchasePlanValueUncached(player, game, difficulty);
            cache.purchasePlanValues[cacheKey] = value;
            return value;
        }
        return cpu._estimatePurchasePlanValueUncached(player, game, difficulty);
    },

    estimatePurchasePlanValueUncached(cpu, player, game, difficulty = cpu.difficulty) {
        const bestLandmark = cpu._bestAffordableLandmark(player, game);
        const affordable = CARDS.filter(card =>
            player.coins >= card.cost &&
            card.cost > 0 &&
            !(card.color === "purple" && player.countCardIncludingDormant(card.name) > 0)
        );
        const ranked = cpu._sortAffordableForDifficulty(affordable, game, player, difficulty);
        const bestCard = ranked[0] ? ranked[0].score : -Infinity;
        return CPUEvaluation.purchasePlanValue({
            bestCardScore: bestCard,
            bestLandmark,
            coins: player.coins,
        });
    },

    scoreStrongChoiceState(cpu, game, focusIndex) {
        const withStableSignature = globalThis.CPUEvaluationCache &&
            globalThis.CPUEvaluationCache.withStableSignature;
        const evaluate = () =>
            cpu._profileMeasure("strong.choiceState", () => {
                const player = game.players[focusIndex];
                const landmarkPressure = cpu._isEndgameMode(player, game, 2) ? 6 : 0;
                const purchasePlanValue = cpu._profileMeasure(
                    "strong.choiceState.purchasePlan",
                    () => cpu._estimatePurchasePlanValue(player, game, "strong")
                );
                const turnValue = cpu._profileMeasure(
                    "strong.choiceState.turnValue",
                    () => cpu._estimatePlayerTurnValue(game, focusIndex)
                );
                const winDistance = cpu._profileMeasure(
                    "strong.choiceState.winDistance",
                    () => cpu._estimateWinDistance(player, game)
                );
                const redPressure = cpu._profileMeasure(
                    "strong.choiceState.redPressure",
                    () => cpu._estimateRedPressure(game, focusIndex)
                );
                return CPUEvaluation.strongChoiceScore({
                    purchasePlanValue,
                    turnValue,
                    coins: player.coins,
                    builtLandmarkCount: player.builtLandmarkCount(),
                    landmarkPressure,
                    winDistance,
                    redPressure,
                    duplicateRenovationPenalty: cpu._duplicateRenovationPenalty(player, "strong", game),
                });
            });
        return typeof withStableSignature === 'function'
            ? withStableSignature(cpu, game, evaluate)
            : evaluate();
    },

    expectedStrongChoiceValue(cpu, game, focusIndex, outcomes, applyOutcome) {
        return cpu._profileMeasure("strong.expectedChoiceValue", () =>
            CPUEvaluation.expectedOutcomeValue(outcomes, outcome => {
                const clone = cpu._cloneGame(game);
                applyOutcome(clone, outcome);
                return cpu._scoreStrongChoiceState(clone, focusIndex);
            })
        );
    },
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPUChoiceScoring };
if (typeof window !== 'undefined') window.CPUChoiceScoring = CPUChoiceScoring;
if (typeof globalThis !== 'undefined') globalThis.CPUChoiceScoring = CPUChoiceScoring;
