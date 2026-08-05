'use strict';

const CPUBuildScoring = Object.freeze({
    _scoreExpertV2SimpleBuildOptionBreakdown(cpu, game, option, shopStock = null) {
        const clone = cpu._cloneGame(game);
        const current = clone.currentPlayer();
        if (option.type === 'landmark') {
            current.coins -= Player.landmarkCost(option.name);
            current.landmarks[option.name] = true;
        } else {
            current.coins -= option.card.cost;
            current.cards.push(cpu._cardByName(option.card.name));
        }
        const oneScore = cpu._expectedDiceScoreWithHarbor(clone, false);
        const twoScore = current.landmarks[LANDMARK_NAMES.STATION]
            ? cpu._expectedDiceScoreWithHarbor(clone, true)
            : -Infinity;
        const baseEv = Math.max(oneScore, twoScore);
        const beforeOneScore = cpu._expectedDiceScoreWithHarbor(game, false);
        const beforeTwoScore = game.currentPlayer().landmarks[LANDMARK_NAMES.STATION]
            ? cpu._expectedDiceScoreWithHarbor(game, true)
            : -Infinity;
        const deltaEv = baseEv - Math.max(beforeOneScore, beforeTwoScore);
        const comboUnlockBonus = cpu._expertV2SimpleComboUnlockBonus(game, option, shopStock);
        const tempoBonus = cpu._expertV2SimpleBuildTempoBonus(clone);
        const redOpponentTurnBonus = cpu._expertV2SimpleRedOpponentTurnBonus(game, option);
        const lateBasicDuplicatePenalty = cpu._expertV2SimpleLateBasicDuplicatePenalty(game, option, deltaEv);
        const renovationRiskPenalty = cpu._expertV2SimpleRenovationRiskPenalty(game, option);
        return {
            baseEv,
            deltaEv,
            comboUnlockBonus,
            tempoBonus,
            redOpponentTurnBonus,
            lateBasicDuplicatePenalty,
            renovationRiskPenalty,
            total: baseEv + comboUnlockBonus + tempoBonus + redOpponentTurnBonus - lateBasicDuplicatePenalty - renovationRiskPenalty,
        };
    },

    _scoreExpertBuildOption(cpu, game, shopStock, action, context = null) {
        return cpu._profileMeasure("expert.scoreBuildOption", () => {
                const ci = game.currentPlayerIndex;
                const tuning = cpu.expertTuning;
                const beforePlayer = game.players[ci];
                const beforeDistance = cpu._estimateWinDistance(beforePlayer, game);
                const affordableBuildCount = context && typeof context.affordableBuildCount === "number"
                    ? context.affordableBuildCount
                    : cpu._listExpertBuildOptions(game, shopStock).filter(option => option.type !== 'skip').length;
                const clone = cpu._cloneGame(game);
                const stock = Object.assign({}, shopStock);
                clone.phase = GAME_PHASES.BUILD;
                const current = clone.currentPlayer();
                let scorePenalty = 0;
                if (action.type === 'landmark') {
                    if (!clone.buildLandmark(action.name)) return -Infinity;
                } else if (action.type === 'card') {
                    const card = cpu._cardByName(action.cardName);
                    if (!card || !clone.buildCard(card)) return -Infinity;
                    stock[card.name] = Math.max(0, (stock[card.name] || 0) - 1);
                    scorePenalty = cpu._scoreExpertCardPenalty(card.name, current, clone);
                    scorePenalty += cpu._scoreExpertFutureLandmarkHoldPenalty(current, clone, card);
                } else if (action.type === 'skip') {
                    clone.builtThisTurn = false;
                }
                let score = cpu._evaluatePosition(clone, ci);
                const remainingLandmarks = [...clone.enabledLandmarks].filter(name => !current.landmarks[name]).length;
                const allowBuildLookahead = cpu.simulationMode === "realtime"
                    ? (game.players.length < 4 && action.type === 'landmark' && remainingLandmarks <= 1)
                    : (cpu.simulationMode !== "lite" && (action.type === 'landmark' || remainingLandmarks <= 2));
                if (allowBuildLookahead) {
                    score += cpu._profileMeasure("expert.buildLookahead", () =>
                        cpu._simulateLookahead(
                            clone,
                            stock,
                            ci,
                            cpu._expertLookaheadSteps(clone, ci, game.players.length * tuning.lateGameLookaheadStepsPerPlayer)
                        )
                    ) * tuning.lookaheadWeight;
                }
                if (action.type === 'landmark') score += tuning.landmarkActionBonus + (remainingLandmarks <= 2 ? tuning.lateLandmarkActionBonus : 0);
                if (action.type === 'card') score -= (scorePenalty || 0) + cpu._scoreExpertLandmarkDelayPenalty(current, clone);
                if (action.type === 'card' && cpu._shouldExpertStopBuyingCards(current, clone, cpu._cardByName(action.cardName))) {
                    score -= 18;
                }
                if (action.type === 'skip' && current.landmarks[LANDMARK_NAMES.AIRPORT]) score += tuning.skipAirportBonus;
                if (action.type === 'skip' && !current.landmarks[LANDMARK_NAMES.AIRPORT]) score -= tuning.skipPenalty;
                if (action.type === 'skip' && affordableBuildCount > 0 && !current.landmarks[LANDMARK_NAMES.AIRPORT]) {
                    score -= Math.min(12, 4 + affordableBuildCount * 1.5);
                }
                if (action.type === 'landmark' && current.hasWon([...clone.enabledLandmarks])) score += 50000;
                if (cpu._expertFlagEnabled("endgameBuildFocus")) {
                    score += cpu._scoreExpertEndgameBuildFocus(game, clone, ci, action, beforeDistance);
                }
                return score;
        });
    },

    _scoreExpertEndgameBuildFocus(cpu, game, clone, playerIndex, action, beforeDistance = null) {
        if (!game || !clone) return 0;
        const beforePlayer = game.players[playerIndex];
        const afterPlayer = clone.players[playerIndex];
        const remainingBefore = [...game.enabledLandmarks].filter(name => !beforePlayer.landmarks[name]).length;
        if (remainingBefore > 2) return 0;
        const distanceBefore = beforeDistance == null ? cpu._estimateWinDistance(beforePlayer, game) : beforeDistance;
        const distanceAfter = cpu._estimateWinDistance(afterPlayer, clone);
        const distanceGain = distanceBefore - distanceAfter;
        let score = distanceGain * 12;
        if (action.type === "landmark") score += 10;
        if (action.type === "card" && distanceGain < 0.3) score -= remainingBefore <= 1 ? 14 : 8;
        if (action.type === "skip" && !afterPlayer.landmarks[LANDMARK_NAMES.AIRPORT]) score -= remainingBefore <= 1 ? 10 : 4;
        if (remainingBefore <= 3) {
            const urgentAfter = cpu._bestAffordableLandmark(afterPlayer, clone);
            if (action.type === "card") {
                score -= 6;
                if (urgentAfter && urgentAfter.urgency >= 7) score -= 10;
                if (!afterPlayer.landmarks[LANDMARK_NAMES.AIRPORT]) score -= 4;
                if (!afterPlayer.landmarks[LANDMARK_NAMES.RADIO_TOWER]) score -= 4;
            }
            if (action.type === "skip") {
                score -= 8;
                if (!afterPlayer.landmarks[LANDMARK_NAMES.AIRPORT]) score -= 6;
                if (!afterPlayer.landmarks[LANDMARK_NAMES.RADIO_TOWER]) score -= 4;
            }
        }
        if (remainingBefore <= 1) {
            score += Math.max(0, afterPlayer.coins - beforePlayer.coins) * 1.5;
        }
        return score;
    },

    _scoreStrongBuildOption(cpu, game, shopStock, action) {
        const ci = game.currentPlayerIndex;
        const clone = cpu._cloneGame(game);
        const stock = Object.assign({}, shopStock);
        const current = clone.currentPlayer();
        if (action.type === 'landmark') {
            if (!clone.buildLandmark(action.name)) return -Infinity;
        } else {
            const card = cpu._cardByName(action.cardName);
            if (!card || !clone.buildCard(card)) return -Infinity;
            stock[card.name] = Math.max(0, (stock[card.name] || 0) - 1);
        }
        let score = cpu._scoreStrongChoiceState(clone, ci);
        const targetLandmark = cpu._strongTargetLandmark(game.currentPlayer(), game);
        if (action.type === 'landmark') {
            const urgency = cpu._landmarkUrgency(action.name, current, clone);
            score += urgency * 3.5;
            if (targetLandmark && action.name === targetLandmark.name) score += 6;
        } else {
            const card = cpu._cardByName(action.cardName);
            const stableIncome = cpu._estimateStableIncome(game, game.currentPlayer());
            if (targetLandmark) {
                const shortfall = targetLandmark.cost - game.currentPlayer().coins;
                if (shortfall > 0 && shortfall <= 3) score -= Math.max(0, 4 - shortfall) * 1.8;
            }
            if (card && (card.color === "red" || card.color === "purple") && stableIncome < 10) score -= 4.5;
            if (card && game.players.length >= 4 && (card.color === "red" || card.color === "purple")) score -= 2.5;
        }
        return score;
    }
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPUBuildScoring };
if (typeof window !== 'undefined') window.CPUBuildScoring = CPUBuildScoring;
if (typeof globalThis !== 'undefined') globalThis.CPUBuildScoring = CPUBuildScoring;
