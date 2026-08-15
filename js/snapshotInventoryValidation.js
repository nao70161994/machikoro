'use strict';

const SnapshotInventoryValidation = (() => {
    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function createValidator(options = {}) {
        const cards = Array.isArray(options.cards) ? options.cards : [];
        const getInitialCardStock = typeof options.getInitialCardStock === 'function'
            ? options.getInitialCardStock
            : (() => -1);
        const isMajorCard = typeof options.isMajorCard === 'function'
            ? options.isMajorCard
            : (() => false);
        const initialPlayerCardNames = new Set(Array.isArray(options.initialPlayerCardNames)
            ? options.initialPlayerCardNames
            : []);
        const cardByName = new Map();
        const cardNameByStockKey = new Map();
        for (const card of cards) {
            if (!card || typeof card.name !== 'string' || !card.name || cardByName.has(card.name)) continue;
            cardByName.set(card.name, card);
            cardNameByStockKey.set(card.name, card.name);
            if (typeof card.id === 'string' && card.id) cardNameByStockKey.set(card.id, card.name);
        }

        function validate(input = {}) {
            const playerCount = input.playerCount;
            const playerCardNames = input.playerCardNames;
            if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 10 ||
                    !Array.isArray(playerCardNames) || playerCardNames.length !== playerCount) return false;
            const enabled = input.enabledCardNames == null
                ? new Set(cardByName.keys())
                : new Set(Array.isArray(input.enabledCardNames) ? input.enabledCardNames : []);
            if (Array.from(enabled).some(name => !cardByName.has(name))) return false;

            const ownedByName = new Map();
            for (const names of playerCardNames) {
                if (!Array.isArray(names)) return false;
                const majorCounts = new Map();
                for (const name of names) {
                    const card = cardByName.get(name);
                    if (!card) return false;
                    if (!enabled.has(name) && !initialPlayerCardNames.has(name)) return false;
                    ownedByName.set(name, (ownedByName.get(name) || 0) + 1);
                    if (isMajorCard(card)) {
                        const count = (majorCounts.get(name) || 0) + 1;
                        if (count > 1) return false;
                        majorCounts.set(name, count);
                    }
                }
            }

            const explicitStockByName = new Map();
            if (input.shopStock != null) {
                if (!isPlainObject(input.shopStock)) return false;
                for (const [key, count] of Object.entries(input.shopStock)) {
                    const name = cardNameByStockKey.get(key);
                    if (!name || explicitStockByName.has(name) ||
                            !Number.isSafeInteger(count) || count < 0) return false;
                    explicitStockByName.set(name, count);
                }
            }

            const marketSupply = input.marketSupply;
            const tenTypeMarket = marketSupply && marketSupply.mode === 'ten-type';
            const deckByName = new Map();
            if (tenTypeMarket) {
                if (!Array.isArray(marketSupply.deck)) return false;
                for (const name of marketSupply.deck) {
                    if (!cardByName.has(name) || !enabled.has(name)) return false;
                    deckByName.set(name, (deckByName.get(name) || 0) + 1);
                }
                const expectedTypeCount = Math.min(10, enabled.size);
                if (marketSupply.targetTypeCount !== expectedTypeCount) return false;
                const visibleTypeCount = Array.from(explicitStockByName.values())
                    .filter(count => count > 0).length;
                if (visibleTypeCount > expectedTypeCount ||
                        marketSupply.deck.length > 0 && visibleTypeCount !== expectedTypeCount) {
                    return false;
                }
            }

            for (const [name, card] of cardByName.entries()) {
                const shopLimit = enabled.has(name) ? getInitialCardStock(card, playerCount) : 0;
                if (!Number.isSafeInteger(shopLimit) || shopLimit < 0) return false;
                const grantLimit = initialPlayerCardNames.has(name) ? playerCount : 0;
                const ownedLimit = shopLimit + grantLimit;
                const owned = ownedByName.get(name) || 0;
                if (owned > ownedLimit) return false;
                if (isMajorCard(card) && owned > playerCount) return false;
                if (explicitStockByName.has(name)) {
                    const stock = explicitStockByName.get(name);
                    if (stock > shopLimit || owned + stock > ownedLimit) return false;
                }
                if (tenTypeMarket) {
                    if (!explicitStockByName.has(name) || owned < grantLimit) return false;
                    const purchased = owned - grantLimit;
                    const stock = explicitStockByName.get(name);
                    const deck = deckByName.get(name) || 0;
                    if (purchased + stock + deck !== shopLimit) return false;
                }
            }
            return true;
        }

        return Object.freeze({ validate });
    }

    return Object.freeze({ createValidator });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SnapshotInventoryValidation;
if (typeof globalThis !== 'undefined') globalThis.SnapshotInventoryValidation = SnapshotInventoryValidation;
