const CPUEvaluation = Object.freeze({
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

    closestLandmarkShortfall(player, enabledLandmarks, landmarkCost) {
        if (!player || !enabledLandmarks) return Infinity;
        const remaining = [...enabledLandmarks]
            .filter(name => !player.landmarks[name])
            .map(name => landmarkCost(name) - player.coins);
        if (remaining.length === 0) return 0;
        return Math.max(0, Math.min(...remaining));
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

    cardSpamPenalty(card, owned, intensity = 1) {
        if (owned <= 0) return 0;
        let penalty = owned * 0.35 * intensity;
        if (card.color === 'red') penalty += owned * 0.65 * intensity;
        if (card.color === 'purple') penalty += owned * 1.4 * intensity;
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
