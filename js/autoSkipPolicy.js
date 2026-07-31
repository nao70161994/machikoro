'use strict';

const AutoSkipPolicy = (() => {
    function buildAvailability(options) {
        const {
            cards,
            current,
            shopStock,
            getStockCount,
            enabledLandmarks,
            yakushoName,
            landmarkCost,
        } = options;

        const canAffordCard = cards.some(card =>
            getStockCount(shopStock, card) > 0 &&
            current.coins >= card.cost &&
            !(card.color === 'purple' && current.countCardIncludingDormant(card.name) > 0)
        );
        const canAffordLandmark = Object.entries(current.landmarks)
            .some(([name, built]) =>
                enabledLandmarks.has(name) &&
                !built &&
                name !== yakushoName &&
                current.coins >= landmarkCost(name)
            );

        return Object.freeze({
            canAffordCard,
            canAffordLandmark,
            canAffordAny: canAffordCard || canAffordLandmark,
        });
    }

    return Object.freeze({ buildAvailability });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AutoSkipPolicy;
if (typeof window !== 'undefined') window.AutoSkipPolicy = AutoSkipPolicy;
if (typeof globalThis !== 'undefined') globalThis.AutoSkipPolicy = AutoSkipPolicy;
