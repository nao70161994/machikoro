'use strict';

const CPUStateEvaluationRuntime = Object.freeze({
    _playerCountProfile(cpu, game) {
        return CPUProfile.playerCountProfile(game.players.length, cpu.playerCountProfileTunings);
    },

    _expertProfileName(cpu, game) {
        return CPUProfile.expertProfileName(game && game.players ? game.players.length : null);
    },

    _syncExpertTuningForGame(cpu, game) {
        if (cpu.difficulty !== "expert") return cpu.expertTuning;
        const resolved = resolveExpertProfileTuning({
            profile: cpu._expertProfileName(game),
            profilePresets: cpu.expertProfilePresets,
            profileTunings: cpu.expertProfileTunings,
            expertPreset: cpu.expertPreset,
            baseTuning: cpu.baseExpertTuning,
            simulationMode: cpu.simulationMode,
        });
        cpu.activeExpertPreset = resolved.activePreset;
        cpu.expertTuning = resolved.tuning;
        return cpu.expertTuning;
    },

    _expertCrowdNormalPlan(cpu, game) {
        return CPUEvaluation.expertCrowdNormalPlan({
            difficulty: cpu.difficulty,
            playerCount: () => game && game.players ? game.players.length : 0,
            currentPlayer: () => game && game.currentPlayer ? game.currentPlayer() : null,
            remainingLandmarkCount: current => cpu._remainingEnabledLandmarks(current, game).length,
            stableIncome: current => cpu._estimateStableIncome(game, current),
        });
    },

    _expertCrowdDisruptionBonus(cpu, game, targetIndex, amount) {
        if (!game || cpu.difficulty !== "expert") return 0;
        if (cpu._expertCrowdNormalPlan(game)) return 0;
        return cpu._crowdLeaderBonus(game, targetIndex, amount);
    },

    _expertCrowdCleaningWeight(cpu, game, cardName, amount) {
        if (!game || cpu.difficulty !== "expert") return 0;
        if (cpu._expertCrowdNormalPlan(game)) return cpu._crowdCleaningBonus(game, cardName, amount * 0.3);
        return cpu._crowdCleaningBonus(game, cardName, amount);
    },

    _expertDisruptionScale(cpu, game, focusIndex = null) {
        return CPUEvaluation.expertDisruptionScale({
            gameAvailable: !!game,
            difficulty: cpu.difficulty,
            selfRacePriority: () => cpu._expertFlagEnabled("selfRacePriority"),
            focusIndex,
            currentPlayerIndex: game && game.currentPlayerIndex,
            myDistance: playerIndex => cpu._estimateWinDistance(game.players[playerIndex], game),
            bestOpponentDistance: playerIndex => cpu._bestOpponentWinDistance(game, playerIndex),
            remainingLandmarkCount: playerIndex => [...game.enabledLandmarks]
                .filter(name => !game.players[playerIndex].landmarks[name]).length,
        });
    },

    _closestLandmarkShortfall(cpu, player, game) {
        return CPUEvaluation.closestLandmarkShortfall(
            player,
            game && game.enabledLandmarks,
            Player.landmarkCost
        );
    },

    _lookaheadTerminalHeuristic(cpu, game, focusIndex) {
        if (!game || focusIndex < 0) return 0;
        const focus = game.players[focusIndex];
        return CPUEvaluation.lookaheadTerminalHeuristic({
            focusIndex,
            playerCount: game.players.length,
            focusDistance: () => cpu._estimateWinDistance(focus, game),
            bestOpponentDistance: () => cpu._bestOpponentWinDistance(game, focusIndex),
            raceFocus: () => cpu._expertFlagEnabled("lookaheadRaceFocus"),
            remainingLandmarkCount: () => [...game.enabledLandmarks]
                .filter(name => !focus.landmarks[name]).length,
            reachableLandmarkCount: () => cpu._countReachableLandmarks(
                focus,
                [...game.enabledLandmarks]
            ),
            threatBalance: () => cpu._expertFlagEnabled("lookaheadThreatBalance"),
            threatForPlayer: index => cpu._estimateOpponentThreat(game.players[index], game),
            distanceForPlayer: index => cpu._estimateWinDistance(game.players[index], game),
        });
    },

    _tvLandmarkDenialValue(cpu, target, amount, game) {
        return CPUEvaluation.tvLandmarkDenialValue(
            target,
            amount,
            game && game.enabledLandmarks,
            Player.landmarkCost,
            cpu._expertFlagEnabled("tvLandmarkDenial")
        );
    },

    _expertCandidateTargetIndexes(cpu, game, currentIndex) {
        if (!game || !game.players) return [];
        const prune = cpu._expertFlagEnabled("disruptionCandidatePruning") && game.players.length >= 4;
        return CPULegalMoves.disruptionTargetIndexes(
            game.players,
            currentIndex,
            player => cpu._estimateOpponentThreat(player, game),
            prune
        );
    },

    _expertCandidateCleaningNames(cpu, game) {
        if (!game) return [];
        const prune = cpu._expertFlagEnabled("disruptionCandidatePruning") && game.players.length >= 4;
        return CPULegalMoves.disruptionCleaningNames(
            game.players,
            player => player.getMinorCards().filter(card => !player.isDormant(card)),
            (card, player) => cpu._ownedCardValue(card, game, player),
            prune
        );
    },

    _cardActivationValue(cpu, card, game, owner, roller, dice) {
        return CPUEvaluation.cardActivationValue(card, game, owner, roller, dice, {
            effects: CARD_EFFECTS,
            categories: CARD_CATEGORIES,
            landmarkNames: LANDMARK_NAMES,
            capValue: value => cpu._strongSoftCapValue(value),
            calcCardIncome: GameManager.calcCardIncome,
            estimateTvValue: (runtime, player) => cpu._estimateTvValue(runtime, player),
            estimatePublisherValue: (runtime, player) => cpu._estimatePublisherValue(runtime, player),
            estimateTaxOfficeValue: (runtime, player) => cpu._estimateTaxOfficeValue(runtime, player),
            estimateBusinessValue: (runtime, player) => cpu._estimateBusinessValue(runtime, player),
            estimateCleaningValue: (runtime, player) => cpu._estimateCleaningValue(runtime, player),
            estimateMoverValue: (runtime, player) => cpu._estimateMoverValue(runtime, player),
            estimateRenovationValue: (runtime, player, ordinal) =>
                cpu._estimateRenovationValue(runtime, player, ordinal),
            estimateItStartupValue: (runtime, player) => cpu._estimateItStartupValue(runtime, player),
            estimateParkValue: (runtime, player) => cpu._estimateParkValue(runtime, player),
        });
    },

    _estimateRollScore(cpu, game, dice) {
        let selfPositiveIncome = 0;
        let selfOtherValue = 0;
        let opponentValue = 0;
        const current = game.currentPlayer();
        for (const player of game.players) {
            for (const card of player.cards) {
                if (player.isDormant(card)) continue;
                if (!card.diceNums.includes(dice)) continue;
                const value = cpu._cardActivationValue(card, game, player, current, dice);
                if (player === current) {
                    const incomeValue = Math.max(0, cpu._cardSelfIncomeValue(card, game, player, current, dice));
                    selfPositiveIncome += incomeValue;
                    selfOtherValue += value - incomeValue;
                } else {
                    opponentValue += value * (card.color === "blue" ? 0.7 : 1);
                }
            }
        }
        return cpu._expertV2CappedPositiveIncome(game, current, selfPositiveIncome) + selfOtherValue - opponentValue;
    },

    _estimateOpponentRedRisk(cpu, game, dice) {
        if (!game || cpu.expertRollRiskMode !== "red") return 0;
        const current = game.currentPlayer();
        if (!current) return 0;
        let risk = 0;
        for (const player of game.players) {
            if (player === current) continue;
            for (const card of player.cards) {
                if (player.isDormant(card)) continue;
                if (card.color !== "red" || !card.diceNums.includes(dice)) continue;
                risk += Math.max(0, cpu._cardActivationValue(card, game, player, current, dice));
            }
        }
        return risk;
    },

    _estimateRiskAdjustedRollScore(cpu, game, dice) {
        const baseScore = cpu._estimateRollScoreCached(game, dice);
        if (cpu.expertRollRiskMode !== "red" || cpu.expertRollRedRiskWeight <= 0) return baseScore;
        return baseScore - cpu._estimateOpponentRedRisk(game, dice) * cpu.expertRollRedRiskWeight;
    },

    _expertV2CappedPositiveIncome(cpu, game, player, value) {
        if (!cpu._isExpertV2Simple()) return value;
        return CPUEvaluation.expertPositiveIncomeCap(value, cpu.expertIncomeCapMode, {
            remainingLandmarkCosts() {
                if (!game || !player || !player.landmarks) return [];
                const names = game.enabledLandmarks
                    ? [...game.enabledLandmarks]
                    : Player.landmarkNames();
                return names
                    .filter(name => !player.landmarks[name])
                    .map(name => Player.landmarkCost(name));
            },
            coins: () => player && Number.isFinite(player.coins) ? player.coins : 0,
        });
    },

    _cardSelfIncomeValue(cpu, card, game, owner, roller, dice) {
        return CPUEvaluation.cardSelfIncomeValue(
            card, game, owner, roller,
            CARD_EFFECTS, CARD_CATEGORIES, LANDMARK_NAMES,
            GameManager.calcCardIncome
        );
    },

    _expectedDiceScore(cpu, game, useTwo) {
        const cache = cpu._rollEvaluationCache(game);
        const cacheKey = useTwo ? 'two' : 'one';
        if (cacheKey in cache.expectedDiceScores) {
            return cache.expectedDiceScores[cacheKey];
        }
        const score = CPUEvaluation.expectedDiceScore(
            cpu._diceOutcomeWeights(useTwo),
            dice => cpu._estimateRiskAdjustedRollScore(game, dice)
        );
        cache.expectedDiceScores[cacheKey] = score;
        return score;
    },

    _expectedDiceScoreWithHarbor(cpu, game, useTwo) {
        const cache = cpu._rollEvaluationCache(game);
        const cacheKey = useTwo ? 'two' : 'one';
        if (cacheKey in cache.expectedDiceScoresWithHarbor) {
            return cache.expectedDiceScoresWithHarbor[cacheKey];
        }
        const current = game.currentPlayer();
        const canUseHarbor = useTwo && current.landmarks[LANDMARK_NAMES.HARBOR];
        const score = CPUEvaluation.expectedDiceScore(
            cpu._diceOutcomeWeights(useTwo),
            dice => cpu._estimateRiskAdjustedRollScore(game, dice),
            canUseHarbor ? {
                alternateMinDice: 10,
                alternateScoreForDice: dice => cpu._estimateRiskAdjustedRollScore(game, dice + 2),
            } : {}
        );
        cache.expectedDiceScoresWithHarbor[cacheKey] = score;
        return score;
    },

    _diceOutcomeWeights(cpu, useTwo) {
        return CPUSimulation.diceOutcomeWeights(useTwo);
    },

    _expertLookaheadSteps(cpu, game, focusIndex, baseSteps) {
        const player = game.players[focusIndex];
        const remainingLandmarks = [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length;
        return CPUEvaluation.expertLookaheadSteps(
            game.players.length, remainingLandmarks, game.phase, GAME_PHASES.BUILD, cpu.simulationMode, baseSteps
        );
    },

    _crowdLeaderBonus(cpu, game, targetIndex, weight = 1) {
        return CPUEvaluation.crowdLeaderBonus({
            gameAvailable: !!game,
            playerCount: game ? game.players.length : 0,
            currentPlayerIndex: game ? game.currentPlayerIndex : -1,
            targetIndex,
            weight,
            playerExists: index => !!game.players[index],
            threatForPlayer: index => cpu._estimateOpponentThreat(game.players[index], game),
        });
    },

    _crowdCleaningBonus(cpu, game, cardName, weight = 1) {
        return CPUEvaluation.crowdCleaningBonus({
            gameAvailable: !!game,
            playerCount: game ? game.players.length : 0,
            currentPlayerIndex: game ? game.currentPlayerIndex : -1,
            weight,
            threatForPlayer: index => cpu._estimateOpponentThreat(game.players[index], game),
            matchingActiveCardCount: index => {
                const opponent = game.players[index];
                return opponent.getMinorCards().filter(card =>
                    card.name === cardName && !opponent.isDormant(card)
                ).length;
            },
        });
    },

    _remainingEnabledLandmarks(cpu, current, game) {
        return CPULegalMoves.remainingEnabledLandmarkNames(
            current, game.enabledLandmarks, Player.landmarkNames()
        );
    },

    _isEndgameMode(cpu, current, game, threshold = 2) {
        return CPULegalMoves.isEndgame(
            current, game.enabledLandmarks, Player.landmarkNames(), threshold
        );
    },

    _strongLiteUseHeuristicChoices(cpu) {
        return cpu.difficulty === "strong" && cpu.simulationMode === "lite";
    },

    _expertV2SimpleStrongCrowdDiceThreshold(cpu, game) {
        if (!game || !game.players || game.players.length < 4) return false;
        let strongOpponents = 0;
        for (let i = 0; i < game.players.length; i++) {
            if (i === game.currentPlayerIndex) continue;
            const difficulty = cpu.expertOpponentDifficulties && cpu.expertOpponentDifficulties[i]
                ? cpu.expertOpponentDifficulties[i]
                : game.players[i] && game.players[i].difficulty;
            if (difficulty === "strong") strongOpponents++;
        }
        return strongOpponents >= 2;
    },

    _scoreExpertV2SimpleTVTarget(cpu, game, player, steal, built) {
        return CPUEvaluation.v2SimpleTvTargetScore({
            beforeShortfall: cpu._closestLandmarkShortfall(player, game),
            coins: player.coins,
            steal,
            builtLandmarkCount: built,
            remainingLandmarkCosts: cpu._remainingEnabledLandmarks(player, game)
                .map(name => Player.landmarkCost(name)),
        });
    },

    _scoreExpertV2SimpleCleaningValue(cpu, game, name) {
        const current = game.currentPlayer();
        const features = CPUEvaluation.expertV2SimpleCleaningFeatures(
            name,
            current,
            game.players,
            {
                minorCards: player => player.getMinorCards(),
                isDormant: (player, card) => player.isDormant(card),
                ownedCardValue: (card, player) => cpu._ownedCardValue(card, game, player),
            }
        );
        return CPUEvaluation.expertV2SimpleCleaningScore(features);
    },

    _estimatePlayerTurnValue(cpu, game, playerIndex) {
        const cache = cpu._stateEvaluationCache(game);
        if (playerIndex in cache.playerTurnValues) return cache.playerTurnValues[playerIndex];
        const scores = cpu._estimatePlayerTurnScorePair(game, playerIndex);
        const value = Math.max(scores.one, scores.two);
        const normalized = Number.isFinite(value) ? value : 0;
        cache.playerTurnValues[playerIndex] = normalized;
        return normalized;
    },

    _estimatePlayerTurnScorePair(cpu, game, playerIndex) {
        const cache = cpu._stateEvaluationCache(game);
        if (playerIndex in cache.playerTurnScorePairs) return cache.playerTurnScorePairs[playerIndex];
        const original = game.currentPlayerIndex;
        game.currentPlayerIndex = playerIndex;
        try {
            const rollCache = cpu._rollEvaluationCache(game);
            const getRollScore = dice => {
                if (!(dice in rollCache.rollScores)) {
                    rollCache.rollScores[dice] = cpu._estimateRollScore(game, dice);
                }
                return rollCache.rollScores[dice];
            };
            const scores = CPUEvaluation.turnScorePair(
                game.players[playerIndex].landmarks[LANDMARK_NAMES.STATION],
                getRollScore
            );
            cache.playerTurnScorePairs[playerIndex] = scores;
            return scores;
        } finally {
            game.currentPlayerIndex = original;
        }
    },

    _countReachableLandmarks(cpu, player, enabledLandmarks) {
        return CPUEvaluation.countReachableLandmarks(player, enabledLandmarks, Player.landmarkCost);
    },

    _isProgressIncomeCard(cpu, card, player) {
        return CPUEvaluation.isProgressIncomeCard(card, player, CARD_EFFECTS);
    },

    _estimateStableIncome(cpu, game, player) {
        const playerIndex = game && game.players ? game.players.indexOf(player) : -1;
        let cache = null;
        if (playerIndex >= 0) {
            cache = cpu._stateEvaluationCache(game);
            if (playerIndex in cache.stableIncomes) return cache.stableIncomes[playerIndex];
        }
        const total = CPUEvaluation.progressIncomeTotal(
            player.cards,
            card => cpu._isProgressIncomeCard(card, player),
            card => cpu._ownedCardValue(card, game, player)
        );
        if (cache) cache.stableIncomes[playerIndex] = total;
        return total;
    },

    _estimateProgressIncome(cpu, game, player) {
        if (!game || !player) return 0;
        const playerIndex = game.players ? game.players.indexOf(player) : -1;
        let cache = null;
        if (playerIndex >= 0) {
            cache = cpu._stateEvaluationCache(game);
            if (playerIndex in cache.progressIncomes) return cache.progressIncomes[playerIndex];
        }
        const total = CPUEvaluation.progressIncomeTotal(
            player.cards,
            card => cpu._isProgressIncomeCard(card, player),
            card => cpu.evalCard(card, game, player) * cpu._cardDiceFreq(card, game, player) / 6
        );
        if (cache) cache.progressIncomes[playerIndex] = total;
        return total;
    },

    _estimateWinDistance(cpu, player, game) {
        if (!player || !game || !game.enabledLandmarks) return Infinity;
        const playerIndex = game.players ? game.players.indexOf(player) : -1;
        if (playerIndex >= 0) {
            const cache = cpu._stateEvaluationCache(game);
            if (playerIndex in cache.winDistances) return cache.winDistances[playerIndex];
            const value = cpu._estimateWinDistanceUncached(player, game, playerIndex);
            cache.winDistances[playerIndex] = value;
            return value;
        }
        return cpu._estimateWinDistanceUncached(player, game, playerIndex);
    },

    _estimateWinDistanceUncached(cpu, player, game, playerIndex = -1) {
        if (!player || !game || !game.enabledLandmarks) return Infinity;
        const remaining = [...game.enabledLandmarks]
            .filter(name => !player.landmarks[name])
            .map(name => ({
                name,
                cost: Player.landmarkCost(name),
                urgency: cpu._landmarkUrgency(name, player, game),
            }));
        if (remaining.length === 0) return 0;
        const turnValue = playerIndex >= 0 ? cpu._estimatePlayerTurnValue(game, playerIndex) : 0;
        const reachable = remaining.filter(entry => player.coins >= entry.cost).length;
        const progressIncome = cpu._estimateProgressIncome(game, player);
        return CPUEvaluation.estimateWinDistance({
            remainingLandmarks: remaining,
            playerCoins: player.coins,
            turnValue,
            reachable,
            progressIncome,
            crowdFocus: cpu._expertFlagEnabled("crowdWinDistanceFocus") && game.players.length >= 4,
        });
    },

    _estimateRedPressure(cpu, game, playerIndex) {
        const cache = cpu._stateEvaluationCache(game);
        if (playerIndex in cache.redPressures) return cache.redPressures[playerIndex];
        let pressure = 0;
        for (let i = 0; i < game.players.length; i++) {
            if (i === playerIndex) continue;
            const opponent = game.players[i];
            for (const card of opponent.cards) {
                if (opponent.isDormant(card) || card.color !== "red") continue;
                pressure += cpu._ownedCardValue(card, game, opponent);
            }
        }
        cache.redPressures[playerIndex] = pressure;
        return pressure;
    },

    _estimateOpponentThreat(cpu, opponent, game) {
        const opponentIndex = game.players ? game.players.indexOf(opponent) : -1;
        if (opponentIndex >= 0) {
            const cache = cpu._stateEvaluationCache(game);
            if (opponentIndex in cache.opponentThreats) return cache.opponentThreats[opponentIndex];
            const value = cpu._estimateOpponentThreatUncached(opponent, game, opponentIndex);
            cache.opponentThreats[opponentIndex] = value;
            return value;
        }
        return cpu._estimateOpponentThreatUncached(opponent, game, opponentIndex);
    },

    _estimateOpponentThreatUncached(cpu, opponent, game, opponentIndex = -1) {
        const enabledLandmarks = [...game.enabledLandmarks];
        const progress = enabledLandmarks.filter(name => opponent.landmarks[name]).length;
        const turnValue = cpu._estimatePlayerTurnValue(game, opponentIndex);
        const reachable = cpu._countReachableLandmarks(opponent, enabledLandmarks);
        const winDistance = cpu._estimateWinDistance(opponent, game);
        return CPUEvaluation.estimateOpponentThreat({
            coins: opponent.coins,
            turnValue,
            landmarkProgress: progress,
            builtLandmarkCount: opponent.builtLandmarkCount(),
            reachableLandmarks: reachable,
            winDistance,
        });
    },

    _bestOpponentWinDistance(cpu, game, playerIndex) {
        let best = Infinity;
        for (let i = 0; i < game.players.length; i++) {
            if (i === playerIndex) continue;
            best = Math.min(best, cpu._estimateWinDistance(game.players[i], game));
        }
        return best;
    },

    _evaluatePosition(cpu, game, playerIndex) {
        const player = game.players[playerIndex];
        const tuning = cpu.expertTuning;
        if (player.hasWon([...game.enabledLandmarks])) return 100000;
        const myTurnValue = cpu._estimatePlayerTurnValue(game, playerIndex);
        const enabledLandmarks = [...game.enabledLandmarks];
        const myLandmarkProgress = enabledLandmarks.filter(name => player.landmarks[name]).length;
        const remainingLandmarks = enabledLandmarks.filter(name => !player.landmarks[name]);
        const reachableLandmarks = cpu._countReachableLandmarks(player, enabledLandmarks);
        const stableIncome = cpu._estimateStableIncome(game, player);
        const winDistance = cpu._estimateWinDistance(player, game);
        const redPressure = cpu._estimateRedPressure(game, playerIndex);
        const lowValueSpam = player.countCard("改装屋") + player.countCard("貸金業") + player.countCard("雑貨屋");
        const builtLandmarkCount = player.builtLandmarkCount();
        const duplicateRenovationPenalty = cpu._duplicateRenovationPenalty(player, "expert", game);
        const airportIdleBonus = Boolean(
            player.landmarks[LANDMARK_NAMES.AIRPORT] &&
            !game.builtThisTurn &&
            game.currentPlayerIndex === playerIndex
        );
        const opponentThreats = [];
        for (let i = 0; i < game.players.length; i++) {
            if (i === playerIndex) continue;
            opponentThreats.push(cpu._estimateOpponentThreat(game.players[i], game));
        }
        return CPUEvaluation.evaluatePositionScore({
            coins: player.coins,
            turnValue: myTurnValue,
            landmarkProgress: myLandmarkProgress,
            builtLandmarkCount,
            reachableLandmarks,
            stableIncome,
            winDistance,
            redPressure,
            remainingLandmarkCount: remainingLandmarks.length,
            lowValueSpam,
            duplicateRenovationPenalty,
            airportIdleBonus,
            opponentThreats,
        }, tuning);
    },

    _scoreExpertCardPenalty(cpu, cardName, player, game) {
        return CPUEvaluation.expertCardPenalty({
            cardName,
            copies: player.countCard(cardName),
            remainingLandmarks: [...game.enabledLandmarks]
                .filter(name => !player.landmarks[name]).length,
            playerCount: game.players.length,
            builtLandmarkCount: () => player.builtLandmarkCount(),
        });
    },

    _scoreExpertLandmarkDelayPenalty(cpu, player, game) {
        const remaining = [...game.enabledLandmarks]
            .filter(name => !player.landmarks[name])
            .map(name => ({ name, cost: Player.landmarkCost(name), urgency: cpu._landmarkUrgency(name, player, game) }));
        if (remaining.length === 0) return 0;
        const affordable = CPUSelection.stableRankLexicographic(
            remaining.filter(entry => player.coins >= entry.cost),
            [
                { valueOf: entry => entry.urgency, direction: CPUSelection.directions.DESCENDING },
                { valueOf: entry => entry.cost, direction: CPUSelection.directions.ASCENDING },
            ]
        );
        if (affordable.length === 0) return 0;
        const best = affordable[0];
        const surplus = player.coins - best.cost;
        return Math.max(0, best.urgency * 2 + Math.min(12, surplus * 0.4));
    },

    _scoreExpertFutureLandmarkHoldPenalty(cpu, player, game, card = null) {
        if (!player || !game || !cpu._expertFlagEnabled("futureLandmarkHold")) return 0;
        const remaining = [...game.enabledLandmarks]
            .filter(name => !player.landmarks[name])
            .map(name => ({
                name,
                cost: Player.landmarkCost(name),
                urgency: cpu._landmarkUrgency(name, player, game),
                shortfall: Player.landmarkCost(name) - player.coins,
            }))
            .filter(entry => entry.shortfall > 0 && entry.shortfall <= 3);
        const rankedRemaining = CPUSelection.stableRankLexicographic(remaining, [
            { valueOf: entry => entry.urgency, direction: CPUSelection.directions.DESCENDING },
            { valueOf: entry => entry.shortfall, direction: CPUSelection.directions.ASCENDING },
        ]);

        if (rankedRemaining.length === 0) return 0;
        const target = rankedRemaining[0];
        let penalty = target.urgency * (4 - target.shortfall) * 1.35;
        if (card) {
            if (card.cost >= 5) penalty += 4.5;
            else if (card.cost >= 3) penalty += 2.5;
            if (card.color === "purple") penalty += 3.5;
        }
        return penalty;
    },

    _expertPremiumPurpleReady(cpu, card, game, player) {
        if (!card || !game || !player) return true;
        if (!cpu._expertFlagEnabled("premiumPurpleGate")) return true;
        if (![CARD_EFFECTS.STADIUM, CARD_EFFECTS.TV, CARD_EFFECTS.TAXOFFICE, CARD_EFFECTS.PUBLISHER].includes(card.effect)) {
            return true;
        }
        const stableIncome = cpu._estimateStableIncome(game, player);
        const remainingLandmarks = [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length;
        const nextLandmark = cpu._bestAffordableLandmark(player, game, 0);
        const nextShortfall = nextLandmark ? Math.max(0, nextLandmark.cost - player.coins) : Infinity;
        const opponents = game.players.filter(p => p !== player);
        const maxThreat = opponents.reduce((max, opponent) => Math.max(max, cpu._estimateOpponentThreat(opponent, game)), 0);
        const threatReady = maxThreat >= 40;
        return stableIncome >= 10 || remainingLandmarks <= 2 || nextShortfall <= 2 || threatReady;
    },

    _expertBuildCandidateLimit(cpu, game, current) {
        let limit = cpu.simulationMode === "realtime" ? 2 : (cpu.simulationMode === "lite" ? 2 : (cpu.simulationMode === "fast" ? 3 : 4));
        if (!game || !current || !cpu._expertFlagEnabled("dynamicBuildCandidateLimit")) return limit;
        if (game.players.length < 4) return limit;
        const remainingLandmarks = [...game.enabledLandmarks].filter(name => !current.landmarks[name]).length;
        const stableIncome = cpu._estimateStableIncome(game, current);
        if (remainingLandmarks <= 2 || current.coins >= 10 || stableIncome >= 12) {
            limit += 1;
        }
        return limit;
    },

    _listExpertBuildOptions(cpu, game, shopStock) {
        const current = game.currentPlayer();
        const affordableLandmarks = CPULegalMoves.affordableLandmarkNames(
            current,
            game.enabledLandmarks,
            Player.landmarkNames(),
            Player.landmarkCost,
            false
        );
        const affordable = CPULegalMoves.affordableCards(current, shopStock, CARDS);
        const ranked = CPUSelection.stableRankDescending(
            affordable.map(card => ({
                card,
                score: cpu._scoreExpertCardCandidate(card, game, current),
            })),
            entry => entry.score
        );
        return CPULegalMoves.expertBuildOptions(
            affordableLandmarks,
            ranked,
            cpu._expertBuildCandidateLimit(game, current),
            card => cpu._expertPremiumPurpleReady(card, game, current)
        );
    },

    _listStrongBuildOptions(cpu, game, shopStock) {
        const current = game.currentPlayer();
        const affordableLandmarks = CPULegalMoves.affordableLandmarkNames(
            current,
            game.enabledLandmarks,
            Player.landmarkNames(),
            Player.landmarkCost,
            false
        );
        const affordable = CPULegalMoves.affordableCards(current, shopStock, CARDS);
        const ranked = cpu._sortAffordableForDifficulty(affordable, game, current, "strong");
        const targetLandmark = cpu._strongTargetLandmark(current, game);
        return CPULegalMoves.strongBuildOptions(affordableLandmarks, ranked, {
            playerCount: game.players.length,
            builtLandmarkCount: current.builtLandmarkCount(),
            attackUnlocked: cpu._strongAttackUnlocked(current, game, targetLandmark),
            oneDieOpponentCount: game.players.filter(
                player => player !== current && !player.landmarks[LANDMARK_NAMES.STATION]
            ).length,
        });
    }
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPUStateEvaluationRuntime };
if (typeof window !== 'undefined') window.CPUStateEvaluationRuntime = CPUStateEvaluationRuntime;
if (typeof globalThis !== 'undefined') globalThis.CPUStateEvaluationRuntime = CPUStateEvaluationRuntime;
