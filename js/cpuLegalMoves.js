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

    affordableCards(player, shopStock, cards) {
        return cards.filter(card =>
            shopStock[card.name] > 0 &&
            player.coins >= card.cost &&
            !(card.color === 'purple' && player.countCardIncludingDormant(card.name) > 0)
        );
    },
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPULegalMoves };
}
if (typeof window !== 'undefined') window.CPULegalMoves = CPULegalMoves;
if (typeof globalThis !== 'undefined') globalThis.CPULegalMoves = CPULegalMoves;
