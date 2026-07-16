const CPUEvaluation = Object.freeze({
    singleDiceFrequency(diceNums) {
        const weights = {1:1,2:1,3:1,4:1,5:1,6:1};
        return diceNums.reduce((sum, dice) => sum + (weights[dice] || 0), 0);
    },

    doubleDiceFrequency(diceNums) {
        const weights = {1:0,2:1,3:2,4:3,5:4,6:5,7:6,8:5,9:4,10:3,11:2,12:1,13:0,14:0};
        return diceNums.reduce((sum, dice) => sum + (weights[dice] || 0), 0);
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
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUEvaluation };
}
