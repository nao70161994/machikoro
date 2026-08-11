'use strict';

const SAVED_PENDING_ACTION_BY_FIELD = Object.freeze({
    pendingTV: 'resolveTV',
    pendingBusiness: 'resolveBusiness',
    pendingCleaning: 'resolveCleaning',
    pendingMover: 'resolveMover',
    pendingRenovation: 'resolveRenovation',
});
const MAX_SAVED_PENDING_COUNT = 50;

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCpuSettings(state) {
    const defaults = state.players.map((_, index) => index === 0 ? null : { difficulty: 'normal' });
    if (!Array.isArray(state.cpuSettings)) return defaults;
    return state.players.map((_, index) => {
        const setting = state.cpuSettings[index];
        if (setting === undefined) return defaults[index];
        if (!setting) return null;
        if (typeof setting === 'string') return { difficulty: setting };
        return {
            difficulty: setting.difficulty || 'normal',
            rlModelId: setting.rlModelId || setting.modelId || null,
        };
    });
}

function createValidator(options = {}) {
    const isKnownCardName = typeof options.isKnownCardName === 'function'
        ? options.isKnownCardName
        : (() => false);
    const isKnownLandmarkName = typeof options.isKnownLandmarkName === 'function'
        ? options.isKnownLandmarkName
        : (() => false);
    const cardNameById = options.cardNameById && typeof options.cardNameById === 'object'
        ? options.cardNameById
        : Object.freeze({});

    function savedShopStockNameFromKey(key) {
        if (isKnownCardName(key)) return key;
        const mappedName = cardNameById[key];
        return mappedName && isKnownCardName(mappedName) ? mappedName : null;
    }

    function isValidSavedPendingActions(state) {
        if (!Object.prototype.hasOwnProperty.call(state, 'pendingActions')) return true;
        if (!Array.isArray(state.pendingActions) ||
            state.pendingActions.length > MAX_SAVED_PENDING_COUNT) return false;
        const counts = Object.fromEntries(Object.keys(SAVED_PENDING_ACTION_BY_FIELD).map(field => [field, 0]));
        for (const pending of state.pendingActions) {
            if (!isPlainObject(pending)) return false;
            const expectedAction = SAVED_PENDING_ACTION_BY_FIELD[pending.field];
            if (!expectedAction || pending.action !== expectedAction) return false;
            counts[pending.field]++;
        }
        return Object.keys(SAVED_PENDING_ACTION_BY_FIELD).every(field =>
            counts[field] === (Number.isInteger(state[field]) ? state[field] : 0)
        );
    }

    function isValidSavedPlayerState(playerState) {
        if (!isPlainObject(playerState)) return false;
        if (typeof playerState.name !== 'string') return false;
        if (!Number.isInteger(playerState.coins) || playerState.coins < 0) return false;
        if (!Array.isArray(playerState.cards) || playerState.cards.some(name => !isKnownCardName(name))) return false;
        const dormantIndices = Array.isArray(playerState.dormantIndices) ? playerState.dormantIndices : [];
        if (new Set(dormantIndices).size !== dormantIndices.length ||
            dormantIndices.some(idx => !Number.isInteger(idx) || idx < 0 || idx >= playerState.cards.length)) return false;
        if (isPlainObject(playerState.landmarks)) {
            for (const [name, built] of Object.entries(playerState.landmarks)) {
                if (!isKnownLandmarkName(name) || typeof built !== 'boolean') return false;
            }
        } else if (playerState.landmarks != null) {
            return false;
        }
        if (Object.prototype.hasOwnProperty.call(playerState, 'itVentureCoins') &&
            (!Number.isInteger(playerState.itVentureCoins) || playerState.itVentureCoins < 0)) return false;
        if (Object.prototype.hasOwnProperty.call(playerState, 'hasYakusho') &&
            typeof playerState.hasYakusho !== 'boolean') return false;
        return true;
    }

    function isValidSavedShopStock(shopStock, enabledCardsList) {
        if (!isPlainObject(shopStock)) return false;
        const enabled = Array.isArray(enabledCardsList) ? new Set(enabledCardsList) : null;
        for (const [key, count] of Object.entries(shopStock)) {
            const name = savedShopStockNameFromKey(key);
            if (!name || !Number.isInteger(count) || count < 0) return false;
            if (enabled && !enabled.has(name) && count !== 0) return false;
        }
        return true;
    }

    function isValidSavedGameState(state) {
        if (!isPlainObject(state)) return false;
        if (!Array.isArray(state.players) || state.players.length < 2 || state.players.length > 10) return false;
        if (!Number.isInteger(state.currentPlayerIndex) ||
            state.currentPlayerIndex < 0 ||
            state.currentPlayerIndex >= state.players.length) return false;
        const phases = new Set(['roll', 'selectDice', 'rerollConfirm', 'harborChoice', 'pending', 'build']);
        if (typeof state.phase !== 'string' || !phases.has(state.phase)) return false;
        if (state.log != null && !Array.isArray(state.log)) return false;
        for (const field of ['lastDiceResult', 'lastDice1', 'lastDice2', 'turnCount']) {
            if (Object.prototype.hasOwnProperty.call(state, field) &&
                (!Number.isInteger(state[field]) || state[field] < 0)) return false;
        }
        let pendingFieldTotal = 0;
        for (const field of ['pendingTV', 'pendingBusiness', 'pendingCleaning', 'pendingMover', 'pendingRenovation']) {
            if (Object.prototype.hasOwnProperty.call(state, field) &&
                (!Number.isInteger(state[field]) || state[field] < 0 ||
                state[field] > MAX_SAVED_PENDING_COUNT)) return false;
            pendingFieldTotal += Number.isInteger(state[field]) ? state[field] : 0;
        }
        if (pendingFieldTotal > MAX_SAVED_PENDING_COUNT) return false;
        if (state.phase !== 'pending' && pendingFieldTotal > 0) return false;
        if (!isValidSavedPendingActions(state)) return false;
        for (const field of ['builtThisTurn', 'pendingIT', 'usedReroll', 'hadAmusementParkAtRoll']) {
            if (Object.prototype.hasOwnProperty.call(state, field) &&
                typeof state[field] !== 'boolean') return false;
        }
        if (state.pendingIT === true && state.phase !== 'pending') return false;
        if (state.phase === 'pending' &&
            ((state.pendingIT === true) === (pendingFieldTotal > 0))) return false;
        if (Object.prototype.hasOwnProperty.call(state, 'pendingTunaDice') &&
            state.pendingTunaDice !== null &&
            (!Array.isArray(state.pendingTunaDice) ||
            state.pendingTunaDice.length !== 2 ||
            state.pendingTunaDice.some(value => !Number.isInteger(value) || value < 1 || value > 6))) return false;
        if (state.enabledLandmarksList != null &&
            (!Array.isArray(state.enabledLandmarksList) ||
            state.enabledLandmarksList.length === 0 ||
            state.enabledLandmarksList.some(name => !isKnownLandmarkName(name)))) return false;
        if (state.enabledCardsList != null &&
            (!Array.isArray(state.enabledCardsList) ||
            state.enabledCardsList.some(name => !isKnownCardName(name)))) return false;
        for (const playerState of state.players) {
            if (!isValidSavedPlayerState(playerState)) return false;
        }
        if (state.shopStock != null && !isValidSavedShopStock(state.shopStock, state.enabledCardsList)) return false;
        return true;
    }

    return Object.freeze({
        isValidSavedGameState,
        isValidSavedPendingActions,
        isValidSavedPlayerState,
        isValidSavedShopStock,
        savedShopStockNameFromKey,
    });
}

const SavedGameValidation = Object.freeze({
    maxPendingCount: MAX_SAVED_PENDING_COUNT,
    pendingActionByField: SAVED_PENDING_ACTION_BY_FIELD,
    createValidator,
    normalizeCpuSettings,
});

if (typeof module !== 'undefined' && module.exports) module.exports = SavedGameValidation;
if (typeof window !== 'undefined') window.SavedGameValidation = SavedGameValidation;
if (typeof globalThis !== 'undefined') globalThis.SavedGameValidation = SavedGameValidation;
