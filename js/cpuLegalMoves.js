'use strict';

const CPULegalMoves = Object.freeze({
    affordableLandmarkNames(
        player,
        enabledLandmarks,
        landmarkNames,
        landmarkCost,
        includeAllWhenEnabledMissing = true
    ) {
        return landmarkNames.filter(name =>
            (enabledLandmarks ? enabledLandmarks.has(name) : includeAllWhenEnabledMissing) &&
            !player.landmarks[name] &&
            player.coins >= landmarkCost(name)
        );
    },

    remainingEnabledLandmarkNames(player, enabledLandmarks, landmarkNames) {
        return landmarkNames.filter(name =>
            (!enabledLandmarks || enabledLandmarks.has(name)) && !player.landmarks[name]
        );
    },

    isEndgame(player, enabledLandmarks, landmarkNames, threshold = 2) {
        return this.remainingEnabledLandmarkNames(player, enabledLandmarks, landmarkNames).length <= threshold;
    },

    affordableCards(player, shopStock, cards) {
        return cards.filter(card =>
            shopStock[card.name] > 0 &&
            player.coins >= card.cost &&
            !(card.color === 'purple' && player.countCardIncludingDormant(card.name) > 0)
        );
    },

    expertBuildOptions(landmarkNames, rankedCards, candidateLimit, cardReady) {
        const options = [{ type: 'skip' }];
        for (const name of landmarkNames) {
            options.push({ type: 'landmark', name });
        }
        for (const entry of rankedCards.slice(0, candidateLimit)) {
            if (!cardReady(entry.card)) continue;
            options.push({ type: 'card', cardName: entry.card.name });
        }
        return options;
    },

    strongBuildOptions(landmarkNames, rankedCards, context) {
        const options = landmarkNames.map(name => ({ type: 'landmark', name }));
        for (const entry of rankedCards) {
            const card = entry.card;
            if (context.playerCount >= 4 && context.builtLandmarkCount < 4) {
                if (card.color === 'purple') continue;
                if (!context.attackUnlocked && card.color === 'red') continue;
                if (context.oneDieOpponentCount >= 2 && Math.min(...card.diceNums) >= 7 &&
                    (card.color === 'blue' || card.color === 'green')) continue;
            } else if (!context.attackUnlocked && (card.color === 'red' || card.color === 'purple')) {
                continue;
            }
            options.push({ type: 'card', cardName: card.name });
            if (options.length >= 6) break;
        }
        if (options.length === 0 && rankedCards[0]) {
            options.push({ type: 'card', cardName: rankedCards[0].card.name });
        }
        return options;
    },

    disruptionTargetIndexes(players, currentIndex, estimateThreat, prune = false) {
        if (!Array.isArray(players)) return [];
        const indexes = players
            .map((player, index) => ({ player, index }))
            .filter(entry => entry.index !== currentIndex)
            .sort((a, b) => {
                const threatDiff = estimateThreat(b.player) - estimateThreat(a.player);
                if (threatDiff !== 0) return threatDiff;
                return b.player.coins - a.player.coins;
            })
            .map(entry => entry.index);
        return prune ? indexes.slice(0, 2) : indexes;
    },

    disruptionCleaningNames(players, activeMinorCards, cardValue, prune = false) {
        if (!Array.isArray(players)) return [];
        const allNames = [...new Set(players.flatMap(player =>
            activeMinorCards(player).map(card => card.name)))];
        if (!prune) return allNames;
        return allNames
            .map(name => ({
                name,
                score: players.reduce((sum, player) => sum + activeMinorCards(player)
                    .filter(card => card.name === name)
                    .reduce((inner, card) => inner + cardValue(card, player), 0), 0),
            }))
            .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
            .slice(0, 3)
            .map(entry => entry.name);
    },

    lookaheadStrongOpponentIndexes(players, focusIndex, mode, estimateThreat) {
        if (!Array.isArray(players) || players.length < 4) return [];
        const opponents = players
            .map((player, index) => ({ player, index }))
            .filter(entry => entry.index !== focusIndex);
        if (mode === 'next-seat') return [(focusIndex + 1) % players.length];
        if (mode === 'leader' || mode === 'top-two') {
            const ranked = opponents.slice().sort((a, b) =>
                estimateThreat(b.player) - estimateThreat(a.player));
            return ranked
                .slice(0, mode === 'leader' ? 1 : 2)
                .map(entry => entry.index);
        }
        return opponents.map(entry => entry.index);
    },
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPULegalMoves };
}
if (typeof window !== 'undefined') window.CPULegalMoves = CPULegalMoves;
if (typeof globalThis !== 'undefined') globalThis.CPULegalMoves = CPULegalMoves;
