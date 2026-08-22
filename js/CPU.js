/** @typedef {{action: 'buildCard'|'buildLandmark', data: Object}} CPUBuildActionProposal */
const CPU_SIMULATION_GAME_ADAPTER = Object.freeze({
    createGame: playerCount => new GameManager(playerCount),
    cloneCard: card => cloneCard(card),
    defaultLandmarks: () => Player.landmarkNames(),
});

function selectNearTieForCpu(cpu, ranked, scoreOf, game, domain) {
    const seed = cpu._signatureCache('_cachedDecisionSeed', game, signature => ({ signature })).signature;
    const selected = CPUSelection.nearTieChoice(
        ranked,
        scoreOf,
        cpu._nearTieThreshold(),
        `${cpu.difficulty}:${domain}:${seed}`
    );
    if (selected && ranked && ranked[0] && selected !== ranked[0]) {
        const value = selected.option || selected;
        const cardName = value.card && value.card.name || value.cardName || '';
        const landmarkName = value.type === 'landmark' && value.name || '';
        cpu._pendingNearTieDecision = {
            action: cardName ? 'buildCard' : landmarkName ? 'buildLandmark' : '',
            name: cardName || landmarkName,
            reason: {
                code: CPUActionProposal.reasonCodes.SEEDED_NEAR_TIE_BUILD,
                values: {
                    bestScore: Number(scoreOf(ranked[0])),
                    selectedScore: Number(scoreOf(selected)),
                    delta: Number(scoreOf(ranked[0])) - Number(scoreOf(selected)),
                },
            },
        };
    }
    return selected;
}

function finalizeBuildDecisionReason(cpu, proposal) {
    const pending = cpu._pendingNearTieDecision;
    cpu._pendingNearTieDecision = null;
    const selectedName = proposal && proposal.data && (proposal.data.cardName || proposal.data.name);
    if (pending && proposal && proposal.action === pending.action && selectedName === pending.name) {
        cpu._lastDecisionReason = pending.reason;
    }
    return proposal;
}

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
        this.playerCountProfileTunings = runtimeConfig.playerCountProfileTunings;
        this.largeCrowdBuildMode = runtimeConfig.largeCrowdBuildMode;
        this.largeCrowdRollMode = runtimeConfig.largeCrowdRollMode;
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

    _withStableEvaluationSignature(game, fn) {
        return CPUEvaluationCache.withStableSignature(this, game, fn);
    }

    _nearTieThreshold() {
        if (this.difficulty === 'expert') return 0.005;
        if (this.difficulty === 'strong') return 0.01;
        if (this.difficulty === 'normal') return 0.03;
        return 0;
    }

    _selectNearTie(ranked, scoreOf, game, domain) {
        return selectNearTieForCpu(this, ranked, scoreOf, game, domain);
    }

    _clearDecisionReason() {
        this._lastDecisionReason = null;
        this._pendingNearTieDecision = null;
    }

    _recordDecisionReason(code, values = {}) {
        this._lastDecisionReason = { code, values: Object.assign({}, values) };
    }

    _consumeDecisionReason() {
        const reason = this._lastDecisionReason || null;
        this._lastDecisionReason = null;
        return reason;
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
        return CPUBusinessDecisionRuntime._randomChoice(this, items);
    }


    _forEachBusinessMove(game, callback) {
        return CPUBusinessDecisionRuntime._forEachBusinessMove(this, game, callback);
    }


    _minorCardIndexes(player) {
        return CPUBusinessDecisionRuntime._minorCardIndexes(this, player);
    }


    _chooseRandomBusinessMove(game) {
        return CPUBusinessDecisionRuntime._chooseRandomBusinessMove(this, game);
    }


    _chooseSimpleBusinessMove(game, actor = game.currentPlayer()) {
        return CPUBusinessDecisionRuntime._chooseSimpleBusinessMove(this, game, actor);
    }


    _scoreBusinessExchangeDetails(game, current, move) {
        return CPUBusinessDecisionRuntime._scoreBusinessExchangeDetails(this, game, current, move);
    }


    _scoreBusinessExchange(game, current, move) {
        return CPUBusinessDecisionRuntime._scoreBusinessExchange(this, game, current, move);
    }


    _chooseHarmfulGiftBusinessMove(game, actor = game.currentPlayer()) {
        return CPUBusinessDecisionRuntime._chooseHarmfulGiftBusinessMove(this, game, actor);
    }


    _businessOwnCandidateIndexes(game, current, limit) {
        return CPUBusinessDecisionRuntime._businessOwnCandidateIndexes(this, game, current, limit);
    }


    _businessTargetCandidateIndexes(game, current, target, limit, attackScale) {
        return CPUBusinessDecisionRuntime._businessTargetCandidateIndexes(this, game, current, target, limit, attackScale);
    }


    _forEachBusinessMoveCandidate(game, candidateTargets, callback) {
        return CPUBusinessDecisionRuntime._forEachBusinessMoveCandidate(this, game, candidateTargets, callback);
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
        return this._withStableEvaluationSignature(game, () =>
            CPURollDecision.chooseDiceCount(this, game)
        );
    }

    _expertV2SimpleStrongCrowdDiceThreshold(game) {
        return CPUStateEvaluationRuntime._expertV2SimpleStrongCrowdDiceThreshold(this, game);
    }


    chooseReroll(game) {
        return this._withStableEvaluationSignature(game, () =>
            CPURollDecision.chooseReroll(this, game)
        );
    }

    chooseHarbor(game) {
        return this._withStableEvaluationSignature(game, () =>
            CPURollDecision.chooseHarbor(this, game)
        );
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
        return CPUBuildPolicyRuntime._tryEndgameBuild(this, current, game, shopStock, difficulty);
    }


    _chooseExpertV2SimpleITInvest(game) {
        return CPUBuildPolicyRuntime._chooseExpertV2SimpleITInvest(this, game);
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
        this._pendingNearTieDecision = null;
        return finalizeBuildDecisionReason(this, CPUBuildStrategy.chooseBuildAction(this, game, shopStock));
    }

    _buildExecutionContext() {
        return {
            isOnlineGame: typeof isOnlineGame !== 'undefined' && isOnlineGame,
            isRoomHost: typeof isRoomHost === 'undefined' || isRoomHost,
            isReconnectingOnline: typeof isReconnectingOnline !== 'undefined' && isReconnectingOnline,
            socketConnected: typeof socket === 'undefined' || !socket ? null : socket.connected,
            sendAction: typeof sendAction === 'function' ? sendAction : null,
            decrementShopStock: typeof decrementMarketShopStock === 'function'
                ? (stock, card, game) => decrementMarketShopStock(game, stock, card)
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
        return CPUBuildPolicyRuntime._buyWinningLandmark(this, current, game);
    }


    _listExpertV2SimpleAffordableLandmarks(current, game) {
        return CPUBuildPolicyRuntime._listExpertV2SimpleAffordableLandmarks(this, current, game);
    }


    _listExpertV2SimpleAffordableCards(current, shopStock) {
        return CPUBuildPolicyRuntime._listExpertV2SimpleAffordableCards(this, current, shopStock);
    }


    _buildExpertV2Simple(current, game, shopStock) {
        return CPUBuildStrategy._buildExpertV2Simple(this, current, game, shopStock);
    }

    _shouldCompareExpertV2SimpleLandmarkWithCards(landmarkName) {
        return CPUBuildPolicyRuntime._shouldCompareExpertV2SimpleLandmarkWithCards(this, landmarkName);
    }


    _shouldForceExpertV2SimpleLandmarkProgress(game) {
        return CPUBuildPolicyRuntime._shouldForceExpertV2SimpleLandmarkProgress(this, game);
    }


    _expertV2SimpleLandmarkOverrideMargin(game, landmarkName) {
        return CPUBuildPolicyRuntime._expertV2SimpleLandmarkOverrideMargin(this, game, landmarkName);
    }


    _scoreExpertV2SimpleCardOptionForLandmarkComparison(game, option, breakdown, hasAffordableLandmark) {
        return CPUBuildPolicyRuntime._scoreExpertV2SimpleCardOptionForLandmarkComparison(this, game, option, breakdown, hasAffordableLandmark);
    }


    _expertV2SimpleLandmarkCardPenalty(game, option, hasAffordableLandmark) {
        return CPUBuildPolicyRuntime._expertV2SimpleLandmarkCardPenalty(this, game, option, hasAffordableLandmark);
    }


    _scoreExpertV2SimpleLandmarkOption(game, name) {
        return CPUBuildPolicyRuntime._scoreExpertV2SimpleLandmarkOption(this, game, name);
    }


    _expertV2SimpleLandmarkEffectBonus(game, name, rollDelta = 0) {
        return CPUBuildPolicyRuntime._expertV2SimpleLandmarkEffectBonus(this, game, name, rollDelta);
    }


    _sameExpertV2SimpleBuildOption(a, b) {
        return CPUBuildPolicyRuntime._sameExpertV2SimpleBuildOption(this, a, b);
    }


    _scoreExpertV2SimpleBuildOption(game, option, shopStock = null) {
        return this._scoreExpertV2SimpleBuildOptionBreakdown(game, option, shopStock).total;
    }

    _scoreExpertV2SimpleBuildOptionBreakdown(game, option, shopStock = null) {
        return CPUBuildScoring._scoreExpertV2SimpleBuildOptionBreakdown(this, game, option, shopStock);
    }

    _expertV2SimpleLateBasicDuplicatePenalty(game, option, deltaEv) {
        return CPUBuildPolicyRuntime._expertV2SimpleLateBasicDuplicatePenalty(this, game, option, deltaEv);
    }


    _expertV2SimpleRedOpponentTurnBonus(game, option) {
        return CPUBuildPolicyRuntime._expertV2SimpleRedOpponentTurnBonus(this, game, option);
    }


    _expertV2SimpleRedOpponentFutureValue(card, game, owner, roller) {
        return CPUBuildPolicyRuntime._expertV2SimpleRedOpponentFutureValue(this, card, game, owner, roller);
    }


    _expertV2SimpleRenovationRiskPenalty(game, option) {
        return CPUBuildPolicyRuntime._expertV2SimpleRenovationRiskPenalty(this, game, option);
    }


    _expertV2SimpleBuildTempoBonus(game) {
        return CPUBuildPolicyRuntime._expertV2SimpleBuildTempoBonus(this, game);
    }


    _expertV2SimpleComboUnlockBonus(game, option, shopStock = null) {
        return CPUBuildPolicyRuntime._expertV2SimpleComboUnlockBonus(this, game, option, shopStock);
    }


    _expertV2SimpleFuturePayoffCards(card, mode = "unlock") {
        return CPUBuildPolicyRuntime._expertV2SimpleFuturePayoffCards(this, card, mode);
    }


    _expertV2SimpleMarginalComboIncome(enabler, payoff) {
        return CPUBuildPolicyRuntime._expertV2SimpleMarginalComboIncome(this, enabler, payoff);
    }


    _buyLateGameLandmark(current, game) {
        return CPUBuildPolicyRuntime._buyLateGameLandmark(this, current, game);
    }


    _shouldExpertForceLandmarkPlan(current, game) {
        return CPUBuildPolicyRuntime._shouldExpertForceLandmarkPlan(this, current, game);
    }


    _shouldExpertStopBuyingCards(current, game, card = null) {
        return CPUBuildPolicyRuntime._shouldExpertStopBuyingCards(this, current, game, card);
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
        return CPUBuildPolicyRuntime._shouldHoldForLandmark(this, current, game, bestCardScore, maxShortfall);
    }


    _maybeBuyLandmark(current, game, reserve = 0, minUrgency = 0) {
        return CPUBuildPolicyRuntime._maybeBuyLandmark(this, current, game, reserve, minUrgency);
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
        return CPUBuildPolicyRuntime._trySynergy(this, current, game, shopStock);
    }

}
