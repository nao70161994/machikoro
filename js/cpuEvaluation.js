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
