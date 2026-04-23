class CPU {
    constructor(difficulty, options = {}) {
        this.difficulty = difficulty;
        this.expertPurpose = options.expertPurpose || "training";
        this.expertBehaviorFlags = Object.assign(
            {
                crowdBuildLookahead: difficulty === "expert",
                futureLandmarkHold: difficulty === "expert",
                lookaheadLeaderStrongOnly: difficulty === "expert",
            },
            options.expertBehaviorFlags || {}
        );
        this.simulationMode = options.simulationMode || (
            difficulty === "expert" && this.expertPurpose === "live" ? "realtime" : "full"
        );
        this.expertPreset = options.expertPreset || "default";
        this.profileStats = options.profileStats || null;
        this.expertProfilePresets = Object.assign({}, options.expertProfilePresets || {});
        this.expertProfileTunings = Object.assign(
            {},
            difficulty === "expert" ? CPU._defaultExpertProfileTunings() : {},
            options.expertProfileTunings || {}
        );
        this.baseExpertTuning = Object.assign(
            {},
            CPU._resolveExpertTuning(this.expertPreset),
            options.expertTuning || {}
        );
        this.activeExpertPreset = this.expertPreset;
        this.expertTuning = Object.assign({}, this.baseExpertTuning);
    }

    _expertFlagEnabled(name) {
        return !!(this.expertBehaviorFlags && this.expertBehaviorFlags[name]);
    }

    _isLiveExpert() {
        return this.difficulty === "expert" && this.expertPurpose === "live";
    }

    static _nowMs() {
        if (typeof performance !== "undefined" && performance && typeof performance.now === "function") {
            return performance.now();
        }
        return Date.now();
    }

    static _cardByNameMap() {
        if (!CPU.__cardByNameMap) {
            CPU.__cardByNameMap = Object.fromEntries(CARDS.map(card => [card.name, card]));
        }
        return CPU.__cardByNameMap;
    }

    _cardByName(name) {
        return CPU._cardByNameMap()[name] || null;
    }

    _profileMeasure(label, fn) {
        if (!this.profileStats) return fn();
        const startedAt = CPU._nowMs();
        try {
            return fn();
        } finally {
            const entry = this.profileStats[label] || (this.profileStats[label] = { calls: 0, timeMs: 0 });
            entry.calls++;
            entry.timeMs = Number((entry.timeMs + (CPU._nowMs() - startedAt)).toFixed(3));
        }
    }

    _profileCount(label, amount = 1) {
        if (!this.profileStats) return;
        const entry = this.profileStats[label] || (this.profileStats[label] = { count: 0 });
        entry.count = (entry.count || 0) + amount;
    }

    getProfileSummary() {
        if (!this.profileStats) return [];
        return Object.entries(this.profileStats)
            .map(([label, value]) => Object.assign({ label }, value))
            .sort((a, b) => (b.timeMs || 0) - (a.timeMs || 0) || (b.count || 0) - (a.count || 0) || a.label.localeCompare(b.label));
    }

    static _expertPresets() {
        return {
            default: {
                coinWeight: 1.1,
                turnWeight: 3.2,
                landmarkWeight: 14,
                builtLandmarkWeight: 8,
                landmarkReachWeight: 6,
                stableIncomeWeight: 1.4,
                redPressureWeight: 1.1,
                leaderThreatWeight: 1.3,
                lateCoinWeight: 1.6,
                finalCoinWeight: 2.2,
                lateProgressBonus: 8,
                lowValueSpamThreshold: 4,
                lowValueSpamPenalty: 6,
                landmarkActionBonus: 24,
                lateLandmarkActionBonus: 18,
                skipAirportBonus: 10,
                skipPenalty: 8,
                winLookaheadBonus: 5000,
                loseLookaheadPenalty: 3000,
                lookaheadWeight: 0.7,
                lateGameLookaheadStepsPerPlayer: 6,
            },
            refined: {
                lateCoinWeight: 1.44,
                skipPenalty: 10,
            },
            rush: {
                coinWeight: 1.25,
                turnWeight: 3.1,
                landmarkWeight: 16,
                builtLandmarkWeight: 9,
                landmarkReachWeight: 7,
                stableIncomeWeight: 1.1,
                redPressureWeight: 1.2,
                leaderThreatWeight: 1.45,
                lateCoinWeight: 2.0,
                finalCoinWeight: 2.8,
                lateProgressBonus: 10,
                lowValueSpamThreshold: 3,
                lowValueSpamPenalty: 8,
                landmarkActionBonus: 30,
                lateLandmarkActionBonus: 26,
                skipAirportBonus: 8,
                skipPenalty: 12,
                winLookaheadBonus: 6000,
                loseLookaheadPenalty: 3200,
                lookaheadWeight: 0.75,
                lateGameLookaheadStepsPerPlayer: 6,
            },
            economy: {
                coinWeight: 1.3,
                turnWeight: 3.5,
                landmarkWeight: 13,
                builtLandmarkWeight: 7,
                landmarkReachWeight: 5,
                stableIncomeWeight: 1.7,
                redPressureWeight: 0.8,
                leaderThreatWeight: 1.1,
                lateCoinWeight: 1.4,
                finalCoinWeight: 2.0,
                lateProgressBonus: 6,
                lowValueSpamThreshold: 5,
                lowValueSpamPenalty: 4,
                landmarkActionBonus: 20,
                lateLandmarkActionBonus: 12,
                skipAirportBonus: 14,
                skipPenalty: 6,
                winLookaheadBonus: 4800,
                loseLookaheadPenalty: 2800,
                lookaheadWeight: 0.65,
                lateGameLookaheadStepsPerPlayer: 7,
            },
        };
    }

    static _resolveExpertTuning(presetName = "default") {
        const presets = CPU._expertPresets();
        return Object.assign({}, presets.default, presets[presetName] || {});
    }

    static _defaultExpertProfileTunings() {
        return {
            duel: {
                lowValueSpamPenalty: 5.1,
            },
            trio: {
                coinWeight: 1.16,
                turnWeight: 3.28,
                stableIncomeWeight: 2.15,
                redPressureWeight: 0.72,
                leaderThreatWeight: 0.82,
                landmarkActionBonus: 21,
                lateLandmarkActionBonus: 16,
                lookaheadWeight: 0.52,
                lowValueSpamPenalty: 5.6,
            },
            crowd: {
                coinWeight: 1.22,
                turnWeight: 3.35,
                stableIncomeWeight: 3.4,
                redPressureWeight: 0.14,
                leaderThreatWeight: 0.08,
                lateCoinWeight: 2.05,
                finalCoinWeight: 2.55,
                landmarkActionBonus: 18,
                lateLandmarkActionBonus: 14,
                lookaheadWeight: 0.28,
            },
        };
    }

    takeTurn(game, shopStock) {
        // scheduleCPU側で処理
    }

    _playerCountProfile(game) {
        const count = game.players.length;
        if (count >= 4) {
            return {
                landmarkBias: 1.12,
                blueFactor: 1.28,
                redFactor: 0.92,
                greenFactor: 1.18,
                purpleFactor: 0.82,
                massAttackFactor: 0.95,
                airportBias: 0.9,
            };
        }
        if (count === 3) {
            return {
                landmarkBias: 1,
                blueFactor: 1.05,
                redFactor: 1.08,
                greenFactor: 1,
                purpleFactor: 1.05,
                massAttackFactor: 1.08,
                airportBias: 1,
            };
        }
        return {
            landmarkBias: 1,
            blueFactor: 1,
            redFactor: 1,
            greenFactor: 1,
            purpleFactor: 1,
            massAttackFactor: 1,
            airportBias: 1,
        };
    }

    _expertProfileName(game) {
        if (!game || !game.players) return "crowd";
        if (game.players.length <= 2) return "duel";
        if (game.players.length === 3) return "trio";
        return "crowd";
    }

    _syncExpertTuningForGame(game) {
        if (this.difficulty !== "expert") return this.expertTuning;
        const profile = this._expertProfileName(game);
        const profilePreset = this.expertProfilePresets[profile];
        const profileTuning = this.expertProfileTunings[profile];
        this.activeExpertPreset = profilePreset || this.expertPreset;
        this.expertTuning = Object.assign(
            {},
            this.baseExpertTuning,
            profilePreset ? CPU._resolveExpertTuning(profilePreset) : {},
            profileTuning || {}
        );
        if (this.simulationMode === "realtime") {
            this.expertTuning.lookaheadWeight = Number((this.expertTuning.lookaheadWeight * 0.12).toFixed(3));
            this.expertTuning.lateGameLookaheadStepsPerPlayer = Math.max(1, Math.round(this.expertTuning.lateGameLookaheadStepsPerPlayer * 0.2));
        }
        if (this.simulationMode === "fast" || this.simulationMode === "lite") {
            this.expertTuning.lookaheadWeight = Number((this.expertTuning.lookaheadWeight * 0.65).toFixed(3));
            this.expertTuning.lateGameLookaheadStepsPerPlayer = Math.max(2, Math.round(this.expertTuning.lateGameLookaheadStepsPerPlayer * 0.5));
        }
        if (this.simulationMode === "lite") {
            this.expertTuning.lookaheadWeight = Number((this.expertTuning.lookaheadWeight * 0.35).toFixed(3));
            this.expertTuning.lateGameLookaheadStepsPerPlayer = Math.max(1, Math.round(this.expertTuning.lateGameLookaheadStepsPerPlayer * 0.35));
        }
        return this.expertTuning;
    }

    _expertCrowdNormalPlan(game) {
        if (this.difficulty !== "expert") return false;
        if (!game || !game.players || game.players.length < 4) return false;
        const current = game.currentPlayer ? game.currentPlayer() : null;
        if (!current) return false;
        const remaining = this._remainingEnabledLandmarks(current, game);
        const stableIncome = this._estimateStableIncome(game, current);
        return remaining.length > 1 || stableIncome < 10;
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
        if (!game || this.difficulty !== "expert" || !this._expertFlagEnabled("selfRacePriority")) return 1;
        const playerIndex = focusIndex == null ? game.currentPlayerIndex : focusIndex;
        const myDistance = this._estimateWinDistance(game.players[playerIndex], game);
        const bestOpponentDistance = this._bestOpponentWinDistance(game, playerIndex);
        if (myDistance > bestOpponentDistance) return 1;
        const remainingLandmarks = [...game.enabledLandmarks].filter(name => !game.players[playerIndex].landmarks[name]).length;
        if (myDistance + 0.5 <= bestOpponentDistance) {
            return remainingLandmarks <= 2 ? 0.3 : 0.5;
        }
        return remainingLandmarks <= 2 ? 0.5 : 0.75;
    }

    _closestLandmarkShortfall(player, game) {
        if (!player || !game || !game.enabledLandmarks) return Infinity;
        const remaining = [...game.enabledLandmarks]
            .filter(name => !player.landmarks[name])
            .map(name => Player.landmarkCost(name) - player.coins);
        if (remaining.length === 0) return 0;
        return Math.max(0, Math.min(...remaining));
    }

    _lookaheadTerminalHeuristic(game, focusIndex) {
        if (!game || focusIndex < 0) return 0;
        let score = 0;
        const focus = game.players[focusIndex];
        const focusDistance = this._estimateWinDistance(focus, game);
        const bestOpponentDistance = this._bestOpponentWinDistance(game, focusIndex);
        score += (bestOpponentDistance - focusDistance) * 4.5;

        if (this._expertFlagEnabled("lookaheadRaceFocus")) {
            const remaining = [...game.enabledLandmarks].filter(name => !focus.landmarks[name]).length;
            const reachable = this._countReachableLandmarks(focus, [...game.enabledLandmarks]);
            score += Math.max(0, 16 - focusDistance) * 1.6;
            score += reachable * (remaining <= 2 ? 6 : 2.5);
        }

        if (this._expertFlagEnabled("lookaheadThreatBalance")) {
            for (let i = 0; i < game.players.length; i++) {
                if (i === focusIndex) continue;
                const opponent = game.players[i];
                const threat = this._estimateOpponentThreat(opponent, game);
                const distance = this._estimateWinDistance(opponent, game);
                score -= Math.max(0, 14 - distance) * 1.2;
                score -= threat * 0.06;
            }
        }

        return score;
    }

    _tvLandmarkDenialValue(target, amount, game) {
        if (!target || !game || !this._expertFlagEnabled("tvLandmarkDenial")) return 0;
        const before = this._closestLandmarkShortfall(target, game);
        const afterCoins = Math.max(0, target.coins - amount);
        const remainingCosts = [...game.enabledLandmarks]
            .filter(name => !target.landmarks[name])
            .map(name => Player.landmarkCost(name));
        if (remainingCosts.length === 0) return 0;
        const after = Math.max(0, Math.min(...remainingCosts) - afterCoins);
        if (before <= 0 && after > 0) return 8 + Math.min(4, after * 1.5);
        if (before <= 1 && after >= 2) return 4.5;
        return Math.max(0, after - before) * 1.8;
    }

    _expertCandidateTargetIndexes(game, currentIndex) {
        if (!game || !game.players) return [];
        const indexes = game.players
            .map((player, index) => ({ player, index }))
            .filter(entry => entry.index !== currentIndex)
            .sort((a, b) => {
                const threatDiff = this._estimateOpponentThreat(b.player, game) - this._estimateOpponentThreat(a.player, game);
                if (threatDiff !== 0) return threatDiff;
                return b.player.coins - a.player.coins;
            })
            .map(entry => entry.index);
        if (!this._expertFlagEnabled("disruptionCandidatePruning") || game.players.length < 4) return indexes;
        return indexes.slice(0, 2);
    }

    _expertCandidateCleaningNames(game) {
        if (!game) return [];
        const allNames = [...new Set(game.players.flatMap(p =>
            p.getMinorCards().filter(c => !p.isDormant(c)).map(c => c.name)))];
        if (!this._expertFlagEnabled("disruptionCandidatePruning") || game.players.length < 4) return allNames;
        return allNames
            .map(name => ({
                name,
                score: game.players.reduce((sum, player) => sum + player.getMinorCards()
                    .filter(card => card.name === name && !player.isDormant(card))
                    .reduce((inner, card) => inner + this._ownedCardValue(card, game, player), 0), 0),
            }))
            .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
            .slice(0, 3)
            .map(entry => entry.name);
    }

    // ===== サイコロ判断 =====

    _cardActivationValue(card, game, owner, roller, dice) {
        const capped = (value) => this._strongSoftCapValue(value);
        const ownerIndex = game.players.indexOf(owner);
        const rollerIndex = game.players.indexOf(roller);
        const isCurrentTurn = ownerIndex === rollerIndex;
        const opponents = game.players.filter((_, i) => i !== ownerIndex);
        const livingCards = owner.cards.filter(c => !owner.isDormant(c));

        if (card.color === "blue") {
            if (card.effect === CARD_EFFECTS.HARBOR) return capped(owner.landmarks[LANDMARK_NAMES.HARBOR] ? card.income : 0);
            if (card.effect === CARD_EFFECTS.TUNA) return capped(owner.landmarks[LANDMARK_NAMES.HARBOR] ? 7 : 0);
            return capped(card.income);
        }

        if (card.color === "red") {
            if (isCurrentTurn) return 0;
            if (card.effect === CARD_EFFECTS.HARBOR_RED) return capped(roller.landmarks[LANDMARK_NAMES.HARBOR] ? card.income : 0);
            if (card.effect === CARD_EFFECTS.FRENCHR) return capped(roller.landmarks && roller.builtLandmarkCount() >= 2 ? card.income : 0);
            if (card.effect === CARD_EFFECTS.MEMBERBAR) return capped(roller.landmarks && roller.builtLandmarkCount() >= 3 ? Math.max(roller.coins, 4) : 0);
            return capped(card.income + (roller.landmarks[LANDMARK_NAMES.SHOPPING_MALL] && card.category === CARD_CATEGORIES.RESTAURANT ? 1 : 0));
        }

        if (!isCurrentTurn) return 0;

        switch (card.effect) {
            case CARD_EFFECTS.CHEESE:
            case CARD_EFFECTS.FURNITURE:
            case CARD_EFFECTS.FLOWER:
            case CARD_EFFECTS.MARKET:
            case CARD_EFFECTS.FOODWAREHOUSE:
            case CARD_EFFECTS.DRINKFACTORY:
            case CARD_EFFECTS.WINERY:
            case CARD_EFFECTS.FEWLANDMARK:
                return capped(GameManager.calcCardIncome(card, owner, game));
            case CARD_EFFECTS.STADIUM:
                return capped(opponents.length * card.income);
            case CARD_EFFECTS.TV:
                return capped(Math.min(card.income, Math.max(...opponents.map(p => p.coins), 0)));
            case CARD_EFFECTS.PUBLISHER:
                return capped(opponents.reduce((sum, p) =>
                    sum + p.cards.filter(c => (c.category === CARD_CATEGORIES.RESTAURANT || c.category === CARD_CATEGORIES.SHOP) && !p.isDormant(c)).length, 0));
            case CARD_EFFECTS.TAXOFFICE:
                return capped(opponents.filter(p => p.coins >= 10).length * 5);
            case CARD_EFFECTS.LOAN:
                return (dice === 5 || dice === 6) ? -2 : 0;
            case CARD_EFFECTS.BUSINESS:
                return capped(4);
            case CARD_EFFECTS.CLEANING:
                return capped(game.players.reduce((sum, p) => sum + p.getMinorCards().filter(c => !p.isDormant(c)).length, 0) * 0.4);
            case CARD_EFFECTS.MOVER:
                return 4;
            case CARD_EFFECTS.RENOVATION:
                return owner.builtLandmarkCount() ? 3 : 0;
            case CARD_EFFECTS.ITSTARTUP:
                return opponents.length * Math.max(owner.itVentureCoins, 1);
            case CARD_EFFECTS.PARK:
                return 2;
            default: {
                let amount = card.income;
                if (owner.landmarks[LANDMARK_NAMES.SHOPPING_MALL] &&
                    (card.category === CARD_CATEGORIES.RESTAURANT || card.category === CARD_CATEGORIES.SHOP)) amount += 1;
                return amount;
            }
        }
    }

    _estimateRollScore(game, dice) {
        let score = 0;
        const current = game.currentPlayer();
        for (const player of game.players) {
            for (const card of player.cards) {
                if (player.isDormant(card)) continue;
                if (!card.diceNums.includes(dice)) continue;
                const value = this._cardActivationValue(card, game, player, current, dice);
                if (player === current) score += value;
                else score -= value * (card.color === "blue" ? 0.7 : 1);
            }
        }
        return score;
    }

    _expectedDiceScore(game, useTwo) {
        const weights = useTwo
            ? { 2:1, 3:2, 4:3, 5:4, 6:5, 7:6, 8:5, 9:4, 10:3, 11:2, 12:1 }
            : { 1:1, 2:1, 3:1, 4:1, 5:1, 6:1 };
        let totalWeight = 0;
        let totalScore = 0;
        for (const [diceText, weight] of Object.entries(weights)) {
            const dice = parseInt(diceText, 10);
            totalWeight += weight;
            totalScore += this._estimateRollScore(game, dice) * weight;
        }
        return totalWeight > 0 ? totalScore / totalWeight : 0;
    }

    _diceOutcomeWeights(useTwo) {
        if (!useTwo) {
            return [
                { weight: 1, dice1: 1, dice2: 0, total: 1 },
                { weight: 1, dice1: 2, dice2: 0, total: 2 },
                { weight: 1, dice1: 3, dice2: 0, total: 3 },
                { weight: 1, dice1: 4, dice2: 0, total: 4 },
                { weight: 1, dice1: 5, dice2: 0, total: 5 },
                { weight: 1, dice1: 6, dice2: 0, total: 6 },
            ];
        }
        return [
            { weight: 1, dice1: 1, dice2: 1, total: 2 },
            { weight: 2, dice1: 1, dice2: 2, total: 3 },
            { weight: 3, dice1: 1, dice2: 3, total: 4 },
            { weight: 4, dice1: 1, dice2: 4, total: 5 },
            { weight: 5, dice1: 1, dice2: 5, total: 6 },
            { weight: 6, dice1: 1, dice2: 6, total: 7 },
            { weight: 5, dice1: 2, dice2: 6, total: 8 },
            { weight: 4, dice1: 3, dice2: 6, total: 9 },
            { weight: 3, dice1: 4, dice2: 6, total: 10 },
            { weight: 2, dice1: 5, dice2: 6, total: 11 },
            { weight: 1, dice1: 6, dice2: 6, total: 12 },
        ];
    }

    _simulationShopStock(playerCount = 2) {
        const stock = {};
        for (const card of CARDS) stock[card.name] = getInitialCardStock(card, playerCount);
        return stock;
    }

    _expertLookaheadSteps(game, focusIndex, baseSteps) {
        const player = game.players[focusIndex];
        const remainingLandmarks = [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length;
        let steps = Math.max(2, baseSteps);
        if (remainingLandmarks <= 1) steps += game.players.length * 2;
        else if (remainingLandmarks <= 2) steps += game.players.length;
        if (game.phase === GAME_PHASES.BUILD) steps += 1;
        if (game.players.length >= 4 && remainingLandmarks >= 4) steps = Math.max(2, steps - game.players.length);
        if (this.simulationMode === "fast") steps = Math.max(2, Math.round(steps * 0.8));
        if (this.simulationMode === "lite") steps = Math.max(2, Math.round(steps * 0.65));
        return steps;
    }

    _scoreExpertChoiceState(game, focusIndex) {
        return this._profileMeasure("expert.choiceState", () => {
            const tuning = this.expertTuning;
            let score = this._evaluatePosition(game, focusIndex);
            if (!game.checkWinner() && this._shouldUseExpertChoiceLookahead(game, focusIndex)) {
                score += this._profileMeasure("expert.choiceLookahead", () =>
                    this._simulateLookahead(
                        game,
                        this._simulationShopStock(game.players.length),
                        focusIndex,
                        this._expertLookaheadSteps(game, focusIndex, game.players.length * 2)
                    )
                ) * Math.min(0.35, tuning.lookaheadWeight * 0.5);
            }
            return score;
        });
    }

    _shouldUseExpertChoiceLookahead(game, focusIndex) {
        const player = game.players[focusIndex];
        const remainingLandmarks = [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length;
        if (this.simulationMode === "realtime") {
            if (game.players.length >= 4) return false;
            return game.phase === GAME_PHASES.BUILD && remainingLandmarks <= 1;
        }
        if (this.simulationMode === "lite") {
            return remainingLandmarks <= 1 && game.phase === GAME_PHASES.BUILD;
        }
        if (this.simulationMode === "fast") {
            return game.phase === GAME_PHASES.BUILD || remainingLandmarks <= 2;
        }
        if (game.players.length >= 4) {
            return game.phase === GAME_PHASES.BUILD && remainingLandmarks <= 2;
        }
        return game.phase === GAME_PHASES.BUILD || remainingLandmarks <= 2;
    }

    _expectedExpertChoiceValue(game, focusIndex, outcomes, applyOutcome) {
        return this._profileMeasure("expert.expectedChoiceValue", () => {
            let totalWeight = 0;
            let totalScore = 0;
            for (const outcome of outcomes) {
                const clone = this._cloneGame(game);
                applyOutcome(clone, outcome);
                totalWeight += outcome.weight;
                totalScore += this._scoreExpertChoiceState(clone, focusIndex) * outcome.weight;
            }
            return totalWeight > 0 ? totalScore / totalWeight : -Infinity;
        });
    }

    _scoreExpertPendingChoice(game, applyChoice) {
        const focusIndex = game.currentPlayerIndex;
        const clone = this._cloneGame(game);
        applyChoice(clone);
        return this._scoreExpertChoiceState(clone, focusIndex);
    }

    _scoreStrongPendingChoice(game, applyChoice) {
        const focusIndex = game.currentPlayerIndex;
        const clone = this._cloneGame(game);
        applyChoice(clone);
        return this._scoreStrongChoiceState(clone, focusIndex);
    }

    _crowdLeaderBonus(game, targetIndex, weight = 1) {
        if (!game || game.players.length < 4 || targetIndex < 0) return 0;
        const ci = game.currentPlayerIndex;
        let maxThreat = -Infinity;
        for (let i = 0; i < game.players.length; i++) {
            if (i === ci) continue;
            maxThreat = Math.max(maxThreat, this._estimateOpponentThreat(game.players[i], game));
        }
        const target = game.players[targetIndex];
        if (!target || maxThreat <= 0) return 0;
        const threat = this._estimateOpponentThreat(target, game);
        return (threat / maxThreat) * weight;
    }

    _crowdCleaningBonus(game, cardName, weight = 1) {
        if (!game || game.players.length < 4) return 0;
        const ci = game.currentPlayerIndex;
        let maxThreat = -Infinity;
        let bonus = 0;
        for (let i = 0; i < game.players.length; i++) {
            if (i === ci) continue;
            maxThreat = Math.max(maxThreat, this._estimateOpponentThreat(game.players[i], game));
        }
        if (maxThreat <= 0) return 0;
        for (let i = 0; i < game.players.length; i++) {
            if (i === ci) continue;
            const opponent = game.players[i];
            const threatRatio = this._estimateOpponentThreat(opponent, game) / maxThreat;
            const matching = opponent.getMinorCards().filter(card => card.name === cardName && !opponent.isDormant(card)).length;
            bonus += matching * threatRatio * weight;
        }
        return bonus;
    }

    _remainingEnabledLandmarks(current, game) {
        return Player.landmarkNames()
            .filter(name => (!game.enabledLandmarks || game.enabledLandmarks.has(name)) && !current.landmarks[name]);
    }

    _isEndgameMode(current, game, threshold = 2) {
        return this._remainingEnabledLandmarks(current, game).length <= threshold;
    }

    _estimatePurchasePlanValue(player, game, difficulty = this.difficulty) {
        const bestLandmark = this._bestAffordableLandmark(player, game);
        const affordable = CARDS.filter(card =>
            player.coins >= card.cost &&
            card.cost > 0 &&
            !(card.color === "purple" && player.countCard(card.name) > 0)
        );
        const ranked = this._sortAffordableForDifficulty(affordable, game, player, difficulty);
        const bestCard = ranked[0] ? ranked[0].score : -Infinity;
        const landmarkValue = bestLandmark
            ? bestLandmark.urgency * 2.4 + Math.max(0, player.coins - bestLandmark.cost) * 0.08
            : -Infinity;
        return Math.max(bestCard, landmarkValue, 0);
    }

    _scoreStrongChoiceState(game, focusIndex) {
        const player = game.players[focusIndex];
        const landmarkPressure = this._isEndgameMode(player, game, 2) ? 6 : 0;
        const winDistance = this._estimateWinDistance(player, game);
        return this._estimatePurchasePlanValue(player, game, "strong") +
            this._estimatePlayerTurnValue(game, focusIndex) * 0.35 +
            player.coins * 0.18 +
            player.builtLandmarkCount() * 2.8 +
            landmarkPressure -
            winDistance * 1.2 -
            this._estimateRedPressure(game, focusIndex) * 0.08 -
            this._duplicateRenovationPenalty(player, "strong");
    }

    _expectedStrongChoiceValue(game, focusIndex, outcomes, applyOutcome) {
        let totalWeight = 0;
        let totalScore = 0;
        for (const outcome of outcomes) {
            const clone = this._cloneGame(game);
            applyOutcome(clone, outcome);
            totalWeight += outcome.weight;
            totalScore += this._scoreStrongChoiceState(clone, focusIndex) * outcome.weight;
        }
        return totalWeight > 0 ? totalScore / totalWeight : -Infinity;
    }

    chooseDiceCount(game) {
        this._syncExpertTuningForGame(game);
        if (this.difficulty === "weak") return Math.random() < 0.5;
        if (this.difficulty === "expert" && !this._expertCrowdNormalPlan(game)) {
            if (this._expertCrowdNormalPlan(game)) {
                const oneScore = this._expectedDiceScore(game, false);
                const twoScore = this._expectedDiceScore(game, true);
                return twoScore > oneScore + 0.8;
            }
            const focusIndex = game.currentPlayerIndex;
            const oneScore = this._expectedExpertChoiceValue(
                game,
                focusIndex,
                this._diceOutcomeWeights(false),
                (clone, outcome) => clone.selectDiceCount(false, outcome.dice1, null, [outcome.dice1, outcome.dice1])
            );
            const twoScore = this._expectedExpertChoiceValue(
                game,
                focusIndex,
                this._diceOutcomeWeights(true),
                (clone, outcome) => clone.selectDiceCount(true, outcome.dice1, outcome.dice2, [outcome.dice1, outcome.dice2])
            );
            if (this._expertFlagEnabled("diceCloserDiscipline")) {
                const current = game.players[focusIndex];
                const shortfall = this._closestLandmarkShortfall(current, game);
                const remainingLandmarks = [...game.enabledLandmarks].filter(name => !current.landmarks[name]).length;
                if (remainingLandmarks <= 2 && shortfall <= 3 && twoScore <= oneScore + 1.2) {
                    return false;
                }
            }
            return twoScore >= oneScore;
        }
        if (this.difficulty === "strong") {
            if (game.players.length >= 4) {
                const oneScore = this._expectedDiceScore(game, false);
                const twoScore = this._expectedDiceScore(game, true);
                const threshold = this._strongCrowdOneDieOpponents(game) >= 2 ? 1.5 : 0.8;
                return twoScore > oneScore + threshold;
            }
            const focusIndex = game.currentPlayerIndex;
            const oneScore = this._expectedStrongChoiceValue(
                game,
                focusIndex,
                this._diceOutcomeWeights(false),
                (clone, outcome) => clone.selectDiceCount(false, outcome.dice1, null, [outcome.dice1, outcome.dice1])
            );
            const twoScore = this._expectedStrongChoiceValue(
                game,
                focusIndex,
                this._diceOutcomeWeights(true),
                (clone, outcome) => clone.selectDiceCount(true, outcome.dice1, outcome.dice2, [outcome.dice1, outcome.dice2])
            );
            return twoScore >= oneScore;
        }
        const oneScore = this._expectedDiceScore(game, false);
        const twoScore = this._expectedDiceScore(game, true);
        if (this.difficulty === "normal") {
            return twoScore > oneScore + 0.8;
        }
        return twoScore >= oneScore;
    }

    chooseReroll(game) {
        this._syncExpertTuningForGame(game);
        const dice = game.lastDiceResult;
        if (this.difficulty === "weak") return Math.random() < 0.5;
        if (this.difficulty === "expert") {
            if (this._expertCrowdNormalPlan(game)) {
                const currentScore = this._estimateRollScore(game, dice);
                const usingTwoDice = game.lastDice2 > 0;
                const rerollScore = this._expectedDiceScore(game, usingTwoDice);
                return rerollScore > currentScore + 1.2;
            }
            const focusIndex = game.currentPlayerIndex;
            const usingTwoDice = game.lastDice2 > 0;
            const keepScore = this._expectedExpertChoiceValue(
                game,
                focusIndex,
                [{ weight: 1, dice1: game.lastDice1 || game.lastDiceResult, dice2: game.lastDice2 || 0 }],
                (clone) => clone.skipReroll()
            );
            const rerollScore = this._expectedExpertChoiceValue(
                game,
                focusIndex,
                this._diceOutcomeWeights(usingTwoDice),
                (clone, outcome) => clone.rerollDice(outcome.total, [outcome.dice1, outcome.dice2 || outcome.dice1])
            );
            if (this._expertFlagEnabled("rerollCloserDiscipline")) {
                const current = game.players[focusIndex];
                const remainingLandmarks = [...game.enabledLandmarks].filter(name => !current.landmarks[name]).length;
                const shortfall = this._closestLandmarkShortfall(current, game);
                if (remainingLandmarks <= 2 && shortfall <= 3 && keepScore >= rerollScore - 1.5) {
                    return false;
                }
            }
            return rerollScore > keepScore;
        }
        if (this.difficulty === "strong") {
            if (game.players.length >= 4) {
                const currentScore = this._estimateRollScore(game, dice);
                const usingTwoDice = game.lastDice2 > 0;
                const rerollScore = this._expectedDiceScore(game, usingTwoDice);
                if (!usingTwoDice && dice <= 6 && this._strongCrowdOneDieOpponents(game) >= 2) {
                    return rerollScore > currentScore + 2.2;
                }
                return rerollScore > currentScore + 1.2;
            }
            const focusIndex = game.currentPlayerIndex;
            const usingTwoDice = game.lastDice2 > 0;
            const keepScore = this._expectedStrongChoiceValue(
                game,
                focusIndex,
                [{ weight: 1, dice1: game.lastDice1 || game.lastDiceResult, dice2: game.lastDice2 || 0 }],
                (clone) => clone.skipReroll()
            );
            const rerollScore = this._expectedStrongChoiceValue(
                game,
                focusIndex,
                this._diceOutcomeWeights(usingTwoDice),
                (clone, outcome) => clone.rerollDice(outcome.total, [outcome.dice1, outcome.dice2 || outcome.dice1])
            );
            return rerollScore > keepScore + 0.2;
        }
        const currentScore = this._estimateRollScore(game, dice);
        const usingTwoDice = game.lastDice2 > 0;
        const rerollScore = this._expectedDiceScore(game, usingTwoDice);
        if (this.difficulty === "normal") return rerollScore > currentScore + 1.2;
        return rerollScore > currentScore + 0.3;
    }

    chooseHarbor(game) {
        this._syncExpertTuningForGame(game);
        if (this.difficulty === "weak") return Math.random() < 0.5;
        if (this.difficulty === "expert") {
            if (this._expertCrowdNormalPlan(game)) {
                const keepScore = this._estimateRollScore(game, game.lastDiceResult);
                const bonusScore = this._estimateRollScore(game, game.lastDiceResult + 2);
                return bonusScore > keepScore + 0.5;
            }
            const focusIndex = game.currentPlayerIndex;
            const outcomes = [{ weight: 1, tunaDice: game.pendingTunaDice || [game.lastDice1 || 1, game.lastDice2 || 1] }];
            const keepScore = this._expectedExpertChoiceValue(
                game,
                focusIndex,
                outcomes,
                (clone, outcome) => clone.resolveHarbor(false, outcome.tunaDice)
            );
            const bonusScore = this._expectedExpertChoiceValue(
                game,
                focusIndex,
                outcomes,
                (clone, outcome) => clone.resolveHarbor(true, outcome.tunaDice)
            );
            return bonusScore >= keepScore;
        }
        if (this.difficulty === "strong") {
            if (game.players.length >= 4) {
                const keepScore = this._estimateRollScore(game, game.lastDiceResult);
                const bonusScore = this._estimateRollScore(game, game.lastDiceResult + 2);
                const threshold = this._strongCrowdOneDieOpponents(game) >= 2 && game.lastDiceResult <= 6 ? 0.8 : 0.3;
                return bonusScore > keepScore + threshold;
            }
            const focusIndex = game.currentPlayerIndex;
            const outcomes = [{ weight: 1, tunaDice: game.pendingTunaDice || [game.lastDice1 || 1, game.lastDice2 || 1] }];
            const keepScore = this._expectedStrongChoiceValue(
                game,
                focusIndex,
                outcomes,
                (clone, outcome) => clone.resolveHarbor(false, outcome.tunaDice)
            );
            const bonusScore = this._expectedStrongChoiceValue(
                game,
                focusIndex,
                outcomes,
                (clone, outcome) => clone.resolveHarbor(true, outcome.tunaDice)
            );
            return bonusScore >= keepScore;
        }
        const keepScore = this._estimateRollScore(game, game.lastDiceResult);
        const bonusScore = this._estimateRollScore(game, game.lastDiceResult + 2);
        if (this.difficulty === "normal") return bonusScore > keepScore + 0.5;
        return bonusScore >= keepScore;
    }

    chooseTVTarget(game) {
        this._syncExpertTuningForGame(game);
        const ci = game.currentPlayerIndex;
        if (this.difficulty === "expert") {
            const disruptionScale = this._expertDisruptionScale(game, ci);
            let bestScore = -Infinity;
            let targetIndex = -1;
            for (const i of this._expertCandidateTargetIndexes(game, ci)) {
                const target = game.players[i];
                if (!target || target.coins <= 0) continue;
                const targetDistance = this._estimateWinDistance(target, game);
                const racePressure = Math.max(0, 18 - targetDistance);
                const nextLandmarkPressure = this._coinsTowardsNextLandmark(target) * 0.4;
                const steal = Math.min(5, target.coins);
                const score = this._scoreExpertPendingChoice(game, clone => clone.resolveTV(i)) +
                    this._expertCrowdDisruptionBonus(game, i, 12 * disruptionScale) +
                    racePressure * 0.7 * disruptionScale +
                    nextLandmarkPressure * disruptionScale +
                    this._tvLandmarkDenialValue(target, steal, game);
                if (score > bestScore) {
                    bestScore = score;
                    targetIndex = i;
                }
            }
            if (targetIndex >= 0) return targetIndex;
        }
        let bestScore = -Infinity;
        let targetIndex = -1;
        const attackScale = this._strongCrowdAttackScale(game);
        const disruptionReady = this._strongCrowdDisruptionReady(game, game.currentPlayer());
        for (let i = 0; i < game.players.length; i++) {
            if (i === ci) continue;
            const opponent = game.players[i];
            const steal = Math.min(5, opponent.coins);
            const score = (this.difficulty === "strong" && game.players.length >= 4)
                ? (disruptionReady ? this._scoreStrongPendingChoice(game, clone => clone.resolveTV(i)) + steal * 0.4 : steal * 0.5)
                : steal * 2.2 +
                    opponent.builtLandmarkCount() * 2.5 * attackScale +
                    this._coinsTowardsNextLandmark(opponent) * 0.25 * attackScale;
            if (score > bestScore) {
                bestScore = score;
                targetIndex = i;
            }
        }
        return targetIndex;
    }

    chooseBusinessMove(game) {
        this._syncExpertTuningForGame(game);
        const current = game.currentPlayer();
        const ci = game.currentPlayerIndex;
        const myCards = current.getMinorCards();
        if (myCards.length === 0) return null;

        let bestMove = null;
        const attackScale = this._strongCrowdAttackScale(game);
        const disruptionReady = this._strongCrowdDisruptionReady(game, current);
        const disruptionScale = this._expertDisruptionScale(game, ci);
        for (const myCard of myCards) {
            for (const i of this._expertCandidateTargetIndexes(game, ci)) {
                const target = game.players[i];
                for (const theirCard of target.getMinorCards()) {
                    const move = {
                        myCard: current.cards.indexOf(myCard),
                        targetIndex: i,
                        theirCard: target.cards.indexOf(theirCard),
                    };
                    let score;
                    if (this.difficulty === "expert" && !this._expertCrowdNormalPlan(game)) {
                        const targetDistance = this._estimateWinDistance(target, game);
                        const racePressure = Math.max(0, 18 - targetDistance);
                        const denialValue = this._ownedCardValue(theirCard, game, target);
                        const giftValue = this._receivedCardValue(myCard, game, target);
                        score = this._scoreExpertPendingChoice(game, clone =>
                            clone.resolveBusiness(move.myCard, move.targetIndex, move.theirCard)
                        ) +
                            this._expertCrowdDisruptionBonus(game, i, 10 * disruptionScale) +
                            denialValue * 0.45 * disruptionScale +
                            racePressure * 0.75 * disruptionScale -
                            giftValue * 0.2;
                    } else if (this.difficulty === "strong" && game.players.length >= 4) {
                        score = disruptionReady
                            ? this._scoreStrongPendingChoice(game, clone =>
                                clone.resolveBusiness(move.myCard, move.targetIndex, move.theirCard)
                            )
                            : this._receivedCardValue(theirCard, game, current) - this._ownedCardValue(myCard, game, current) * 0.9;
                    } else {
                        const myLoss = this._ownedCardValue(myCard, game, current);
                        const gain = this._receivedCardValue(theirCard, game, current);
                        const denial = this._ownedCardValue(theirCard, game, target) * 0.7 * attackScale;
                        const gift = this._receivedCardValue(myCard, game, target) * 0.45;
                        score = gain + denial - myLoss - gift +
                            target.builtLandmarkCount() * 0.8 * attackScale +
                            (target.coins >= 10 ? 1.5 * attackScale : 0);
                    }
                    if (!bestMove || score > bestMove.score) {
                        bestMove = Object.assign({ score }, move);
                    }
                }
            }
        }
        return bestMove;
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
        this._syncExpertTuningForGame(game);
        const current = game.currentPlayer();
        let best = null;
        const attackScale = this._strongCrowdAttackScale(game);
        const disruptionReady = this._strongCrowdDisruptionReady(game, current);
        const disruptionScale = this._expertDisruptionScale(game, game.currentPlayerIndex);
        const names = this._expertCandidateCleaningNames(game);
        for (const name of names) {
            let score;
            if (this.difficulty === "expert" && !this._expertCrowdNormalPlan(game)) {
                let targetValue = 0;
                let racePressure = 0;
                for (let i = 0; i < game.players.length; i++) {
                    const player = game.players[i];
                    if (player === current) continue;
                    const distance = this._estimateWinDistance(player, game);
                    const pressure = Math.max(0, 18 - distance);
                    for (const card of player.getMinorCards()) {
                        if (card.name !== name || player.isDormant(card)) continue;
                        targetValue += this._ownedCardValue(card, game, player);
                        racePressure += pressure;
                    }
                }
                score = this._scoreExpertPendingChoice(game, clone => clone.resolveCleaning(name)) +
                    this._expertCrowdCleaningWeight(game, name, 3 * disruptionScale) +
                    targetValue * 0.18 * disruptionScale +
                    racePressure * 0.45 * disruptionScale;
            } else if (this.difficulty === "strong" && game.players.length >= 4) {
                score = disruptionReady
                    ? this._scoreStrongPendingChoice(game, clone => clone.resolveCleaning(name))
                    : (() => {
                        let ownPenalty = 0;
                        let targetGain = 0;
                        for (const player of game.players) {
                            for (const card of player.getMinorCards()) {
                                if (card.name !== name || player.isDormant(card)) continue;
                                const value = this._ownedCardValue(card, game, player);
                                if (player === current) ownPenalty += value;
                                else targetGain += value;
                            }
                        }
                        return targetGain * 0.35 - ownPenalty * 1.4;
                    })();
            } else {
                let ownPenalty = 0;
                let targetGain = 0;
                let count = 0;
                for (const player of game.players) {
                    for (const card of player.getMinorCards()) {
                        if (card.name !== name || player.isDormant(card)) continue;
                        count++;
                        const value = this._ownedCardValue(card, game, player);
                        if (player === current) ownPenalty += value;
                        else targetGain += value;
                    }
                }
                score = count * attackScale + targetGain * 0.7 * attackScale - ownPenalty * 1.2;
            }
            if (!best || score > best.score) best = { cardName: name, score };
        }
        return best ? best.cardName : null;
    }

    chooseMoverMove(game) {
        this._syncExpertTuningForGame(game);
        const current = game.currentPlayer();
        const ci = game.currentPlayerIndex;
        const attackScale = this._strongCrowdAttackScale(game);
        let best = null;
        for (const card of current.getMinorCards()) {
            for (let i = 0; i < game.players.length; i++) {
                if (i === ci) continue;
                const target = game.players[i];
                const move = {
                    cardIndex: current.cards.indexOf(card),
                    targetIndex: i,
                };
                let score;
                if (this.difficulty === "expert" && !this._expertCrowdNormalPlan(game)) {
                    score = this._scoreExpertPendingChoice(game, clone =>
                        clone.resolveMover(move.cardIndex, move.targetIndex)
                    ) - this._expertCrowdDisruptionBonus(game, i, 8);
                } else if (this.difficulty === "strong" && game.players.length >= 4) {
                    score = this._scoreStrongPendingChoice(game, clone =>
                        clone.resolveMover(move.cardIndex, move.targetIndex)
                    );
                } else {
                    const myLoss = this._ownedCardValue(card, game, current);
                    const gift = this._receivedCardValue(card, game, target);
                    score = 4 - myLoss - gift * 0.6 * attackScale -
                        target.builtLandmarkCount() * 0.6 * attackScale +
                        (current.isDormant(card) ? 2.5 : 0);
                }
                if (!best || score > best.score) {
                    best = Object.assign({ score }, move);
                }
            }
        }
        return best;
    }

    chooseRenovationTarget(game) {
        this._syncExpertTuningForGame(game);
        const current = game.currentPlayer();
        if (this.difficulty === "expert" && !this._expertCrowdNormalPlan(game)) {
            let bestScore = -Infinity;
            let bestName = null;
            for (const [name, built] of Object.entries(current.landmarks)) {
                if (!built || name === LANDMARK_NAMES.YAKUSHO) continue;
                const demolitionValue = this._builtLandmarkValue(name, current, game);
                const score = this._scoreExpertPendingChoice(game, clone => clone.resolveRenovation(name)) - demolitionValue * 3;
                if (score > bestScore) {
                    bestScore = score;
                    bestName = name;
                }
            }
            if (bestName) return bestName;
        }
        let best = null;
        for (const [name, built] of Object.entries(current.landmarks)) {
            if (!built || name === LANDMARK_NAMES.YAKUSHO) continue;
            const score = this._builtLandmarkValue(name, current, game);
            if (!best || score < best.score) best = { name, score };
        }
        return best ? best.name : null;
    }

    chooseITSave(game) {
        this._syncExpertTuningForGame(game);
        const current = game.currentPlayer();
        if (current.coins < 1) return false;
        if (this.difficulty === "weak") return false;

        const remainingLandmarks = Player.landmarkNames()
            .filter(name => (!game.enabledLandmarks || game.enabledLandmarks.has(name)) && !current.landmarks[name]);
        const urgentLandmark = remainingLandmarks
            .filter(name => (!game.enabledLandmarks || game.enabledLandmarks.has(name)) && !current.landmarks[name])
            .map(name => ({
                name,
                shortfall: Player.landmarkCost(name) - current.coins,
                urgency: this._landmarkUrgency(name, current, game),
            }))
            .filter(entry => entry.shortfall >= 0)
            .sort((a, b) => a.shortfall - b.shortfall || b.urgency - a.urgency)[0];
        const closeToFinish = remainingLandmarks.length <= 2;
        const airportOnly = remainingLandmarks.length === 1 && remainingLandmarks[0] === LANDMARK_NAMES.AIRPORT;
        const nearLandmark = urgentLandmark && (urgentLandmark.shortfall <= 3 || (airportOnly && urgentLandmark.shortfall <= 6));
        const overSaved = current.itVentureCoins >= 8;

        if ((closeToFinish && nearLandmark) || (airportOnly && overSaved)) return false;
        if (this.difficulty === "normal") return !closeToFinish;

        if (this.difficulty === "expert") {
            if (this._expertCrowdNormalPlan(game)) return !closeToFinish;
            if (this._shouldExpertForceLandmarkPlan(current, game)) return false;
            if (remainingLandmarks.length <= 3 && urgentLandmark && urgentLandmark.shortfall <= 4) return false;
            if (remainingLandmarks.length <= 4 && current.builtLandmarkCount() >= 2 && urgentLandmark && urgentLandmark.shortfall <= 6) return false;
            if (urgentLandmark && urgentLandmark.shortfall <= 1 && urgentLandmark.urgency >= 7) return false;
            const focusIndex = game.currentPlayerIndex;
            const skipScore = this._expectedExpertChoiceValue(
                game,
                focusIndex,
                [{ weight: 1 }],
                clone => clone.resolveIT(false)
            );
            const saveScore = this._expectedExpertChoiceValue(
                game,
                focusIndex,
                [{ weight: 1 }],
                clone => clone.resolveIT(true)
            );
            const baselineSave = game.players.length >= 3 || current.itVentureCoins >= 1 || current.coins >= 8;
            if (baselineSave && saveScore >= skipScore - 2) return true;
            return saveScore >= skipScore;
        }

        return (!urgentLandmark || urgentLandmark.shortfall > 0 || urgentLandmark.urgency < 7) && !closeToFinish;
    }

    // ===== カード評価 =====

    // ゲーム状況を踏まえたカードの期待収入スコア
    evalCard(card, game, player) {
        const ci = game.players.indexOf(player);
        const opponents = game.players.filter((_, i) => i !== ci);
        const profile = this._playerCountProfile(game);

        switch (card.effect) {
            case CARD_EFFECTS.CHEESE:
            case CARD_EFFECTS.FURNITURE:
            case CARD_EFFECTS.FLOWER:
            case CARD_EFFECTS.MARKET:
            case CARD_EFFECTS.FOODWAREHOUSE:
            case CARD_EFFECTS.DRINKFACTORY:
            case CARD_EFFECTS.WINERY:
            case CARD_EFFECTS.FEWLANDMARK:
            case CARD_EFFECTS.CORNFIELD:
                return GameManager.calcCardIncome(card, player, game) * profile.greenFactor;
            case CARD_EFFECTS.STADIUM:
                return opponents.length * card.income * profile.massAttackFactor;
            case CARD_EFFECTS.TV:
                return Math.min(card.income, Math.max(...opponents.map(p => p.coins), 0)) * profile.purpleFactor;
            case CARD_EFFECTS.PUBLISHER:
                return opponents.reduce((s, p) =>
                    s + p.cards.filter(c => c.category === CARD_CATEGORIES.RESTAURANT || c.category === CARD_CATEGORIES.SHOP).length, 0) * profile.massAttackFactor;
            case CARD_EFFECTS.TAXOFFICE:
                return opponents.filter(p => p.coins >= 10).length * 5 * profile.massAttackFactor;
            case CARD_EFFECTS.HARBOR:
                return (player.landmarks[LANDMARK_NAMES.HARBOR] ? card.income : card.income * 0.4) * profile.blueFactor;
            case CARD_EFFECTS.HARBOR_RED:
                return (player.landmarks[LANDMARK_NAMES.HARBOR] ? card.income : 0) * profile.redFactor;
            case CARD_EFFECTS.TUNA:
                return (player.landmarks[LANDMARK_NAMES.HARBOR] ? 7 : 0) * profile.blueFactor;
            case CARD_EFFECTS.LOAN:
                return (player.coins <= 4 ? 3.5 : 1.2) * profile.greenFactor;
            case CARD_EFFECTS.ITSTARTUP:
                return opponents.length * Math.max(2, player.itVentureCoins + 1) * profile.massAttackFactor;
            case CARD_EFFECTS.RENOVATION:
                return (player.builtLandmarkCount() > 0 ? 3.5 : 0) * profile.greenFactor;
            case CARD_EFFECTS.CLEANING:
                return this._estimateCleaningValue(game, player) * profile.massAttackFactor;
            case CARD_EFFECTS.MOVER:
                return this._estimateMoverValue(game, player) * profile.greenFactor;
            case CARD_EFFECTS.BUSINESS:
                return this._estimateBusinessValue(game, player) * (game.players.length <= 2 ? 1.15 : 1);
            case CARD_EFFECTS.PARK:
                return this._estimateParkValue(game, player) * profile.massAttackFactor;
            default:
                if (card.color === "blue") return card.income * profile.blueFactor;
                if (card.color === "red") return card.income * profile.redFactor;
                if (card.color === "green") return card.income * profile.greenFactor;
                if (card.color === "purple") return card.income * profile.purpleFactor;
                return card.income;
        }
    }

    _expertRollIncomeCap(player, game) {
        if (!player || !game || !game.enabledLandmarks) return Infinity;
        const remainingCosts = [...game.enabledLandmarks]
            .filter(name => !player.landmarks[name])
            .map(name => Player.landmarkCost(name));
        if (remainingCosts.length === 0) return Infinity;
        return Math.max(...remainingCosts);
    }

    _estimateOwnRollIncome(game, player, dice, candidateCard = null) {
        if (!game || !player) return 0;
        let total = 0;
        const cards = candidateCard ? player.cards.concat([candidateCard]) : player.cards;
        for (const card of cards) {
            if (!card || !card.diceNums || !card.diceNums.includes(dice)) continue;
            if (!candidateCard && player.isDormant(card)) continue;
            const value = this._cardActivationValue(card, game, player, player, dice);
            if (value > 0) total += value;
        }
        return total;
    }

    _scoreExpertRollCapPenalty(card, game, player) {
        if (this.difficulty !== "expert" || !card || !game || !player || !card.diceNums || card.diceNums.length === 0) return 0;
        const cap = this._expertRollIncomeCap(player, game);
        if (!Number.isFinite(cap) || cap <= 0) return 0;
        let penalty = 0;
        for (const dice of card.diceNums) {
            const before = this._estimateOwnRollIncome(game, player, dice);
            const after = this._estimateOwnRollIncome(game, player, dice, card);
            const added = Math.max(0, after - before);
            if (added <= 0) continue;
            if (before >= cap) {
                penalty += added * 2.4;
                continue;
            }
            const overflow = Math.max(0, after - cap);
            if (overflow > 0) {
                penalty += overflow * 1.8;
            }
        }
        return penalty;
    }

    // ダイス出目の重み
    _singleDiceFreq(diceNums) {
        const w = {1:1,2:1,3:1,4:1,5:1,6:1};
        return diceNums.reduce((s, d) => s + (w[d] || 0), 0);
    }

    _doubleDiceFreq(diceNums) {
        const w = {1:0,2:1,3:2,4:3,5:4,6:5,7:6,8:5,9:4,10:3,11:2,12:1,13:0,14:0};
        return diceNums.reduce((s, d) => s + (w[d] || 0), 0);
    }

    _diceFreqForRoller(diceNums, roller) {
        if (!roller || !roller.landmarks || !roller.landmarks[LANDMARK_NAMES.STATION]) {
            return this._singleDiceFreq(diceNums);
        }
        return Math.max(this._singleDiceFreq(diceNums), this._doubleDiceFreq(diceNums));
    }

    _cardDiceFreq(card, game, player) {
        if (!card || !game || !player) return this._doubleDiceFreq(card && card.diceNums ? card.diceNums : []);
        const ci = game.players.indexOf(player);
        if (card.color === "blue") {
            return game.players.reduce((sum, p) => sum + this._diceFreqForRoller(card.diceNums, p), 0);
        }
        if (card.color === "red") {
            return game.players.reduce((sum, p, i) =>
                i === ci ? sum : sum + this._diceFreqForRoller(card.diceNums, p), 0
            );
        }
        return this._diceFreqForRoller(card.diceNums, player);
    }

    _diceFreq(diceNums) {
        return this._doubleDiceFreq(diceNums);
    }

    // 購入可能カードをスコア順にソート（ダイス確率を加味）
    sortAffordable(cards, game, player) {
        return cards.map(card => ({
            card,
            score: this.evalCard(card, game, player) * this._cardDiceFreq(card, game, player) / Math.max(card.cost, 1)
        })).sort((a, b) => b.score - a.score);
    }

    _scoreExpertCardCandidate(card, game, player) {
        let score = this.evalCard(card, game, player) * this._cardDiceFreq(card, game, player) / Math.max(card.cost, 1);
        score -= this._scoreExpertRollCapPenalty(card, game, player);
        if (this.difficulty !== "expert" || !game || !player || game.players.length < 4) return score;
        const remainingLandmarks = [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length;
        const lowDice = card.diceNums && card.diceNums.length > 0 && Math.max(...card.diceNums) <= 6;
        const highDice = card.diceNums && card.diceNums.length > 0 && Math.min(...card.diceNums) >= 7;
        const earlyCrowd = remainingLandmarks > 2;

        if (this._expertFlagEnabled("crowdLowDiceEngineBoost") && earlyCrowd) {
            if (lowDice && (card.color === "blue" || card.color === "green")) score += 1.1;
            if (lowDice && card.cost <= 3) score += 0.8;
            if (card.name === "パン屋" || card.name === "コンビニ") score += 0.9;
            if (card.name === "麦畑" || card.name === "牧場") score += 0.6;
        }

        if (this._expertFlagEnabled("crowdRedRestaurantSuppression") && earlyCrowd) {
            if (card.color === "red") score -= 1.4;
            if (card.category === CARD_CATEGORIES.RESTAURANT) score -= 1.1;
            if (highDice && card.color === "red") score -= 0.8;
            if (card.name === "レストラン" || card.name === "ファミレス") score -= 0.9;
        }

        if (this._expertFlagEnabled("crowdPurpleShortlistDelay") && earlyCrowd) {
            if (card.name === "スタジアム" || card.name === "テレビ局" || card.name === "税務署" || card.name === "出版社") {
                score -= 3.2;
            }
        }

        if (remainingLandmarks <= 4) {
            if (card.name === "食品倉庫") score -= 2.8;
            if (card.name === "ピザ屋" || card.name === "バーガーショップ") score -= 2.1;
            if (card.name === "ブドウ園") score -= 1.8;
        }
        if (game.players.length >= 4 && remainingLandmarks <= 4) {
            if (card.name === "食品倉庫") score -= 3.5;
            if (card.name === "改装屋") score -= 3.2;
            if (card.name === "ピザ屋" || card.name === "バーガーショップ") score -= 2.6;
            if (card.name === "寿司屋") score -= 1.4;
        }

        return score;
    }

    _cardSpamPenalty(card, player, intensity = 1) {
        const owned = player.countCard(card.name);
        if (owned <= 0) return 0;
        let penalty = owned * 0.35 * intensity;
        if (card.color === "red") penalty += owned * 0.65 * intensity;
        if (card.color === "purple") penalty += owned * 1.4 * intensity;
        return penalty;
    }

    _duplicateRenovationPenalty(player, difficulty = this.difficulty) {
        if (!player) return 0;
        const copies = player.countCard("改装屋");
        const extraCopies = Math.max(0, copies - 1);
        if (extraCopies <= 0) return 0;
        if (difficulty === "expert") return extraCopies * 14 + Math.max(0, extraCopies - 1) * 6;
        if (difficulty === "strong") return extraCopies * 8 + Math.max(0, extraCopies - 1) * 3;
        return extraCopies * 4;
    }

    _strongRolePressure(card, game, player) {
        const cards = player.cards || [];
        const blueCount = cards.filter(c => c.color === "blue").length;
        const greenCount = cards.filter(c => c.color === "green").length;
        const redCount = cards.filter(c => c.color === "red").length;
        const purpleCount = cards.filter(c => c.color === "purple").length;
        let adjustment = 0;
        if (card.color === "blue" && blueCount === 0) adjustment += 0.7;
        if (card.color === "green" && greenCount < 2) adjustment += 0.9;
        if (card.color === "red" && redCount === 0 && game.players.some((p, i) => p !== player && p.coins >= 8)) adjustment += 0.5;
        if (card.color === "red" && redCount >= Math.max(2, greenCount + blueCount)) adjustment -= 1.2;
        if (card.color === "purple" && purpleCount > 0) adjustment -= 2.5;
        if (card.color === "green" && this._isEndgameMode(player, game, 2)) adjustment += 0.4;
        if (game.players.length >= 4) {
            if (card.color === "red") adjustment -= 2.1;
            if (card.color === "purple") adjustment -= 0.7;
            if (card.color === "blue") adjustment += 0.7;
            if (card.color === "green") adjustment += 1.1;
        }
        adjustment += this._strongPurpleAdjustment(card, game, player);
        return adjustment;
    }

    _normalSafetyAdjustment(card, game, player) {
        let adjustment = 0;
        const stableIncome = this._estimateStableIncome(game, player);
        if (card.effect === CARD_EFFECTS.LOAN && player.coins >= 8) adjustment -= 1.5;
        if (card.effect === CARD_EFFECTS.RENOVATION && player.builtLandmarkCount() === 0) adjustment -= 1.8;
        if (card.color === "purple" && stableIncome < 6 && card.cost >= 6) adjustment -= 1.1;
        if (card.color === "red" && player.cards.filter(c => c.color === "red").length >= 2) adjustment -= 0.7;
        if ((card.color === "blue" || card.color === "green") && stableIncome < 5) adjustment += 0.35;
        return adjustment;
    }

    _economyBalancePenalty(card, game, player, intensity = 1) {
        const profile = this._playerCountProfile(game);
        const cards = player.cards || [];
        const blueCount = cards.filter(c => c.color === "blue").length;
        const greenCount = cards.filter(c => c.color === "green").length;
        const redCount = cards.filter(c => c.color === "red").length;
        let penalty = 0;
        if (card.color === "red" && redCount >= Math.max(2, greenCount + blueCount)) {
            penalty += (redCount - Math.max(greenCount, 1) + 1) * 0.9 * intensity * profile.redFactor;
        }
        if (card.color === "red" && greenCount + blueCount <= 2) {
            penalty += 0.8 * intensity;
        }
        if (card.color === "green" && greenCount <= 1 && blueCount === 0) {
            penalty -= 0.4 * intensity;
        }
        if (card.color === "blue" && blueCount === 0) {
            penalty -= 0.25 * intensity;
        }
        return penalty;
    }

    _strongConditionalCardAdjustment(card, game, player) {
        if (this.difficulty !== "strong" || !card || !game || !player) return 0;
        if (card.effect !== CARD_EFFECTS.FRENCHR && card.effect !== CARD_EFFECTS.MEMBERBAR) return 0;
        const threshold = card.effect === CARD_EFFECTS.FRENCHR ? 2 : 3;
        const readyOpponents = game.players.filter(p => p !== player && p.builtLandmarkCount() >= threshold).length;
        if (readyOpponents > 0) return readyOpponents * (card.effect === CARD_EFFECTS.FRENCHR ? 1.6 : 2.2);
        const nearOpponents = game.players.filter(p => p !== player && p.builtLandmarkCount() === threshold - 1).length;
        return nearOpponents > 0 ? -1.2 : -3.6;
    }

    _strongLandmarkThresholdPenalty(name, current, game) {
        if (this.difficulty !== "strong" || !name || !current || !game) return 0;
        const nextBuiltCount = current.builtLandmarkCount() + 1;
        let penalty = 0;
        if (nextBuiltCount === 2) {
            const cornfieldCount = current.countCard('コーン畑') + current.countCard('雑貨屋');
            if (cornfieldCount > 0) penalty += cornfieldCount * 2.2;
        }
        for (const opponent of game.players) {
            if (opponent === current) continue;
            const frenchCount = opponent.cards.filter(card => !opponent.isDormant(card) && card.effect === CARD_EFFECTS.FRENCHR).length;
            const memberBarCount = opponent.cards.filter(card => !opponent.isDormant(card) && card.effect === CARD_EFFECTS.MEMBERBAR).length;
            if (nextBuiltCount >= 2 && frenchCount > 0) penalty += frenchCount * 2.6;
            if (nextBuiltCount >= 3 && memberBarCount > 0) penalty += memberBarCount * 4.2;
        }
        const remaining = this._remainingEnabledLandmarks(current, game).length;
        if (remaining <= 2) penalty *= 0.35;
        else if (remaining <= 3) penalty *= 0.6;
        return penalty;
    }

    _strongTempoValueBonus(card, game, player) {
        if (this.difficulty !== "strong" || !game || !player || !card || !card.diceNums || card.diceNums.length === 0) return 0;
        const lowDice = Math.max(...card.diceNums) <= 6;
        const highDice = Math.min(...card.diceNums) >= 7;
        let bonus = 0;
        const opponents = game.players.filter(p => p !== player);
        const oneDieOpponents = opponents.filter(p => !p.landmarks[LANDMARK_NAMES.STATION]).length;
        const selfOneDie = !player.landmarks[LANDMARK_NAMES.STATION];

        if ((card.color === "blue" || card.color === "red") && oneDieOpponents > 0) {
            if (lowDice) bonus += oneDieOpponents * 0.35;
            if (highDice) bonus -= oneDieOpponents * 0.35;
            if (game.players.length >= 4 && highDice && card.color === "red") bonus -= oneDieOpponents * 0.15;
        }

        if ((card.color === "green" || card.color === "purple") && selfOneDie) {
            if (lowDice) bonus += 0.9;
            if (highDice) bonus -= 0.9;
        }
        return bonus;
    }

    _strongCrowdOneDieOpponents(game, player = null) {
        if (!game || !game.players || game.players.length < 4) return 0;
        const current = player || game.currentPlayer();
        return game.players.filter(p => p !== current && !p.landmarks[LANDMARK_NAMES.STATION]).length;
    }

    _strongCrowdAttackScale(game) {
        const scale = this._opponentDilutionFactor(game);
        if (this.difficulty !== "strong" || !game || game.players.length < 4) return scale;
        return scale * 0.45;
    }

    _isStrongCrowd(game) {
        return this.difficulty === "strong" && game && game.players && game.players.length >= 4;
    }

    _strongPurpleAdjustment(card, game, player) {
        if (!card || card.color !== "purple") return 0;
        const stableIncome = this._estimateStableIncome(game, player);
        let adjustment = 0;
        if (card.effect === CARD_EFFECTS.STADIUM) adjustment += game.players.length >= 4 ? 3.4 : 1.8;
        if (card.effect === CARD_EFFECTS.TV) adjustment += game.players.length >= 4 ? 3.2 : 1.6;
        if (card.effect === CARD_EFFECTS.BUSINESS) adjustment += game.players.length >= 4 ? 2.4 : 1.2;
        if (card.effect === CARD_EFFECTS.RENOVATION) adjustment -= 1.8;
        if (card.effect === CARD_EFFECTS.ITSTARTUP) adjustment -= game.players.length >= 4 ? 2.8 : 1.8;
        if (card.effect === CARD_EFFECTS.LOAN) adjustment -= stableIncome >= 7 ? 0.4 : 1.2;
        return adjustment;
    }

    _landmarkCardSynergyBonus(card, game, player) {
        if (!card || !game || !player) return 0;
        let bonus = 0;
        const hasStation = !!player.landmarks[LANDMARK_NAMES.STATION];
        const hasMall = !!player.landmarks[LANDMARK_NAMES.SHOPPING_MALL];
        const hasHarbor = !!player.landmarks[LANDMARK_NAMES.HARBOR];
        const hasTower = !!player.landmarks[LANDMARK_NAMES.RADIO_TOWER];
        const hasPark = !!player.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK];
        const hasAirport = !!player.landmarks[LANDMARK_NAMES.AIRPORT];
        const lowDice = card.diceNums && card.diceNums.length > 0 && Math.max(...card.diceNums) <= 6;
        const highDice = card.diceNums && card.diceNums.length > 0 && Math.min(...card.diceNums) >= 7;

        if (hasStation && highDice) bonus += 0.9;
        if (!hasStation && highDice) bonus -= 0.6;
        if (hasMall && (card.category === CARD_CATEGORIES.RESTAURANT || card.category === CARD_CATEGORIES.SHOP)) bonus += 1.1;
        if (hasHarbor && [CARD_EFFECTS.HARBOR, CARD_EFFECTS.HARBOR_RED, CARD_EFFECTS.TUNA].includes(card.effect)) bonus += 1.6;
        if (hasTower && highDice) bonus += 0.5;
        if (hasPark && highDice) bonus += 0.35;
        if (hasAirport && card.cost <= 3 && lowDice) bonus -= 0.5;
        return bonus;
    }

    _strongPremiumPurpleReady(card, game, player) {
        if (!card || !game || !player) return true;
        if (!this._isStrongCrowd(game)) return true;
        if (![CARD_EFFECTS.STADIUM, CARD_EFFECTS.TV, CARD_EFFECTS.BUSINESS].includes(card.effect)) return true;
        const stableIncome = this._estimateStableIncome(game, player);
        const builtCount = player.builtLandmarkCount();
        const remainingLandmarks = [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length;
        return (stableIncome >= 10 && builtCount >= 2) || builtCount >= 3 || remainingLandmarks <= 2;
    }

    _strongLandmarkUrgencyBonus(name, current, game) {
        if (this.difficulty !== "strong" || !current || !game) return 0;
        const stableIncome = this._estimateStableIncome(game, current);
        const shopRestaurantCards = current.cards.filter(c =>
            c && (c.category === CARD_CATEGORIES.RESTAURANT || c.category === CARD_CATEGORIES.SHOP)
        ).length;
        const harborCards = current.cards.filter(c =>
            c && (c.effect === CARD_EFFECTS.HARBOR || c.effect === CARD_EFFECTS.HARBOR_RED || c.effect === CARD_EFFECTS.TUNA)
        ).length;
        const highVarianceCards = current.cards.filter(card =>
            card && card.diceNums && card.diceNums.length > 0 && Math.min(...card.diceNums) >= 7
        ).length;
        const cheapEngineCards = current.cards.filter(card => card && card.cost <= 3).length;

        if (name === LANDMARK_NAMES.STATION) {
            if (game.players.length >= 4) {
                if (highVarianceCards >= 1) return 3;
                return 2;
            }
            if (highVarianceCards >= 2) return 2;
            if (highVarianceCards >= 1) return 1;
            return 0;
        }
        if (name === LANDMARK_NAMES.SHOPPING_MALL) {
            if (game.players.length >= 4) {
                if (shopRestaurantCards >= 4) return 2;
                return 1;
            }
            if (shopRestaurantCards >= 5) return 1;
            return 0;
        }
        if (name === LANDMARK_NAMES.HARBOR) {
            let bonus = 0;
            if (game.players.length >= 4) bonus += 1;
            if (current.countCard('マグロ漁船') >= 2) bonus += 2;
            else if (current.countCard('マグロ漁船') >= 1) bonus += 1;
            if (harborCards >= 3) bonus += 1;
            return bonus;
        }
        if (name === LANDMARK_NAMES.RADIO_TOWER) {
            let bonus = current.landmarks[LANDMARK_NAMES.STATION] ? 1 : 0;
            if (highVarianceCards >= 4) bonus += 2;
            else if (highVarianceCards >= 2) bonus += 1;
            return bonus;
        }
        if (name === LANDMARK_NAMES.AMUSEMENT_PARK) {
            if (!current.landmarks[LANDMARK_NAMES.STATION]) return 0;
            if (highVarianceCards >= 2) return 2;
            if (highVarianceCards >= 1) return 1;
            return 0;
        }
        if (name === LANDMARK_NAMES.AIRPORT) {
            let bonus = 0;
            if (stableIncome >= 8) bonus += 1;
            if (cheapEngineCards <= 3) bonus += 1;
            return bonus;
        }
        return 0;
    }

    _strongSoftCapValue(value) {
        if (this.difficulty !== "strong") return value;
        const sign = Math.sign(value);
        const abs = Math.abs(value);
        if (abs <= 12) return value;
        if (abs <= 20) return sign * (12 + (abs - 12) * 0.5);
        if (abs <= 30) return sign * (16 + (abs - 20) * 0.3);
        return sign * (19 + Math.sqrt(abs - 30));
    }

    _strongCrowdDisruptionReady(game, player) {
        if (!this._isStrongCrowd(game) || !player) return true;
        const stableIncome = this._estimateStableIncome(game, player);
        const builtCount = player.builtLandmarkCount();
        return stableIncome >= 10 || builtCount >= 3;
    }

    _strongCrowdPremiumPurple(card) {
        return !!card && [CARD_EFFECTS.STADIUM, CARD_EFFECTS.TV, CARD_EFFECTS.BUSINESS].includes(card.effect);
    }

    _scoreAffordablePurchase(card, game, player, options = {}) {
        const intensity = options.intensity || 1;
        const expectedGain = (this.evalCard(card, game, player) + this._strongTempoValueBonus(card, game, player)) *
            this._cardDiceFreq(card, game, player);
        let score;
        if (options.difficulty === "strong") {
            score = expectedGain - card.cost * 0.7;
        } else {
            score = expectedGain / Math.max(card.cost, 1);
        }
        score += this._landmarkCardSynergyBonus(card, game, player);
        score -= this._cardSpamPenalty(card, player, intensity);
        score -= this._economyBalancePenalty(card, game, player, intensity);
        if (options.difficulty === "strong") score += this._strongConditionalCardAdjustment(card, game, player);
        if (card.effect === CARD_EFFECTS.RENOVATION && options.difficulty === "strong") {
            const owned = player.countCard("改装屋");
            if (owned >= 1) {
                score -= this._duplicateRenovationPenalty({ countCard: () => owned + 1 }, "strong");
            }
        }
        if (options.difficulty === "strong") score += this._strongRolePressure(card, game, player);
        if (options.difficulty === "normal") score += this._normalSafetyAdjustment(card, game, player);
        if (options.difficulty === "strong" && game.players.length >= 4) {
            const stableIncome = this._estimateStableIncome(game, player);
            const remainingLandmarks = [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length;
            const oneDieOpponents = this._strongCrowdOneDieOpponents(game, player);
            const lowDice = card.diceNums && card.diceNums.length > 0 && Math.max(...card.diceNums) <= 6;
            const highDice = card.diceNums && card.diceNums.length > 0 && Math.min(...card.diceNums) >= 7;
            const premiumPurple = [CARD_EFFECTS.STADIUM, CARD_EFFECTS.TV, CARD_EFFECTS.BUSINESS].includes(card.effect);
            if (card.color === "blue" || card.color === "green") score += 0.9;
            if (card.color === "red") score -= 1.1;
            if (card.color === "purple" && !premiumPurple) score -= 1.1;
            if (stableIncome < 8 && (card.color === "blue" || card.color === "green")) score += 1.2;
            if (stableIncome < 10 && card.color === "red") score -= 1.8;
            if (stableIncome < 10 && card.color === "purple" && !premiumPurple) score -= 1.8;
            if (remainingLandmarks > 2 && card.effect === CARD_EFFECTS.ITSTARTUP) score -= 2.5;
            if (oneDieOpponents >= 2 && lowDice && (card.color === "blue" || card.color === "green")) score += 1.2;
            if (oneDieOpponents >= 2 && highDice) score -= 1.4;
            if (oneDieOpponents >= 2 && highDice && (card.color === "red" || card.color === "purple")) score -= 1.0;
            if (premiumPurple && !this._strongPremiumPurpleReady(card, game, player)) score -= 3.2;
            if (lowDice && (card.color === "blue" || card.color === "green")) score += 0.9;
            if (lowDice && card.color === "green" && card.cost <= 3) score += 0.6;
            if (lowDice && card.color === "blue" && card.cost <= 2) score += 0.4;
            if (!player.landmarks[LANDMARK_NAMES.STATION] && lowDice && card.color === "green") score += 0.5;
            if (!player.landmarks[LANDMARK_NAMES.SHOPPING_MALL] && card.name === 'コンビニ') score += 0.6;
            if (!player.landmarks[LANDMARK_NAMES.STATION] && card.name === 'パン屋') score += 0.5;
        }
        return score;
    }

    _sortAffordableForDifficulty(cards, game, player, difficulty) {
        const intensity = difficulty === "strong" ? 1.4 : 0.8;
        return cards.map(card => ({
            card,
            score: this._scoreAffordablePurchase(card, game, player, { intensity, difficulty }),
        })).sort((a, b) => b.score - a.score);
    }

    _bestAffordableLandmark(current, game, reserve = 0) {
        let best = null;
        for (const name of Player.landmarkNames()) {
            if (!game.enabledLandmarks || !game.enabledLandmarks.has(name) || current.landmarks[name]) continue;
            const cost = Player.landmarkCost(name);
            if (current.coins < cost + reserve) continue;
            const urgency = this._landmarkUrgency(name, current, game);
            const thresholdPenalty = this._strongLandmarkThresholdPenalty(name, current, game);
            const score = urgency * 2.2 + Math.max(0, current.coins - cost - reserve) * 0.08 - thresholdPenalty;
            if (!best || score > best.score || (score === best.score && cost < best.cost)) {
                best = { name, cost, urgency, score };
            }
        }
        return best;
    }

    _strongTargetLandmark(current, game) {
        const priority = [
            LANDMARK_NAMES.STATION,
            LANDMARK_NAMES.SHOPPING_MALL,
            LANDMARK_NAMES.HARBOR,
            LANDMARK_NAMES.RADIO_TOWER,
            LANDMARK_NAMES.AMUSEMENT_PARK,
            LANDMARK_NAMES.AIRPORT,
        ];
        const remaining = this._remainingEnabledLandmarks(current, game)
            .map(name => ({
                name,
                cost: Player.landmarkCost(name),
                urgency: this._landmarkUrgency(name, current, game),
                priority: priority.indexOf(name),
            }))
            .sort((a, b) => {
                if (game.players.length >= 4) {
                    return b.urgency - a.urgency || a.priority - b.priority || a.cost - b.cost;
                }
                return a.priority - b.priority || b.urgency - a.urgency || a.cost - b.cost;
            });
        return remaining[0] || null;
    }

    _strongAttackUnlocked(current, game, targetLandmark = null) {
        if (game.players.length <= 2) {
            return current.builtLandmarkCount() >= 2 || this._estimateStableIncome(game, current) >= 6;
        }
        const target = targetLandmark || this._strongTargetLandmark(current, game);
        const stableIncome = this._estimateStableIncome(game, current);
        const builtCount = current.builtLandmarkCount();
        const remaining = this._remainingEnabledLandmarks(current, game).length;
        const targetAffordable = target ? target.cost <= current.coins : false;
        return stableIncome >= 12 || builtCount >= 4 || remaining <= 2 || targetAffordable;
    }

    _bestStrongEconomyCard(sorted, game, current, attackUnlocked) {
        if (!sorted || sorted.length === 0) return null;
        const stableIncome = this._estimateStableIncome(game, current);
        for (const entry of sorted) {
            const card = entry.card;
            if (card.color === "blue" || card.color === "green") return entry;
            if (!attackUnlocked && (card.color === "red" || card.color === "purple")) continue;
            if (stableIncome >= 10) return entry;
        }
        return sorted[0];
    }

    _tryEndgameBuild(current, game, shopStock, difficulty) {
        if (!this._isEndgameMode(current, game, difficulty === "strong" ? 3 : 2)) return false;
        if (this._buyLateGameLandmark(current, game)) return true;
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            card.cost > 0 &&
            !(card.color === "purple" && current.countCard(card.name) > 0)
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

    _shouldStrongBuyAttackCard(game, current, targetLandmark = null) {
        if (game.players.length <= 2) return this._strongAttackUnlocked(current, game, targetLandmark);
        const stableIncome = this._estimateStableIncome(game, current);
        const builtCount = current.builtLandmarkCount();
        const target = targetLandmark || this._strongTargetLandmark(current, game);
        const shortfall = target ? target.cost - current.coins : Infinity;
        return stableIncome >= 18 || builtCount >= 5 || shortfall > 5;
    }

    _bestCrowdEconomyCard(sorted, game = null, current = null) {
        const oneDieOpponents = game && current
            ? game.players.filter(p => p !== current && !p.landmarks[LANDMARK_NAMES.STATION]).length
            : 0;
        if (oneDieOpponents > 0) {
            const lowDice = sorted.find(entry =>
                (entry.card.color === "blue" || entry.card.color === "green") &&
                Math.max(...entry.card.diceNums) <= 6
            );
            if (lowDice) return lowDice;
        }
        return sorted.find(entry => entry.card.color === "blue" || entry.card.color === "green") || null;
    }

    _scoreExpertCrowdAffordable(card, game, current) {
        let score = this._scoreExpertCardCandidate(card, game, current);
        score -= this._scoreExpertCardPenalty(card.name, current, game);
        const remainingLandmarks = this._remainingEnabledLandmarks(current, game).length;
        const lowDice = card.diceNums && card.diceNums.length > 0 && Math.max(...card.diceNums) <= 6;
        const highDice = card.diceNums && card.diceNums.length > 0 && Math.min(...card.diceNums) >= 7;
        if (lowDice && (card.color === "blue" || card.color === "green")) score += 2.4;
        if (card.name === "パン屋" || card.name === "コンビニ") score += 2.1;
        if (card.name === "麦畑" || card.name === "牧場") score += 1.4;
        if (remainingLandmarks > 2 && highDice) score -= 2.6;
        if (remainingLandmarks > 2 && ["食品倉庫", "改装屋", "ピザ屋", "バーガーショップ", "寿司屋", "ブドウ園"].includes(card.name)) {
            score -= 4.5;
        }
        return score;
    }

    _buildExpertCrowd(current, game, shopStock) {
        const remainingLandmarks = this._remainingEnabledLandmarks(current, game);
        const builtCount = current.builtLandmarkCount();
        const bannedCrowdCards = remainingLandmarks.length > 2
            ? new Set(["食品倉庫", "改装屋", "ピザ屋", "バーガーショップ", "寿司屋", "ブドウ園"])
            : null;
        if (this._shouldExpertForceLandmarkPlan(current, game) && this._maybeBuyLandmark(current, game, 0, 6)) return true;
        if (builtCount >= 2 && this._maybeBuyLandmark(current, game, 0, 6)) return true;
        if (this._maybeBuyLandmark(current, game, 1, 7)) return true;

        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            card.cost > 0 &&
            !(card.color === "purple" && current.countCard(card.name) > 0)
        );
        if (affordable.length === 0) return false;

        const sorted = affordable
            .map(card => ({ card, score: this._scoreExpertCrowdAffordable(card, game, current) }))
            .sort((a, b) => b.score - a.score);
        const candidatePool = bannedCrowdCards
            ? sorted.filter(entry => !bannedCrowdCards.has(entry.card.name))
            : sorted;

        const stableIncome = this._estimateStableIncome(game, current);
        const oneDieOpponents = game.players.filter(p =>
            p !== current && !p.landmarks[LANDMARK_NAMES.STATION]
        ).length;
        const lowDiceEconomy = candidatePool.find(entry =>
            (entry.card.color === "blue" || entry.card.color === "green") &&
            Math.max(...entry.card.diceNums) <= 6
        );
        const candidate = (
            oneDieOpponents >= 2 &&
            builtCount < 4 &&
            lowDiceEconomy
        ) || this._bestCrowdEconomyCard(candidatePool, game, current) || candidatePool[0] || sorted[0];

        if (!candidate) return false;
        if (builtCount >= 2 && this._shouldHoldForLandmark(current, game, candidate.score, 1)) return true;
        if (remainingLandmarks.length <= 3 && this._maybeBuyLandmark(current, game, 0, 4)) return true;
        if (stableIncome < 12 && lowDiceEconomy && lowDiceEconomy.score >= candidate.score - 1.2) {
            this._buyCard(lowDiceEconomy.card, game, shopStock);
            return true;
        }
        if (candidate.score >= 0.5) {
            this._buyCard(candidate.card, game, shopStock);
            return true;
        }
        if (this._maybeBuyLandmark(current, game, 0, 3)) return true;
        return false;
    }

    _buildStrongCrowd(current, game, shopStock) {
        const bestAffordableLandmark = this._bestAffordableLandmark(current, game);
        if (bestAffordableLandmark && (
            bestAffordableLandmark.urgency >= 6 ||
            current.coins >= 12 ||
            current.coins >= bestAffordableLandmark.cost + 5
        )) {
            this._buyLandmark(bestAffordableLandmark.name, game);
            return true;
        }

        if (this._maybeBuyLandmark(current, game, 1, 6)) return true;
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            card.cost > 0 &&
            !(card.color === "purple" && current.countCard(card.name) > 0)
        );
        const sorted = this._sortAffordableForDifficulty(affordable, game, current, "strong");
        if (sorted.length === 0) return false;

        const crowdEconomyCard = this._bestCrowdEconomyCard(sorted, game, current);
        const stableIncome = this._estimateStableIncome(game, current);
        const candidate = crowdEconomyCard || sorted[0];
        if (this._shouldHoldForLandmark(current, game, candidate.score, 2)) return true;
        if (stableIncome < 10 && crowdEconomyCard && crowdEconomyCard.score >= 0.7) {
            this._buyCard(crowdEconomyCard.card, game, shopStock);
            return true;
        }
        if (this._maybeBuyLandmark(current, game, 0, 4)) return true;
        if (candidate.score >= 0.75) {
            this._buyCard(candidate.card, game, shopStock);
            return true;
        }
        if (crowdEconomyCard) {
            this._buyCard(crowdEconomyCard.card, game, shopStock);
            return true;
        }
        return false;
    }

    // ===== 購入戦略 =====

    build(game, shopStock) {
        this._syncExpertTuningForGame(game);
        if (!game || game.phase !== GAME_PHASES.BUILD || game.builtThisTurn) return;
        if (this.difficulty === "weak") {
            this.buildWeak(game, shopStock);
        } else if (this.difficulty === "normal") {
            this.buildNormal(game, shopStock);
        } else if (this.difficulty === "strong") {
            this.buildStrong(game, shopStock);
        } else {
            this.buildExpert(game, shopStock);
        }
    }

    _buyCard(card, game, shopStock) {
        if (!game || game.builtThisTurn) return;
        if (game.buildCard(card)) {
            shopStock[card.name]--;
            if (typeof isOnlineGame !== 'undefined' && isOnlineGame && typeof sendAction === 'function') {
                sendAction('buildCard', { cardName: card.name });
            }
        }
    }

    _buyLandmark(name, game) {
        if (!game || game.builtThisTurn) return;
        if (game.buildLandmark(name)) {
            if (typeof isOnlineGame !== 'undefined' && isOnlineGame && typeof sendAction === 'function') {
                sendAction('buildLandmark', { name });
            }
        }
    }

    _landmarkUrgency(name, current, game) {
        const builtCount = current.builtLandmarkCount();
        const opponentMaxBuilt = Math.max(0, ...game.players
            .filter(p => p !== current)
            .map(p => p.builtLandmarkCount()));
        const profile = this._playerCountProfile(game);
        let urgency = 0;
        if (name === LANDMARK_NAMES.STATION) {
            urgency = builtCount < 2 ? 8 : 5;
        }
        else if (name === LANDMARK_NAMES.SHOPPING_MALL) {
            urgency = current.cards.filter(c => c.category === CARD_CATEGORIES.RESTAURANT || c.category === CARD_CATEGORIES.SHOP).length >= 3 ? 8 : 4;
        }
        else if (name === LANDMARK_NAMES.HARBOR) {
            urgency = current.cards.some(c => c.effect === CARD_EFFECTS.HARBOR || c.effect === CARD_EFFECTS.HARBOR_RED || c.effect === CARD_EFFECTS.TUNA) ? 7 : 3;
        }
        else if (name === LANDMARK_NAMES.RADIO_TOWER) {
            urgency = builtCount >= 3 || opponentMaxBuilt >= 4 ? 8 : 4;
            if (this.difficulty === "expert" && (builtCount >= 2 || opponentMaxBuilt >= 3)) urgency += 2;
        }
        else if (name === LANDMARK_NAMES.AMUSEMENT_PARK) urgency = current.landmarks[LANDMARK_NAMES.STATION] ? 5 : 2;
        else if (name === LANDMARK_NAMES.AIRPORT) {
            urgency = builtCount >= 4 ? 6 : 1;
            if (this.difficulty === "expert") {
                if (builtCount >= 3) urgency += 3;
                else if (builtCount >= 2 && this._estimateStableIncome(game, current) >= 8) urgency += 2;
            }
        }
        urgency += this._strongLandmarkUrgencyBonus(name, current, game);
        if (name === LANDMARK_NAMES.AIRPORT) return Math.round(urgency * profile.airportBias);
        return Math.round(urgency * profile.landmarkBias);
    }

    _coinsTowardsNextLandmark(player) {
        const remainingCosts = Player.landmarkNames()
            .filter(name => !player.landmarks[name])
            .map(name => Player.landmarkCost(name));
        if (remainingCosts.length === 0) return 0;
        return Math.max(0, player.coins - Math.min(...remainingCosts));
    }

    _estimateBusinessValue(game, player) {
        const attackScale = this._opponentDilutionFactor(game);
        const ci = game.players.indexOf(player);
        const myCards = player.getMinorCards();
        if (myCards.length === 0) return 0;
        let best = 0;
        for (let i = 0; i < game.players.length; i++) {
            if (i === ci) continue;
            const target = game.players[i];
            for (const myCard of myCards) {
                for (const theirCard of target.getMinorCards()) {
                    const score = this._receivedCardValue(theirCard, game, player) -
                        this._ownedCardValue(myCard, game, player) * 0.8 +
                        this._ownedCardValue(theirCard, game, target) * 0.5 * attackScale;
                    if (score > best) best = score;
                }
            }
        }
        return best;
    }

    _estimateCleaningValue(game, player) {
        const attackScale = this._opponentDilutionFactor(game);
        let best = 0;
        const names = [...new Set(game.players.flatMap(p => p.getMinorCards().map(c => c.name)))];
        for (const name of names) {
            let score = 0;
            for (const owner of game.players) {
                for (const card of owner.getMinorCards()) {
                    if (card.name !== name || owner.isDormant(card)) continue;
                    score += 1;
                    if (owner === player) score -= this._ownedCardValue(card, game, owner);
                    else score += this._ownedCardValue(card, game, owner) * 0.7 * attackScale;
                }
            }
            if (score > best) best = score;
        }
        return best;
    }

    _estimateMoverValue(game, player) {
        const myCards = player.getMinorCards();
        if (myCards.length === 0) return 0;
        let best = -Infinity;
        for (const card of myCards) {
            const score = 4 - this._ownedCardValue(card, game, player) + (player.isDormant(card) ? 2 : 0);
            if (score > best) best = score;
        }
        return Math.max(best, 0);
    }

    _estimateParkValue(game, player) {
        const attackScale = this._opponentDilutionFactor(game);
        const total = game.players.reduce((sum, p) => sum + p.coins, 0);
        return (total / Math.max(game.players.length, 1) - player.coins) * attackScale;
    }

    _opponentDilutionFactor(game) {
        return 1 / Math.max(1, (game && game.players ? game.players.length : 1) - 1);
    }

    _receivedCardValue(card, game, player) {
        let baseValue;
        switch (card.effect) {
            case CARD_EFFECTS.BUSINESS:
                baseValue = this._strongSoftCapValue(3.5);
                break;
            case CARD_EFFECTS.CLEANING:
                baseValue = this._strongSoftCapValue(3);
                break;
            case CARD_EFFECTS.MOVER:
                baseValue = this._strongSoftCapValue(2.5);
                break;
            case CARD_EFFECTS.PARK:
                baseValue = this._strongSoftCapValue(1.5);
                break;
            case CARD_EFFECTS.RENOVATION:
                baseValue = this._strongSoftCapValue(2.5);
                break;
            default:
                baseValue = this._strongSoftCapValue(this.evalCard(card, game, player));
                break;
        }
        return baseValue * this._cardDiceFreq(card, game, player) + card.cost * 1.4;
    }

    _cardDependencyValue(card, player, game) {
        if (!card || !player || !game) return 0;
        switch (card.effect) {
            case CARD_EFFECTS.CHEESE:
                return player.countCard('牧場') * 1.4;
            case CARD_EFFECTS.FURNITURE:
                return (player.countCard('森林') + player.countCard('鉱山')) * 1.2;
            case CARD_EFFECTS.FLOWER:
                return player.countCard('花畑') * 1.3;
            case CARD_EFFECTS.MARKET:
                return player.countCard('果樹園') * 1.3;
            case CARD_EFFECTS.FOODWAREHOUSE:
                return ['パン屋', 'コンビニ', 'フラワーショップ', 'ドラッグストア']
                    .reduce((sum, name) => sum + player.countCard(name), 0) * 0.9;
            case CARD_EFFECTS.DRINKFACTORY:
                return ['カフェ', 'レストラン', 'ファミレス', '会員制バー']
                    .reduce((sum, name) => sum + player.countCard(name), 0) * 0.9;
            case CARD_EFFECTS.WINERY:
                return player.countCard('ぶどう園') * 1.2;
            case CARD_EFFECTS.HARBOR:
            case CARD_EFFECTS.TUNA:
            case CARD_EFFECTS.HARBOR_RED:
                return player.landmarks[LANDMARK_NAMES.HARBOR] ? 2.2 : 0.6;
            case CARD_EFFECTS.BUSINESS:
                return player.getMinorCards().length * 0.35;
            default:
                return 0;
        }
    }

    _ownedCardValue(card, game, player) {
        let value = this._receivedCardValue(card, game, player);
        if (player.isDormant(card)) value *= 0.35;
        if (card.color === "red") value += 1.5;
        if (card.color === "purple") value += 2;
        value += this._cardDependencyValue(card, player, game);
        return value;
    }

    _builtLandmarkValue(name, current, game) {
        return this._landmarkUrgency(name, current, game) * 2 + Player.landmarkCost(name) * 0.15;
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

    _buyLateGameLandmark(current, game) {
        const remaining = Player.landmarkNames()
            .filter(name => (!game.enabledLandmarks || game.enabledLandmarks.has(name)) && !current.landmarks[name]);
        if (remaining.length === 0) return false;
        if (this.difficulty !== "expert" && remaining.length > 2) return false;
        if (this.difficulty === "expert" && remaining.length > 3) return false;
        const affordable = remaining
            .map(name => ({ name, cost: Player.landmarkCost(name), urgency: this._landmarkUrgency(name, current, game) }))
            .filter(entry => current.coins >= entry.cost)
            .sort((a, b) => b.urgency - a.urgency || a.cost - b.cost);
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
        const urgentLandmark = remaining
            .map(name => ({
                name,
                shortfall: Player.landmarkCost(name) - current.coins,
                urgency: this._landmarkUrgency(name, current, game),
            }))
            .sort((a, b) => b.urgency - a.urgency || a.shortfall - b.shortfall)[0];
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
        return this._profileMeasure("expert.cloneGame", () => {
            const clone = new GameManager(game.players.length);
            clone.enabledLandmarks = new Set(game.enabledLandmarks || Player.landmarkNames());
            clone.players.forEach((player, index) => {
                const source = game.players[index];
                player.name = source.name;
                player.coins = source.coins;
                player.cards = source.cards.map(card => cloneCard(card));
                player.dormantCards = source.dormantCards.map(dormant => source.cards.indexOf(dormant))
                    .filter(i => i >= 0)
                    .map(i => player.cards[i])
                    .filter(Boolean);
                player.landmarks = Object.assign({}, source.landmarks);
                player.itVentureCoins = source.itVentureCoins || 0;
                player.hasYakusho = source.hasYakusho !== false;
            });
            clone.currentPlayerIndex = game.currentPlayerIndex;
            clone.phase = game.phase;
            clone.lastDiceResult = game.lastDiceResult || 0;
            clone.lastDice1 = game.lastDice1 || 0;
            clone.lastDice2 = game.lastDice2 || 0;
            clone.builtThisTurn = game.builtThisTurn || false;
            clone.pendingTV = game.pendingTV || 0;
            clone.pendingBusiness = game.pendingBusiness || 0;
            clone.pendingCleaning = game.pendingCleaning || 0;
            clone.pendingMover = game.pendingMover || 0;
            clone.pendingRenovation = game.pendingRenovation || 0;
            clone.pendingIT = game.pendingIT || false;
            clone.usedReroll = game.usedReroll || false;
            clone.pendingTunaDice = game.pendingTunaDice || null;
            clone.turnCount = game.turnCount || 0;
            clone.hadAmusementParkAtRoll = game.hadAmusementParkAtRoll || false;
            clone.log = [];
            return clone;
        });
    }

    _estimatePlayerTurnValue(game, playerIndex) {
        const original = game.currentPlayerIndex;
        game.currentPlayerIndex = playerIndex;
        const useTwo = game.players[playerIndex].landmarks[LANDMARK_NAMES.STATION];
        const value = Math.max(
            this._expectedDiceScore(game, false),
            useTwo ? this._expectedDiceScore(game, true) : -Infinity
        );
        game.currentPlayerIndex = original;
        return Number.isFinite(value) ? value : 0;
    }

    _countReachableLandmarks(player, enabledLandmarks) {
        return enabledLandmarks.filter(name =>
            !player.landmarks[name] && player.coins >= Player.landmarkCost(name)
        ).length;
    }

    _estimateStableIncome(game, player) {
        let total = 0;
        for (const card of player.cards) {
            if (player.isDormant(card)) continue;
            if (card.color !== "blue" && card.color !== "green") continue;
            total += this._ownedCardValue(card, game, player);
        }
        return total;
    }

    _estimateProgressIncome(game, player) {
        if (!game || !player) return 0;
        let total = 0;
        for (const card of player.cards) {
            if (!card || player.isDormant(card)) continue;
            if (card.color !== "blue" && card.color !== "green") continue;
            if ([
                CARD_EFFECTS.LOAN,
                CARD_EFFECTS.RENOVATION,
                CARD_EFFECTS.ITSTARTUP,
                CARD_EFFECTS.PARK,
                CARD_EFFECTS.BUSINESS,
                CARD_EFFECTS.CLEANING,
                CARD_EFFECTS.MOVER,
            ].includes(card.effect)) continue;
            total += this.evalCard(card, game, player) * this._cardDiceFreq(card, game, player) / 6;
        }
        return total;
    }

    _estimateWinDistance(player, game) {
        if (!player || !game || !game.enabledLandmarks) return Infinity;
        const remaining = [...game.enabledLandmarks]
            .filter(name => !player.landmarks[name])
            .map(name => ({
                name,
                cost: Player.landmarkCost(name),
                urgency: this._landmarkUrgency(name, player, game),
            }));
        if (remaining.length === 0) return 0;
        const playerIndex = game.players.indexOf(player);
        const turnValue = playerIndex >= 0 ? this._estimatePlayerTurnValue(game, playerIndex) : 0;
        const reachable = remaining.filter(entry => player.coins >= entry.cost).length;
        const totalRemainingCost = remaining.reduce((sum, entry) => sum + entry.cost, 0);
        const nextLandmark = remaining
            .slice()
            .sort((a, b) => b.urgency - a.urgency || a.cost - b.cost)[0];
        const nextShortfall = Math.max(0, nextLandmark.cost - player.coins);
        const progressIncome = this._estimateProgressIncome(game, player);
        let effectiveGainPerTurn = Math.max(
            1.2,
            progressIncome * 0.85 + turnValue * 0.12 + reachable * 0.6
        );
        const routeCost = totalRemainingCost - Math.min(player.coins, totalRemainingCost);
        const landmarkSteps = routeCost / effectiveGainPerTurn;
        let nextStepDelay = nextShortfall / Math.max(1, progressIncome * 0.9 + turnValue * 0.08);
        let distance = landmarkSteps + nextStepDelay * 0.7 + remaining.length * 0.45 - reachable * 0.5;
        if (this._expertFlagEnabled("crowdWinDistanceFocus") && game.players.length >= 4) {
            effectiveGainPerTurn = Math.max(
                1.3,
                progressIncome * 0.9 + turnValue * 0.12 + reachable * 0.9
            );
            nextStepDelay = nextShortfall / Math.max(1, progressIncome + turnValue * 0.08);
            const crowdLandmarkSteps = routeCost / effectiveGainPerTurn;
            distance = crowdLandmarkSteps + nextStepDelay * 0.95 + remaining.length * 0.35 - reachable * 0.85;
        }
        return Number(Math.max(0, distance).toFixed(3));
    }

    _estimateRedPressure(game, playerIndex) {
        let pressure = 0;
        for (let i = 0; i < game.players.length; i++) {
            if (i === playerIndex) continue;
            const opponent = game.players[i];
            for (const card of opponent.cards) {
                if (opponent.isDormant(card) || card.color !== "red") continue;
                pressure += this._ownedCardValue(card, game, opponent);
            }
        }
        return pressure;
    }

    _estimateOpponentThreat(opponent, game) {
        const enabledLandmarks = [...game.enabledLandmarks];
        const progress = enabledLandmarks.filter(name => opponent.landmarks[name]).length;
        const turnValue = this._estimatePlayerTurnValue(game, game.players.indexOf(opponent));
        const reachable = this._countReachableLandmarks(opponent, enabledLandmarks);
        const winDistance = this._estimateWinDistance(opponent, game);
        return opponent.coins * 0.4 +
            turnValue * 1.8 +
            progress * 9 +
            opponent.builtLandmarkCount() * 5 +
            reachable * 6 +
            Math.max(0, 18 - winDistance) * 1.4;
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
        let score = player.coins * tuning.coinWeight +
            myTurnValue * tuning.turnWeight +
            myLandmarkProgress * tuning.landmarkWeight +
            player.builtLandmarkCount() * tuning.builtLandmarkWeight +
            reachableLandmarks * tuning.landmarkReachWeight +
            stableIncome * tuning.stableIncomeWeight -
            winDistance * 1.8 -
            redPressure * tuning.redPressureWeight;
        if (remainingLandmarks.length <= 2) score += player.coins * tuning.lateCoinWeight + myLandmarkProgress * tuning.lateProgressBonus;
        if (remainingLandmarks.length <= 1) score += player.coins * tuning.finalCoinWeight;
        if (lowValueSpam > tuning.lowValueSpamThreshold) {
            score -= (lowValueSpam - tuning.lowValueSpamThreshold) * tuning.lowValueSpamPenalty;
        }
        score -= this._duplicateRenovationPenalty(player, "expert");
        if (player.landmarks[LANDMARK_NAMES.AIRPORT] && !game.builtThisTurn && game.currentPlayerIndex === playerIndex) score += 12;
        let maxOpponentThreat = 0;
        for (let i = 0; i < game.players.length; i++) {
            if (i === playerIndex) continue;
            const opponent = game.players[i];
            const threat = this._estimateOpponentThreat(opponent, game);
            maxOpponentThreat = Math.max(maxOpponentThreat, threat);
            score -= threat;
        }
        score -= maxOpponentThreat * tuning.leaderThreatWeight;
        return score;
    }

    _scoreExpertCardPenalty(cardName, player, game) {
        const copies = player.countCard(cardName);
        const remainingLandmarks = [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length;
        if (game.players.length >= 4 && remainingLandmarks > 2) {
            if (cardName === "スタジアム" || cardName === "テレビ局" || cardName === "税務署" || cardName === "出版社") return 9 + copies * 3;
            if (cardName === "公園" || cardName === "ITベンチャー") return 7 + copies * 2.5;
        }
        if (cardName === "改装屋") {
            if (player.builtLandmarkCount() === 0) return 18 + copies * 5;
            return copies >= 2 ? 18 + copies * 8 : 0;
        }
        if (cardName === "貸金業") {
            if (remainingLandmarks <= 3 && copies >= 2) return 12 + copies * 4;
            return copies >= 3 ? 8 + copies * 3 : 0;
        }
        if (remainingLandmarks <= 4) {
            if (cardName === "食品倉庫") return 10 + copies * 3;
            if (cardName === "ピザ屋" || cardName === "バーガーショップ") return 7 + copies * 2.5;
            if (cardName === "ブドウ園") return 6 + copies * 2;
        }
        if (game.players.length >= 4 && remainingLandmarks <= 4) {
            if (cardName === "食品倉庫") return 16 + copies * 4;
            if (cardName === "改装屋") return 14 + copies * 4;
            if (cardName === "ピザ屋" || cardName === "バーガーショップ") return 10 + copies * 3;
            if (cardName === "寿司屋") return 6 + copies * 2;
        }
        if (cardName === "雑貨屋") return remainingLandmarks <= 2 && copies >= 3 ? 8 + copies * 2 : 0;
        return 0;
    }

    _scoreExpertLandmarkDelayPenalty(player, game) {
        const remaining = [...game.enabledLandmarks]
            .filter(name => !player.landmarks[name])
            .map(name => ({ name, cost: Player.landmarkCost(name), urgency: this._landmarkUrgency(name, player, game) }));
        if (remaining.length === 0) return 0;
        const affordable = remaining.filter(entry => player.coins >= entry.cost)
            .sort((a, b) => b.urgency - a.urgency || a.cost - b.cost);
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
            .filter(entry => entry.shortfall > 0 && entry.shortfall <= 3)
            .sort((a, b) => entrySort(b, a));

        if (remaining.length === 0) return 0;
        const target = remaining[0];
        let penalty = target.urgency * (4 - target.shortfall) * 1.35;
        if (card) {
            if (card.cost >= 5) penalty += 4.5;
            else if (card.cost >= 3) penalty += 2.5;
            if (card.color === "purple") penalty += 3.5;
        }
        return penalty;

        function entrySort(left, right) {
            return left.urgency - right.urgency || right.shortfall - left.shortfall;
        }
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
        const options = [{ type: 'skip' }];
        for (const name of Player.landmarkNames()) {
            if (!game.enabledLandmarks || !game.enabledLandmarks.has(name)) continue;
            if (current.landmarks[name]) continue;
            const cost = Player.landmarkCost(name);
            if (current.coins >= cost) options.push({ type: 'landmark', name });
        }
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            !(card.color === "purple" && current.countCard(card.name) > 0)
        );
        const ranked = affordable.map(card => ({
            card,
            score: this._scoreExpertCardCandidate(card, game, current),
        })).sort((a, b) => b.score - a.score);
        const candidateLimit = this._expertBuildCandidateLimit(game, current);
        for (const entry of ranked.slice(0, candidateLimit)) {
            if (!this._expertPremiumPurpleReady(entry.card, game, current)) continue;
            options.push({ type: 'card', cardName: entry.card.name });
        }
        return options;
    }

    _scoreExpertBuildOption(game, shopStock, action, context = null) {
        return this._profileMeasure("expert.scoreBuildOption", () => {
            const ci = game.currentPlayerIndex;
            const tuning = this.expertTuning;
            const beforePlayer = game.players[ci];
            const beforeDistance = this._estimateWinDistance(beforePlayer, game);
            const affordableBuildCount = context && typeof context.affordableBuildCount === "number"
                ? context.affordableBuildCount
                : this._listExpertBuildOptions(game, shopStock).filter(option => option.type !== 'skip').length;
            const clone = this._cloneGame(game);
            const stock = Object.assign({}, shopStock);
            const current = clone.currentPlayer();
            let scorePenalty = 0;
            if (action.type === 'landmark') {
                if (!clone.buildLandmark(action.name)) return -Infinity;
            } else if (action.type === 'card') {
                const card = this._cardByName(action.cardName);
                if (!card || !clone.buildCard(card)) return -Infinity;
                stock[card.name] = Math.max(0, (stock[card.name] || 0) - 1);
                scorePenalty = this._scoreExpertCardPenalty(card.name, current, clone);
                scorePenalty += this._scoreExpertFutureLandmarkHoldPenalty(current, clone, card);
            } else if (action.type === 'skip') {
                clone.builtThisTurn = false;
            }
            let score = this._evaluatePosition(clone, ci);
            const remainingLandmarks = [...clone.enabledLandmarks].filter(name => !current.landmarks[name]).length;
            const allowBuildLookahead = this.simulationMode === "realtime"
                ? (game.players.length < 4 && action.type === 'landmark' && remainingLandmarks <= 1)
                : (this.simulationMode !== "lite" && (action.type === 'landmark' || remainingLandmarks <= 2));
            if (allowBuildLookahead) {
                score += this._profileMeasure("expert.buildLookahead", () =>
                    this._simulateLookahead(
                        clone,
                        stock,
                        ci,
                        this._expertLookaheadSteps(clone, ci, game.players.length * tuning.lateGameLookaheadStepsPerPlayer)
                    )
                ) * tuning.lookaheadWeight;
            }
            if (action.type === 'landmark') score += tuning.landmarkActionBonus + (remainingLandmarks <= 2 ? tuning.lateLandmarkActionBonus : 0);
            if (action.type === 'card') score -= (scorePenalty || 0) + this._scoreExpertLandmarkDelayPenalty(current, clone);
            if (action.type === 'card' && this._shouldExpertStopBuyingCards(current, clone, this._cardByName(action.cardName))) {
                score -= 18;
            }
            if (action.type === 'skip' && current.landmarks[LANDMARK_NAMES.AIRPORT]) score += tuning.skipAirportBonus;
            if (action.type === 'skip' && !current.landmarks[LANDMARK_NAMES.AIRPORT]) score -= tuning.skipPenalty;
            if (action.type === 'skip' && affordableBuildCount > 0 && !current.landmarks[LANDMARK_NAMES.AIRPORT]) {
                score -= Math.min(12, 4 + affordableBuildCount * 1.5);
            }
            if (action.type === 'landmark' && current.hasWon([...clone.enabledLandmarks])) score += 50000;
            if (this._expertFlagEnabled("endgameBuildFocus")) {
                score += this._scoreExpertEndgameBuildFocus(game, clone, ci, action, beforeDistance);
            }
            return score;
        });
    }

    _scoreExpertEndgameBuildFocus(game, clone, playerIndex, action, beforeDistance = null) {
        if (!game || !clone) return 0;
        const beforePlayer = game.players[playerIndex];
        const afterPlayer = clone.players[playerIndex];
        const remainingBefore = [...game.enabledLandmarks].filter(name => !beforePlayer.landmarks[name]).length;
        if (remainingBefore > 2) return 0;
        const distanceBefore = beforeDistance == null ? this._estimateWinDistance(beforePlayer, game) : beforeDistance;
        const distanceAfter = this._estimateWinDistance(afterPlayer, clone);
        const distanceGain = distanceBefore - distanceAfter;
        let score = distanceGain * 12;
        if (action.type === "landmark") score += 10;
        if (action.type === "card" && distanceGain < 0.3) score -= remainingBefore <= 1 ? 14 : 8;
        if (action.type === "skip" && !afterPlayer.landmarks[LANDMARK_NAMES.AIRPORT]) score -= remainingBefore <= 1 ? 10 : 4;
        if (remainingBefore <= 3) {
            const urgentAfter = this._bestAffordableLandmark(afterPlayer, clone);
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
    }

    _listStrongBuildOptions(game, shopStock) {
        const current = game.currentPlayer();
        const options = [];
        for (const name of Player.landmarkNames()) {
            if (!game.enabledLandmarks || !game.enabledLandmarks.has(name)) continue;
            if (current.landmarks[name]) continue;
            const cost = Player.landmarkCost(name);
            if (current.coins >= cost) options.push({ type: 'landmark', name });
        }
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            !(card.color === "purple" && current.countCard(card.name) > 0)
        );
        const ranked = this._sortAffordableForDifficulty(affordable, game, current, "strong");
        const targetLandmark = this._strongTargetLandmark(current, game);
        const attackUnlocked = this._strongAttackUnlocked(current, game, targetLandmark);
        const oneDieOpponents = game.players.filter(p => p !== current && !p.landmarks[LANDMARK_NAMES.STATION]).length;
        for (const entry of ranked) {
            if (game.players.length >= 4 && current.builtLandmarkCount() < 4) {
                if (entry.card.color === "purple") continue;
                if (!attackUnlocked && entry.card.color === "red") continue;
                if (oneDieOpponents >= 2 && Math.min(...entry.card.diceNums) >= 7 &&
                    (entry.card.color === "blue" || entry.card.color === "green")) continue;
            } else if (!attackUnlocked && (entry.card.color === "red" || entry.card.color === "purple")) {
                continue;
            }
            options.push({ type: 'card', cardName: entry.card.name });
            if (options.length >= 6) break;
        }
        if (options.length === 0 && ranked[0]) options.push({ type: 'card', cardName: ranked[0].card.name });
        return options;
    }

    _scoreStrongBuildOption(game, shopStock, action) {
        const ci = game.currentPlayerIndex;
        const clone = this._cloneGame(game);
        const stock = Object.assign({}, shopStock);
        const current = clone.currentPlayer();
        if (action.type === 'landmark') {
            if (!clone.buildLandmark(action.name)) return -Infinity;
        } else {
            const card = this._cardByName(action.cardName);
            if (!card || !clone.buildCard(card)) return -Infinity;
            stock[card.name] = Math.max(0, (stock[card.name] || 0) - 1);
        }
        let score = this._scoreStrongChoiceState(clone, ci);
        const targetLandmark = this._strongTargetLandmark(game.currentPlayer(), game);
        if (action.type === 'landmark') {
            const urgency = this._landmarkUrgency(action.name, current, clone);
            score += urgency * 3.5;
            if (targetLandmark && action.name === targetLandmark.name) score += 6;
        } else {
            const card = this._cardByName(action.cardName);
            const stableIncome = this._estimateStableIncome(game, game.currentPlayer());
            if (targetLandmark) {
                const shortfall = targetLandmark.cost - game.currentPlayer().coins;
                if (shortfall > 0 && shortfall <= 3) score -= Math.max(0, 4 - shortfall) * 1.8;
            }
            if (card && (card.color === "red" || card.color === "purple") && stableIncome < 10) score -= 4.5;
            if (card && game.players.length >= 4 && (card.color === "red" || card.color === "purple")) score -= 2.5;
        }
        return score;
    }

    _createPlayoutRng(seed) {
        let state = (seed >>> 0) || 1;
        return () => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 0x100000000;
        };
    }

    _simulateLookahead(game, shopStock, focusIndex, maxSteps) {
        return this._profileMeasure("expert.simulateLookahead", () => {
            const cpus = game.players.map((_, index) => this._createLookaheadCpu(game, focusIndex, index));
            const tuning = this.expertTuning;
            const seed = game.turnCount + focusIndex * 97 + game.currentPlayer().coins * 13 + maxSteps;
            const rng = this._createPlayoutRng(seed);
            let safety = 0;
            while (!game.checkWinner() && safety < maxSteps) {
                const cpu = cpus[game.currentPlayerIndex];
                this._runSimulationStep(game, cpu, shopStock, rng);
                safety++;
            }
            this._profileCount("expert.lookaheadSteps", safety);
            if (game.checkWinner()) {
                const winnerIndex = game.players.indexOf(game.checkWinner());
                return winnerIndex === focusIndex ? tuning.winLookaheadBonus : -tuning.loseLookaheadPenalty;
            }
            return this._lookaheadTerminalHeuristic(game, focusIndex);
        });
    }

    _createLookaheadCpu(game, focusIndex, playerIndex) {
        if (!game || !game.players || playerIndex === focusIndex) return new CPU('strong');
        if (
            this.difficulty === "expert" &&
            this._expertFlagEnabled("crowdNormalLookaheadOpponents") &&
            game.players.length >= 4 &&
            playerIndex !== focusIndex
        ) {
            return new CPU('normal');
        }
        if (this.difficulty === "expert" && game.players.length >= 4) {
            const strongOpponents = this._lookaheadStrongOpponentSet(game, focusIndex);
            if (!strongOpponents.has(playerIndex)) {
                return new CPU('normal');
            }
        }
        return new CPU('strong');
    }

    _lookaheadStrongOpponentSet(game, focusIndex) {
        const set = new Set();
        if (!game || !game.players || game.players.length < 4) return set;
        const opponents = game.players
            .map((player, index) => ({ player, index }))
            .filter(entry => entry.index !== focusIndex);

        if (this._expertFlagEnabled("lookaheadLeaderStrongOnly")) {
            const leader = opponents
                .slice()
                .sort((a, b) => this._estimateOpponentThreat(b.player, game) - this._estimateOpponentThreat(a.player, game))[0];
            if (leader) set.add(leader.index);
            return set;
        }

        if (this._expertFlagEnabled("lookaheadNextSeatStrongOnly")) {
            set.add((focusIndex + 1) % game.players.length);
            return set;
        }

        if (this._expertFlagEnabled("lookaheadTopTwoStrong")) {
            opponents
                .slice()
                .sort((a, b) => this._estimateOpponentThreat(b.player, game) - this._estimateOpponentThreat(a.player, game))
                .slice(0, 2)
                .forEach(entry => set.add(entry.index));
            return set;
        }

        opponents.forEach(entry => set.add(entry.index));
        return set;
    }

    _runSimulationStep(game, cpu, shopStock, rng) {
        const die = () => Math.floor(rng() * 6) + 1;
        const tunaDice = [die(), die()];
        switch (game.phase) {
            case GAME_PHASES.ROLL:
                game.rollDice(die(), tunaDice);
                return;
            case GAME_PHASES.SELECT_DICE: {
                const useTwo = cpu.chooseDiceCount(game);
                game.selectDiceCount(useTwo, die(), die(), tunaDice);
                return;
            }
            case GAME_PHASES.REROLL_CONFIRM:
                if (cpu.chooseReroll(game)) game.rerollDice(die(), tunaDice);
                else game.skipReroll();
                return;
            case GAME_PHASES.HARBOR_CHOICE:
                game.resolveHarbor(cpu.chooseHarbor(game), tunaDice);
                return;
            case GAME_PHASES.PENDING:
                if (game.pendingTV > 0) {
                    game.resolveTV(cpu.chooseTVTarget(game));
                    return;
                }
                if (game.pendingBusiness > 0) {
                    const move = cpu.chooseBusinessMove(game);
                    if (move) game.resolveBusiness(move.myCard, move.targetIndex, move.theirCard);
                    else { game.pendingBusiness = 0; game._checkPending(); }
                    return;
                }
                if (game.pendingCleaning > 0) {
                    const cardName = cpu.chooseCleaningTarget(game);
                    if (cardName) game.resolveCleaning(cardName);
                    else { game.pendingCleaning = 0; game._checkPending(); }
                    return;
                }
                if (game.pendingMover > 0) {
                    const move = cpu.chooseMoverMove(game);
                    if (move) game.resolveMover(move.cardIndex, move.targetIndex);
                    else { game.pendingMover = 0; game._checkPending(); }
                    return;
                }
                if (game.pendingRenovation > 0) {
                    const landmarkName = cpu.chooseRenovationTarget(game);
                    if (landmarkName) game.resolveRenovation(landmarkName);
                    else { game.pendingRenovation = 0; game._checkPending(); }
                    return;
                }
                game.phase = GAME_PHASES.BUILD;
                return;
            case GAME_PHASES.BUILD:
                if (game.pendingIT) {
                    game.resolveIT(cpu.chooseITSave(game));
                    return;
                }
                cpu.build(game, shopStock);
                if (!game.pendingIT && game.phase === GAME_PHASES.BUILD) game.nextTurn();
                return;
            default:
                return;
        }
    }

    _shouldHoldForLandmark(current, game, bestCardScore, maxShortfall) {
        let best = null;
        for (const name of Player.landmarkNames()) {
            if (!game.enabledLandmarks || !game.enabledLandmarks.has(name) || current.landmarks[name]) continue;
            const cost = Player.landmarkCost(name);
            const shortfall = cost - current.coins;
            if (shortfall <= 0 || shortfall > maxShortfall) continue;
            const urgency = this._landmarkUrgency(name, current, game);
            if (!best || urgency > best.urgency || (urgency === best.urgency && shortfall < best.shortfall)) {
                best = { urgency, shortfall };
            }
        }
        if (!best) return false;
        return best.urgency >= 6 && bestCardScore < (best.urgency - best.shortfall) * 1.2;
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
        const current = game.currentPlayer();
        if (this._buyWinningLandmark(current, game)) return;
        const affordableLandmarks = this._remainingEnabledLandmarks(current, game)
            .filter(name => current.coins >= Player.landmarkCost(name));
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            !(card.color === "purple" && current.countCard(card.name) > 0)
        );
        if (affordableLandmarks.length > 0 && (affordable.length === 0 || Math.random() < 0.5)) {
            const name = affordableLandmarks[Math.floor(Math.random() * affordableLandmarks.length)];
            this._buyLandmark(name, game);
            return;
        }
        if (affordable.length === 0) return;
        this._buyCard(affordable[Math.floor(Math.random() * affordable.length)], game, shopStock);
    }

    // 普通CPU：シナジー＋コスパ重視
    buildNormal(game, shopStock) {
        const current = game.currentPlayer();
        if (this._buyWinningLandmark(current, game)) return;
        if (this._tryEndgameBuild(current, game, shopStock, "normal")) return;

        const bestAffordableLandmark = this._bestAffordableLandmark(current, game);
        if (bestAffordableLandmark && (
            bestAffordableLandmark.urgency >= 7 ||
            current.coins >= 12 ||
            current.coins >= bestAffordableLandmark.cost + 6
        )) {
            this._buyLandmark(bestAffordableLandmark.name, game);
            return;
        }

        // シナジーチェック
        if (this._trySynergy(current, game, shopStock)) return;

        if (this._maybeBuyLandmark(current, game, 1, 6)) return;

        // スコア順にカードを選ぶ
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            card.cost > 0 &&
            !(card.color === "purple" && current.countCard(card.name) > 0)
        );
        const sorted = this._sortAffordableForDifficulty(affordable, game, current, "normal");
        if (sorted.length > 0 && this._shouldHoldForLandmark(current, game, sorted[0].score, 2)) return;
        if (sorted.length > 0 && sorted[0].score >= 0.9) {
            this._buyCard(sorted[0].card, game, shopStock);
            return;
        }
        if (this._maybeBuyLandmark(current, game, 0, 4)) return;
        if (sorted.length > 0) this._buyCard(sorted[0].card, game, shopStock);
    }

    // 強いCPU：状況判断型
    buildStrong(game, shopStock) {
        if (game.players.length >= 4) {
            const current = game.currentPlayer();
            if (this._buyWinningLandmark(current, game)) return;
            if (this._tryEndgameBuild(current, game, shopStock, "strong")) return;
            
            const bestAffordableLandmark = this._bestAffordableLandmark(current, game);
            if (bestAffordableLandmark && (
                bestAffordableLandmark.urgency >= 6 ||
                current.coins >= 10 ||
                current.coins >= bestAffordableLandmark.cost + 4 ||
                (current.builtLandmarkCount() < 3 && bestAffordableLandmark.urgency >= 5)
            )) {
                this._buyLandmark(bestAffordableLandmark.name, game);
                return;
            }

            if (this._maybeBuyLandmark(current, game, 0, 5)) return;
            if (this._trySynergy(current, game, shopStock)) return;
            if (this._maybeBuyLandmark(current, game, 1, 5)) return;

            const affordable = CARDS.filter(card =>
                shopStock[card.name] > 0 &&
                current.coins >= card.cost &&
                card.cost > 0 &&
                !(card.color === "purple" && current.countCard(card.name) > 0)
            );
            const sorted = this._sortAffordableForDifficulty(affordable, game, current, "strong")
                .filter(entry => this._strongPremiumPurpleReady(entry.card, game, current) || !this._strongCrowdPremiumPurple(entry.card));
            const oneDieOpponents = game.players.filter(p =>
                p !== current && !p.landmarks[LANDMARK_NAMES.STATION]
            ).length;
            const lowDiceEconomy = sorted.find(entry =>
                (entry.card.color === "blue" || entry.card.color === "green") &&
                Math.max(...entry.card.diceNums) <= 6
            );
            const premiumPurple = sorted.find(entry => this._strongCrowdPremiumPurple(entry.card));
            const bestEconomy = this._bestCrowdEconomyCard(sorted, game, current);
            const best = (
                oneDieOpponents >= 2 &&
                current.builtLandmarkCount() < 4 &&
                lowDiceEconomy
            ) || (
                this._strongPremiumPurpleReady(premiumPurple && premiumPurple.card, game, current) &&
                premiumPurple &&
                premiumPurple.score >= ((bestEconomy && bestEconomy.score) || -Infinity) + 1.5
                    ? premiumPurple
                    : null
            ) || bestEconomy || (sorted.length > 0 ? sorted[0] : null);
            if (best && current.builtLandmarkCount() >= 3 && this._shouldHoldForLandmark(current, game, best.score, 2)) return;
            if (best && best.score >= 0.9) {
                this._buyCard(best.card, game, shopStock);
                return;
            }
            if (this._maybeBuyLandmark(current, game, 0, 3)) return;
            if (best) this._buyCard(best.card, game, shopStock);
            return;
        }
        const current = game.currentPlayer();
        const ci = game.currentPlayerIndex;
        const builtCount = current.builtLandmarkCount();
        if (this._buyWinningLandmark(current, game)) return;
        if (this._tryEndgameBuild(current, game, shopStock, "strong")) return;
        const targetLandmark = this._strongTargetLandmark(current, game);
        const targetShortfall = targetLandmark ? targetLandmark.cost - current.coins : Infinity;

        // 誰かが勝利に近い（ランドマーク4つ以上）→ 緊急モード：ランドマーク最優先
        const opponentMaxBuilt = Math.max(...game.players
            .filter((_, i) => i !== ci)
            .map(p => p.builtLandmarkCount()));
        const emergencyMode = opponentMaxBuilt >= 4 || builtCount >= 4;

        if (emergencyMode && this._maybeBuyLandmark(current, game, 0, 3)) return;
        if (targetLandmark && targetShortfall <= 0 && targetLandmark.urgency >= 4) {
            this._buyLandmark(targetLandmark.name, game);
            return;
        }
        const options = this._listStrongBuildOptions(game, shopStock)
            .map(option => Object.assign({ score: this._scoreStrongBuildOption(game, shopStock, option) }, option))
            .sort((a, b) => b.score - a.score);
        if (options.length === 0) return;
        const best = options[0];
        if (best.type === 'landmark') {
            this._buyLandmark(best.name, game);
            return;
        }
        const card = this._cardByName(best.cardName);
        if (card) this._buyCard(card, game, shopStock);
    }

    buildExpert(game, shopStock) {
        const current = game.currentPlayer();
        if (this._buyWinningLandmark(current, game)) return;
        if (this._buyLateGameLandmark(current, game)) return;
        if (this._shouldExpertForceLandmarkPlan(current, game) && this._maybeBuyLandmark(current, game, 0, 7)) return;
        if (current.builtLandmarkCount() >= 2 && this._maybeBuyLandmark(current, game, 0, 8)) return;
        if (this.simulationMode === "realtime" && game.players.length >= 4) {
            this.buildNormal(game, shopStock);
            return;
        }
        if (this.simulationMode === "lite" && game.players.length >= 4) {
            this.buildNormal(game, shopStock);
            return;
        }
        if (game.players.length >= 4 && this._buildExpertCrowd(current, game, shopStock)) {
            return;
        }

        const options = this._listExpertBuildOptions(game, shopStock);
        const buildContext = {
            affordableBuildCount: options.filter(action => action.type !== 'skip').length,
        };
        let best = null;
        let bestNonSkip = null;
        let bestLandmark = null;
        for (const action of options) {
            const score = this._scoreExpertBuildOption(game, shopStock, action, buildContext);
            const scored = Object.assign({ score }, action);
            if (!best || score > best.score) best = scored;
            if (action.type !== 'skip' && (!bestNonSkip || score > bestNonSkip.score)) bestNonSkip = scored;
            if (action.type === 'landmark' && (!bestLandmark || score > bestLandmark.score)) bestLandmark = scored;
        }

        if (!best) return;
        const forceLandmarkPlan = this._shouldExpertForceLandmarkPlan(current, game);
        if (forceLandmarkPlan && bestLandmark && bestLandmark.score >= best.score - 8) {
            best = bestLandmark;
        }
        if (best.type === 'skip') {
            if (current.landmarks[LANDMARK_NAMES.AIRPORT]) return;
            if (forceLandmarkPlan) return;
            if (!bestNonSkip) return;
            best = bestNonSkip;
        }
        if (best.type === 'landmark') {
            this._buyLandmark(best.name, game);
            return;
        }
        const card = this._cardByName(best.cardName);
        if (card) this._buyCard(card, game, shopStock);
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
