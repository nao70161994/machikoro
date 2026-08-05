'use strict';

const CPUCardEvaluationRuntime = Object.freeze({
    evalCard(cpu, card, game, player) {
        return CPUEvaluation.cardPurchaseValue(
            card,
            game,
            player,
            cpu._playerCountProfile(game),
            {
                effects: CARD_EFFECTS,
                landmarkNames: LANDMARK_NAMES,
                calcCardIncome: GameManager.calcCardIncome,
                estimateTvValue: (runtime, owner) => cpu._estimateTvValue(runtime, owner),
                estimatePublisherValue: (runtime, owner) => cpu._estimatePublisherValue(runtime, owner),
                estimateTaxOfficeValue: (runtime, owner) => cpu._estimateTaxOfficeValue(runtime, owner),
                estimateConditionalRedValue: (candidate, runtime, owner) =>
                    cpu._estimateConditionalRedValue(candidate, runtime, owner),
                estimateItStartupValue: (runtime, owner, options) =>
                    cpu._estimateItStartupValue(runtime, owner, options),
                estimateRenovationValue: (runtime, owner, ordinal) =>
                    cpu._estimateRenovationValue(runtime, owner, ordinal),
                estimateCleaningValue: (runtime, owner) => cpu._estimateCleaningValue(runtime, owner),
                estimateMoverValue: (runtime, owner) => cpu._estimateMoverValue(runtime, owner),
                estimateBusinessValue: (runtime, owner) => cpu._estimateBusinessValue(runtime, owner),
                renovationCardName: '改装屋',
            }
        );
    },

    _expertRollIncomeCap(cpu, player, game) {
        return CPUEvaluation.expertRollIncomeCap(
            player,
            game && game.enabledLandmarks,
            Player.landmarkCost
        );
    },

    _estimateOwnRollIncome(cpu, game, player, dice, candidateCard = null) {
        if (!game || !player) return 0;
        return CPUEvaluation.ownRollIncome(
            player.cards,
            dice,
            candidateCard,
            card => player.isDormant(card),
            card => cpu._cardActivationValue(card, game, player, player, dice)
        );
    },

    _scoreExpertRollCapPenalty(cpu, card, game, player) {
        if (cpu.difficulty !== "expert" || !card || !game || !player || !card.diceNums || card.diceNums.length === 0) return 0;
        const cap = cpu._expertRollIncomeCap(player, game);
        if (!Number.isFinite(cap) || cap <= 0) return 0;
        const incomePairs = card.diceNums.map(dice => ({
            before: cpu._estimateOwnRollIncome(game, player, dice),
            after: cpu._estimateOwnRollIncome(game, player, dice, card),
        }));
        return CPUEvaluation.expertRollCapPenalty(incomePairs, cap, cpu.difficulty);
    },

    // ダイス出目の重み

    _singleDiceFreq(cpu, diceNums) {
        return CPUEvaluation.singleDiceFrequency(diceNums);
    },

    _doubleDiceFreq(cpu, diceNums) {
        return CPUEvaluation.doubleDiceFrequency(diceNums);
    },

    _diceFreqForRoller(cpu, diceNums, roller) {
        return CPUEvaluation.diceFrequencyForRoller(diceNums, roller, LANDMARK_NAMES.STATION);
    },

    _cardDiceFreq(cpu, card, game, player) {
        return CPUEvaluation.cardDiceFrequency(card, game, player, LANDMARK_NAMES.STATION);
    },

    _diceFreq(cpu, diceNums) {
        return cpu._doubleDiceFreq(diceNums);
    },

    _baseCardEfficiency(cpu, card, game, player) {
        return cpu.evalCard(card, game, player) * cpu._cardDiceFreq(card, game, player) / Math.max(card.cost, 1);
    },

    // 購入可能カードをスコア順にソート（ダイス確率を加味）

    sortAffordable(cpu, cards, game, player) {
        return CPUEvaluation.rankCards(
            cards,
            card => cpu._baseCardEfficiency(card, game, player)
        );
    },

    _scoreExpertCardCandidate(cpu, card, game, player) {
        let score = cpu._baseCardEfficiency(card, game, player);
        score -= cpu._scoreExpertRollCapPenalty(card, game, player);
        if (cpu.difficulty !== "expert" || !game || !player || game.players.length < 4) return score;
        const remainingLandmarks = [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length;
        const lowDice = card.diceNums && card.diceNums.length > 0 && Math.max(...card.diceNums) <= 6;
        const highDice = card.diceNums && card.diceNums.length > 0 && Math.min(...card.diceNums) >= 7;
        return score + CPUEvaluation.expertCrowdCardCandidateAdjustment({
            difficulty: cpu.difficulty,
            playerCount: game.players.length,
            remainingLandmarks,
            lowDice,
            highDice,
            color: card.color,
            cost: card.cost,
            name: card.name,
            category: card.category,
            restaurantCategory: CARD_CATEGORIES.RESTAURANT,
            flags: {
                lowDiceEngineBoost: cpu._expertFlagEnabled("crowdLowDiceEngineBoost"),
                redRestaurantSuppression: cpu._expertFlagEnabled("crowdRedRestaurantSuppression"),
                purpleShortlistDelay: cpu._expertFlagEnabled("crowdPurpleShortlistDelay"),
            },
        });
    },

    _cardSpamPenalty(cpu, card, player, intensity = 1) {
        return CPUEvaluation.cardSpamPenalty(card, player.countCard(card.name), intensity);
    },

    _duplicateRenovationPenalty(cpu, player, difficulty = cpu.difficulty, game = null) {
        if (!player) return 0;
        const copies = player.countCard("改装屋");
        const extraCopies = Math.max(0, copies - 1);
        if (extraCopies <= 0) return 0;
        if (!game || !player.landmarks) {
            return CPUEvaluation.duplicateRenovationPenalty({
                extraCopies,
                difficulty,
                includeBoardRisk: false,
                exposedValue: 0,
                premiumExposure: 0,
            });
        }

        const builtValues = CPUSelection.stableRankDescending(
            Object.entries(player.landmarks)
                .filter(([name, built]) => built && name !== LANDMARK_NAMES.YAKUSHO)
                .map(([name]) => ({
                    name,
                    value: cpu._builtLandmarkValue(name, player, game),
                })),
            entry => entry.value
        );
        if (builtValues.length === 0) {
            return CPUEvaluation.duplicateRenovationPenalty({
                extraCopies,
                difficulty,
                includeBoardRisk: false,
                exposedValue: 0,
                premiumExposure: 0,
            });
        }

        const exposedValue = builtValues
            .slice(0, Math.min(extraCopies, builtValues.length))
            .reduce((sum, entry) => sum + entry.value, 0);
        const premiumLandmarks = /** @type {string[]} */ ([
            LANDMARK_NAMES.SHOPPING_MALL,
            LANDMARK_NAMES.HARBOR,
            LANDMARK_NAMES.RADIO_TOWER,
            LANDMARK_NAMES.AIRPORT,
        ]);
        return CPUEvaluation.duplicateRenovationPenalty({
            extraCopies,
            difficulty,
            includeBoardRisk: true,
            exposedValue,
            premiumExposure: builtValues
                .filter(entry => premiumLandmarks.includes(entry.name))
                .length,
        });
    },

    _strongRolePressure(cpu, card, game, player) {
        const cards = player.cards || [];
        const blueCount = cards.filter(c => c.color === "blue").length;
        const greenCount = cards.filter(c => c.color === "green").length;
        const redCount = cards.filter(c => c.color === "red").length;
        const purpleCount = cards.filter(c => c.color === "purple").length;
        return CPUEvaluation.strongRolePressure({
            color: card.color,
            blueCardCount: blueCount,
            greenCardCount: greenCount,
            redCardCount: redCount,
            purpleCardCount: purpleCount,
            opponentHasEightCoins: card.color === "red" && redCount === 0 &&
                game.players.some(candidate => candidate !== player && candidate.coins >= 8),
            isEndgameMode: card.color === "green" && cpu._isEndgameMode(player, game, 2),
            playerCount: game.players.length,
            purpleAdjustment: cpu._strongPurpleAdjustment(card, game, player),
        });
    },

    _normalSafetyAdjustment(cpu, card, game, player) {
        return CPUEvaluation.normalSafetyAdjustment({
            effect: card.effect,
            color: card.color,
            cost: card.cost,
            coins: player.coins,
            builtLandmarkCount: player.builtLandmarkCount(),
            stableIncome: cpu._estimateStableIncome(game, player),
            redCardCount: player.cards.filter(candidate => candidate.color === "red").length,
        }, CARD_EFFECTS);
    },

    _economyBalancePenalty(cpu, card, game, player, intensity = 1) {
        const profile = cpu._playerCountProfile(game);
        return CPUEvaluation.economyBalancePenalty(card, player.cards || [], intensity, profile.redFactor);
    },

    _strongConditionalCardAdjustment(cpu, card, game, player) {
        if (cpu.difficulty !== "strong" || !card || !game || !player) return 0;
        if (card.effect !== CARD_EFFECTS.FRENCHR && card.effect !== CARD_EFFECTS.MEMBERBAR) return 0;
        const opponentBuiltCounts = game.players
            .filter(candidate => candidate !== player)
            .map(candidate => candidate.builtLandmarkCount());
        return CPUEvaluation.strongConditionalCardAdjustment(
            card.effect,
            opponentBuiltCounts,
            cpu.difficulty,
            CARD_EFFECTS
        );
    },

    _strongLandmarkThresholdPenalty(cpu, name, current, game) {
        if (cpu.difficulty !== "strong" || !name || !current || !game) return 0;
        const features = CPUEvaluation.strongLandmarkThresholdFeatures(name, current, game, {
            difficulty: cpu.difficulty,
            effects: CARD_EFFECTS,
            remainingEnabledLandmarks: (player, runtime) => cpu._remainingEnabledLandmarks(player, runtime),
        });
        return CPUEvaluation.strongLandmarkThresholdPenalty(features);
    },

    _strongTempoValueBonus(cpu, card, game, player) {
        if (cpu.difficulty !== "strong" || !game || !player || !card || !card.diceNums || card.diceNums.length === 0) return 0;
        const features = CPUEvaluation.strongTempoValueFeatures(card, game, player, {
            difficulty: cpu.difficulty,
            stationName: LANDMARK_NAMES.STATION,
        });
        return CPUEvaluation.strongTempoValueBonus(features);
    },

    _strongCrowdOneDieOpponents(cpu, game, player = null) {
        if (!game || !game.players || game.players.length < 4) return 0;
        const current = player || game.currentPlayer();
        return game.players.filter(p => p !== current && !p.landmarks[LANDMARK_NAMES.STATION]).length;
    },

    _strongCrowdAttackScale(cpu, game) {
        const scale = cpu._opponentDilutionFactor(game);
        const strongCrowd = cpu.difficulty === "strong" && game && game.players.length >= 4;
        return CPUEvaluation.strongCrowdAttackScale(scale, strongCrowd);
    },

    _isStrongCrowd(cpu, game) {
        return cpu.difficulty === "strong" && game && game.players && game.players.length >= 4;
    },

    _strongPurpleAdjustment(cpu, card, game, player) {
        if (!card || card.color !== "purple") return 0;
        return CPUEvaluation.strongPurpleAdjustment({
            stadium: card.effect === CARD_EFFECTS.STADIUM,
            tv: card.effect === CARD_EFFECTS.TV,
            business: card.effect === CARD_EFFECTS.BUSINESS,
            renovation: card.effect === CARD_EFFECTS.RENOVATION,
            itStartup: card.effect === CARD_EFFECTS.ITSTARTUP,
            loan: card.effect === CARD_EFFECTS.LOAN,
            crowd: game.players.length >= 4,
            stableIncome: cpu._estimateStableIncome(game, player),
        });
    },

    _landmarkCardSynergyBonus(cpu, card, game, player) {
        if (!card || !game || !player) return 0;
        return CPUEvaluation.landmarkCardSynergyBonus({
            hasStation: !!player.landmarks[LANDMARK_NAMES.STATION],
            hasMall: !!player.landmarks[LANDMARK_NAMES.SHOPPING_MALL],
            hasHarbor: !!player.landmarks[LANDMARK_NAMES.HARBOR],
            hasTower: !!player.landmarks[LANDMARK_NAMES.RADIO_TOWER],
            hasPark: !!player.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK],
            hasAirport: !!player.landmarks[LANDMARK_NAMES.AIRPORT],
            lowDice: !!(card.diceNums && card.diceNums.length > 0 && Math.max(...card.diceNums) <= 6),
            highDice: !!(card.diceNums && card.diceNums.length > 0 && Math.min(...card.diceNums) >= 7),
            mallCategory: card.category === CARD_CATEGORIES.RESTAURANT || card.category === CARD_CATEGORIES.SHOP,
            harborEffect: [CARD_EFFECTS.HARBOR, CARD_EFFECTS.HARBOR_RED, CARD_EFFECTS.TUNA].includes(card.effect),
            cost: card.cost,
        });
    },

    _strongPremiumPurpleReady(cpu, card, game, player) {
        if (!card || !game || !player) return true;
        if (!cpu._isStrongCrowd(game)) return true;
        if (![CARD_EFFECTS.STADIUM, CARD_EFFECTS.TV, CARD_EFFECTS.BUSINESS].includes(card.effect)) return true;
        return CPUEvaluation.strongPremiumPurpleReady(
            cpu._estimateStableIncome(game, player),
            player.builtLandmarkCount(),
            [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length
        );
    },

    _strongCrowdPurchaseScore(cpu, score, card, game, player) {
        const stableIncome = cpu._estimateStableIncome(game, player);
        const remainingLandmarkCount = [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length;
        const oneDieOpponentCount = cpu._strongCrowdOneDieOpponents(game, player);
        const lowDice = card.diceNums && card.diceNums.length > 0 && Math.max(...card.diceNums) <= 6;
        const highDice = card.diceNums && card.diceNums.length > 0 && Math.min(...card.diceNums) >= 7;
        const premiumPurple = [CARD_EFFECTS.STADIUM, CARD_EFFECTS.TV, CARD_EFFECTS.BUSINESS].includes(card.effect);
        const premiumPurpleReady = !premiumPurple || cpu._strongPremiumPurpleReady(card, game, player);
        return CPUEvaluation.strongCrowdPurchaseScore(score, {
            blue: card.color === "blue",
            green: card.color === "green",
            red: card.color === "red",
            purple: card.color === "purple",
            premiumPurple,
            premiumPurpleReady,
            stableIncome,
            remainingLandmarkCount,
            oneDieOpponentCount,
            lowDice,
            highDice,
            itStartup: card.effect === CARD_EFFECTS.ITSTARTUP,
            cost: card.cost,
            hasStation: !!player.landmarks[LANDMARK_NAMES.STATION],
            hasMall: !!player.landmarks[LANDMARK_NAMES.SHOPPING_MALL],
            convenienceStore: card.name === 'コンビニ',
            bakery: card.name === 'パン屋',
        });
    },

    _strongLandmarkUrgencyBonus(cpu, name, current, game) {
        if (cpu.difficulty !== "strong" || !current || !game) return 0;
        const features = CPUEvaluation.strongLandmarkUrgencyFeatures(name, current, game, {
            landmarkNames: LANDMARK_NAMES,
            categories: CARD_CATEGORIES,
            effects: CARD_EFFECTS,
            estimateStableIncome: (runtime, player) => cpu._estimateStableIncome(runtime, player),
        });
        return CPUEvaluation.strongLandmarkUrgencyBonus(features);
    },

    _strongSoftCapValue(cpu, value) {
        return CPUEvaluation.strongSoftCapValue(value, cpu.difficulty);
    },

    _strongCrowdDisruptionReady(cpu, game, player) {
        if (!cpu._isStrongCrowd(game) || !player) return true;
        return CPUEvaluation.strongCrowdDisruptionReady(
            cpu._estimateStableIncome(game, player),
            player.builtLandmarkCount()
        );
    },

    _strongCrowdPremiumPurple(cpu, card) {
        return !!card && [CARD_EFFECTS.STADIUM, CARD_EFFECTS.TV, CARD_EFFECTS.BUSINESS].includes(card.effect);
    },

    _scoreAffordablePurchase(cpu, card, game, player, options = {}) {
        const intensity = options.intensity || 1;
        return CPUEvaluation.affordablePurchaseScore({
            difficulty: options.difficulty,
            cost: card.cost,
            cardValue: () => cpu.evalCard(card, game, player),
            tempoBonus: () => cpu._strongTempoValueBonus(card, game, player),
            diceFrequency: () => cpu._cardDiceFreq(card, game, player),
            synergyBonus: () => cpu._landmarkCardSynergyBonus(card, game, player),
            spamPenalty: () => cpu._cardSpamPenalty(card, player, intensity),
            balancePenalty: () => cpu._economyBalancePenalty(card, game, player, intensity),
            conditionalAdjustment: () => cpu._strongConditionalCardAdjustment(card, game, player),
            renovation: card.effect === CARD_EFFECTS.RENOVATION,
            renovationOwned: () => player.countCard("改装屋"),
            duplicateRenovationPenalty: owned =>
                cpu._duplicateRenovationPenalty({ countCard: () => owned + 1 }, "strong", game),
            rolePressure: () => cpu._strongRolePressure(card, game, player),
            safetyAdjustment: () => cpu._normalSafetyAdjustment(card, game, player),
            crowd: () => game.players.length >= 4,
            crowdScore: score => cpu._strongCrowdPurchaseScore(score, card, game, player),
        });
    },

    _sortAffordableForDifficulty(cpu, cards, game, player, difficulty) {
        const intensity = difficulty === "strong" ? 1.4 : 0.8;
        return CPUEvaluation.rankCards(
            cards,
            card => cpu._scoreAffordablePurchase(card, game, player, { intensity, difficulty })
        );
    },

    _bestAffordableLandmark(cpu, current, game, reserve = 0) {
        const candidates = [];
        for (const name of Player.landmarkNames()) {
            if (!game.enabledLandmarks || !game.enabledLandmarks.has(name) || current.landmarks[name]) continue;
            const cost = Player.landmarkCost(name);
            if (current.coins < cost + reserve) continue;
            const urgency = cpu._landmarkUrgency(name, current, game);
            const thresholdPenalty = cpu._strongLandmarkThresholdPenalty(name, current, game);
            const score = urgency * 2.2 + Math.max(0, current.coins - cost - reserve) * 0.08 - thresholdPenalty;
            candidates.push({ name, cost, urgency, score });
        }
        return CPUEvaluation.bestLandmarkCandidate(candidates);
    },

    _strongTargetLandmark(cpu, current, game) {
        const priority = [
            LANDMARK_NAMES.STATION,
            LANDMARK_NAMES.SHOPPING_MALL,
            LANDMARK_NAMES.HARBOR,
            LANDMARK_NAMES.RADIO_TOWER,
            LANDMARK_NAMES.AMUSEMENT_PARK,
            LANDMARK_NAMES.AIRPORT,
        ];
        const candidates = cpu._remainingEnabledLandmarks(current, game)
            .map(name => ({
                name,
                cost: Player.landmarkCost(name),
                urgency: cpu._landmarkUrgency(name, current, game),
                priority: priority.indexOf(name),
            }));
        const keySpecs = game.players.length >= 4
            ? [
                { valueOf: entry => entry.urgency, direction: CPUSelection.directions.DESCENDING },
                { valueOf: entry => entry.priority, direction: CPUSelection.directions.ASCENDING },
                { valueOf: entry => entry.cost, direction: CPUSelection.directions.ASCENDING },
            ]
            : [
                { valueOf: entry => entry.priority, direction: CPUSelection.directions.ASCENDING },
                { valueOf: entry => entry.urgency, direction: CPUSelection.directions.DESCENDING },
                { valueOf: entry => entry.cost, direction: CPUSelection.directions.ASCENDING },
            ];
        const remaining = CPUSelection.stableRankLexicographic(candidates, keySpecs);
        return remaining[0] || null;
    },

    _strongAttackUnlocked(cpu, current, game, targetLandmark = null) {
        if (game.players.length <= 2) {
            return current.builtLandmarkCount() >= 2 || cpu._estimateStableIncome(game, current) >= 6;
        }
        const target = targetLandmark || cpu._strongTargetLandmark(current, game);
        const stableIncome = cpu._estimateStableIncome(game, current);
        const builtCount = current.builtLandmarkCount();
        const remaining = cpu._remainingEnabledLandmarks(current, game).length;
        const targetAffordable = target ? target.cost <= current.coins : false;
        return stableIncome >= 12 || builtCount >= 4 || remaining <= 2 || targetAffordable;
    },

    _bestStrongEconomyCard(cpu, sorted, game, current, attackUnlocked) {
        if (!sorted || sorted.length === 0) return null;
        const stableIncome = cpu._estimateStableIncome(game, current);
        for (const entry of sorted) {
            const card = entry.card;
            if (card.color === "blue" || card.color === "green") return entry;
            if (!attackUnlocked && (card.color === "red" || card.color === "purple")) continue;
            if (stableIncome >= 10) return entry;
        }
        return sorted[0];
    },

    _shouldStrongBuyAttackCard(cpu, game, current, targetLandmark = null) {
        if (game.players.length <= 2) return cpu._strongAttackUnlocked(current, game, targetLandmark);
        const stableIncome = cpu._estimateStableIncome(game, current);
        const builtCount = current.builtLandmarkCount();
        const target = targetLandmark || cpu._strongTargetLandmark(current, game);
        const shortfall = target ? target.cost - current.coins : Infinity;
        return stableIncome >= 18 || builtCount >= 5 || shortfall > 5;
    },

    _bestCrowdEconomyCard(cpu, sorted, game = null, current = null) {
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
    },

    _scoreExpertCrowdAffordable(cpu, card, game, current) {
        let score = cpu._scoreExpertCardCandidate(card, game, current);
        score -= cpu._scoreExpertCardPenalty(card.name, current, game);
        const remainingLandmarks = cpu._remainingEnabledLandmarks(current, game).length;
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
    },

    _landmarkUrgency(cpu, name, current, game) {
        const builtCount = current.builtLandmarkCount();
        const opponentMaxBuilt = Math.max(0, ...game.players
            .filter(p => p !== current)
            .map(p => p.builtLandmarkCount()));
        const profile = cpu._playerCountProfile(game);
        return CPUEvaluation.landmarkUrgency(name, {
            builtCount,
            opponentMaxBuilt,
            mallCategoryCardCount: current.cards.filter(card =>
                card.category === CARD_CATEGORIES.RESTAURANT || card.category === CARD_CATEGORIES.SHOP
            ).length,
            hasHarborCard: current.cards.some(card =>
                card.effect === CARD_EFFECTS.HARBOR || card.effect === CARD_EFFECTS.HARBOR_RED || card.effect === CARD_EFFECTS.TUNA
            ),
            hasStation: !!current.landmarks[LANDMARK_NAMES.STATION],
            isExpert: cpu.difficulty === "expert",
            stableIncome: name === LANDMARK_NAMES.AIRPORT && cpu.difficulty === "expert" && builtCount === 2
                ? cpu._estimateStableIncome(game, current) : 0,
            strongUrgencyBonus: cpu._strongLandmarkUrgencyBonus(name, current, game),
            airportBias: profile.airportBias,
            landmarkBias: profile.landmarkBias,
        }, LANDMARK_NAMES);
    },

    _coinsTowardsNextLandmark(cpu, player) {
        return CPUEvaluation.coinsTowardsNextLandmark(
            player,
            Player.landmarkNames(),
            Player.landmarkCost
        );
    },

    _estimateCleaningValue(cpu, game, player) {
        const opponentCount = Math.max(1, game.players.length - 1);
        let best = 0;
        const names = [...new Set(game.players.flatMap(p => p.getMinorCards().map(c => c.name)))];
        for (const name of names) {
            let selfPenalty = 0;
            let opponentDamage = 0;
            for (const owner of game.players) {
                for (const card of owner.getMinorCards()) {
                    if (card.name !== name || owner.isDormant(card)) continue;
                    const dormantWeight = 0.8;
                    if (owner === player) selfPenalty += cpu._ownedCardValue(card, game, owner) * dormantWeight;
                    else opponentDamage += cpu._ownedCardValue(card, game, owner) * dormantWeight;
                }
            }
            const score = opponentDamage / opponentCount - selfPenalty;
            if (score > best) best = score;
        }
        return best;
    },

    _estimateMoverValue(cpu, game, player) {
        const features = CPUEvaluation.moverValueFeatures(game, player, {
            minorCards: value => value.getMinorCards(),
            ownedCardValue: (card, owner) => cpu._ownedCardValue(card, game, owner),
            receivedCardValue: (card, target) => cpu._receivedCardValue(card, game, target),
            builtLandmarkCount: target => target.builtLandmarkCount(),
            isDormant: (owner, card) => owner.isDormant(card),
        });
        return CPUEvaluation.moverValue(features);
    },

    _estimateTvTargetValue(cpu, game, player, targetIndex) {
        if (!game || !player || targetIndex < 0 || targetIndex >= game.players.length) return 0;
        const opponentCount = Math.max(1, game.players.length - 1);
        const target = game.players[targetIndex];
        if (!target || target === player || target.coins <= 0) return 0;
        const steal = Math.min(5, target.coins);
        const denial = cpu._tvLandmarkDenialValue(target, steal, game);
        const damage = steal + denial;
        return steal + damage / opponentCount;
    },

    _estimateTvValue(cpu, game, player) {
        let best = 0;
        for (let index = 0; index < game.players.length; index++) {
            best = Math.max(best, cpu._estimateTvTargetValue(game, player, index));
        }
        return best;
    },

    _estimateBusinessValue(cpu, game, player) {
        const move = cpu._chooseSimpleBusinessMove(game, player);
        if (!move) return 0;
        const target = game.players[move.targetIndex];
        if (!player || !target) return 0;
        const myCard = player.cards[move.myCard];
        const theirCard = target.cards[move.theirCard];
        if (!myCard || !theirCard) return 0;
        const opponentCount = Math.max(1, game.players.length - 1);
        const gain = cpu._exchangeReceivedCardValue(theirCard, game, player);
        const myLoss = cpu._exchangeOwnedCardValue(myCard, game, player);
        const denial = cpu._exchangeOwnedCardValue(theirCard, game, target);
        const gift = cpu._exchangeReceivedCardValue(myCard, game, target);
        const selfGain = gain - myLoss;
        const opponentSwing = denial - gift;
        return Math.max(0, selfGain + opponentSwing / opponentCount);
    },

    _estimatePublisherValue(cpu, game, player) {
        return CPUEvaluation.publisherValue(game, player, CARD_CATEGORIES);
    },

    _estimateTaxOfficeValue(cpu, game, player) {
        const opponentCount = Math.max(1, game.players.length - 1);
        let selfGain = 0;
        let opponentDamage = 0;
        for (const target of game.players) {
            if (!target || target === player || target.coins < 10) continue;
            const steal = Math.floor(target.coins / 2);
            selfGain += steal;
            opponentDamage += steal + cpu._tvLandmarkDenialValue(target, steal, game) * 0.6;
        }
        return selfGain + opponentDamage / opponentCount;
    },

    _estimateItStartupValue(cpu, game, player, options = {}) {
        return CPUEvaluation.itStartupValue(game, player, options);
    },

    _estimateConditionalRedValue(cpu, card, game, player) {
        return CPUEvaluation.conditionalRedValue(card, game, player, CARD_EFFECTS);
    },

    _estimateRenovationValue(cpu, game, player, copyOrdinal = 1) {
        const builtValues = CPUSelection.stableRankAscending(
            Object.entries(player.landmarks)
                .filter(([name, built]) => built && name !== LANDMARK_NAMES.YAKUSHO)
                .map(([name]) => ({
                    name,
                    value: cpu._builtLandmarkValue(name, player, game),
                })),
            entry => entry.value
        );
        if (builtValues.length === 0) return 0;

        const ordinalIndex = Math.max(0, copyOrdinal - 1);
        const targetIndex = Math.min(ordinalIndex, builtValues.length - 1);
        const targetValue = builtValues[targetIndex].value;
        let score = 8 - targetValue;

        if (ordinalIndex >= builtValues.length) {
            score -= (ordinalIndex - builtValues.length + 1) * 4;
        }
        return score;
    },

    _estimateParkValue(cpu, game, player) {
        return 0;
    },

    _estimateLoanBurdenValue(cpu, player, copyOrdinal = 1) {
        return CPUEvaluation.loanBurdenValue(copyOrdinal);
    },

    _exchangeReceivedCardValue(cpu, card, game, player) {
        return CPUEvaluation.receivedCardValue(card, CARD_EFFECTS, {
            loanValue: () => {
                const nextCopyOrdinal = player.countCard("貸金業") + 1;
                return cpu._estimateLoanBurdenValue(player, nextCopyOrdinal);
            },
            renovationValue: () => {
                const nextCopyOrdinal = player.countCard("改装屋") + 1;
                return cpu._estimateRenovationValue(game, player, nextCopyOrdinal);
            },
            baseValue: () => {
                if (card.color === "blue" || card.color === "green") {
                    return GameManager.calcCardIncome(card, player, game);
                }
                if (card.color === "red") return card.income;
                return card.income || card.cost || 0;
            },
            softCap: value => cpu._strongSoftCapValue(value),
            diceFrequency: () => cpu._cardDiceFreq(card, game, player),
        });
    },

    _exchangeOwnedCardValue(cpu, card, game, player) {
        return CPUEvaluation.ownedCardValue(
            cpu._exchangeReceivedCardValue(card, game, player),
            card,
            {
                dormant: player.isDormant(card),
                purpleBonus: 0,
                dependencyValue: cpu._cardDependencyValue(card, player, game),
            }
        );
    },

    _opponentDilutionFactor(cpu, game) {
        const playerCount = game && game.players ? game.players.length : 1;
        return CPUEvaluation.opponentDilutionFactor(playerCount);
    },

    _receivedCardValue(cpu, card, game, player) {
        return CPUEvaluation.receivedCardValue(card, CARD_EFFECTS, {
            loanValue: () => {
                const nextCopyOrdinal = player.countCard("貸金業") + 1;
                return cpu._estimateLoanBurdenValue(player, nextCopyOrdinal);
            },
            renovationValue: () => {
                const nextCopyOrdinal = player.countCard("改装屋") + 1;
                return cpu._estimateRenovationValue(game, player, nextCopyOrdinal);
            },
            specialEffectBaseValues: {
                [CARD_EFFECTS.BUSINESS]: 3.5,
                [CARD_EFFECTS.CLEANING]: 3,
                [CARD_EFFECTS.MOVER]: 2.5,
                [CARD_EFFECTS.PARK]: 1.5,
            },
            baseValue: () => {
                if (card.color === "blue" || card.color === "green") {
                    return GameManager.calcCardIncome(card, player, game);
                }
                if (card.color === "red") return card.income;
                return card.income || card.cost || 0;
            },
            softCap: value => cpu._strongSoftCapValue(value),
            diceFrequency: () => cpu._cardDiceFreq(card, game, player),
        });
    },

    _cardDependencyValue(cpu, card, player, game) {
        return CPUEvaluation.cardDependencyValue(
            card,
            player,
            game,
            CARD_CATEGORIES,
            CARD_EFFECTS,
            LANDMARK_NAMES.HARBOR
        );
    },

    _ownedCardValue(cpu, card, game, player) {
        if (card.effect === CARD_EFFECTS.LOAN) {
            const ownedCopyOrdinal = Math.max(1, player.countCard("貸金業"));
            let value = cpu._estimateLoanBurdenValue(player, ownedCopyOrdinal);
            if (player.isDormant(card)) value *= 0.35;
            return value;
        }
        if (card.effect === CARD_EFFECTS.RENOVATION) {
            const ownedCopyOrdinal = Math.max(1, player.countCard("改装屋"));
            let value = cpu._estimateRenovationValue(game, player, ownedCopyOrdinal);
            if (player.isDormant(card)) value *= 0.35;
            return value;
        }
        return CPUEvaluation.ownedCardValue(
            cpu._receivedCardValue(card, game, player),
            card,
            {
                dormant: player.isDormant(card),
                purpleBonus: 2,
                dependencyValue: cpu._cardDependencyValue(card, player, game),
            }
        );
    },

    _builtLandmarkValue(cpu, name, current, game) {
        return cpu._landmarkUrgency(name, current, game) * 2 + Player.landmarkCost(name) * 0.15;
    }
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPUCardEvaluationRuntime };
if (typeof window !== 'undefined') window.CPUCardEvaluationRuntime = CPUCardEvaluationRuntime;
if (typeof globalThis !== 'undefined') globalThis.CPUCardEvaluationRuntime = CPUCardEvaluationRuntime;
