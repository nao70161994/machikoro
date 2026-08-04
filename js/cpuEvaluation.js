const CPUEvaluation = Object.freeze({
    bestLandmarkCandidate(candidates) {
        let best = null;
        for (const candidate of candidates) {
            if (!best || candidate.score > best.score ||
                    (candidate.score === best.score && candidate.cost < best.cost)) {
                best = candidate;
            }
        }
        return best;
    },

    rankCards(cards, scoreCard) {
        return cards.map(card => ({
            card,
            score: scoreCard(card),
        })).sort((a, b) => b.score - a.score);
    },

    affordablePurchaseScore(facts = {}) {
        const read = value => typeof value === 'function' ? value() : value;
        const difficulty = facts.difficulty;
        const expectedGain = (read(facts.cardValue) + read(facts.tempoBonus)) *
            read(facts.diceFrequency);
        let score = difficulty === 'strong'
            ? expectedGain - facts.cost * 0.7
            : expectedGain / Math.max(facts.cost, 1);
        score += read(facts.synergyBonus);
        score -= read(facts.spamPenalty);
        score -= read(facts.balancePenalty);
        if (difficulty === 'strong') score += read(facts.conditionalAdjustment);
        if (difficulty === 'strong' && facts.renovation === true) {
            const owned = read(facts.renovationOwned);
            if (owned >= 1) {
                score -= typeof facts.duplicateRenovationPenalty === 'function'
                    ? facts.duplicateRenovationPenalty(owned)
                    : 0;
            }
        }
        if (difficulty === 'strong') score += read(facts.rolePressure);
        if (difficulty === 'normal') score += read(facts.safetyAdjustment);
        if (difficulty === 'strong' && read(facts.crowd) === true &&
                typeof facts.crowdScore === 'function') {
            score = facts.crowdScore(score);
        }
        return score;
    },

    crowdLeaderBonus(facts = {}) {
        if (!facts.gameAvailable || facts.playerCount < 4 || facts.targetIndex < 0) return 0;
        let maxThreat = -Infinity;
        for (let index = 0; index < facts.playerCount; index++) {
            if (index === facts.currentPlayerIndex) continue;
            maxThreat = Math.max(maxThreat, facts.threatForPlayer(index));
        }
        if (!facts.playerExists(facts.targetIndex) || maxThreat <= 0) return 0;
        return (facts.threatForPlayer(facts.targetIndex) / maxThreat) * facts.weight;
    },

    crowdCleaningBonus(facts = {}) {
        if (!facts.gameAvailable || facts.playerCount < 4) return 0;
        let maxThreat = -Infinity;
        for (let index = 0; index < facts.playerCount; index++) {
            if (index === facts.currentPlayerIndex) continue;
            maxThreat = Math.max(maxThreat, facts.threatForPlayer(index));
        }
        if (maxThreat <= 0) return 0;
        let bonus = 0;
        for (let index = 0; index < facts.playerCount; index++) {
            if (index === facts.currentPlayerIndex) continue;
            const threatRatio = facts.threatForPlayer(index) / maxThreat;
            bonus += facts.matchingActiveCardCount(index) * threatRatio * facts.weight;
        }
        return bonus;
    },

    purchasePlanValue(facts = {}) {
        const landmarkValue = facts.bestLandmark
            ? facts.bestLandmark.urgency * 2.4 +
                Math.max(0, facts.coins - facts.bestLandmark.cost) * 0.08
            : -Infinity;
        return Math.max(facts.bestCardScore, landmarkValue, 0);
    },

    strongChoiceScore(facts = {}) {
        return facts.purchasePlanValue +
            facts.turnValue * 0.35 +
            facts.coins * 0.18 +
            facts.builtLandmarkCount * 2.8 +
            facts.landmarkPressure -
            facts.winDistance * 1.2 -
            facts.redPressure * 0.08 -
            facts.duplicateRenovationPenalty;
    },

    expertChoiceScore(facts = {}) {
        const read = value => typeof value === 'function' ? value() : value;
        let score = read(facts.positionScore);
        if (!read(facts.hasWinner) && read(facts.shouldUseLookahead)) {
            score += read(facts.lookaheadScore) * Math.min(0.35, facts.lookaheadWeight * 0.5);
        }
        return score;
    },

    lookaheadTerminalHeuristic(facts = {}) {
        const read = value => typeof value === 'function' ? value() : value;
        const focusDistance = read(facts.focusDistance);
        const bestOpponentDistance = read(facts.bestOpponentDistance);
        let score = (bestOpponentDistance - focusDistance) * 4.5;

        if (read(facts.raceFocus)) {
            const remainingLandmarkCount = read(facts.remainingLandmarkCount);
            const reachableLandmarkCount = read(facts.reachableLandmarkCount);
            score += Math.max(0, 16 - focusDistance) * 1.6;
            score += reachableLandmarkCount * (remainingLandmarkCount <= 2 ? 6 : 2.5);
        }

        if (read(facts.threatBalance)) {
            for (let index = 0; index < facts.playerCount; index++) {
                if (index === facts.focusIndex) continue;
                const threat = facts.threatForPlayer(index);
                const distance = facts.distanceForPlayer(index);
                score -= Math.max(0, 14 - distance) * 1.2;
                score -= threat * 0.06;
            }
        }

        return score;
    },

    expertDisruptionScale(facts = {}) {
        if (!facts.gameAvailable || facts.difficulty !== 'expert') return 1;
        const selfRacePriority = typeof facts.selfRacePriority === 'function'
            ? facts.selfRacePriority()
            : facts.selfRacePriority;
        if (!selfRacePriority) return 1;
        const playerIndex = facts.focusIndex == null ? facts.currentPlayerIndex : facts.focusIndex;
        const myDistance = facts.myDistance(playerIndex);
        const bestOpponentDistance = facts.bestOpponentDistance(playerIndex);
        if (myDistance > bestOpponentDistance) return 1;
        const remainingLandmarkCount = facts.remainingLandmarkCount(playerIndex);
        if (myDistance + 0.5 <= bestOpponentDistance) {
            return remainingLandmarkCount <= 2 ? 0.3 : 0.5;
        }
        return remainingLandmarkCount <= 2 ? 0.5 : 0.75;
    },

    expertCrowdNormalPlan(facts = {}) {
        if (facts.difficulty !== 'expert') return false;
        const playerCount = typeof facts.playerCount === 'function'
            ? facts.playerCount()
            : facts.playerCount;
        if (playerCount < 4) return false;
        const current = typeof facts.currentPlayer === 'function'
            ? facts.currentPlayer()
            : facts.currentPlayer;
        if (!current) return false;
        const remainingLandmarkCount = facts.remainingLandmarkCount(current);
        const stableIncome = facts.stableIncome(current);
        return remainingLandmarkCount > 1 || stableIncome < 10;
    },

    expertCardPenalty(facts = {}) {
        const cardName = facts.cardName;
        const copies = facts.copies;
        const remainingLandmarks = facts.remainingLandmarks;
        const playerCount = facts.playerCount;
        if (playerCount >= 4 && remainingLandmarks > 2) {
            if (cardName === 'スタジアム' || cardName === 'テレビ局' ||
                    cardName === '税務署' || cardName === '出版社') return 9 + copies * 3;
            if (cardName === '公園' || cardName === 'ITベンチャー') return 7 + copies * 2.5;
        }
        if (cardName === '改装屋') {
            const builtLandmarkCount = typeof facts.builtLandmarkCount === 'function'
                ? facts.builtLandmarkCount()
                : facts.builtLandmarkCount;
            if (builtLandmarkCount === 0) return 18 + copies * 5;
            return copies >= 2 ? 18 + copies * 8 : 0;
        }
        if (cardName === '貸金業') {
            if (remainingLandmarks <= 3 && copies >= 2) return 12 + copies * 4;
            return copies >= 3 ? 8 + copies * 3 : 0;
        }
        if (remainingLandmarks <= 4) {
            if (cardName === '食品倉庫') return 10 + copies * 3;
            if (cardName === 'ピザ屋' || cardName === 'バーガーショップ') return 7 + copies * 2.5;
            if (cardName === 'ブドウ園') return 6 + copies * 2;
        }
        if (playerCount >= 4 && remainingLandmarks <= 4) {
            if (cardName === '食品倉庫') return 16 + copies * 4;
            if (cardName === '改装屋') return 14 + copies * 4;
            if (cardName === 'ピザ屋' || cardName === 'バーガーショップ') return 10 + copies * 3;
            if (cardName === '寿司屋') return 6 + copies * 2;
        }
        if (cardName === '雑貨屋') {
            return remainingLandmarks <= 2 && copies >= 3 ? 8 + copies * 2 : 0;
        }
        return 0;
    },

    expertPositiveIncomeCap(value, mode, facts = {}) {
        const softCap = (cap, rate) => value <= cap ? value : cap + (value - cap) * rate;
        const remainingCosts = () => {
            const source = typeof facts.remainingLandmarkCosts === 'function'
                ? facts.remainingLandmarkCosts()
                : facts.remainingLandmarkCosts;
            return Array.isArray(source) ? source : [];
        };
        const remainingTotal = () => remainingCosts().reduce((sum, cost) => sum + cost, 0);
        const remainingMax = () => remainingCosts().reduce((max, cost) => Math.max(max, cost), 0);
        const coins = () => {
            const source = typeof facts.coins === 'function' ? facts.coins() : facts.coins;
            return Number.isFinite(source) ? source : 0;
        };
        const remainingNeed = () => Math.max(0, remainingTotal() - coins());
        const maxRemainingNeed = () => Math.max(0, remainingMax() - coins());

        switch (mode) {
        case 'hard30':
            return Math.min(value, 30);
        case 'hard40':
            return Math.min(value, 40);
        case 'hard50':
            return Math.min(value, 50);
        case 'soft30':
            return value <= 30 ? value : 30 + (value - 30) * 0.5;
        case 'soft40':
            return value <= 40 ? value : 40 + (value - 40) * 0.5;
        case 'soft50':
            return value <= 50 ? value : 50 + (value - 50) * 0.5;
        case 'landmarkTotalHard':
            return Math.min(value, remainingTotal());
        case 'landmarkTotalSoft25':
            return softCap(remainingTotal(), 0.25);
        case 'landmarkTotalSoft50':
            return softCap(remainingTotal(), 0.5);
        case 'landmarkNeedHard':
            return Math.min(value, remainingNeed());
        case 'landmarkNeedSoft25':
            return softCap(remainingNeed(), 0.25);
        case 'landmarkNeedSoft50':
            return softCap(remainingNeed(), 0.5);
        case 'landmarkMaxHard':
            return Math.min(value, remainingMax());
        case 'landmarkMaxSoft25':
            return softCap(remainingMax(), 0.25);
        case 'landmarkMaxSoft50':
            return softCap(remainingMax(), 0.5);
        case 'landmarkMaxNeedHard':
            return Math.min(value, maxRemainingNeed());
        case 'landmarkMaxNeedSoft25':
            return softCap(maxRemainingNeed(), 0.25);
        case 'landmarkMaxNeedSoft50':
            return softCap(maxRemainingNeed(), 0.5);
        case 'none':
        default:
            return value;
        }
    },

    ownRollIncome(cards, dice, candidateCard, isDormant, activationValue) {
        let total = 0;
        const evaluatedCards = candidateCard ? cards.concat([candidateCard]) : cards;
        for (const card of evaluatedCards) {
            if (!card || !card.diceNums || !card.diceNums.includes(dice)) continue;
            if (!candidateCard && isDormant(card)) continue;
            const value = activationValue(card);
            if (value > 0) total += value;
        }
        return total;
    },

    expectedDiceScore(outcomes, scoreForDice, options = {}) {
        const list = Array.isArray(outcomes) ? outcomes : [];
        let totalWeight = 0;
        let totalScore = 0;
        for (const outcome of list) {
            const dice = outcome.total;
            const weight = outcome.weight;
            let score = scoreForDice(dice);
            if (options.alternateScoreForDice && dice >= options.alternateMinDice) {
                score = Math.max(score, options.alternateScoreForDice(dice));
            }
            totalWeight += weight;
            totalScore += score * weight;
        }
        return totalWeight > 0 ? totalScore / totalWeight : 0;
    },

    singleDiceFrequency(diceNums) {
        const weights = {1:1,2:1,3:1,4:1,5:1,6:1};
        return diceNums.reduce((sum, dice) => sum + (weights[dice] || 0), 0);
    },

    doubleDiceFrequency(diceNums) {
        const weights = {1:0,2:1,3:2,4:3,5:4,6:5,7:6,8:5,9:4,10:3,11:2,12:1,13:0,14:0};
        return diceNums.reduce((sum, dice) => sum + (weights[dice] || 0), 0);
    },

    diceFrequencyForRoller(diceNums, roller, stationName) {
        if (!roller || !roller.landmarks || !roller.landmarks[stationName]) {
            return CPUEvaluation.singleDiceFrequency(diceNums);
        }
        return Math.max(
            CPUEvaluation.singleDiceFrequency(diceNums),
            CPUEvaluation.doubleDiceFrequency(diceNums)
        );
    },

    cardDiceFrequency(card, game, player, stationName) {
        if (!card || !game || !player) {
            return CPUEvaluation.doubleDiceFrequency(card && card.diceNums ? card.diceNums : []);
        }
        const currentIndex = game.players.indexOf(player);
        if (card.color === 'blue') {
            return game.players.reduce(
                (sum, roller) => sum + CPUEvaluation.diceFrequencyForRoller(card.diceNums, roller, stationName),
                0
            );
        }
        if (card.color === 'red') {
            return game.players.reduce(
                (sum, roller, index) => index === currentIndex
                    ? sum
                    : sum + CPUEvaluation.diceFrequencyForRoller(card.diceNums, roller, stationName),
                0
            );
        }
        return CPUEvaluation.diceFrequencyForRoller(card.diceNums, player, stationName);
    },

    cardPurchaseValue(card, game, player, profile, options) {
        const effects = options.effects;
        const opponents = game.players.filter(candidate => candidate !== player);

        switch (card.effect) {
        case effects.CHEESE:
        case effects.FURNITURE:
        case effects.FLOWER:
        case effects.MARKET:
        case effects.FOODWAREHOUSE:
        case effects.DRINKFACTORY:
        case effects.WINERY:
        case effects.FEWLANDMARK:
        case effects.CORNFIELD:
            return options.calcCardIncome(card, player, game) * profile.greenFactor;
        case effects.STADIUM:
            return (opponents.length * card.income + (opponents.length > 0 ? card.income : 0)) *
                profile.massAttackFactor;
        case effects.TV:
            return options.estimateTvValue(game, player) * profile.purpleFactor;
        case effects.PUBLISHER:
            return options.estimatePublisherValue(game, player) * profile.massAttackFactor;
        case effects.TAXOFFICE:
            return options.estimateTaxOfficeValue(game, player) * profile.massAttackFactor;
        case effects.HARBOR:
            return (player.landmarks[options.landmarkNames.HARBOR] ? card.income : card.income * 0.4) *
                profile.blueFactor;
        case effects.HARBOR_RED:
            return (player.landmarks[options.landmarkNames.HARBOR] ? card.income : 0) * profile.redFactor;
        case effects.TUNA:
            return (player.landmarks[options.landmarkNames.HARBOR] ? 7 : 0) * profile.blueFactor;
        case effects.FRENCHR:
        case effects.MEMBERBAR:
            return options.estimateConditionalRedValue(card, game, player) * profile.redFactor;
        case effects.LOAN:
            return (player.coins <= 4 ? 3.5 : 1.2) * profile.greenFactor;
        case effects.ITSTARTUP:
            return options.estimateItStartupValue(game, player, true) * profile.massAttackFactor;
        case effects.RENOVATION:
            return options.estimateRenovationValue(
                game, player, player.countCard(options.renovationCardName) + 1
            ) * profile.greenFactor;
        case effects.CLEANING:
            return options.estimateCleaningValue(game, player) * profile.massAttackFactor;
        case effects.MOVER:
            return options.estimateMoverValue(game, player) * profile.greenFactor;
        case effects.BUSINESS:
            return options.estimateBusinessValue(game, player) * (game.players.length <= 2 ? 1.15 : 1);
        case effects.PARK:
            return 0;
        default:
            if (card.color === 'blue') return card.income * profile.blueFactor;
            if (card.color === 'red') return card.income * profile.redFactor;
            if (card.color === 'green') return card.income * profile.greenFactor;
            if (card.color === 'purple') return card.income * profile.purpleFactor;
            return card.income;
        }
    },

    cardActivationValue(card, game, owner, roller, dice, options) {
        const { effects, categories, landmarkNames } = options;
        const capped = options.capValue;
        const ownerIndex = game.players.indexOf(owner);
        const rollerIndex = game.players.indexOf(roller);
        const isCurrentTurn = ownerIndex === rollerIndex;
        const opponents = game.players.filter((_, index) => index !== ownerIndex);
        const copyOrdinal = owner.cards
            .slice(0, owner.cards.indexOf(card) + 1)
            .filter(candidate => candidate.name === card.name)
            .length || 1;

        if (card.color === 'blue') {
            if (card.effect === effects.HARBOR) return capped(owner.landmarks[landmarkNames.HARBOR] ? card.income : 0);
            if (card.effect === effects.TUNA) return capped(owner.landmarks[landmarkNames.HARBOR] ? 7 : 0);
            if (card.effect === effects.CORNFIELD) return capped(options.calcCardIncome(card, owner, game));
            return capped(card.income);
        }

        if (card.color === 'red') {
            if (isCurrentTurn) return 0;
            if (card.effect === effects.HARBOR_RED) return capped(owner.landmarks[landmarkNames.HARBOR] ? card.income : 0);
            if (card.effect === effects.FRENCHR) {
                return capped(roller.landmarks && roller.builtLandmarkCount() >= 2
                    ? Math.min(card.income, roller.coins) : 0);
            }
            if (card.effect === effects.MEMBERBAR) {
                return capped(roller.landmarks && roller.builtLandmarkCount() >= 3 ? roller.coins : 0);
            }
            return capped(card.income + (owner.landmarks[landmarkNames.SHOPPING_MALL] &&
                card.category === categories.RESTAURANT ? 1 : 0));
        }

        if (!isCurrentTurn) return 0;

        switch (card.effect) {
        case effects.CHEESE:
        case effects.FURNITURE:
        case effects.FLOWER:
        case effects.MARKET:
        case effects.FOODWAREHOUSE:
        case effects.DRINKFACTORY:
        case effects.WINERY:
        case effects.FEWLANDMARK:
            return capped(options.calcCardIncome(card, owner, game));
        case effects.STADIUM:
            return capped(opponents.length * card.income + (opponents.length > 0 ? card.income : 0));
        case effects.TV:
            return capped(options.estimateTvValue(game, owner));
        case effects.PUBLISHER:
            return capped(options.estimatePublisherValue(game, owner));
        case effects.TAXOFFICE:
            return capped(options.estimateTaxOfficeValue(game, owner));
        case effects.LOAN:
            return dice === 5 || dice === 6 ? -2 : 0;
        case effects.BUSINESS:
            return capped(options.estimateBusinessValue(game, owner));
        case effects.CLEANING:
            return capped(options.estimateCleaningValue(game, owner));
        case effects.MOVER:
            return capped(options.estimateMoverValue(game, owner));
        case effects.RENOVATION:
            return capped(options.estimateRenovationValue(game, owner, copyOrdinal));
        case effects.ITSTARTUP:
            return capped(options.estimateItStartupValue(game, owner));
        case effects.PARK:
            return capped(options.estimateParkValue(game, owner));
        default: {
            let amount = card.income;
            if (owner.landmarks[landmarkNames.SHOPPING_MALL] &&
                    (card.category === categories.RESTAURANT || card.category === categories.SHOP)) {
                amount += 1;
            }
            return amount;
        }
        }
    },

    cardSelfIncomeValue(card, game, owner, roller, effects, categories, landmarkNames, calcCardIncome) {
        const ownerIndex = game.players.indexOf(owner);
        const rollerIndex = game.players.indexOf(roller);
        const opponents = game.players.filter((_, index) => index !== ownerIndex);

        if (ownerIndex !== rollerIndex) return 0;

        if (card.color === 'blue') {
            if (card.effect === effects.HARBOR) return owner.landmarks[landmarkNames.HARBOR] ? card.income : 0;
            if (card.effect === effects.TUNA) return owner.landmarks[landmarkNames.HARBOR] ? 7 : 0;
            if (card.effect === effects.CORNFIELD) return calcCardIncome(card, owner, game);
            return card.income;
        }

        if (card.color === 'red') return 0;

        switch (card.effect) {
        case effects.CHEESE:
        case effects.FURNITURE:
        case effects.FLOWER:
        case effects.MARKET:
        case effects.FOODWAREHOUSE:
        case effects.DRINKFACTORY:
        case effects.WINERY:
        case effects.FEWLANDMARK:
            return calcCardIncome(card, owner, game);
        case effects.STADIUM:
            return opponents.length * card.income;
        case effects.TV:
            return opponents.reduce((best, target) => Math.max(best, Math.min(5, target.coins)), 0);
        case effects.PUBLISHER:
            return opponents.reduce((total, target) => {
                if (!target || target.coins <= 0) return total;
                const activeHits = target.cards.filter(candidate =>
                    !target.isDormant(candidate) &&
                    (candidate.category === categories.RESTAURANT || candidate.category === categories.SHOP)
                );
                return total + Math.min(activeHits.length, target.coins);
            }, 0);
        case effects.TAXOFFICE:
            return opponents.reduce((total, target) =>
                !target || target.coins < 10 ? total : total + Math.floor(target.coins / 2), 0
            );
        case effects.ITSTARTUP: {
            const ventureCoins = Math.max(0, owner.itVentureCoins);
            if (ventureCoins <= 0) return 0;
            return opponents.reduce((total, target) =>
                !target || target.coins <= 0 ? total : total + Math.min(ventureCoins, target.coins), 0
            );
        }
        case effects.BUSINESS:
        case effects.CLEANING:
        case effects.MOVER:
        case effects.RENOVATION:
        case effects.PARK:
            return 0;
        default: {
            let amount = card.income;
            if (owner.landmarks[landmarkNames.SHOPPING_MALL] &&
                    (card.category === categories.RESTAURANT || card.category === categories.SHOP)) {
                amount += 1;
            }
            return amount;
        }
        }
    },

    strongSoftCapValue(value, difficulty) {
        if (difficulty !== 'strong') return value;
        const sign = Math.sign(value);
        const abs = Math.abs(value);
        if (abs <= 12) return value;
        if (abs <= 20) return sign * (12 + (abs - 12) * 0.5);
        if (abs <= 30) return sign * (16 + (abs - 20) * 0.3);
        return sign * (19 + Math.sqrt(abs - 30));
    },

    publisherValue(game, player, categories) {
        const opponentCount = Math.max(1, game.players.length - 1);
        let total = 0;
        for (const target of game.players) {
            if (!target || target === player || target.coins <= 0) continue;
            const activeHits = target.cards.filter(card =>
                !target.isDormant(card) &&
                (card.category === categories.RESTAURANT || card.category === categories.SHOP)
            );
            total += Math.min(activeHits.length, target.coins);
        }
        return total + total / opponentCount;
    },

    itStartupValue(game, player, options = {}) {
        if (typeof options === 'boolean') options = { assumeInvest: options };
        const assumeInvest = !!options.assumeInvest;
        const opponentCount = Math.max(1, game.players.length - 1);
        const ventureCoins = Math.max(0, player.itVentureCoins) + (assumeInvest ? 1 : 0);
        if (ventureCoins <= 0) return 0;
        const totalAt = (coins) => {
            let total = 0;
            for (const target of game.players) {
                if (!target || target === player || target.coins <= 0) continue;
                total += Math.min(coins, target.coins);
            }
            return total;
        };
        const total = totalAt(ventureCoins);
        let value = total + total / opponentCount;
        if (assumeInvest) {
            const futureInvestSteps = Math.min(2, Math.max(0, player.coins));
            let previousTotal = total;
            for (let step = 1; step <= futureInvestSteps; step++) {
                const nextTotal = totalAt(ventureCoins + step);
                const marginal = nextTotal - previousTotal;
                if (marginal > 0) {
                    value += (marginal + marginal / opponentCount) * Math.pow(0.5, step);
                }
                previousTotal = nextTotal;
            }
        }
        return value;
    },

    conditionalRedValue(card, game, player, effects) {
        if (!card || !game || !player) return 0;
        let total = 0;
        for (const target of game.players) {
            if (!target || target === player) continue;
            if (card.effect === effects.FRENCHR) {
                if (target.builtLandmarkCount() >= 2) total += card.income;
                continue;
            }
            if (card.effect === effects.MEMBERBAR) {
                if (target.builtLandmarkCount() >= 3) total += Math.max(target.coins, 4);
                continue;
            }
        }
        return total;
    },

    normalSafetyAdjustment(features, effects) {
        if (!features) return 0;
        let adjustment = 0;
        if (features.effect === effects.LOAN && features.coins >= 8) adjustment -= 1.5;
        if (features.effect === effects.RENOVATION && features.builtLandmarkCount === 0) adjustment -= 1.8;
        if (features.color === 'purple' && features.stableIncome < 6 && features.cost >= 6) adjustment -= 1.1;
        if (features.color === 'red' && features.redCardCount >= 2) adjustment -= 0.7;
        if ((features.color === 'blue' || features.color === 'green') && features.stableIncome < 5) adjustment += 0.35;
        return adjustment;
    },

    expertLandmarkEffectBonus(name, features, landmarkNames) {
        if (!features || !landmarkNames) return 0;
        const remainingBonus = Math.max(0, 6 - features.remainingLandmarkCount) * 0.6;
        if (name === landmarkNames.STATION) {
            return features.hasStation ? 0 : 5 + Math.max(0, features.rollDelta) * 1.5;
        }
        if (name === landmarkNames.SHOPPING_MALL) {
            return Math.min(5, features.mallTargetCardCount * 0.8) + remainingBonus;
        }
        if (name === landmarkNames.HARBOR) {
            return Math.min(8, features.harborBaseBonus + features.harborCardCount * 2) +
                Math.max(0, features.rollDelta);
        }
        if (name === landmarkNames.RADIO_TOWER) {
            return 2.5 + Math.min(5, Math.max(0, features.rollSwing)) + remainingBonus;
        }
        if (name === landmarkNames.AMUSEMENT_PARK) {
            return features.hasStation ? 3 + remainingBonus : 1;
        }
        if (name === landmarkNames.AIRPORT) {
            return features.remainingLandmarkCount <= 2 ? 4 : 1.5;
        }
        return 0;
    },

    strongRolePressure(features) {
        if (!features) return 0;
        let adjustment = 0;
        if (features.color === 'blue' && features.blueCardCount === 0) adjustment += 0.7;
        if (features.color === 'green' && features.greenCardCount < 2) adjustment += 0.9;
        if (features.color === 'red' && features.redCardCount === 0 && features.opponentHasEightCoins) adjustment += 0.5;
        if (features.color === 'red' && features.redCardCount >= Math.max(2, features.greenCardCount + features.blueCardCount)) adjustment -= 1.2;
        if (features.color === 'purple' && features.purpleCardCount > 0) adjustment -= 2.5;
        if (features.color === 'green' && features.isEndgameMode) adjustment += 0.4;
        if (features.playerCount >= 4) {
            if (features.color === 'red') adjustment -= 2.1;
            if (features.color === 'purple') adjustment -= 0.7;
            if (features.color === 'blue') adjustment += 0.7;
            if (features.color === 'green') adjustment += 1.1;
        }
        return adjustment + (features.purpleAdjustment || 0);
    },

    strongConditionalCardAdjustment(effect, opponentBuiltCounts, difficulty, effects) {
        if (difficulty !== 'strong') return 0;
        if (effect !== effects.FRENCHR && effect !== effects.MEMBERBAR) return 0;
        const threshold = effect === effects.FRENCHR ? 2 : 3;
        const readyOpponents = opponentBuiltCounts.filter(count => count >= threshold).length;
        if (readyOpponents > 0) {
            return readyOpponents * (effect === effects.FRENCHR ? 1.6 : 2.2);
        }
        const nearOpponents = opponentBuiltCounts.filter(count => count === threshold - 1).length;
        return nearOpponents > 0 ? -1.2 : -3.6;
    },

    strongLandmarkThresholdPenalty(features) {
        if (!features || features.difficulty !== 'strong' || !features.hasName) return 0;
        let penalty = 0;
        if (features.nextBuiltCount === 2 && features.progressCardCount > 0) {
            penalty += features.progressCardCount * 2.2;
        }
        for (const counts of features.opponentConditionalCards) {
            if (features.nextBuiltCount >= 2 && counts.french > 0) {
                penalty += counts.french * 2.6;
            }
            if (features.nextBuiltCount >= 3 && counts.memberBar > 0) {
                penalty += counts.memberBar * 4.2;
            }
        }
        if (features.remainingLandmarkCount <= 2) penalty *= 0.35;
        else if (features.remainingLandmarkCount <= 3) penalty *= 0.6;
        return penalty;
    },

    strongTempoValueBonus(features) {
        if (!features || features.difficulty !== 'strong') return 0;
        let bonus = 0;
        if ((features.color === 'blue' || features.color === 'red') && features.oneDieOpponentCount > 0) {
            if (features.lowDice) bonus += features.oneDieOpponentCount * 0.35;
            if (features.highDice) bonus -= features.oneDieOpponentCount * 0.35;
            if (features.playerCount >= 4 && features.highDice && features.color === 'red') {
                bonus -= features.oneDieOpponentCount * 0.15;
            }
        }
        if ((features.color === 'green' || features.color === 'purple') && features.selfOneDie) {
            if (features.lowDice) bonus += 0.9;
            if (features.highDice) bonus -= 0.9;
        }
        return bonus;
    },

    landmarkCardSynergyBonus(features) {
        if (!features) return 0;
        let bonus = 0;
        if (features.hasStation && features.highDice) bonus += 0.9;
        if (!features.hasStation && features.highDice) bonus -= 0.6;
        if (features.hasMall && features.mallCategory) bonus += 1.1;
        if (features.hasHarbor && features.harborEffect) bonus += 1.6;
        if (features.hasTower && features.highDice) bonus += 0.5;
        if (features.hasPark && features.highDice) bonus += 0.35;
        if (features.hasAirport && features.cost <= 3 && features.lowDice) bonus -= 0.5;
        return bonus;
    },

    strongCrowdAttackScale(opponentScale, strongCrowd) {
        return strongCrowd ? opponentScale * 0.45 : opponentScale;
    },

    strongCrowdDisruptionReady(stableIncome, builtCount) {
        return stableIncome >= 10 || builtCount >= 3;
    },

    strongPurpleAdjustment(features) {
        if (!features) return 0;
        let adjustment = 0;
        if (features.stadium) adjustment += features.crowd ? 3.4 : 1.8;
        if (features.tv) adjustment += features.crowd ? 3.2 : 1.6;
        if (features.business) adjustment += features.crowd ? 2.4 : 1.2;
        if (features.renovation) adjustment -= 1.8;
        if (features.itStartup) adjustment -= features.crowd ? 2.8 : 1.8;
        if (features.loan) adjustment -= features.stableIncome >= 7 ? 0.4 : 1.2;
        return adjustment;
    },

    strongPremiumPurpleReady(stableIncome, builtCount, remainingLandmarkCount) {
        return (stableIncome >= 10 && builtCount >= 2) ||
            builtCount >= 3 ||
            remainingLandmarkCount <= 2;
    },

    strongLandmarkUrgencyBonus(features) {
        if (!features) return 0;
        if (features.station) {
            if (features.crowd) return features.highVarianceCardCount >= 1 ? 3 : 2;
            if (features.highVarianceCardCount >= 2) return 2;
            if (features.highVarianceCardCount >= 1) return 1;
            return 0;
        }
        if (features.mall) {
            if (features.crowd) return features.shopRestaurantCardCount >= 4 ? 2 : 1;
            return features.shopRestaurantCardCount >= 5 ? 1 : 0;
        }
        if (features.harbor) {
            let bonus = features.crowd ? 1 : 0;
            bonus += features.tunaBoatLevel;
            if (features.harborCardCount >= 3) bonus += 1;
            return bonus;
        }
        if (features.tower) {
            let bonus = features.hasStation ? 1 : 0;
            if (features.highVarianceCardCount >= 4) bonus += 2;
            else if (features.highVarianceCardCount >= 2) bonus += 1;
            return bonus;
        }
        if (features.park) {
            if (!features.hasStation) return 0;
            if (features.highVarianceCardCount >= 2) return 2;
            if (features.highVarianceCardCount >= 1) return 1;
            return 0;
        }
        if (features.airport) {
            let bonus = features.stableIncome >= 8 ? 1 : 0;
            if (features.cheapEngineCardCount <= 3) bonus += 1;
            return bonus;
        }
        return 0;
    },

    strongCrowdPurchaseScore(score, features) {
        if (!features) return score;
        if (features.blue || features.green) score += 0.9;
        if (features.red) score -= 1.1;
        if (features.purple && !features.premiumPurple) score -= 1.1;
        if (features.stableIncome < 8 && (features.blue || features.green)) score += 1.2;
        if (features.stableIncome < 10 && features.red) score -= 1.8;
        if (features.stableIncome < 10 && features.purple && !features.premiumPurple) score -= 1.8;
        if (features.remainingLandmarkCount > 2 && features.itStartup) score -= 2.5;
        if (features.oneDieOpponentCount >= 2 && features.lowDice && (features.blue || features.green)) score += 1.2;
        if (features.oneDieOpponentCount >= 2 && features.highDice) score -= 1.4;
        if (features.oneDieOpponentCount >= 2 && features.highDice && (features.red || features.purple)) score -= 1.0;
        if (features.premiumPurple && !features.premiumPurpleReady) score -= 3.2;
        if (features.lowDice && (features.blue || features.green)) score += 0.9;
        if (features.lowDice && features.green && features.cost <= 3) score += 0.6;
        if (features.lowDice && features.blue && features.cost <= 2) score += 0.4;
        if (!features.hasStation && features.lowDice && features.green) score += 0.5;
        if (!features.hasMall && features.convenienceStore) score += 0.6;
        if (!features.hasStation && features.bakery) score += 0.5;
        return score;
    },

    loanBurdenValue(copyOrdinal = 1) {
        const ordinal = Math.max(1, copyOrdinal);
        return -2.5 * ordinal;
    },

    cardDependencyValue(card, player, game, categories, effects, harborName) {
        if (!card || !player || !game) return 0;
        switch (card.effect) {
            case effects.CHEESE:
                return player.countCard('牧場') * 1.4;
            case effects.FURNITURE:
                return (player.countCard('森林') + player.countCard('鉱山')) * 1.2;
            case effects.FLOWER:
                return player.countCard('花畑') * 1.3;
            case effects.MARKET:
                return player.cards.filter(c => c.category === categories.FARM && !player.isDormant(c)).length * 1.3;
            case effects.FOODWAREHOUSE:
                return player.cards.filter(c => c.category === categories.RESTAURANT && !player.isDormant(c)).length * 0.9;
            case effects.DRINKFACTORY:
                return game.players.reduce((sum, owner) =>
                    sum + owner.cards.filter(c => c.category === categories.RESTAURANT && !owner.isDormant(c)).length, 0) * 0.9;
            case effects.WINERY:
                return player.countCard('ブドウ園') * 1.2;
            case effects.HARBOR:
            case effects.TUNA:
            case effects.HARBOR_RED:
                return player.landmarks[harborName] ? 2.2 : 0.6;
            case effects.BUSINESS:
                return player.getMinorCards().length * 0.35;
            default:
                return 0;
        }
    },

    opponentDilutionFactor(playerCount) {
        return 1 / Math.max(1, playerCount - 1);
    },

    coinsTowardsNextLandmark(player, landmarkNames, landmarkCost) {
        const remainingCosts = landmarkNames
            .filter(name => !player.landmarks[name])
            .map(name => landmarkCost(name));
        if (remainingCosts.length === 0) return 0;
        return Math.max(0, player.coins - Math.min(...remainingCosts));
    },

    countReachableLandmarks(player, enabledLandmarks, landmarkCost) {
        return enabledLandmarks.filter(name =>
            !player.landmarks[name] && player.coins >= landmarkCost(name)
        ).length;
    },

    estimateWinDistance(features) {
        const remaining = features.remainingLandmarks;
        if (!Array.isArray(remaining) || remaining.length === 0) return 0;
        const totalRemainingCost = remaining.reduce((sum, entry) => sum + entry.cost, 0);
        const nextLandmark = remaining
            .slice()
            .sort((a, b) => b.urgency - a.urgency || a.cost - b.cost)[0];
        const nextShortfall = Math.max(0, nextLandmark.cost - features.playerCoins);
        let effectiveGainPerTurn = Math.max(
            1.2,
            features.progressIncome * 0.85 + features.turnValue * 0.12 + features.reachable * 0.6
        );
        const routeCost = totalRemainingCost - Math.min(features.playerCoins, totalRemainingCost);
        const landmarkSteps = routeCost / effectiveGainPerTurn;
        let nextStepDelay = nextShortfall / Math.max(
            1,
            features.progressIncome * 0.9 + features.turnValue * 0.08
        );
        let distance = landmarkSteps + nextStepDelay * 0.7 +
            remaining.length * 0.45 - features.reachable * 0.5;
        if (features.crowdFocus) {
            effectiveGainPerTurn = Math.max(
                1.3,
                features.progressIncome * 0.9 + features.turnValue * 0.12 + features.reachable * 0.9
            );
            nextStepDelay = nextShortfall / Math.max(
                1,
                features.progressIncome + features.turnValue * 0.08
            );
            const crowdLandmarkSteps = routeCost / effectiveGainPerTurn;
            distance = crowdLandmarkSteps + nextStepDelay * 0.95 +
                remaining.length * 0.35 - features.reachable * 0.85;
        }
        return Number(Math.max(0, distance).toFixed(3));
    },

    estimateOpponentThreat(features) {
        return features.coins * 0.4 +
            features.turnValue * 1.8 +
            features.landmarkProgress * 9 +
            features.builtLandmarkCount * 5 +
            features.reachableLandmarks * 6 +
            Math.max(0, 18 - features.winDistance) * 1.4;
    },

    evaluatePositionScore(features, tuning) {
        let score = features.coins * tuning.coinWeight +
            features.turnValue * tuning.turnWeight +
            features.landmarkProgress * tuning.landmarkWeight +
            features.builtLandmarkCount * tuning.builtLandmarkWeight +
            features.reachableLandmarks * tuning.landmarkReachWeight +
            features.stableIncome * tuning.stableIncomeWeight -
            features.winDistance * 1.8 -
            features.redPressure * tuning.redPressureWeight;
        if (features.remainingLandmarkCount <= 2) {
            score += features.coins * tuning.lateCoinWeight +
                features.landmarkProgress * tuning.lateProgressBonus;
        }
        if (features.remainingLandmarkCount <= 1) {
            score += features.coins * tuning.finalCoinWeight;
        }
        if (features.lowValueSpam > tuning.lowValueSpamThreshold) {
            score -= (features.lowValueSpam - tuning.lowValueSpamThreshold) * tuning.lowValueSpamPenalty;
        }
        score -= features.duplicateRenovationPenalty;
        if (features.airportIdleBonus) score += 12;
        let maxOpponentThreat = 0;
        for (const threat of features.opponentThreats) {
            maxOpponentThreat = Math.max(maxOpponentThreat, threat);
            score -= threat;
        }
        score -= maxOpponentThreat * tuning.leaderThreatWeight;
        return score;
    },

    closestLandmarkShortfall(player, enabledLandmarks, landmarkCost) {
        if (!player || !enabledLandmarks) return Infinity;
        const remaining = [...enabledLandmarks]
            .filter(name => !player.landmarks[name])
            .map(name => landmarkCost(name) - player.coins);
        if (remaining.length === 0) return 0;
        return Math.max(0, Math.min(...remaining));
    },

    v2SimpleTvTargetScore(facts = {}) {
        const afterCoins = Math.max(0, facts.coins - facts.steal);
        const afterShortfall = facts.remainingLandmarkCosts.length > 0
            ? Math.max(0, Math.min(...facts.remainingLandmarkCosts) - afterCoins)
            : 0;
        let denial = 0;
        if (facts.beforeShortfall <= 0 && afterShortfall > 0) {
            denial = 10 + Math.min(6, afterShortfall * 1.5);
        } else if (facts.beforeShortfall <= 2 && afterShortfall > facts.beforeShortfall) {
            denial = (afterShortfall - facts.beforeShortfall) * 3;
        }
        return facts.steal * 2.2 + facts.builtLandmarkCount * 2.5 + denial;
    },

    tvLandmarkDenialValue(target, amount, enabledLandmarks, landmarkCost, enabled) {
        if (!enabled || !target || !enabledLandmarks) return 0;
        const before = CPUEvaluation.closestLandmarkShortfall(
            target,
            enabledLandmarks,
            landmarkCost
        );
        const afterCoins = Math.max(0, target.coins - amount);
        const remainingCosts = [...enabledLandmarks]
            .filter(name => !target.landmarks[name])
            .map(name => landmarkCost(name));
        if (remainingCosts.length === 0) return 0;
        const after = Math.max(0, Math.min(...remainingCosts) - afterCoins);
        if (before <= 0 && after > 0) return 8 + Math.min(4, after * 1.5);
        if (before <= 1 && after >= 2) return 4.5;
        return Math.max(0, after - before) * 1.8;
    },

    expertRollIncomeCap(player, enabledLandmarks, landmarkCost) {
        if (!player || !enabledLandmarks) return Infinity;
        const remainingCosts = [...enabledLandmarks]
            .filter(name => !player.landmarks[name])
            .map(name => landmarkCost(name));
        if (remainingCosts.length === 0) return Infinity;
        return Math.max(...remainingCosts);
    },

    expertRollCapPenalty(incomePairs, cap, difficulty) {
        if (difficulty !== 'expert' || !Number.isFinite(cap) || cap <= 0) return 0;
        let penalty = 0;
        for (const pair of incomePairs) {
            const added = Math.max(0, pair.after - pair.before);
            if (added <= 0) continue;
            if (pair.before >= cap) {
                penalty += added * 2.4;
                continue;
            }
            const overflow = Math.max(0, pair.after - cap);
            if (overflow > 0) penalty += overflow * 1.8;
        }
        return penalty;
    },

    sameBuildOption(a, b) {
        if (!a || !b || a.type !== b.type) return false;
        if (a.type === 'landmark') return a.name === b.name;
        return a.card && b.card && a.card.name === b.card.name;
    },

    futurePayoffCardNames(card, mode, categories) {
        if (!card) return [];
        const payoffs = [];
        if (card.category === categories.LIVESTOCK) payoffs.push('チーズ工場');
        if (card.name === '森林' || card.name === '鉱山') payoffs.push('家具工場');
        if (card.name === '花畑') payoffs.push('フラワーショップ');
        if (card.name === 'ブドウ園') payoffs.push('ワイナリー');
        if (mode === 'core') return payoffs;
        if (card.category === categories.FARM) payoffs.push('青果市場');
        if (card.category === categories.RESTAURANT) {
            payoffs.push('食品倉庫');
            payoffs.push('ドリンク工場');
        }
        return payoffs;
    },

    marginalComboIncome(enabler, payoff, categories, effects) {
        if (!enabler || !payoff) return 0;
        switch (payoff.effect) {
            case effects.CHEESE:
                return enabler.category === categories.LIVESTOCK ? payoff.income : 0;
            case effects.FURNITURE:
                return (enabler.name === '森林' || enabler.name === '鉱山') ? payoff.income : 0;
            case effects.MARKET:
                return enabler.category === categories.FARM ? payoff.income : 0;
            case effects.FLOWER:
                return enabler.name === '花畑' ? payoff.income : 0;
            case effects.WINERY:
                return enabler.name === 'ブドウ園' ? payoff.income : 0;
            case effects.FOODWAREHOUSE:
            case effects.DRINKFACTORY:
                return enabler.category === categories.RESTAURANT ? payoff.income : 0;
            default:
                return 0;
        }
    },

    landmarkCardPenalty(hasAffordableLandmark, mode, option, effects, remainingLandmarkCount) {
        if (!hasAffordableLandmark || mode === 'none') return 0;
        if (!option || option.type !== 'card' || !option.card) return 0;
        if (mode !== 'riskySpecials') return 0;
        const remaining = remainingLandmarkCount();
        switch (option.card.effect) {
            case effects.BUSINESS:
                return 8;
            case effects.RENOVATION:
                return 6 + (remaining <= 4 ? 6 : 0);
            case effects.LOAN:
                return 5;
            default:
                return 0;
        }
    },

    expertCrowdCardCandidateAdjustment(features) {
        if (!features || features.difficulty !== 'expert' || features.playerCount < 4) return 0;
        let adjustment = 0;
        const earlyCrowd = features.remainingLandmarks > 2;

        if (features.flags.lowDiceEngineBoost && earlyCrowd) {
            if (features.lowDice && (features.color === 'blue' || features.color === 'green')) adjustment += 1.1;
            if (features.lowDice && features.cost <= 3) adjustment += 0.8;
            if (features.name === 'パン屋' || features.name === 'コンビニ') adjustment += 0.9;
            if (features.name === '麦畑' || features.name === '牧場') adjustment += 0.6;
        }

        if (features.flags.redRestaurantSuppression && earlyCrowd) {
            if (features.color === 'red') adjustment -= 1.4;
            if (features.category === features.restaurantCategory) adjustment -= 1.1;
            if (features.highDice && features.color === 'red') adjustment -= 0.8;
            if (features.name === '会員制BAR' || features.name === 'ファミレス') adjustment -= 0.9;
        }

        if (features.flags.purpleShortlistDelay && earlyCrowd &&
                ['スタジアム', 'テレビ局', '税務署', '出版社'].includes(features.name)) {
            adjustment -= 3.2;
        }

        if (features.remainingLandmarks <= 4) {
            if (features.name === '食品倉庫') adjustment -= 2.8;
            if (features.name === 'ピザ屋' || features.name === 'バーガーショップ') adjustment -= 2.1;
            if (features.name === 'ブドウ園') adjustment -= 1.8;
        }
        if (features.playerCount >= 4 && features.remainingLandmarks <= 4) {
            if (features.name === '食品倉庫') adjustment -= 3.5;
            if (features.name === '改装屋') adjustment -= 3.2;
            if (features.name === 'ピザ屋' || features.name === 'バーガーショップ') adjustment -= 2.6;
            if (features.name === '寿司屋') adjustment -= 1.4;
        }

        return adjustment;
    },

    cardSpamPenalty(card, owned, intensity = 1) {
        if (owned <= 0) return 0;
        let penalty = owned * 0.35 * intensity;
        if (card.color === 'red') penalty += owned * 0.65 * intensity;
        if (card.color === 'purple') penalty += owned * 1.4 * intensity;
        return penalty;
    },

    duplicateRenovationPenalty(features) {
        if (!features) return 0;
        const extraCopies = Math.max(0, features.extraCopies);
        if (extraCopies <= 0) return 0;
        let penalty = 0;
        if (features.difficulty === 'expert') {
            penalty = extraCopies * 14 + Math.max(0, extraCopies - 1) * 6;
        } else if (features.difficulty === 'strong') {
            penalty = extraCopies * 8 + Math.max(0, extraCopies - 1) * 3;
        } else {
            penalty = extraCopies * 4;
        }
        if (!features.includeBoardRisk) return penalty;

        if (features.difficulty === 'expert') {
            penalty += features.exposedValue * 0.9 +
                features.premiumExposure * 5 * extraCopies;
        } else if (features.difficulty === 'strong') {
            penalty += features.exposedValue * 0.45 +
                features.premiumExposure * 2.5 * extraCopies;
        } else {
            penalty += features.exposedValue * 0.2 +
                features.premiumExposure * extraCopies;
        }
        return penalty;
    },

    economyBalancePenalty(card, cards, intensity, redFactor) {
        const blueCount = cards.filter(candidate => candidate.color === 'blue').length;
        const greenCount = cards.filter(candidate => candidate.color === 'green').length;
        const redCount = cards.filter(candidate => candidate.color === 'red').length;
        let penalty = 0;
        if (card.color === 'red' && redCount >= Math.max(2, greenCount + blueCount)) {
            penalty += (redCount - Math.max(greenCount, 1) + 1) * 0.9 * intensity * redFactor;
        }
        if (card.color === 'red' && greenCount + blueCount <= 2) {
            penalty += 0.8 * intensity;
        }
        if (card.color === 'green' && greenCount <= 1 && blueCount === 0) {
            penalty -= 0.4 * intensity;
        }
        if (card.color === 'blue' && blueCount === 0) {
            penalty -= 0.25 * intensity;
        }
        return penalty;
    },

    lateBasicDuplicatePenalty(
        isExpertV2Simple,
        playerCount,
        current,
        option,
        deltaEv,
        shoppingMallName,
        remainingLandmarkCount
    ) {
        if (!isExpertV2Simple || !option || option.type !== 'card' || !option.card) return 0;
        if (playerCount < 4) return 0;
        if (!current || current.landmarks[shoppingMallName]) return 0;
        const remaining = remainingLandmarkCount();
        if (remaining > 4) return 0;
        const card = option.card;
        const basicNames = new Set(['コンビニ', 'ピザ屋', 'バーガーショップ', '食品倉庫']);
        if (!basicNames.has(card.name)) return 0;
        if (current.countCard(card.name) < 2) return 0;
        if (Number.isFinite(deltaEv) && deltaEv > 0.45) return 0;
        return current.countCard(card.name) >= 3 ? 0.75 : 0.45;
    },
    receivedCardValue(card, effects, options) {
        if (card.effect === effects.LOAN) return options.loanValue();
        if (card.effect === effects.RENOVATION) return options.renovationValue();
        const specialValues = options.specialEffectBaseValues || {};
        const baseValue = Object.prototype.hasOwnProperty.call(specialValues, card.effect)
            ? specialValues[card.effect]
            : options.baseValue();
        return options.softCap(baseValue) * options.diceFrequency() + card.cost * 1.4;
    },

    ownedCardValue(receivedValue, card, options) {
        let value = receivedValue;
        if (options.dormant === true) value *= 0.35;
        if (card.color === 'red') value += 1.5;
        if (card.color === 'purple') value += options.purpleBonus || 0;
        value += options.dependencyValue;
        return value;
    },

    isProgressIncomeCard(card, player, effects) {
        if (!card || !player || player.isDormant(card)) return false;
        if (card.color !== 'blue' && card.color !== 'green') return false;
        return ![
            effects.LOAN,
            effects.RENOVATION,
            effects.ITSTARTUP,
            effects.PARK,
            effects.BUSINESS,
            effects.CLEANING,
            effects.MOVER,
        ].includes(card.effect);
    },

    progressIncomeTotal(cards, isEligible, valueForCard) {
        let total = 0;
        for (const card of cards) {
            if (!isEligible(card)) continue;
            total += valueForCard(card);
        }
        return total;
    },

    expertLookaheadSteps(playerCount, remainingLandmarks, phase, buildPhase, simulationMode, baseSteps) {
        let steps = Math.max(2, baseSteps);
        if (remainingLandmarks <= 1) steps += playerCount * 2;
        else if (remainingLandmarks <= 2) steps += playerCount;
        if (phase === buildPhase) steps += 1;
        if (playerCount >= 4 && remainingLandmarks >= 4) steps = Math.max(2, steps - playerCount);
        if (simulationMode === 'fast') steps = Math.max(2, Math.round(steps * 0.8));
        if (simulationMode === 'lite') steps = Math.max(2, Math.round(steps * 0.65));
        return steps;
    },

    shouldHoldForLandmark(landmarkNames, facts = {}) {
        let best = null;
        for (const name of landmarkNames) {
            if (!facts.isEnabled(name) || facts.isBuilt(name)) continue;
            const shortfall = facts.costOf(name) - facts.coins;
            if (shortfall <= 0 || shortfall > facts.maxShortfall) continue;
            const urgency = facts.urgencyOf(name);
            if (!best || urgency > best.urgency || (urgency === best.urgency && shortfall < best.shortfall)) {
                best = { urgency, shortfall };
            }
        }
        if (!best) return false;
        return best.urgency >= 6 && facts.bestCardScore < (best.urgency - best.shortfall) * 1.2;
    },

    landmarkUrgency(name, features, landmarkNames) {
        const values = features || {};
        let urgency = 0;
        if (name === landmarkNames.STATION) {
            urgency = values.builtCount < 2 ? 8 : 5;
        } else if (name === landmarkNames.SHOPPING_MALL) {
            urgency = values.mallCategoryCardCount >= 3 ? 8 : 4;
        } else if (name === landmarkNames.HARBOR) {
            urgency = values.hasHarborCard ? 7 : 3;
        } else if (name === landmarkNames.RADIO_TOWER) {
            urgency = values.builtCount >= 3 || values.opponentMaxBuilt >= 4 ? 8 : 4;
            if (values.isExpert && (values.builtCount >= 2 || values.opponentMaxBuilt >= 3)) urgency += 2;
        } else if (name === landmarkNames.AMUSEMENT_PARK) {
            urgency = values.hasStation ? 5 : 2;
        } else if (name === landmarkNames.AIRPORT) {
            urgency = values.builtCount >= 4 ? 6 : 1;
            if (values.isExpert) {
                if (values.builtCount >= 3) urgency += 3;
                else if (values.builtCount >= 2 && values.stableIncome >= 8) urgency += 2;
            }
        }
        urgency += values.strongUrgencyBonus || 0;
        const bias = name === landmarkNames.AIRPORT ? values.airportBias : values.landmarkBias;
        return Math.round(urgency * bias);
    },

    turnScorePair(hasStation, scoreForDice) {
        let oneTotal = 0;
        for (let dice = 1; dice <= 6; dice++) oneTotal += scoreForDice(dice);
        const one = oneTotal / 6;
        if (!hasStation) return { one, two: -Infinity };

        const weights = { 2:1, 3:2, 4:3, 5:4, 6:5, 7:6, 8:5, 9:4, 10:3, 11:2, 12:1 };
        let totalWeight = 0;
        let totalScore = 0;
        for (const [diceText, weight] of Object.entries(weights)) {
            const dice = parseInt(diceText, 10);
            totalWeight += weight;
            totalScore += scoreForDice(dice) * weight;
        }
        return { one, two: totalWeight > 0 ? totalScore / totalWeight : -Infinity };
    },

    expectedOutcomeValue(outcomes, evaluateOutcome) {
        let totalWeight = 0;
        let totalScore = 0;
        for (const outcome of outcomes) {
            totalWeight += outcome.weight;
            totalScore += evaluateOutcome(outcome) * outcome.weight;
        }
        return totalWeight > 0 ? totalScore / totalWeight : -Infinity;
    },

    shouldUseExpertChoiceLookahead(playerCount, remainingLandmarks, phase, buildPhase, simulationMode) {
        if (simulationMode === 'realtime') {
            if (playerCount >= 4) return false;
            return phase === buildPhase && remainingLandmarks <= 1;
        }
        if (simulationMode === 'lite') return remainingLandmarks <= 1 && phase === buildPhase;
        if (simulationMode === 'fast') return phase === buildPhase || remainingLandmarks <= 2;
        if (playerCount >= 4) return phase === buildPhase && remainingLandmarks <= 2;
        return phase === buildPhase || remainingLandmarks <= 2;
    },

});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUEvaluation };
}
