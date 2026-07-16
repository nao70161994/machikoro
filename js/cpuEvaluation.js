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
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUEvaluation };
}
