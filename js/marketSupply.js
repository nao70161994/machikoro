'use strict';

const MarketSupply = (() => {
    const MODES = Object.freeze({
        STANDARD: 'standard',
        TEN_TYPE: 'ten-type',
    });
    const DEFAULT_MODE = MODES.STANDARD;
    const TARGET_TYPE_COUNT = 10;

    function normalizeMode(value) {
        return value === MODES.TEN_TYPE ? MODES.TEN_TYPE : DEFAULT_MODE;
    }

    function normalizeSeed(value) {
        return Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff
            ? value >>> 0 : 0;
    }

    function createRandom(seed) {
        let state = normalizeSeed(seed);
        return function random() {
            state = (state + 0x6d2b79f5) >>> 0;
            let value = state;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    }

    function shuffled(values, seed) {
        const result = Array.from(values || []);
        const random = createRandom(seed);
        for (let index = result.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(random() * (index + 1));
            [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
        }
        return result;
    }

    function marketTypeCount(shopStock) {
        return Object.values(shopStock || {}).filter(count => Number.isInteger(count) && count > 0).length;
    }

    function refillNames(state, shopStock) {
        if (!state || state.mode !== MODES.TEN_TYPE || !Array.isArray(state.deck) || !shopStock) {
            return [];
        }
        const revealedNames = [];
        while (state.deck.length > 0 && marketTypeCount(shopStock) < state.targetTypeCount) {
            const cardName = state.deck.shift();
            if (typeof cardName !== 'string' || !Object.prototype.hasOwnProperty.call(shopStock, cardName)) {
                continue;
            }
            shopStock[cardName] = Math.max(0, Number(shopStock[cardName]) || 0) + 1;
            revealedNames.push(cardName);
        }
        return revealedNames;
    }

    function refill(state, shopStock) {
        return refillNames(state, shopStock).length;
    }

    function initialize(options = {}) {
        const cards = Array.from(options.cards || []);
        const enabledNames = new Set(options.enabledCardNames || cards.map(card => card.name));
        const playerCount = Number.isInteger(options.playerCount) ? options.playerCount : 0;
        const seed = normalizeSeed(options.seed);
        const mode = normalizeMode(options.mode);
        const stock = options.shopStock || {};
        const initialStock = typeof options.initialStock === 'function'
            ? options.initialStock : (() => 0);
        const setStock = typeof options.setStock === 'function'
            ? options.setStock
            : (target, card, count) => { target[card.name] = count; };
        const enabledCards = cards.filter(card => card && enabledNames.has(card.name));
        if (mode === MODES.STANDARD) {
            for (const card of cards) {
                setStock(stock, card, enabledNames.has(card.name) ? initialStock(card, playerCount) : 0);
            }
            return { mode, seed, targetTypeCount: 0, deck: [] };
        }
        for (const card of cards) setStock(stock, card, 0);
        const supplyCards = [];
        for (const card of enabledCards) {
            const count = initialStock(card, playerCount);
            for (let index = 0; index < count; index++) supplyCards.push(card.name);
        }
        const state = {
            mode,
            seed,
            targetTypeCount: Math.min(TARGET_TYPE_COUNT, enabledCards.length),
            deck: shuffled(supplyCards, seed),
        };
        refill(state, stock);
        return state;
    }

    function copyState(value) {
        const mode = normalizeMode(value && value.mode);
        if (mode === MODES.STANDARD) {
            return { mode, seed: 0, targetTypeCount: 0, deck: [] };
        }
        return {
            mode,
            seed: normalizeSeed(value && value.seed),
            targetTypeCount: Number.isInteger(value && value.targetTypeCount)
                ? Math.min(TARGET_TYPE_COUNT, Math.max(0, value.targetTypeCount))
                : TARGET_TYPE_COUNT,
            deck: Array.isArray(value && value.deck)
                ? value.deck.filter(name => typeof name === 'string').slice()
                : [],
        };
    }

    function isValidState(value, knownCardNames = null) {
        if (value == null) return true;
        if (!value || typeof value !== 'object' || Array.isArray(value) ||
                normalizeMode(value.mode) !== value.mode ||
                !Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff ||
                !Number.isInteger(value.targetTypeCount) || value.targetTypeCount < 0 ||
                value.targetTypeCount > TARGET_TYPE_COUNT || !Array.isArray(value.deck)) return false;
        if (value.mode === MODES.STANDARD) {
            return value.targetTypeCount === 0 && value.deck.length === 0;
        }
        const knownNames = knownCardNames != null && typeof knownCardNames !== 'function'
            ? new Set(knownCardNames)
            : null;
        const isKnown = typeof knownCardNames === 'function'
            ? knownCardNames
            : (knownNames == null
                ? () => true
                : name => knownNames.has(name));
        return (value.targetTypeCount > 0 || value.deck.length === 0) && value.deck.length <= 1000 &&
            value.deck.every(name => typeof name === 'string' && isKnown(name));
    }

    function purchaseResult(state, shopStock, cardRef) {
        const cardName = typeof cardRef === 'string' ? cardRef : cardRef && cardRef.name;
        if (!cardName || !shopStock || !Number.isInteger(shopStock[cardName]) || shopStock[cardName] <= 0) {
            return Object.freeze({ ok: false, revealedNames: Object.freeze([]) });
        }
        shopStock[cardName]--;
        return Object.freeze({
            ok: true,
            revealedNames: Object.freeze(refillNames(state, shopStock)),
        });
    }

    function purchase(state, shopStock, cardRef) {
        return purchaseResult(state, shopStock, cardRef).ok;
    }

    function decrementGameShopStock(game, shopStock, cardRef) {
        const result = purchaseResult(game && game.marketSupply, shopStock, cardRef);
        if (result.ok && result.revealedNames.length > 0 &&
                game && typeof game.addMarketRefillLog === 'function') {
            game.addMarketRefillLog(result.revealedNames);
        }
        return result.ok;
    }

    return Object.freeze({
        DEFAULT_MODE,
        MODES,
        TARGET_TYPE_COUNT,
        copyState,
        createRandom,
        decrementGameShopStock,
        initialize,
        isValidState,
        marketTypeCount,
        normalizeMode,
        normalizeSeed,
        purchase,
        purchaseResult,
        refill,
        shuffled,
    });
})();

function decrementMarketShopStock(game, shopStock, cardRef) {
    return MarketSupply.decrementGameShopStock(game, shopStock, cardRef);
}

if (typeof module !== 'undefined' && module.exports) module.exports = MarketSupply;
if (typeof window !== 'undefined') Object.assign(window, { MarketSupply, decrementMarketShopStock });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { MarketSupply, decrementMarketShopStock });
