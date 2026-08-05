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
        return CPUStateEvaluationRuntime._playerCountProfile(this, game);
    }


    _expertProfileName(game) {
        return CPUStateEvaluationRuntime._expertProfileName(this, game);
    }


    _syncExpertTuningForGame(game) {
        return CPUStateEvaluationRuntime._syncExpertTuningForGame(this, game);
    }


    _expertCrowdNormalPlan(game) {
        return CPUStateEvaluationRuntime._expertCrowdNormalPlan(this, game);
    }


    _expertCrowdDisruptionBonus(game, targetIndex, amount) {
        return CPUStateEvaluationRuntime._expertCrowdDisruptionBonus(this, game, targetIndex, amount);
    }


    _expertCrowdCleaningWeight(game, cardName, amount) {
        return CPUStateEvaluationRuntime._expertCrowdCleaningWeight(this, game, cardName, amount);
    }


    _expertDisruptionScale(game, focusIndex = null) {
        return CPUStateEvaluationRuntime._expertDisruptionScale(this, game, focusIndex);
    }


    _closestLandmarkShortfall(player, game) {
        return CPUStateEvaluationRuntime._closestLandmarkShortfall(this, player, game);
    }


    _lookaheadTerminalHeuristic(game, focusIndex) {
        return CPUStateEvaluationRuntime._lookaheadTerminalHeuristic(this, game, focusIndex);
    }


    _tvLandmarkDenialValue(target, amount, game) {
        return CPUStateEvaluationRuntime._tvLandmarkDenialValue(this, target, amount, game);
    }


    _expertCandidateTargetIndexes(game, currentIndex) {
        return CPUStateEvaluationRuntime._expertCandidateTargetIndexes(this, game, currentIndex);
    }


    _expertCandidateCleaningNames(game) {
        return CPUStateEvaluationRuntime._expertCandidateCleaningNames(this, game);
    }


    // ===== サイコロ判断 =====

    _cardActivationValue(card, game, owner, roller, dice) {
        return CPUStateEvaluationRuntime._cardActivationValue(this, card, game, owner, roller, dice);
    }


    _estimateRollScore(game, dice) {
        return CPUStateEvaluationRuntime._estimateRollScore(this, game, dice);
    }


    _estimateOpponentRedRisk(game, dice) {
        return CPUStateEvaluationRuntime._estimateOpponentRedRisk(this, game, dice);
    }


    _estimateRiskAdjustedRollScore(game, dice) {
        return CPUStateEvaluationRuntime._estimateRiskAdjustedRollScore(this, game, dice);
    }


    _expertV2CappedPositiveIncome(game, player, value) {
        return CPUStateEvaluationRuntime._expertV2CappedPositiveIncome(this, game, player, value);
    }


    _cardSelfIncomeValue(card, game, owner, roller, dice) {
        return CPUStateEvaluationRuntime._cardSelfIncomeValue(this, card, game, owner, roller, dice);
    }


    _expectedDiceScore(game, useTwo) {
        return CPUStateEvaluationRuntime._expectedDiceScore(this, game, useTwo);
    }


    _expectedDiceScoreWithHarbor(game, useTwo) {
        return CPUStateEvaluationRuntime._expectedDiceScoreWithHarbor(this, game, useTwo);
    }


    _diceOutcomeWeights(useTwo) {
        return CPUStateEvaluationRuntime._diceOutcomeWeights(this, useTwo);
    }


    _simulationShopStock(playerCount = 2) {
        return CPUSimulation.buildShopStock(CARDS, playerCount, getInitialCardStock);
    }

    _expertLookaheadSteps(game, focusIndex, baseSteps) {
        return CPUStateEvaluationRuntime._expertLookaheadSteps(this, game, focusIndex, baseSteps);
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
        return CPUStateEvaluationRuntime._crowdLeaderBonus(this, game, targetIndex, weight);
    }


    _crowdCleaningBonus(game, cardName, weight = 1) {
        return CPUStateEvaluationRuntime._crowdCleaningBonus(this, game, cardName, weight);
    }


    _remainingEnabledLandmarks(current, game) {
        return CPUStateEvaluationRuntime._remainingEnabledLandmarks(this, current, game);
    }


    _isEndgameMode(current, game, threshold = 2) {
        return CPUStateEvaluationRuntime._isEndgameMode(this, current, game, threshold);
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
        return CPUStateEvaluationRuntime._strongLiteUseHeuristicChoices(this);
    }


    chooseDiceCount(game) {
        return CPURollDecision.chooseDiceCount(this, game);
    }

    _expertV2SimpleStrongCrowdDiceThreshold(game) {
        return CPUStateEvaluationRuntime._expertV2SimpleStrongCrowdDiceThreshold(this, game);
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
        return CPUStateEvaluationRuntime._scoreExpertV2SimpleTVTarget(this, game, player, steal, built);
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
        return CPUStateEvaluationRuntime._scoreExpertV2SimpleCleaningValue(this, game, name);
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
        return CPUStateEvaluationRuntime._estimatePlayerTurnValue(this, game, playerIndex);
    }


    _estimatePlayerTurnScorePair(game, playerIndex) {
        return CPUStateEvaluationRuntime._estimatePlayerTurnScorePair(this, game, playerIndex);
    }


    _countReachableLandmarks(player, enabledLandmarks) {
        return CPUStateEvaluationRuntime._countReachableLandmarks(this, player, enabledLandmarks);
    }


    _isProgressIncomeCard(card, player) {
        return CPUStateEvaluationRuntime._isProgressIncomeCard(this, card, player);
    }


    _estimateStableIncome(game, player) {
        return CPUStateEvaluationRuntime._estimateStableIncome(this, game, player);
    }


    _estimateProgressIncome(game, player) {
        return CPUStateEvaluationRuntime._estimateProgressIncome(this, game, player);
    }


    _estimateWinDistance(player, game) {
        return CPUStateEvaluationRuntime._estimateWinDistance(this, player, game);
    }


    _estimateWinDistanceUncached(player, game, playerIndex = -1) {
        return CPUStateEvaluationRuntime._estimateWinDistanceUncached(this, player, game, playerIndex);
    }


    _estimateRedPressure(game, playerIndex) {
        return CPUStateEvaluationRuntime._estimateRedPressure(this, game, playerIndex);
    }


    _estimateOpponentThreat(opponent, game) {
        return CPUStateEvaluationRuntime._estimateOpponentThreat(this, opponent, game);
    }


    _estimateOpponentThreatUncached(opponent, game, opponentIndex = -1) {
        return CPUStateEvaluationRuntime._estimateOpponentThreatUncached(this, opponent, game, opponentIndex);
    }


    _bestOpponentWinDistance(game, playerIndex) {
        return CPUStateEvaluationRuntime._bestOpponentWinDistance(this, game, playerIndex);
    }


    _evaluatePosition(game, playerIndex) {
        return CPUStateEvaluationRuntime._evaluatePosition(this, game, playerIndex);
    }


    _scoreExpertCardPenalty(cardName, player, game) {
        return CPUStateEvaluationRuntime._scoreExpertCardPenalty(this, cardName, player, game);
    }


    _scoreExpertLandmarkDelayPenalty(player, game) {
        return CPUStateEvaluationRuntime._scoreExpertLandmarkDelayPenalty(this, player, game);
    }


    _scoreExpertFutureLandmarkHoldPenalty(player, game, card = null) {
        return CPUStateEvaluationRuntime._scoreExpertFutureLandmarkHoldPenalty(this, player, game, card);
    }


    _expertPremiumPurpleReady(card, game, player) {
        return CPUStateEvaluationRuntime._expertPremiumPurpleReady(this, card, game, player);
    }


    _expertBuildCandidateLimit(game, current) {
        return CPUStateEvaluationRuntime._expertBuildCandidateLimit(this, game, current);
    }


    _listExpertBuildOptions(game, shopStock) {
        return CPUStateEvaluationRuntime._listExpertBuildOptions(this, game, shopStock);
    }


    _scoreExpertBuildOption(game, shopStock, action, context = null) {
        return CPUBuildScoring._scoreExpertBuildOption(this, game, shopStock, action, context);
    }

    _scoreExpertEndgameBuildFocus(game, clone, playerIndex, action, beforeDistance = null) {
        return CPUBuildScoring._scoreExpertEndgameBuildFocus(this, game, clone, playerIndex, action, beforeDistance);
    }

    _listStrongBuildOptions(game, shopStock) {
        return CPUStateEvaluationRuntime._listStrongBuildOptions(this, game, shopStock);
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
