/** @typedef {{action: 'buildCard'|'buildLandmark', data: Object}} CPUBuildActionProposal */
const CPU_SIMULATION_GAME_ADAPTER = Object.freeze({
    createGame: playerCount => new GameManager(playerCount),
    cloneCard: card => cloneCard(card),
    defaultLandmarks: () => Player.landmarkNames(),
});
class CPU {
    constructor(difficulty, options = {}) {
        const runtimeConfig = /** @type {any} */ (globalThis).resolveCpuRuntimeConfig(
            difficulty,
            options
        );
        this.difficulty = runtimeConfig.difficulty;
        this.expertPurpose = runtimeConfig.expertPurpose;
        this.expertBehaviorFlags = runtimeConfig.expertBehaviorFlags;
        this.simulationMode = runtimeConfig.simulationMode;
        this.expertPreset = runtimeConfig.expertPreset;
        this.expertDiceMode = runtimeConfig.expertDiceMode;
        this.expertRerollMode = runtimeConfig.expertRerollMode;
        this.expertBuildMode = runtimeConfig.expertBuildMode;
        this.expertInvestMode = runtimeConfig.expertInvestMode;
        this.expertTvMode = runtimeConfig.expertTvMode;
        this.expertBusinessMode = runtimeConfig.expertBusinessMode;
        this.expertCleaningMode = runtimeConfig.expertCleaningMode;
        this.expertHarborMode = runtimeConfig.expertHarborMode;
        this.expertHarborMargin = runtimeConfig.expertHarborMargin;
        this.expertMoverMode = runtimeConfig.expertMoverMode;
        this.expertRenovationMode = runtimeConfig.expertRenovationMode;
        this.expertRerollMargin = runtimeConfig.expertRerollMargin;
        this.expertIncomeCapMode = runtimeConfig.expertIncomeCapMode;
        this.expertComboMode = runtimeConfig.expertComboMode;
        this.expertComboWeight = runtimeConfig.expertComboWeight;
        this.expertBuildTempoWeight = runtimeConfig.expertBuildTempoWeight;
        this.expertRollRiskMode = runtimeConfig.expertRollRiskMode;
        this.expertRollRedRiskWeight = runtimeConfig.expertRollRedRiskWeight;
        this.expertAirportSkipMode = runtimeConfig.expertAirportSkipMode;
        this.expertLandmarkCardMargin = runtimeConfig.expertLandmarkCardMargin;
        this.expertLandmarkCardCompareMode = runtimeConfig.expertLandmarkCardCompareMode;
        this.expertLandmarkCardCompareTargets = runtimeConfig.expertLandmarkCardCompareTargets;
        this.expertLandmarkCardPenaltyMode = runtimeConfig.expertLandmarkCardPenaltyMode;
        this.expertHarborLandmarkBaseBonus = runtimeConfig.expertHarborLandmarkBaseBonus;
        this.expertLandmarkProgressRemaining = runtimeConfig.expertLandmarkProgressRemaining;
        this.expertLandmarkCostWeight = runtimeConfig.expertLandmarkCostWeight;
        this.expertTraceStats = runtimeConfig.expertTraceStats;
        this.expertOpponentDifficulties = runtimeConfig.expertOpponentDifficulties;
        this.profileStats = runtimeConfig.profileStats;
        this.expertProfilePresets = runtimeConfig.expertProfilePresets;
        this.expertProfileTunings = runtimeConfig.expertProfileTunings;
        this.baseExpertTuning = runtimeConfig.baseExpertTuning;
        this.activeExpertPreset = runtimeConfig.activeExpertPreset;
        this.expertTuning = runtimeConfig.expertTuning;
    }

    static _finiteOption(options, key, fallback) {
        return CPUProfile.finiteOption(options, key, fallback);
    }

    _expertFlagEnabled(name) {
        return !!(this.expertBehaviorFlags && this.expertBehaviorFlags[name]);
    }

    _isLiveExpert() {
        return this.difficulty === "expert" && this.expertPurpose === "live";
    }

    _isExpertV2Simple() {
        return this.difficulty === "expert" && this.activeExpertPreset === "v2simple";
    }

    static _nowMs() {
        if (typeof performance !== "undefined" && performance && typeof performance.now === "function") {
            return performance.now();
        }
        return Date.now();
    }

    static _cardByNameMap() {
        const cacheOwner = /** @type {typeof CPU & {__cardByNameMap?: Record<string, Card>}} */ (CPU);
        if (!cacheOwner.__cardByNameMap) {
            cacheOwner.__cardByNameMap = Object.fromEntries(CARDS.map(card => [card.name, card]));
        }
        return cacheOwner.__cardByNameMap;
    }

    _cardByName(name) {
        return CPU._cardByNameMap()[name] || null;
    }

    _profileMeasure(label, fn) {
        return CPUDiagnostics.profileMeasure(this, label, fn);
    }

    _profileCount(label, amount = 1) {
        CPUDiagnostics.profileCount(this, label, amount);
    }

    _profileDecision(label, fn) {
        return this._profileMeasure(`${this.difficulty}.${label}`, fn);
    }

    _rollEvaluationSignature(game) {
        return CPUEvaluationCache.signature(game);
    }

    _signatureCache(cacheKey, game, factory) {
        return CPUEvaluationCache.entry(this, cacheKey, game, factory);
    }

    _rollEvaluationCache(game) {
        return this._signatureCache("_cachedRollEvaluation", game, signature => ({
                signature,
                rollScores: Object.create(null),
                expectedDiceScores: Object.create(null),
                expectedDiceScoresWithHarbor: Object.create(null),
            })
        );
    }

    _stateEvaluationCache(game) {
        return this._signatureCache("_cachedStateEvaluation", game, signature => ({
            signature,
            playerTurnValues: Object.create(null),
            playerTurnScorePairs: Object.create(null),
            stableIncomes: Object.create(null),
            progressIncomes: Object.create(null),
            winDistances: Object.create(null),
            redPressures: Object.create(null),
            opponentThreats: Object.create(null),
            purchasePlanValues: Object.create(null),
        }));
    }

    _estimateRollScoreCached(game, dice) {
        const cache = this._rollEvaluationCache(game);
        if (!(dice in cache.rollScores)) {
            cache.rollScores[dice] = this._estimateRollScore(game, dice);
        }
        return cache.rollScores[dice];
    }

    _traceV2Simple(key, amount = 1) {
        CPUDiagnostics.traceV2Simple(this, key, amount);
    }

    _traceV2SimpleBuildOption(prefix, option) {
        CPUDiagnostics.traceV2SimpleBuildOption(this, prefix, option);
    }

    _traceV2SimpleBuildBreakdown(option, breakdown, chosen = false) {
        CPUDiagnostics.traceV2SimpleBuildBreakdown(this, option, breakdown, chosen);
    }

    _randomChoice(items) {
        return CPUSelection.randomChoice(items, Math.random);
    }

    _forEachBusinessMove(game, callback) {
        return CPUBusinessMoves.forEachMove(game, callback);
    }

    _minorCardIndexes(player) {
        return CPUBusinessMoves.minorCardIndexes(player);
    }

    _chooseRandomBusinessMove(game) {
        return CPUBusinessMoves.chooseRandomMove(game, items => this._randomChoice(items));
    }

    _chooseSimpleBusinessMove(game, actor = game.currentPlayer()) {
        return CPUBusinessMoves.chooseSimpleMove(
            game,
            actor,
            card => this._exchangeOwnedCardValue(card, game, actor),
            card => this._exchangeReceivedCardValue(card, game, actor)
        );
    }

    _scoreBusinessExchangeDetails(game, current, move) {
        if (!move) return null;
        const target = game.players[move.targetIndex];
        if (!target) return null;
        const myCard = move.myCardObject || current.cards[move.myCard];
        const theirCard = move.theirCardObject || target.cards[move.theirCard];
        if (!myCard || !theirCard) return null;
        const selfGain = this._exchangeReceivedCardValue(theirCard, game, current);
        const selfLoss = this._exchangeOwnedCardValue(myCard, game, current);
        const denial = this._exchangeOwnedCardValue(theirCard, game, target);
        const gift = this._exchangeReceivedCardValue(myCard, game, target);
        return CPUBusinessMoves.scoreExchange(selfGain, selfLoss, denial, gift);
    }

    _scoreBusinessExchange(game, current, move) {
        const details = this._scoreBusinessExchangeDetails(game, current, move);
        return details ? details.score : null;
    }

    _chooseHarmfulGiftBusinessMove(game, actor = game.currentPlayer()) {
        const current = actor;
        const simpleMove = this._chooseSimpleBusinessMove(game, actor);
        if (!simpleMove) return null;
        const simpleScore = this._scoreBusinessExchange(game, current, simpleMove);
        let bestMove = simpleMove;
        let bestScore = simpleScore == null ? -Infinity : simpleScore;
        this._forEachBusinessMove(game, ({ myCard, myIndex, targetIndex, theirCard, theirIndex }) => {
            if (myCard.effect !== CARD_EFFECTS.LOAN && myCard.effect !== CARD_EFFECTS.RENOVATION) return;
            const details = this._scoreBusinessExchangeDetails(game, current, {
                myCard: myIndex,
                targetIndex,
                theirCard: theirIndex,
                myCardObject: myCard,
                theirCardObject: theirCard,
            });
            if (!details || details.gift >= -0.25) return;
            if (details.score > bestScore) {
                bestScore = details.score;
                bestMove = {
                    myCard: myIndex,
                    targetIndex,
                    theirCard: theirIndex,
                };
            }
        });
        return bestMove;
    }

    _businessOwnCandidateIndexes(game, current, limit) {
        return CPUBusinessMoves.rankedCandidateIndexes(
            current,
            limit,
            index => this._ownedCardValue(current.cards[index], game, current)
        );
    }

    _businessTargetCandidateIndexes(game, current, target, limit, attackScale) {
        return CPUBusinessMoves.rankedCandidateIndexes(
            target,
            limit,
            (index, card) => this._receivedCardValue(card, game, current) +
                this._ownedCardValue(card, game, target) * 0.7 * attackScale,
            true
        );
    }

    _forEachBusinessMoveCandidate(game, candidateTargets, callback) {
        const current = game.currentPlayer();
        const attackScale = this._strongCrowdAttackScale(game);
        const ownLimit = this.difficulty === "expert" ? 3 : 2;
        const targetLimit = this.difficulty === "expert" ? 4 : 3;
        const myIndexes = this._businessOwnCandidateIndexes(game, current, ownLimit);
        return CPUBusinessMoves.forEachCandidate(
            game,
            myIndexes,
            candidateTargets,
            target => this._businessTargetCandidateIndexes(
                game,
                current,
                target,
                targetLimit,
                attackScale
            ),
            callback
        );
    }

    getProfileSummary() {
        return CPUDiagnostics.profileSummary(this.profileStats);
    }

    static _expertPresetTable() {
        return CPU_EXPERT_PRESETS;
    }

    static _expertDefaultOptionsTable() {
        return CPU_EXPERT_DEFAULT_OPTIONS;
    }

    static _defaultExpertOptions(presetName = "default") {
        const defaults = CPU._expertDefaultOptionsTable();
        return Object.assign({}, defaults, (defaults.byPreset && defaults.byPreset[presetName]) || {});
    }

    static _resolveExpertTuning(presetName = "default") {
        const presets = CPU._expertPresetTable();
        return Object.assign({}, presets.default, presets[presetName] || {});
    }

    static _defaultExpertProfileTunings() {
        return CPU_EXPERT_PROFILE_TUNINGS;
    }

    takeTurn(game, shopStock) {
        // scheduleCPU側で処理
    }

    _playerCountProfile(game) {
        return CPUProfile.playerCountProfile(game.players.length);
    }

    _expertProfileName(game) {
        return CPUProfile.expertProfileName(game && game.players ? game.players.length : null);
    }

    _syncExpertTuningForGame(game) {
        if (this.difficulty !== "expert") return this.expertTuning;
        const resolved = resolveExpertProfileTuning({
            profile: this._expertProfileName(game),
            profilePresets: this.expertProfilePresets,
            profileTunings: this.expertProfileTunings,
            expertPreset: this.expertPreset,
            baseTuning: this.baseExpertTuning,
            simulationMode: this.simulationMode,
        });
        this.activeExpertPreset = resolved.activePreset;
        this.expertTuning = resolved.tuning;
        return this.expertTuning;
    }

    _expertCrowdNormalPlan(game) {
        return CPUEvaluation.expertCrowdNormalPlan({
            difficulty: this.difficulty,
            playerCount: () => game && game.players ? game.players.length : 0,
            currentPlayer: () => game && game.currentPlayer ? game.currentPlayer() : null,
            remainingLandmarkCount: current => this._remainingEnabledLandmarks(current, game).length,
            stableIncome: current => this._estimateStableIncome(game, current),
        });
    }

    _expertCrowdDisruptionBonus(game, targetIndex, amount) {
        if (!game || this.difficulty !== "expert") return 0;
        if (this._expertCrowdNormalPlan(game)) return 0;
        return this._crowdLeaderBonus(game, targetIndex, amount);
    }

    _expertCrowdCleaningWeight(game, cardName, amount) {
        if (!game || this.difficulty !== "expert") return 0;
        if (this._expertCrowdNormalPlan(game)) return this._crowdCleaningBonus(game, cardName, amount * 0.3);
        return this._crowdCleaningBonus(game, cardName, amount);
    }

    _expertDisruptionScale(game, focusIndex = null) {
        return CPUEvaluation.expertDisruptionScale({
            gameAvailable: !!game,
            difficulty: this.difficulty,
            selfRacePriority: () => this._expertFlagEnabled("selfRacePriority"),
            focusIndex,
            currentPlayerIndex: game && game.currentPlayerIndex,
            myDistance: playerIndex => this._estimateWinDistance(game.players[playerIndex], game),
            bestOpponentDistance: playerIndex => this._bestOpponentWinDistance(game, playerIndex),
            remainingLandmarkCount: playerIndex => [...game.enabledLandmarks]
                .filter(name => !game.players[playerIndex].landmarks[name]).length,
        });
    }

    _closestLandmarkShortfall(player, game) {
        return CPUEvaluation.closestLandmarkShortfall(
            player,
            game && game.enabledLandmarks,
            Player.landmarkCost
        );
    }

    _lookaheadTerminalHeuristic(game, focusIndex) {
        if (!game || focusIndex < 0) return 0;
        const focus = game.players[focusIndex];
        return CPUEvaluation.lookaheadTerminalHeuristic({
            focusIndex,
            playerCount: game.players.length,
            focusDistance: () => this._estimateWinDistance(focus, game),
            bestOpponentDistance: () => this._bestOpponentWinDistance(game, focusIndex),
            raceFocus: () => this._expertFlagEnabled("lookaheadRaceFocus"),
            remainingLandmarkCount: () => [...game.enabledLandmarks]
                .filter(name => !focus.landmarks[name]).length,
            reachableLandmarkCount: () => this._countReachableLandmarks(
                focus,
                [...game.enabledLandmarks]
            ),
            threatBalance: () => this._expertFlagEnabled("lookaheadThreatBalance"),
            threatForPlayer: index => this._estimateOpponentThreat(game.players[index], game),
            distanceForPlayer: index => this._estimateWinDistance(game.players[index], game),
        });
    }

    _tvLandmarkDenialValue(target, amount, game) {
        return CPUEvaluation.tvLandmarkDenialValue(
            target,
            amount,
            game && game.enabledLandmarks,
            Player.landmarkCost,
            this._expertFlagEnabled("tvLandmarkDenial")
        );
    }

    _expertCandidateTargetIndexes(game, currentIndex) {
        if (!game || !game.players) return [];
        const prune = this._expertFlagEnabled("disruptionCandidatePruning") && game.players.length >= 4;
        return CPULegalMoves.disruptionTargetIndexes(
            game.players,
            currentIndex,
            player => this._estimateOpponentThreat(player, game),
            prune
        );
    }

    _expertCandidateCleaningNames(game) {
        if (!game) return [];
        const prune = this._expertFlagEnabled("disruptionCandidatePruning") && game.players.length >= 4;
        return CPULegalMoves.disruptionCleaningNames(
            game.players,
            player => player.getMinorCards().filter(card => !player.isDormant(card)),
            (card, player) => this._ownedCardValue(card, game, player),
            prune
        );
    }

    // ===== サイコロ判断 =====

    _cardActivationValue(card, game, owner, roller, dice) {
        return CPUEvaluation.cardActivationValue(card, game, owner, roller, dice, {
            effects: CARD_EFFECTS,
            categories: CARD_CATEGORIES,
            landmarkNames: LANDMARK_NAMES,
            capValue: value => this._strongSoftCapValue(value),
            calcCardIncome: GameManager.calcCardIncome,
            estimateTvValue: (runtime, player) => this._estimateTvValue(runtime, player),
            estimatePublisherValue: (runtime, player) => this._estimatePublisherValue(runtime, player),
            estimateTaxOfficeValue: (runtime, player) => this._estimateTaxOfficeValue(runtime, player),
            estimateBusinessValue: (runtime, player) => this._estimateBusinessValue(runtime, player),
            estimateCleaningValue: (runtime, player) => this._estimateCleaningValue(runtime, player),
            estimateMoverValue: (runtime, player) => this._estimateMoverValue(runtime, player),
            estimateRenovationValue: (runtime, player, ordinal) =>
                this._estimateRenovationValue(runtime, player, ordinal),
            estimateItStartupValue: (runtime, player) => this._estimateItStartupValue(runtime, player),
            estimateParkValue: (runtime, player) => this._estimateParkValue(runtime, player),
        });
    }

    _estimateRollScore(game, dice) {
        let selfPositiveIncome = 0;
        let selfOtherValue = 0;
        let opponentValue = 0;
        const current = game.currentPlayer();
        for (const player of game.players) {
            for (const card of player.cards) {
                if (player.isDormant(card)) continue;
                if (!card.diceNums.includes(dice)) continue;
                const value = this._cardActivationValue(card, game, player, current, dice);
                if (player === current) {
                    const incomeValue = Math.max(0, this._cardSelfIncomeValue(card, game, player, current, dice));
                    selfPositiveIncome += incomeValue;
                    selfOtherValue += value - incomeValue;
                } else {
                    opponentValue += value * (card.color === "blue" ? 0.7 : 1);
                }
            }
        }
        return this._expertV2CappedPositiveIncome(game, current, selfPositiveIncome) + selfOtherValue - opponentValue;
    }

    _estimateOpponentRedRisk(game, dice) {
        if (!game || this.expertRollRiskMode !== "red") return 0;
        const current = game.currentPlayer();
        if (!current) return 0;
        let risk = 0;
        for (const player of game.players) {
            if (player === current) continue;
            for (const card of player.cards) {
                if (player.isDormant(card)) continue;
                if (card.color !== "red" || !card.diceNums.includes(dice)) continue;
                risk += Math.max(0, this._cardActivationValue(card, game, player, current, dice));
            }
        }
        return risk;
    }

    _estimateRiskAdjustedRollScore(game, dice) {
        const baseScore = this._estimateRollScoreCached(game, dice);
        if (this.expertRollRiskMode !== "red" || this.expertRollRedRiskWeight <= 0) return baseScore;
        return baseScore - this._estimateOpponentRedRisk(game, dice) * this.expertRollRedRiskWeight;
    }

    _expertV2CappedPositiveIncome(game, player, value) {
        if (!this._isExpertV2Simple()) return value;
        return CPUEvaluation.expertPositiveIncomeCap(value, this.expertIncomeCapMode, {
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
    }

    _cardSelfIncomeValue(card, game, owner, roller, dice) {
        return CPUEvaluation.cardSelfIncomeValue(
            card, game, owner, roller,
            CARD_EFFECTS, CARD_CATEGORIES, LANDMARK_NAMES,
            GameManager.calcCardIncome
        );
    }

    _expectedDiceScore(game, useTwo) {
        const cache = this._rollEvaluationCache(game);
        const cacheKey = useTwo ? 'two' : 'one';
        if (cacheKey in cache.expectedDiceScores) {
            return cache.expectedDiceScores[cacheKey];
        }
        const score = CPUEvaluation.expectedDiceScore(
            this._diceOutcomeWeights(useTwo),
            dice => this._estimateRiskAdjustedRollScore(game, dice)
        );
        cache.expectedDiceScores[cacheKey] = score;
        return score;
    }

    _expectedDiceScoreWithHarbor(game, useTwo) {
        const cache = this._rollEvaluationCache(game);
        const cacheKey = useTwo ? 'two' : 'one';
        if (cacheKey in cache.expectedDiceScoresWithHarbor) {
            return cache.expectedDiceScoresWithHarbor[cacheKey];
        }
        const current = game.currentPlayer();
        const canUseHarbor = useTwo && current.landmarks[LANDMARK_NAMES.HARBOR];
        const score = CPUEvaluation.expectedDiceScore(
            this._diceOutcomeWeights(useTwo),
            dice => this._estimateRiskAdjustedRollScore(game, dice),
            canUseHarbor ? {
                alternateMinDice: 10,
                alternateScoreForDice: dice => this._estimateRiskAdjustedRollScore(game, dice + 2),
            } : {}
        );
        cache.expectedDiceScoresWithHarbor[cacheKey] = score;
        return score;
    }

    _diceOutcomeWeights(useTwo) {
        return CPUSimulation.diceOutcomeWeights(useTwo);
    }

    _simulationShopStock(playerCount = 2) {
        return CPUSimulation.buildShopStock(CARDS, playerCount, getInitialCardStock);
    }

    _expertLookaheadSteps(game, focusIndex, baseSteps) {
        const player = game.players[focusIndex];
        const remainingLandmarks = [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length;
        return CPUEvaluation.expertLookaheadSteps(
            game.players.length, remainingLandmarks, game.phase, GAME_PHASES.BUILD, this.simulationMode, baseSteps
        );
    }
    _scoreExpertChoiceState(game, focusIndex) {
        return CPUChoiceScoring.scoreExpertChoiceState(this, game, focusIndex);
    }

    _shouldUseExpertChoiceLookahead(game, focusIndex) {
        return CPUChoiceScoring.shouldUseExpertChoiceLookahead(this, game, focusIndex);
    }

    _expectedExpertChoiceValue(game, focusIndex, outcomes, applyOutcome) {
        return CPUChoiceScoring.expectedExpertChoiceValue(this, game, focusIndex, outcomes, applyOutcome);
    }

    _scoreExpertPendingChoice(game, applyChoice) {
        return CPUChoiceScoring.scoreExpertPendingChoice(this, game, applyChoice);
    }

    _scoreStrongPendingChoice(game, applyChoice) {
        return CPUChoiceScoring.scoreStrongPendingChoice(this, game, applyChoice);
    }

    _crowdLeaderBonus(game, targetIndex, weight = 1) {
        return CPUEvaluation.crowdLeaderBonus({
            gameAvailable: !!game,
            playerCount: game ? game.players.length : 0,
            currentPlayerIndex: game ? game.currentPlayerIndex : -1,
            targetIndex,
            weight,
            playerExists: index => !!game.players[index],
            threatForPlayer: index => this._estimateOpponentThreat(game.players[index], game),
        });
    }

    _crowdCleaningBonus(game, cardName, weight = 1) {
        return CPUEvaluation.crowdCleaningBonus({
            gameAvailable: !!game,
            playerCount: game ? game.players.length : 0,
            currentPlayerIndex: game ? game.currentPlayerIndex : -1,
            weight,
            threatForPlayer: index => this._estimateOpponentThreat(game.players[index], game),
            matchingActiveCardCount: index => {
                const opponent = game.players[index];
                return opponent.getMinorCards().filter(card =>
                    card.name === cardName && !opponent.isDormant(card)
                ).length;
            },
        });
    }

    _remainingEnabledLandmarks(current, game) {
        return CPULegalMoves.remainingEnabledLandmarkNames(
            current, game.enabledLandmarks, Player.landmarkNames()
        );
    }

    _isEndgameMode(current, game, threshold = 2) {
        return CPULegalMoves.isEndgame(
            current, game.enabledLandmarks, Player.landmarkNames(), threshold
        );
    }

    _estimatePurchasePlanValue(player, game, difficulty = this.difficulty) {
        return CPUChoiceScoring.estimatePurchasePlanValue(this, player, game, difficulty);
    }

    _estimatePurchasePlanValueUncached(player, game, difficulty = this.difficulty) {
        return CPUChoiceScoring.estimatePurchasePlanValueUncached(this, player, game, difficulty);
    }

    _scoreStrongChoiceState(game, focusIndex) {
        return CPUChoiceScoring.scoreStrongChoiceState(this, game, focusIndex);
    }

    _expectedStrongChoiceValue(game, focusIndex, outcomes, applyOutcome) {
        return CPUChoiceScoring.expectedStrongChoiceValue(this, game, focusIndex, outcomes, applyOutcome);
    }

    _strongLiteUseHeuristicChoices() {
        return this.difficulty === "strong" && this.simulationMode === "lite";
    }

    chooseDiceCount(game) {
        return CPURollDecision.chooseDiceCount(this, game);
    }

    _expertV2SimpleStrongCrowdDiceThreshold(game) {
        if (!game || !game.players || game.players.length < 4) return false;
        let strongOpponents = 0;
        for (let i = 0; i < game.players.length; i++) {
            if (i === game.currentPlayerIndex) continue;
            const difficulty = this.expertOpponentDifficulties && this.expertOpponentDifficulties[i]
                ? this.expertOpponentDifficulties[i]
                : game.players[i] && game.players[i].difficulty;
            if (difficulty === "strong") strongOpponents++;
        }
        return strongOpponents >= 2;
    }

    chooseReroll(game) {
        return CPURollDecision.chooseReroll(this, game);
    }

    chooseHarbor(game) {
        return CPURollDecision.chooseHarbor(this, game);
    }

    chooseTVTarget(game) {
        return CPUPendingDecision.chooseTVTarget(this, game);
    }

    _scoreExpertV2SimpleTVTarget(game, player, steal, built) {
        return CPUEvaluation.v2SimpleTvTargetScore({
            beforeShortfall: this._closestLandmarkShortfall(player, game),
            coins: player.coins,
            steal,
            builtLandmarkCount: built,
            remainingLandmarkCosts: this._remainingEnabledLandmarks(player, game)
                .map(name => Player.landmarkCost(name)),
        });
    }

    chooseBusinessMove(game) {
        return CPUPendingDecision.chooseBusinessMove(this, game);
    }

    resolveBusiness(game) {
        const move = this.chooseBusinessMove(game);
        if (!move) {
            game.pendingBusiness = false;
            game.phase = GAME_PHASES.BUILD;
            return;
        }
        game.resolveBusiness(move.myCard, move.targetIndex, move.theirCard);
    }

    chooseCleaningTarget(game) {
        return CPUPendingDecision.chooseCleaningTarget(this, game);
    }

    _scoreExpertV2SimpleCleaningValue(game, name) {
        const current = game.currentPlayer();
        const features = CPUEvaluation.expertV2SimpleCleaningFeatures(
            name,
            current,
            game.players,
            {
                minorCards: player => player.getMinorCards(),
                isDormant: (player, card) => player.isDormant(card),
                ownedCardValue: (card, player) => this._ownedCardValue(card, game, player),
            }
        );
        return CPUEvaluation.expertV2SimpleCleaningScore(features);
    }

    chooseMoverMove(game) {
        return CPUPendingDecision.chooseMoverMove(this, game);
    }

    chooseRenovationTarget(game) {
        return CPUPendingDecision.chooseRenovationTarget(this, game);
    }

    chooseITInvest(game) {
        return CPUPendingDecision.chooseITInvest(this, game);
    }

    // ===== カード評価 =====

    // ゲーム状況を踏まえたカードの期待収入スコア
    evalCard(card, game, player) {
        return CPUCardEvaluationRuntime.evalCard(this, card, game, player);
    }

    _expertRollIncomeCap(player, game) {
        return CPUCardEvaluationRuntime._expertRollIncomeCap(this, player, game);
    }

    _estimateOwnRollIncome(game, player, dice, candidateCard = null) {
        return CPUCardEvaluationRuntime._estimateOwnRollIncome(this, game, player, dice, candidateCard);
    }

    _scoreExpertRollCapPenalty(card, game, player) {
        return CPUCardEvaluationRuntime._scoreExpertRollCapPenalty(this, card, game, player);
    }

    _singleDiceFreq(diceNums) {
        return CPUCardEvaluationRuntime._singleDiceFreq(this, diceNums);
    }

    _doubleDiceFreq(diceNums) {
        return CPUCardEvaluationRuntime._doubleDiceFreq(this, diceNums);
    }

    _diceFreqForRoller(diceNums, roller) {
        return CPUCardEvaluationRuntime._diceFreqForRoller(this, diceNums, roller);
    }

    _cardDiceFreq(card, game, player) {
        return CPUCardEvaluationRuntime._cardDiceFreq(this, card, game, player);
    }

    _diceFreq(diceNums) {
        return CPUCardEvaluationRuntime._diceFreq(this, diceNums);
    }

    _baseCardEfficiency(card, game, player) {
        return CPUCardEvaluationRuntime._baseCardEfficiency(this, card, game, player);
    }

    sortAffordable(cards, game, player) {
        return CPUCardEvaluationRuntime.sortAffordable(this, cards, game, player);
    }

    _scoreExpertCardCandidate(card, game, player) {
        return CPUCardEvaluationRuntime._scoreExpertCardCandidate(this, card, game, player);
    }

    _cardSpamPenalty(card, player, intensity = 1) {
        return CPUCardEvaluationRuntime._cardSpamPenalty(this, card, player, intensity);
    }

    _duplicateRenovationPenalty(player, difficulty = this.difficulty, game = null) {
        return CPUCardEvaluationRuntime._duplicateRenovationPenalty(this, player, difficulty, game);
    }

    _strongRolePressure(card, game, player) {
        return CPUCardEvaluationRuntime._strongRolePressure(this, card, game, player);
    }

    _normalSafetyAdjustment(card, game, player) {
        return CPUCardEvaluationRuntime._normalSafetyAdjustment(this, card, game, player);
    }

    _economyBalancePenalty(card, game, player, intensity = 1) {
        return CPUCardEvaluationRuntime._economyBalancePenalty(this, card, game, player, intensity);
    }

    _strongConditionalCardAdjustment(card, game, player) {
        return CPUCardEvaluationRuntime._strongConditionalCardAdjustment(this, card, game, player);
    }

    _strongLandmarkThresholdPenalty(name, current, game) {
        return CPUCardEvaluationRuntime._strongLandmarkThresholdPenalty(this, name, current, game);
    }

    _strongTempoValueBonus(card, game, player) {
        return CPUCardEvaluationRuntime._strongTempoValueBonus(this, card, game, player);
    }

    _strongCrowdOneDieOpponents(game, player = null) {
        return CPUCardEvaluationRuntime._strongCrowdOneDieOpponents(this, game, player);
    }

    _strongCrowdAttackScale(game) {
        return CPUCardEvaluationRuntime._strongCrowdAttackScale(this, game);
    }

    _isStrongCrowd(game) {
        return CPUCardEvaluationRuntime._isStrongCrowd(this, game);
    }

    _strongPurpleAdjustment(card, game, player) {
        return CPUCardEvaluationRuntime._strongPurpleAdjustment(this, card, game, player);
    }

    _landmarkCardSynergyBonus(card, game, player) {
        return CPUCardEvaluationRuntime._landmarkCardSynergyBonus(this, card, game, player);
    }

    _strongPremiumPurpleReady(card, game, player) {
        return CPUCardEvaluationRuntime._strongPremiumPurpleReady(this, card, game, player);
    }

    _strongCrowdPurchaseScore(score, card, game, player) {
        return CPUCardEvaluationRuntime._strongCrowdPurchaseScore(this, score, card, game, player);
    }

    _strongLandmarkUrgencyBonus(name, current, game) {
        return CPUCardEvaluationRuntime._strongLandmarkUrgencyBonus(this, name, current, game);
    }

    _strongSoftCapValue(value) {
        return CPUCardEvaluationRuntime._strongSoftCapValue(this, value);
    }

    _strongCrowdDisruptionReady(game, player) {
        return CPUCardEvaluationRuntime._strongCrowdDisruptionReady(this, game, player);
    }

    _strongCrowdPremiumPurple(card) {
        return CPUCardEvaluationRuntime._strongCrowdPremiumPurple(this, card);
    }

    _scoreAffordablePurchase(card, game, player, options = {}) {
        return CPUCardEvaluationRuntime._scoreAffordablePurchase(this, card, game, player, options);
    }

    _sortAffordableForDifficulty(cards, game, player, difficulty) {
        return CPUCardEvaluationRuntime._sortAffordableForDifficulty(this, cards, game, player, difficulty);
    }

    _bestAffordableLandmark(current, game, reserve = 0) {
        return CPUCardEvaluationRuntime._bestAffordableLandmark(this, current, game, reserve);
    }

    _strongTargetLandmark(current, game) {
        return CPUCardEvaluationRuntime._strongTargetLandmark(this, current, game);
    }

    _strongAttackUnlocked(current, game, targetLandmark = null) {
        return CPUCardEvaluationRuntime._strongAttackUnlocked(this, current, game, targetLandmark);
    }

    _bestStrongEconomyCard(sorted, game, current, attackUnlocked) {
        return CPUCardEvaluationRuntime._bestStrongEconomyCard(this, sorted, game, current, attackUnlocked);
    }

    _tryEndgameBuild(current, game, shopStock, difficulty) {
        if (!this._isEndgameMode(current, game, difficulty === "strong" ? 3 : 2)) return false;
        if (this._buyLateGameLandmark(current, game)) return true;
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            card.cost > 0 &&
            !(card.color === "purple" && current.countCardIncludingDormant(card.name) > 0)
        );
        const ranked = this._sortAffordableForDifficulty(affordable, game, current, difficulty);
        if (ranked.length === 0) return false;
        const bestLandmark = this._bestAffordableLandmark(current, game);
        if (bestLandmark && current.coins + (difficulty === "strong" ? 3 : 2) >= bestLandmark.cost) return false;
        if (difficulty === "expert" && this._shouldExpertStopBuyingCards(current, game, ranked[0].card)) return false;
        if (ranked[0].score >= 0.8) {
            this._buyCard(ranked[0].card, game, shopStock);
            return true;
        }
        return false;
    }

    _chooseExpertV2SimpleITInvest(game) {
        if (this.expertInvestMode === "never") return false;
        if (this.expertInvestMode !== "landmarkAware") return true;
        const current = game.currentPlayer();
        if (!current || current.coins < 1) return false;
        const remaining = this._remainingEnabledLandmarks(current, game);
        if (remaining.length === 0) return true;
        const bestShortfall = CPUSelection.stableRankAscending(
            remaining
                .map(name => Player.landmarkCost(name) - current.coins)
                .filter(shortfall => Number.isFinite(shortfall)),
            shortfall => shortfall
        )[0];
        if (bestShortfall <= 0) return false;
        if (remaining.length <= 3 && bestShortfall <= 3) return false;
        return true;
    }

    _shouldStrongBuyAttackCard(game, current, targetLandmark = null) {
        return CPUCardEvaluationRuntime._shouldStrongBuyAttackCard(this, game, current, targetLandmark);
    }

    _bestCrowdEconomyCard(sorted, game = null, current = null) {
        return CPUCardEvaluationRuntime._bestCrowdEconomyCard(this, sorted, game, current);
    }

    _scoreExpertCrowdAffordable(card, game, current) {
        return CPUCardEvaluationRuntime._scoreExpertCrowdAffordable(this, card, game, current);
    }

    _buildExpertCrowd(current, game, shopStock) {
        return CPUBuildStrategy._buildExpertCrowd(this, current, game, shopStock);
    }

    _buildStrongCrowd(current, game, shopStock) {
        return CPUBuildStrategy._buildStrongCrowd(this, current, game, shopStock);
    }

    // ===== 購入戦略 =====

    build(game, shopStock) {
        this._lastBuildActionResult = null;
        if (!game || game.phase !== GAME_PHASES.BUILD || game.builtThisTurn) return null;
        try {
            const proposal = this.chooseBuildAction(game, shopStock);
            return this.executeBuildAction(proposal, game, shopStock);
        } catch (error) {
            console.error('[cpu] build decision failed:', error);
            return this._setBuildActionResult(false);
        }
    }

    /**
     * Applies one already-selected canonical build action.
     * @param {CPUBuildActionProposal|null} proposal
     * @returns {boolean|null}
     */
    executeBuildAction(proposal, game, shopStock) {
        this._lastBuildActionResult = null;
        if (!game || game.phase !== GAME_PHASES.BUILD || game.builtThisTurn) return null;
        if (!proposal) return null;
        try {
            return CPUBuildExecution.executeAction(
                this,
                proposal,
                game,
                shopStock,
                Object.assign(this._buildExecutionContext(), {
                    resolveCard: name => this._cardByName(name),
                })
            );
        } catch (error) {
            console.error('[cpu] build execution failed:', error);
            return this._setBuildActionResult(false);
        }
    }

    /**
     * Selects one canonical build action without mutating the game or shop stock.
     * @returns {CPUBuildActionProposal|null}
     */
    chooseBuildAction(game, shopStock) {
        return CPUBuildStrategy.chooseBuildAction(this, game, shopStock);
    }

    _buildExecutionContext() {
        return {
            isOnlineGame: typeof isOnlineGame !== 'undefined' && isOnlineGame,
            isRoomHost: typeof isRoomHost === 'undefined' || isRoomHost,
            isReconnectingOnline: typeof isReconnectingOnline !== 'undefined' && isReconnectingOnline,
            socketConnected: typeof socket === 'undefined' || !socket ? null : socket.connected,
            sendAction: typeof sendAction === 'function' ? sendAction : null,
            prepareLocalAction: typeof globalThis._prepareLocalGameEngineShadow === 'function'
                ? globalThis._prepareLocalGameEngineShadow
                : null,
            finishLocalAction: typeof globalThis._finishLocalGameEngineShadow === 'function'
                ? globalThis._finishLocalGameEngineShadow
                : null,
        };
    }

    _setBuildActionResult(result) {
        return CPUBuildExecution.setBuildActionResult(this, result);
    }

    _onlineBuildBlocked() {
        return CPUBuildExecution.onlineBuildBlocked(this._buildExecutionContext());
    }

    _buyCard(card, game, shopStock) {
        return CPUBuildExecution.buyCard(this, card, game, shopStock, this._buildExecutionContext());
    }

    _buyLandmark(name, game) {
        return CPUBuildExecution.buyLandmark(this, name, game, this._buildExecutionContext());
    }

    _landmarkUrgency(name, current, game) {
        return CPUCardEvaluationRuntime._landmarkUrgency(this, name, current, game);
    }

    _coinsTowardsNextLandmark(player) {
        return CPUCardEvaluationRuntime._coinsTowardsNextLandmark(this, player);
    }

    _estimateCleaningValue(game, player) {
        return CPUCardEvaluationRuntime._estimateCleaningValue(this, game, player);
    }

    _estimateMoverValue(game, player) {
        return CPUCardEvaluationRuntime._estimateMoverValue(this, game, player);
    }

    _estimateTvTargetValue(game, player, targetIndex) {
        return CPUCardEvaluationRuntime._estimateTvTargetValue(this, game, player, targetIndex);
    }

    _estimateTvValue(game, player) {
        return CPUCardEvaluationRuntime._estimateTvValue(this, game, player);
    }

    _estimateBusinessValue(game, player) {
        return CPUCardEvaluationRuntime._estimateBusinessValue(this, game, player);
    }

    _estimatePublisherValue(game, player) {
        return CPUCardEvaluationRuntime._estimatePublisherValue(this, game, player);
    }

    _estimateTaxOfficeValue(game, player) {
        return CPUCardEvaluationRuntime._estimateTaxOfficeValue(this, game, player);
    }

    _estimateItStartupValue(game, player, options = {}) {
        return CPUCardEvaluationRuntime._estimateItStartupValue(this, game, player, options);
    }

    _estimateConditionalRedValue(card, game, player) {
        return CPUCardEvaluationRuntime._estimateConditionalRedValue(this, card, game, player);
    }

    _estimateRenovationValue(game, player, copyOrdinal = 1) {
        return CPUCardEvaluationRuntime._estimateRenovationValue(this, game, player, copyOrdinal);
    }

    _estimateParkValue(game, player) {
        return CPUCardEvaluationRuntime._estimateParkValue(this, game, player);
    }

    _estimateLoanBurdenValue(player, copyOrdinal = 1) {
        return CPUCardEvaluationRuntime._estimateLoanBurdenValue(this, player, copyOrdinal);
    }

    _exchangeReceivedCardValue(card, game, player) {
        return CPUCardEvaluationRuntime._exchangeReceivedCardValue(this, card, game, player);
    }

    _exchangeOwnedCardValue(card, game, player) {
        return CPUCardEvaluationRuntime._exchangeOwnedCardValue(this, card, game, player);
    }

    _opponentDilutionFactor(game) {
        return CPUCardEvaluationRuntime._opponentDilutionFactor(this, game);
    }

    _receivedCardValue(card, game, player) {
        return CPUCardEvaluationRuntime._receivedCardValue(this, card, game, player);
    }

    _cardDependencyValue(card, player, game) {
        return CPUCardEvaluationRuntime._cardDependencyValue(this, card, player, game);
    }

    _ownedCardValue(card, game, player) {
        return CPUCardEvaluationRuntime._ownedCardValue(this, card, game, player);
    }

    _builtLandmarkValue(name, current, game) {
        return CPUCardEvaluationRuntime._builtLandmarkValue(this, name, current, game);
    }

    _buyWinningLandmark(current, game) {
        const remaining = Player.landmarkNames()
            .filter(name => (!game.enabledLandmarks || game.enabledLandmarks.has(name)) && !current.landmarks[name]);
        if (remaining.length !== 1) return false;
        const name = remaining[0];
        if (current.coins < Player.landmarkCost(name)) return false;
        this._buyLandmark(name, game);
        return true;
    }

    _listExpertV2SimpleAffordableLandmarks(current, game) {
        return CPULegalMoves.affordableLandmarkNames(
            current,
            game.enabledLandmarks,
            Player.landmarkNames(),
            Player.landmarkCost,
            true
        ).map(name => ({ type: 'landmark', name }));
    }

    _listExpertV2SimpleAffordableCards(current, shopStock) {
        return CPULegalMoves.affordableCards(current, shopStock, CARDS)
            .map(card => ({ type: 'card', card }));
    }

    _buildExpertV2Simple(current, game, shopStock) {
        return CPUBuildStrategy._buildExpertV2Simple(this, current, game, shopStock);
    }

    _shouldCompareExpertV2SimpleLandmarkWithCards(landmarkName) {
        if (this.expertLandmarkCardCompareTargets === "none") return false;
        if (this.expertLandmarkCardCompareTargets === "all") return true;
        if (this.expertLandmarkCardCompareTargets === "harbor") {
            return landmarkName === LANDMARK_NAMES.HARBOR;
        }
        if (this.expertLandmarkCardCompareTargets === "mall") {
            return landmarkName === LANDMARK_NAMES.SHOPPING_MALL;
        }
        return landmarkName === LANDMARK_NAMES.HARBOR ||
            landmarkName === LANDMARK_NAMES.SHOPPING_MALL;
    }

    _shouldForceExpertV2SimpleLandmarkProgress(game) {
        const current = game.currentPlayer();
        return this._remainingEnabledLandmarks(current, game).length <= this.expertLandmarkProgressRemaining;
    }

    _expertV2SimpleLandmarkOverrideMargin(game, landmarkName) {
        return this.expertLandmarkCardMargin;
    }

    _scoreExpertV2SimpleCardOptionForLandmarkComparison(game, option, breakdown, hasAffordableLandmark) {
        const penalty = this._expertV2SimpleLandmarkCardPenalty(game, option, hasAffordableLandmark);
        if (!hasAffordableLandmark || this.expertLandmarkCardCompareMode !== "delta") return breakdown.total - penalty;
        const current = game.currentPlayer();
        const beforeOne = this._expectedDiceScoreWithHarbor(game, false);
        const beforeTwo = current.landmarks[LANDMARK_NAMES.STATION]
            ? this._expectedDiceScoreWithHarbor(game, true)
            : -Infinity;
        const beforeRoll = Math.max(beforeOne, beforeTwo);
        const deltaEv = breakdown.baseEv - beforeRoll;
        return (
            deltaEv * 8 +
            (breakdown.comboUnlockBonus || 0) +
            (breakdown.tempoBonus || 0) +
            (breakdown.redOpponentTurnBonus || 0) -
            (breakdown.renovationRiskPenalty || 0) -
            penalty
        );
    }

    _expertV2SimpleLandmarkCardPenalty(game, option, hasAffordableLandmark) {
        return CPUEvaluation.landmarkCardPenalty(
            hasAffordableLandmark,
            this.expertLandmarkCardPenaltyMode,
            option,
            CARD_EFFECTS,
            () => this._remainingEnabledLandmarks(game.currentPlayer(), game).length
        );
    }

    _scoreExpertV2SimpleLandmarkOption(game, name) {
        const current = game.currentPlayer();
        const beforeOne = this._expectedDiceScoreWithHarbor(game, false);
        const beforeTwo = current.landmarks[LANDMARK_NAMES.STATION]
            ? this._expectedDiceScoreWithHarbor(game, true)
            : -Infinity;
        const beforeRoll = Math.max(beforeOne, beforeTwo);

        const clone = this._cloneGame(game);
        const cloneCurrent = clone.currentPlayer();
        cloneCurrent.coins -= Player.landmarkCost(name);
        cloneCurrent.landmarks[name] = true;
        const afterOne = this._expectedDiceScoreWithHarbor(clone, false);
        const afterTwo = cloneCurrent.landmarks[LANDMARK_NAMES.STATION]
            ? this._expectedDiceScoreWithHarbor(clone, true)
            : -Infinity;
        const rollDelta = Math.max(afterOne, afterTwo) - beforeRoll;

        return (
            Player.landmarkCost(name) * this.expertLandmarkCostWeight +
            this._landmarkUrgency(name, current, game) * 0.6 +
            rollDelta * 2.5 +
            this._expertV2SimpleLandmarkEffectBonus(game, name, rollDelta)
        );
    }

    _expertV2SimpleLandmarkEffectBonus(game, name, rollDelta = 0) {
        const current = game.currentPlayer();
        const remaining = this._remainingEnabledLandmarks(current, game).length;
        const mallTargetCardCount = name === LANDMARK_NAMES.SHOPPING_MALL
            ? current.cards.filter(card =>
                card.category === CARD_CATEGORIES.RESTAURANT || card.category === CARD_CATEGORIES.SHOP
            ).length
            : 0;
        const harborCardCount = name === LANDMARK_NAMES.HARBOR
            ? current.cards.filter(card =>
                card.effect === CARD_EFFECTS.HARBOR ||
                card.effect === CARD_EFFECTS.HARBOR_RED ||
                card.effect === CARD_EFFECTS.TUNA
            ).length
            : 0;
        const rollSwing = name === LANDMARK_NAMES.RADIO_TOWER
            ? Math.max(0, this._expectedDiceScoreWithHarbor(game, true) - this._expectedDiceScoreWithHarbor(game, false))
            : 0;
        return CPUEvaluation.expertLandmarkEffectBonus(name, {
            remainingLandmarkCount: remaining,
            hasStation: !!current.landmarks[LANDMARK_NAMES.STATION],
            mallTargetCardCount,
            harborCardCount,
            harborBaseBonus: this.expertHarborLandmarkBaseBonus,
            rollDelta,
            rollSwing,
        }, LANDMARK_NAMES);
    }

    _sameExpertV2SimpleBuildOption(a, b) {
        return CPUEvaluation.sameBuildOption(a, b);
    }

    _scoreExpertV2SimpleBuildOption(game, option, shopStock = null) {
        return this._scoreExpertV2SimpleBuildOptionBreakdown(game, option, shopStock).total;
    }

    _scoreExpertV2SimpleBuildOptionBreakdown(game, option, shopStock = null) {
        return CPUBuildScoring._scoreExpertV2SimpleBuildOptionBreakdown(this, game, option, shopStock);
    }

    _expertV2SimpleLateBasicDuplicatePenalty(game, option, deltaEv) {
        const current = game && game.currentPlayer();
        return CPUEvaluation.lateBasicDuplicatePenalty(
            this._isExpertV2Simple(),
            game && game.players ? game.players.length : 0,
            current,
            option,
            deltaEv,
            LANDMARK_NAMES.SHOPPING_MALL,
            () => this._remainingEnabledLandmarks(current, game).length
        );
    }

    _expertV2SimpleRedOpponentTurnBonus(game, option) {
        if (!this._isExpertV2Simple() || !option || option.type !== 'card' || !option.card) return 0;
        const card = option.card;
        if (card.color !== 'red') return 0;
        const current = game.currentPlayer();
        let total = 0;
        for (const opponent of game.players) {
            if (opponent === current) continue;
            const freq = this._diceFreqForRoller(card.diceNums, opponent);
            if (freq <= 0) continue;
            total += this._expertV2SimpleRedOpponentFutureValue(card, game, current, opponent) * freq / 36;
        }
        return Math.min(1, Math.max(0, total * 0.25));
    }

    _expertV2SimpleRedOpponentFutureValue(card, game, owner, roller) {
        if (!card || card.color !== "red") return 0;
        if (card.effect === CARD_EFFECTS.FRENCHR) {
            return roller.landmarks && roller.builtLandmarkCount() >= 2 ? this._strongSoftCapValue(card.income) : 0;
        }
        if (card.effect === CARD_EFFECTS.MEMBERBAR) {
            return roller.landmarks && roller.builtLandmarkCount() >= 3 ? this._strongSoftCapValue(Math.max(roller.coins, 4)) : 0;
        }
        return this._cardActivationValue(card, game, owner, roller, card.diceNums[0]);
    }

    _expertV2SimpleRenovationRiskPenalty(game, option) {
        if (!this._isExpertV2Simple() || !option || option.type !== 'card' || !option.card) return 0;
        if (option.card.name !== "改装屋") return 0;
        const current = game.currentPlayer();
        const owned = current.countCard("改装屋");
        if (owned <= 0) return 0;
        const nextPlayer = Object.create(current);
        nextPlayer.countCard = name => (name === "改装屋" ? owned + 1 : current.countCard(name));
        const scaledPenalty = this._duplicateRenovationPenalty(nextPlayer, "strong", game) * 0.2;
        return Math.min(4, Math.max(1.5, scaledPenalty));
    }

    _expertV2SimpleBuildTempoBonus(game) {
        if (!this._isExpertV2Simple() || this.expertBuildTempoWeight <= 0) return 0;
        const current = game.currentPlayer();
        const names = game.enabledLandmarks ? [...game.enabledLandmarks] : Player.landmarkNames();
        const remainingCosts = names
            .filter(name => !current.landmarks[name])
            .map(name => Player.landmarkCost(name))
            .filter(cost => Number.isFinite(cost) && cost > 0);
        if (remainingCosts.length === 0) return 0;
        return Math.min(current.coins, Math.min(...remainingCosts)) * this.expertBuildTempoWeight;
    }

    _expertV2SimpleComboUnlockBonus(game, option, shopStock = null) {
        if (!this._isExpertV2Simple() || (this.expertComboMode !== "unlock" && this.expertComboMode !== "core")) return 0;
        if (!option || option.type !== 'card' || !option.card) return 0;
        const current = game.currentPlayer();
        const card = option.card;
        const futurePayoffs = this._expertV2SimpleFuturePayoffCards(card, this.expertComboMode);
        if (futurePayoffs.length === 0) return 0;

        let bonus = 0;
        for (const payoffName of futurePayoffs) {
            if (current.countCard(payoffName) > 0) continue;
            if (shopStock && shopStock[payoffName] <= 0) continue;
            const payoff = this._cardByName(payoffName);
            if (!payoff) continue;
            const marginalIncome = this._expertV2SimpleMarginalComboIncome(card, payoff);
            if (marginalIncome <= 0) continue;
            const activationRate = this._cardDiceFreq(payoff, game, current) / 36;
            bonus += marginalIncome * activationRate * this.expertComboWeight;
        }
        return Math.min(bonus, 3);
    }

    _expertV2SimpleFuturePayoffCards(card, mode = "unlock") {
        return CPUEvaluation.futurePayoffCardNames(card, mode, CARD_CATEGORIES);
    }

    _expertV2SimpleMarginalComboIncome(enabler, payoff) {
        return CPUEvaluation.marginalComboIncome(
            enabler,
            payoff,
            CARD_CATEGORIES,
            CARD_EFFECTS
        );
    }

    _buyLateGameLandmark(current, game) {
        const remaining = Player.landmarkNames()
            .filter(name => (!game.enabledLandmarks || game.enabledLandmarks.has(name)) && !current.landmarks[name]);
        if (remaining.length === 0) return false;
        if (this.difficulty !== "expert" && remaining.length > 2) return false;
        if (this.difficulty === "expert" && remaining.length > 3) return false;
        const affordableCandidates = remaining
            .map(name => ({ name, cost: Player.landmarkCost(name), urgency: this._landmarkUrgency(name, current, game) }))
            .filter(entry => current.coins >= entry.cost);
        const affordable = CPUSelection.stableRankLexicographic(affordableCandidates, [
            { valueOf: entry => entry.urgency, direction: CPUSelection.directions.DESCENDING },
            { valueOf: entry => entry.cost, direction: CPUSelection.directions.ASCENDING },
        ]);
        if (affordable.length === 0) return false;
        if (this.difficulty === "expert" && remaining.length === 3 && affordable[0].urgency < 8) return false;
        this._buyLandmark(affordable[0].name, game);
        return true;
    }

    _shouldExpertForceLandmarkPlan(current, game) {
        if (this.difficulty !== "expert") return false;
        const remaining = this._remainingEnabledLandmarks(current, game);
        if (remaining.length === 0 || remaining.length > 3) return false;
        const bestLandmark = this._bestAffordableLandmark(current, game);
        const urgentLandmark = CPUSelection.stableRankLexicographic(remaining
            .map(name => ({
                name,
                shortfall: Player.landmarkCost(name) - current.coins,
                urgency: this._landmarkUrgency(name, current, game),
            })), [
            { valueOf: entry => entry.urgency, direction: CPUSelection.directions.DESCENDING },
            { valueOf: entry => entry.shortfall, direction: CPUSelection.directions.ASCENDING },
        ])[0];
        if (bestLandmark && bestLandmark.urgency >= 7) return true;
        if (urgentLandmark && urgentLandmark.urgency >= 7 && urgentLandmark.shortfall <= 2) return true;
        if (current.builtLandmarkCount() >= 3 && urgentLandmark && urgentLandmark.shortfall <= 4) return true;
        return false;
    }

    _shouldExpertStopBuyingCards(current, game, card = null) {
        if (this.difficulty !== "expert") return false;
        if (!this._shouldExpertForceLandmarkPlan(current, game)) return false;
        const remaining = this._remainingEnabledLandmarks(current, game).length;
        const bestLandmark = this._bestAffordableLandmark(current, game);
        if (bestLandmark && bestLandmark.urgency >= 7) return true;
        if (remaining <= 2) return true;
        if (card && card.cost >= 3) return true;
        return current.builtLandmarkCount() >= 3;
    }

    _cloneGame(game) {
        return this._profileMeasure(
            'expert.cloneGame',
            () => CPUSimulation.cloneGame(game, CPU_SIMULATION_GAME_ADAPTER)
        );
    }

    _estimatePlayerTurnValue(game, playerIndex) {
        const cache = this._stateEvaluationCache(game);
        if (playerIndex in cache.playerTurnValues) return cache.playerTurnValues[playerIndex];
        const scores = this._estimatePlayerTurnScorePair(game, playerIndex);
        const value = Math.max(scores.one, scores.two);
        const normalized = Number.isFinite(value) ? value : 0;
        cache.playerTurnValues[playerIndex] = normalized;
        return normalized;
    }

    _estimatePlayerTurnScorePair(game, playerIndex) {
        const cache = this._stateEvaluationCache(game);
        if (playerIndex in cache.playerTurnScorePairs) return cache.playerTurnScorePairs[playerIndex];
        const original = game.currentPlayerIndex;
        game.currentPlayerIndex = playerIndex;
        try {
            const rollCache = this._rollEvaluationCache(game);
            const getRollScore = dice => {
                if (!(dice in rollCache.rollScores)) {
                    rollCache.rollScores[dice] = this._estimateRollScore(game, dice);
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
    }

    _countReachableLandmarks(player, enabledLandmarks) {
        return CPUEvaluation.countReachableLandmarks(player, enabledLandmarks, Player.landmarkCost);
    }

    _isProgressIncomeCard(card, player) {
        return CPUEvaluation.isProgressIncomeCard(card, player, CARD_EFFECTS);
    }

    _estimateStableIncome(game, player) {
        const playerIndex = game && game.players ? game.players.indexOf(player) : -1;
        let cache = null;
        if (playerIndex >= 0) {
            cache = this._stateEvaluationCache(game);
            if (playerIndex in cache.stableIncomes) return cache.stableIncomes[playerIndex];
        }
        const total = CPUEvaluation.progressIncomeTotal(
            player.cards,
            card => this._isProgressIncomeCard(card, player),
            card => this._ownedCardValue(card, game, player)
        );
        if (cache) cache.stableIncomes[playerIndex] = total;
        return total;
    }

    _estimateProgressIncome(game, player) {
        if (!game || !player) return 0;
        const playerIndex = game.players ? game.players.indexOf(player) : -1;
        let cache = null;
        if (playerIndex >= 0) {
            cache = this._stateEvaluationCache(game);
            if (playerIndex in cache.progressIncomes) return cache.progressIncomes[playerIndex];
        }
        const total = CPUEvaluation.progressIncomeTotal(
            player.cards,
            card => this._isProgressIncomeCard(card, player),
            card => this.evalCard(card, game, player) * this._cardDiceFreq(card, game, player) / 6
        );
        if (cache) cache.progressIncomes[playerIndex] = total;
        return total;
    }

    _estimateWinDistance(player, game) {
        if (!player || !game || !game.enabledLandmarks) return Infinity;
        const playerIndex = game.players ? game.players.indexOf(player) : -1;
        if (playerIndex >= 0) {
            const cache = this._stateEvaluationCache(game);
            if (playerIndex in cache.winDistances) return cache.winDistances[playerIndex];
            const value = this._estimateWinDistanceUncached(player, game, playerIndex);
            cache.winDistances[playerIndex] = value;
            return value;
        }
        return this._estimateWinDistanceUncached(player, game, playerIndex);
    }

    _estimateWinDistanceUncached(player, game, playerIndex = -1) {
        if (!player || !game || !game.enabledLandmarks) return Infinity;
        const remaining = [...game.enabledLandmarks]
            .filter(name => !player.landmarks[name])
            .map(name => ({
                name,
                cost: Player.landmarkCost(name),
                urgency: this._landmarkUrgency(name, player, game),
            }));
        if (remaining.length === 0) return 0;
        const turnValue = playerIndex >= 0 ? this._estimatePlayerTurnValue(game, playerIndex) : 0;
        const reachable = remaining.filter(entry => player.coins >= entry.cost).length;
        const progressIncome = this._estimateProgressIncome(game, player);
        return CPUEvaluation.estimateWinDistance({
            remainingLandmarks: remaining,
            playerCoins: player.coins,
            turnValue,
            reachable,
            progressIncome,
            crowdFocus: this._expertFlagEnabled("crowdWinDistanceFocus") && game.players.length >= 4,
        });
    }

    _estimateRedPressure(game, playerIndex) {
        const cache = this._stateEvaluationCache(game);
        if (playerIndex in cache.redPressures) return cache.redPressures[playerIndex];
        let pressure = 0;
        for (let i = 0; i < game.players.length; i++) {
            if (i === playerIndex) continue;
            const opponent = game.players[i];
            for (const card of opponent.cards) {
                if (opponent.isDormant(card) || card.color !== "red") continue;
                pressure += this._ownedCardValue(card, game, opponent);
            }
        }
        cache.redPressures[playerIndex] = pressure;
        return pressure;
    }

    _estimateOpponentThreat(opponent, game) {
        const opponentIndex = game.players ? game.players.indexOf(opponent) : -1;
        if (opponentIndex >= 0) {
            const cache = this._stateEvaluationCache(game);
            if (opponentIndex in cache.opponentThreats) return cache.opponentThreats[opponentIndex];
            const value = this._estimateOpponentThreatUncached(opponent, game, opponentIndex);
            cache.opponentThreats[opponentIndex] = value;
            return value;
        }
        return this._estimateOpponentThreatUncached(opponent, game, opponentIndex);
    }

    _estimateOpponentThreatUncached(opponent, game, opponentIndex = -1) {
        const enabledLandmarks = [...game.enabledLandmarks];
        const progress = enabledLandmarks.filter(name => opponent.landmarks[name]).length;
        const turnValue = this._estimatePlayerTurnValue(game, opponentIndex);
        const reachable = this._countReachableLandmarks(opponent, enabledLandmarks);
        const winDistance = this._estimateWinDistance(opponent, game);
        return CPUEvaluation.estimateOpponentThreat({
            coins: opponent.coins,
            turnValue,
            landmarkProgress: progress,
            builtLandmarkCount: opponent.builtLandmarkCount(),
            reachableLandmarks: reachable,
            winDistance,
        });
    }

    _bestOpponentWinDistance(game, playerIndex) {
        let best = Infinity;
        for (let i = 0; i < game.players.length; i++) {
            if (i === playerIndex) continue;
            best = Math.min(best, this._estimateWinDistance(game.players[i], game));
        }
        return best;
    }

    _evaluatePosition(game, playerIndex) {
        const player = game.players[playerIndex];
        const tuning = this.expertTuning;
        if (player.hasWon([...game.enabledLandmarks])) return 100000;
        const myTurnValue = this._estimatePlayerTurnValue(game, playerIndex);
        const enabledLandmarks = [...game.enabledLandmarks];
        const myLandmarkProgress = enabledLandmarks.filter(name => player.landmarks[name]).length;
        const remainingLandmarks = enabledLandmarks.filter(name => !player.landmarks[name]);
        const reachableLandmarks = this._countReachableLandmarks(player, enabledLandmarks);
        const stableIncome = this._estimateStableIncome(game, player);
        const winDistance = this._estimateWinDistance(player, game);
        const redPressure = this._estimateRedPressure(game, playerIndex);
        const lowValueSpam = player.countCard("改装屋") + player.countCard("貸金業") + player.countCard("雑貨屋");
        const builtLandmarkCount = player.builtLandmarkCount();
        const duplicateRenovationPenalty = this._duplicateRenovationPenalty(player, "expert", game);
        const airportIdleBonus = Boolean(
            player.landmarks[LANDMARK_NAMES.AIRPORT] &&
            !game.builtThisTurn &&
            game.currentPlayerIndex === playerIndex
        );
        const opponentThreats = [];
        for (let i = 0; i < game.players.length; i++) {
            if (i === playerIndex) continue;
            opponentThreats.push(this._estimateOpponentThreat(game.players[i], game));
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
    }

    _scoreExpertCardPenalty(cardName, player, game) {
        return CPUEvaluation.expertCardPenalty({
            cardName,
            copies: player.countCard(cardName),
            remainingLandmarks: [...game.enabledLandmarks]
                .filter(name => !player.landmarks[name]).length,
            playerCount: game.players.length,
            builtLandmarkCount: () => player.builtLandmarkCount(),
        });
    }

    _scoreExpertLandmarkDelayPenalty(player, game) {
        const remaining = [...game.enabledLandmarks]
            .filter(name => !player.landmarks[name])
            .map(name => ({ name, cost: Player.landmarkCost(name), urgency: this._landmarkUrgency(name, player, game) }));
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
    }

    _scoreExpertFutureLandmarkHoldPenalty(player, game, card = null) {
        if (!player || !game || !this._expertFlagEnabled("futureLandmarkHold")) return 0;
        const remaining = [...game.enabledLandmarks]
            .filter(name => !player.landmarks[name])
            .map(name => ({
                name,
                cost: Player.landmarkCost(name),
                urgency: this._landmarkUrgency(name, player, game),
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
    }

    _expertPremiumPurpleReady(card, game, player) {
        if (!card || !game || !player) return true;
        if (!this._expertFlagEnabled("premiumPurpleGate")) return true;
        if (![CARD_EFFECTS.STADIUM, CARD_EFFECTS.TV, CARD_EFFECTS.TAXOFFICE, CARD_EFFECTS.PUBLISHER].includes(card.effect)) {
            return true;
        }
        const stableIncome = this._estimateStableIncome(game, player);
        const remainingLandmarks = [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length;
        const nextLandmark = this._bestAffordableLandmark(player, game, 0);
        const nextShortfall = nextLandmark ? Math.max(0, nextLandmark.cost - player.coins) : Infinity;
        const opponents = game.players.filter(p => p !== player);
        const maxThreat = opponents.reduce((max, opponent) => Math.max(max, this._estimateOpponentThreat(opponent, game)), 0);
        const threatReady = maxThreat >= 40;
        return stableIncome >= 10 || remainingLandmarks <= 2 || nextShortfall <= 2 || threatReady;
    }

    _expertBuildCandidateLimit(game, current) {
        let limit = this.simulationMode === "realtime" ? 2 : (this.simulationMode === "lite" ? 2 : (this.simulationMode === "fast" ? 3 : 4));
        if (!game || !current || !this._expertFlagEnabled("dynamicBuildCandidateLimit")) return limit;
        if (game.players.length < 4) return limit;
        const remainingLandmarks = [...game.enabledLandmarks].filter(name => !current.landmarks[name]).length;
        const stableIncome = this._estimateStableIncome(game, current);
        if (remainingLandmarks <= 2 || current.coins >= 10 || stableIncome >= 12) {
            limit += 1;
        }
        return limit;
    }

    _listExpertBuildOptions(game, shopStock) {
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
                score: this._scoreExpertCardCandidate(card, game, current),
            })),
            entry => entry.score
        );
        return CPULegalMoves.expertBuildOptions(
            affordableLandmarks,
            ranked,
            this._expertBuildCandidateLimit(game, current),
            card => this._expertPremiumPurpleReady(card, game, current)
        );
    }

    _scoreExpertBuildOption(game, shopStock, action, context = null) {
        return CPUBuildScoring._scoreExpertBuildOption(this, game, shopStock, action, context);
    }

    _scoreExpertEndgameBuildFocus(game, clone, playerIndex, action, beforeDistance = null) {
        return CPUBuildScoring._scoreExpertEndgameBuildFocus(this, game, clone, playerIndex, action, beforeDistance);
    }

    _listStrongBuildOptions(game, shopStock) {
        const current = game.currentPlayer();
        const affordableLandmarks = CPULegalMoves.affordableLandmarkNames(
            current,
            game.enabledLandmarks,
            Player.landmarkNames(),
            Player.landmarkCost,
            false
        );
        const affordable = CPULegalMoves.affordableCards(current, shopStock, CARDS);
        const ranked = this._sortAffordableForDifficulty(affordable, game, current, "strong");
        const targetLandmark = this._strongTargetLandmark(current, game);
        return CPULegalMoves.strongBuildOptions(affordableLandmarks, ranked, {
            playerCount: game.players.length,
            builtLandmarkCount: current.builtLandmarkCount(),
            attackUnlocked: this._strongAttackUnlocked(current, game, targetLandmark),
            oneDieOpponentCount: game.players.filter(
                player => player !== current && !player.landmarks[LANDMARK_NAMES.STATION]
            ).length,
        });
    }

    _scoreStrongBuildOption(game, shopStock, action) {
        return CPUBuildScoring._scoreStrongBuildOption(this, game, shopStock, action);
    }

    _createPlayoutRng(seed) {
        return CPUSimulation.createPlayoutRng(seed);
    }

    _simulateLookahead(game, shopStock, focusIndex, maxSteps) {
        return CPULookaheadRuntime._simulateLookahead(this, game, shopStock, focusIndex, maxSteps);
    }

    _createLookaheadCpu(game, focusIndex, playerIndex) {
        return CPULookaheadRuntime._createLookaheadCpu(this, game, focusIndex, playerIndex, difficulty => new CPU(difficulty));
    }

    _lookaheadStrongOpponentSet(game, focusIndex) {
        return CPULookaheadRuntime._lookaheadStrongOpponentSet(this, game, focusIndex);
    }

    static _pendingActionDescriptors(game) {
        return CPUPendingResolution.pendingActionDescriptors(game);
    }

    static _isCpuOpponentIndex(game, index) {
        return CPUPendingResolution.isCpuOpponentIndex(game, index);
    }

    static _fallbackCpuOpponentIndex(game) {
        return CPUPendingResolution.fallbackCpuOpponentIndex(game);
    }

    static _isCpuMinorCard(card) {
        return CPUPendingResolution.isCpuMinorCard(card);
    }

    static _resolveCpuCard(player, ref) {
        return CPUPendingResolution.resolveCpuCard(player, ref);
    }

    static _isCpuBusinessMove(game, move) {
        return CPUPendingResolution.isCpuBusinessMove(game, move);
    }

    static _fallbackCpuBusinessMove(game) {
        return CPUPendingResolution.fallbackCpuBusinessMove(game);
    }

    static _isCpuMoverMove(game, move) {
        return CPUPendingResolution.isCpuMoverMove(game, move);
    }

    static _fallbackCpuMoverMove(game) {
        return CPUPendingResolution.fallbackCpuMoverMove(game);
    }

    static _fallbackCpuRenovationTarget(game) {
        return CPUPendingResolution.fallbackCpuRenovationTarget(game);
    }

    static _clearPendingField(game, field) {
        CPUPendingResolution.clearPendingField(game, field);
    }

    static _pendingFallback(game, action, field, fallbackFn, options) {
        return CPUPendingResolution.pendingFallback(game, action, field, fallbackFn, options);
    }

    static _choosePendingTvResolution(game, cpu, options = {}) {
        return CPUPendingResolution.choosePendingTvResolution(game, cpu, options);
    }

    static _choosePendingBusinessResolution(game, cpu, options = {}) {
        return CPUPendingResolution.choosePendingBusinessResolution(game, cpu, options);
    }

    static _choosePendingMoverResolution(game, cpu, options = {}) {
        return CPUPendingResolution.choosePendingMoverResolution(game, cpu, options);
    }

    static _choosePendingRenovationResolution(game, cpu, options = {}) {
        return CPUPendingResolution.choosePendingRenovationResolution(game, cpu, options);
    }

    static _choosePendingItResolution(game, cpu) {
        return CPUPendingResolution.choosePendingItResolution(game, cpu);
    }

    static choosePendingAction(game, cpu, options = {}) {
        return CPUPendingResolution.choosePendingAction(game, cpu, options);
    }

    static choosePendingResolution(game, cpu, options = {}) {
        return CPUPendingResolution.choosePendingResolution(game, cpu, options);
    }

    _runSimulationStep(game, cpu, shopStock, rng) {
        return CPUSimulation.runStep(
            game,
            cpu,
            shopStock,
            rng,
            GAME_PHASES,
            CPUPendingResolution
        );
    }

    _shouldHoldForLandmark(current, game, bestCardScore, maxShortfall) {
        return CPUEvaluation.shouldHoldForLandmark(Player.landmarkNames(), {
            isEnabled: name => !!game.enabledLandmarks && game.enabledLandmarks.has(name),
            isBuilt: name => !!current.landmarks[name],
            costOf: Player.landmarkCost,
            urgencyOf: name => this._landmarkUrgency(name, current, game),
            coins: current.coins,
            bestCardScore,
            maxShortfall,
        });
    }

    _maybeBuyLandmark(current, game, reserve = 0, minUrgency = 0) {
        const landmarkPriority = [LANDMARK_NAMES.STATION, LANDMARK_NAMES.SHOPPING_MALL, LANDMARK_NAMES.HARBOR, LANDMARK_NAMES.RADIO_TOWER, LANDMARK_NAMES.AMUSEMENT_PARK, LANDMARK_NAMES.AIRPORT];
        let best = null;
        for (const name of landmarkPriority) {
            const cost = Player.landmarkCost(name);
            if (!game.enabledLandmarks || !game.enabledLandmarks.has(name)) continue;
            if (current.landmarks[name] || current.coins < cost + reserve) continue;
            const urgency = this._landmarkUrgency(name, current, game);
            if (urgency < minUrgency) continue;
            if (!best || urgency > best.urgency || (urgency === best.urgency && cost < best.cost)) {
                best = { name, cost, urgency };
            }
        }
        if (best) {
            this._buyLandmark(best.name, game);
            return true;
        }
        return false;
    }

    // 弱いCPU：ランダム購入
    buildWeak(game, shopStock) {
        return CPUBuildStrategy.buildWeak(this, game, shopStock);
    }

    buildNormal(game, shopStock) {
        return CPUBuildStrategy.buildNormal(this, game, shopStock);
    }

    buildStrong(game, shopStock) {
        return CPUBuildStrategy.buildStrong(this, game, shopStock);
    }

    buildExpert(game, shopStock) {
        return CPUBuildStrategy.buildExpert(this, game, shopStock);
    }

    // シナジー購入チェック（普通・強い共通）
    _trySynergy(current, game, shopStock) {
        const try_ = (name, cost, condition) => {
            if (!condition) return false;
            const card = this._cardByName(name);
            if (card && shopStock[name] > 0 && current.coins >= cost) {
                this._buyCard(card, game, shopStock);
                return true;
            }
            return false;
        };

        if (try_("チーズ工場",  5, current.countCard("牧場") >= 2)) return true;
        if (try_("家具工場",    3, current.countCard("森林") + current.countCard("鉱山") >= 2)) return true;
        if (try_("ワイナリー",  3, current.countCard("ブドウ園") >= 2)) return true;
        if (try_("フラワーショップ", 1, current.countCard("花畑") >= 2)) return true;
        if (try_("青果市場",    2, current.cards.filter(c => c.category === CARD_CATEGORIES.FARM).length >= 3)) return true;
        if (try_("食品倉庫",    2, current.cards.filter(c => c.category === CARD_CATEGORIES.RESTAURANT).length >= 3)) return true;
        const crowdAttackReady = game.players.length < 4 || this._estimateStableIncome(game, current) >= 12 || current.builtLandmarkCount() >= 4;
        if (try_("テレビ局",    7, crowdAttackReady && game.players.some(p => p !== current && p.coins >= 6) && current.countCard("テレビ局") === 0)) return true;
        if (try_("税務署",      4, crowdAttackReady && game.players.some(p => p !== current && p.coins >= 10) && current.countCard("税務署") === 0)) return true;

        return false;
    }
}
