'use strict';

const MarketSupply = (() => {
    const MODES = Object.freeze({
        STANDARD: 'standard',
        TEN_TYPE: 'ten-type',
    });
    const DEFAULT_MODE = MODES.STANDARD;
    const TARGET_TYPE_COUNT = 10;
    const LOW_DECK_THRESHOLD = 10;
    const MAX_REFILL_HISTORY = 20;

    function safeNonnegativeInteger(value, fallback = 0) {
        return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
    }

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

    function summarizeCardNames(names) {
        const counts = new Map();
        for (const name of names || []) {
            if (typeof name !== 'string') continue;
            counts.set(name, (counts.get(name) || 0) + 1);
        }
        return Array.from(counts, ([name, count]) => count > 1 ? `${name}×${count}` : name).join('、');
    }

    function refillContext(value) {
        const source = value && typeof value === 'object' ? value : {};
        return Object.freeze({
            turnCount: Number.isSafeInteger(source.turnCount) && source.turnCount >= 0
                ? source.turnCount : null,
            playerIndex: Number.isSafeInteger(source.playerIndex) && source.playerIndex >= 0 &&
                source.playerIndex <= 9 ? source.playerIndex : null,
        });
    }

    function recordRefill(state, revealedNames, context = {}) {
        if (!state || state.mode !== MODES.TEN_TYPE || !Array.isArray(revealedNames) ||
                revealedNames.length === 0) return;
        const previousSequence = Number.isSafeInteger(state.refillSequence) && state.refillSequence >= 0
            ? state.refillSequence : 0;
        state.refillSequence = previousSequence < Number.MAX_SAFE_INTEGER
            ? previousSequence + 1 : previousSequence;
        const history = Array.isArray(state.refillHistory) ? state.refillHistory : [];
        const normalizedContext = refillContext(context);
        const historyEntry = {
            sequence: state.refillSequence,
            cardNames: revealedNames.slice(),
        };
        if (normalizedContext.turnCount !== null) historyEntry.turnCount = normalizedContext.turnCount;
        if (normalizedContext.playerIndex !== null) historyEntry.playerIndex = normalizedContext.playerIndex;
        history.push(historyEntry);
        state.refillHistory = history.slice(-MAX_REFILL_HISTORY);
        const previousRevealed = safeNonnegativeInteger(state.revealedCardCount);
        state.revealedCardCount = Math.min(
            Number.MAX_SAFE_INTEGER,
            previousRevealed + revealedNames.length
        );
        state.pendingHighlightNames = revealedNames.slice();
    }

    function consumePendingHighlightNames(state) {
        if (!state || !Array.isArray(state.pendingHighlightNames)) return [];
        const names = state.pendingHighlightNames.slice();
        state.pendingHighlightNames = [];
        return names;
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
            refillSequence: 0,
            refillHistory: [],
            revealedCardCount: 0,
            totalsComplete: true,
        };
        refill(state, stock);
        state.revealedCardCount = supplyCards.length - state.deck.length;
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
            refillSequence: Number.isSafeInteger(value && value.refillSequence) &&
                value.refillSequence >= 0 ? value.refillSequence : 0,
            refillHistory: Array.isArray(value && value.refillHistory)
                ? value.refillHistory.slice(-MAX_REFILL_HISTORY).map(entry => {
                    const copy = {
                        sequence: Number.isSafeInteger(entry && entry.sequence) && entry.sequence >= 0
                            ? entry.sequence : 0,
                        cardNames: Array.isArray(entry && entry.cardNames)
                            ? entry.cardNames.filter(name => typeof name === 'string').slice()
                            : [],
                    };
                    if (Number.isSafeInteger(entry && entry.turnCount) && entry.turnCount >= 0) {
                        copy.turnCount = entry.turnCount;
                    }
                    if (Number.isSafeInteger(entry && entry.playerIndex) &&
                            entry.playerIndex >= 0 && entry.playerIndex <= 9) {
                        copy.playerIndex = entry.playerIndex;
                    }
                    return copy;
                })
                : [],
            revealedCardCount: safeNonnegativeInteger(
                value && value.revealedCardCount,
                Array.isArray(value && value.refillHistory)
                    ? value.refillHistory.reduce((total, entry) => total +
                        (Array.isArray(entry && entry.cardNames) ? entry.cardNames.length : 0), 0)
                    : 0
            ),
            totalsComplete: !!value && value.totalsComplete === true &&
                Number.isSafeInteger(value.revealedCardCount) && value.revealedCardCount >= 0,
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
        if (!(value.targetTypeCount > 0 || value.deck.length === 0) || value.deck.length > 1000 ||
                !value.deck.every(name => typeof name === 'string' && isKnown(name))) return false;
        if (value.refillSequence !== undefined && (!Number.isSafeInteger(value.refillSequence) ||
                value.refillSequence < 0)) return false;
        if (value.revealedCardCount !== undefined && (!Number.isSafeInteger(value.revealedCardCount) ||
                value.revealedCardCount < 0)) return false;
        if (value.totalsComplete !== undefined && typeof value.totalsComplete !== 'boolean') return false;
        if (value.refillHistory === undefined) return true;
        return Array.isArray(value.refillHistory) && value.refillHistory.length <= MAX_REFILL_HISTORY &&
            value.refillHistory.every(entry => entry && typeof entry === 'object' &&
                !Array.isArray(entry) && Number.isSafeInteger(entry.sequence) && entry.sequence >= 0 &&
                (entry.turnCount === undefined || Number.isSafeInteger(entry.turnCount) &&
                    entry.turnCount >= 0) &&
                (entry.playerIndex === undefined || entry.playerIndex === null ||
                    Number.isSafeInteger(entry.playerIndex) && entry.playerIndex >= 0 &&
                    entry.playerIndex <= 9) &&
                Array.isArray(entry.cardNames) && entry.cardNames.length <= 1000 &&
                entry.cardNames.every(name => typeof name === 'string' && isKnown(name)));
    }

    function purchaseResult(state, shopStock, cardRef, context = {}) {
        const cardName = typeof cardRef === 'string' ? cardRef : cardRef && cardRef.name;
        if (!cardName || !shopStock || !Number.isInteger(shopStock[cardName]) || shopStock[cardName] <= 0) {
            return Object.freeze({ ok: false, revealedNames: Object.freeze([]) });
        }
        const deckCountBefore = Array.isArray(state && state.deck) ? state.deck.length : 0;
        shopStock[cardName]--;
        const revealedNames = refillNames(state, shopStock);
        recordRefill(state, revealedNames, context);
        const deckCountAfter = Array.isArray(state && state.deck) ? state.deck.length : 0;
        return Object.freeze({
            ok: true,
            revealedNames: Object.freeze(revealedNames),
            lowDeckReached: state && state.mode === MODES.TEN_TYPE &&
                deckCountBefore > LOW_DECK_THRESHOLD && deckCountAfter <= LOW_DECK_THRESHOLD,
            deckExhausted: state && state.mode === MODES.TEN_TYPE &&
                deckCountBefore > 0 && deckCountAfter === 0,
            deckCount: deckCountAfter,
        });
    }

    function purchase(state, shopStock, cardRef) {
        return purchaseResult(state, shopStock, cardRef).ok;
    }

    function decrementGameShopStock(game, shopStock, cardRef) {
        const result = purchaseResult(game && game.marketSupply, shopStock, cardRef, {
            turnCount: game && game.turnCount,
            playerIndex: game && game.currentPlayerIndex,
        });
        if (result.ok && result.revealedNames.length > 0 &&
                game && typeof game.addMarketRefillLog === 'function') {
            game.addMarketRefillLog(result.revealedNames);
        }
        if (result.ok && game && typeof game.addMarketDeckStatusLog === 'function') {
            if (result.deckExhausted) game.addMarketDeckStatusLog('empty', 0);
            else if (result.lowDeckReached) game.addMarketDeckStatusLog('low', result.deckCount);
        }
        return result.ok;
    }

    return Object.freeze({
        DEFAULT_MODE,
        LOW_DECK_THRESHOLD,
        MAX_REFILL_HISTORY,
        MODES,
        TARGET_TYPE_COUNT,
        consumePendingHighlightNames,
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
        summarizeCardNames,
        shuffled,
    });
})();

function decrementMarketShopStock(game, shopStock, cardRef) {
    return MarketSupply.decrementGameShopStock(game, shopStock, cardRef);
}

if (typeof module !== 'undefined' && module.exports) module.exports = MarketSupply;
if (typeof window !== 'undefined') Object.assign(window, { MarketSupply, decrementMarketShopStock });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { MarketSupply, decrementMarketShopStock });
