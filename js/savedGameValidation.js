'use strict';

const SAVED_PENDING_ACTION_BY_FIELD = Object.freeze({
    pendingTV: 'resolveTV',
    pendingBusiness: 'resolveBusiness',
    pendingCleaning: 'resolveCleaning',
    pendingMover: 'resolveMover',
    pendingRenovation: 'resolveRenovation',
});
const MAX_SAVED_PENDING_COUNT = 50;
const MAX_SAVED_LOG_ENTRIES = 30;
const MAX_SAVED_CPU_SPEED = 5000;

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasResolvablePendingTargets(state, options = {}) {
    if (!isPlainObject(state) || !Array.isArray(state.players)) return false;
    const isMajorCardName = typeof options.isMajorCardName === 'function'
        ? options.isMajorCardName
        : (() => false);
    const yakushoName = typeof options.yakushoName === 'string'
        ? options.yakushoName
        : '役所';

    const pendingCleaning = Number.isInteger(state.pendingCleaning) ? state.pendingCleaning : 0;
    if (pendingCleaning > 0) {
        // Older snapshots may omit cards and let GameManager retain its initial cards.
        if (state.players.every(player => player && Array.isArray(player.cards))) {
            const activeMinorNames = new Set();
            for (const player of state.players) {
                const dormantIndices = new Set(Array.isArray(player.dormantIndices)
                    ? player.dormantIndices
                    : []);
                player.cards.forEach((name, index) => {
                    if (!dormantIndices.has(index) && !isMajorCardName(name)) {
                        activeMinorNames.add(name);
                    }
                });
            }
            if (activeMinorNames.size < pendingCleaning) return false;
        }
    }

    const current = state.players[state.currentPlayerIndex];
    const pendingMover = Number.isInteger(state.pendingMover) ? state.pendingMover : 0;
    if (pendingMover > 0 && current && Array.isArray(current.cards)) {
        const minorCardCount = current.cards.filter(name => !isMajorCardName(name)).length;
        if (minorCardCount < pendingMover) return false;
    }

    const pendingRenovation = Number.isInteger(state.pendingRenovation)
        ? state.pendingRenovation
        : 0;
    if (pendingRenovation > 0 && current && isPlainObject(current.landmarks)) {
        const builtTargetCount = Object.entries(current.landmarks)
            .filter(([name, built]) => built === true && name !== yakushoName)
            .length;
        // Remaining consecutive renovation actions are consumed as no-ops after the last target.
        if (builtTargetCount === 0) return false;
        if (Array.isArray(state.pendingActions)) {
            const renovationRunLengths = [];
            let inRenovationRun = false;
            for (const pending of state.pendingActions) {
                if (pending && pending.field === 'pendingRenovation') {
                    if (!inRenovationRun) renovationRunLengths.push(0);
                    const lastIndex = renovationRunLengths.length - 1;
                    renovationRunLengths[lastIndex]++;
                    inRenovationRun = true;
                } else {
                    inRenovationRun = false;
                }
            }
            if (renovationRunLengths.length > 0) {
                // Earlier runs consume every available target; only the final run can auto-consume its tail.
                const requiredTargets = renovationRunLengths
                    .slice(0, -1)
                    .reduce((sum, runLength) => sum + runLength, 0) + 1;
                if (builtTargetCount < requiredTargets) return false;
            }
        }
    }
    return true;
}

function isNonnegativeSafeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
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

function normalizeSavedLog(log) {
    if (!Array.isArray(log)) return [];
    return log
        .filter(entry => isPlainObject(entry) &&
            typeof entry.type === 'string' &&
            typeof entry.message === 'string')
        .slice(-MAX_SAVED_LOG_ENTRIES)
        .map(entry => ({ type: entry.type, message: entry.message }));
}

function reconstructMissingShopStock(state, options = {}) {
    if (!isPlainObject(state) || !Array.isArray(state.players)) return null;
    const cards = Array.isArray(options.cards) ? options.cards : [];
    const getInitialCardStock = typeof options.getInitialCardStock === 'function'
        ? options.getInitialCardStock
        : (() => -1);
    const initialPlayerCardNames = new Set(Array.isArray(options.initialPlayerCardNames)
        ? options.initialPlayerCardNames
        : []);
    const enabledCards = Array.isArray(state.enabledCardsList)
        ? new Set(state.enabledCardsList)
        : new Set(cards.map(card => card && card.name).filter(Boolean));
    const ownedByName = new Map();
    for (const player of state.players) {
        if (!player || !Array.isArray(player.cards)) return null;
        for (const name of player.cards) {
            ownedByName.set(name, (ownedByName.get(name) || 0) + 1);
        }
    }
    const playerCount = state.players.length;
    const stock = {};
    for (const card of cards) {
        if (!card || typeof card.name !== 'string' || !card.name) return null;
        const initialStock = enabledCards.has(card.name)
            ? getInitialCardStock(card, playerCount)
            : 0;
        if (!isNonnegativeSafeInteger(initialStock)) return null;
        const initialGrant = initialPlayerCardNames.has(card.name) ? playerCount : 0;
        const purchased = Math.max(0, (ownedByName.get(card.name) || 0) - initialGrant);
        if (purchased > initialStock) return null;
        stock[card.name] = initialStock - purchased;
    }
    return stock;
}

function createValidator(options = {}) {
    const isKnownCardName = typeof options.isKnownCardName === 'function'
        ? options.isKnownCardName
        : (() => false);
    const isKnownLandmarkName = typeof options.isKnownLandmarkName === 'function'
        ? options.isKnownLandmarkName
        : (() => false);
    const isMajorCardName = typeof options.isMajorCardName === 'function'
        ? options.isMajorCardName
        : (() => false);
    const cardNameById = options.cardNameById && typeof options.cardNameById === 'object'
        ? options.cardNameById
        : Object.freeze({});
    const inventoryValidator = options.inventoryValidator &&
        typeof options.inventoryValidator.validate === 'function'
        ? options.inventoryValidator
        : null;

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
        if (!isNonnegativeSafeInteger(playerState.coins)) return false;
        if (!Array.isArray(playerState.cards) || playerState.cards.some(name => !isKnownCardName(name))) return false;
        const dormantIndices = Array.isArray(playerState.dormantIndices) ? playerState.dormantIndices : [];
        if (new Set(dormantIndices).size !== dormantIndices.length ||
            dormantIndices.some(idx => !Number.isInteger(idx) || idx < 0 ||
                idx >= playerState.cards.length || isMajorCardName(playerState.cards[idx]))) return false;
        if (isPlainObject(playerState.landmarks)) {
            for (const [name, built] of Object.entries(playerState.landmarks)) {
                if (!isKnownLandmarkName(name) || typeof built !== 'boolean') return false;
            }
        } else if (playerState.landmarks != null) {
            return false;
        }
        if (Object.prototype.hasOwnProperty.call(playerState, 'itVentureCoins') &&
            !isNonnegativeSafeInteger(playerState.itVentureCoins)) return false;
        if (Object.prototype.hasOwnProperty.call(playerState, 'hasYakusho') &&
            typeof playerState.hasYakusho !== 'boolean') return false;
        return true;
    }

    function isValidSavedShopStock(shopStock, enabledCardsList) {
        if (!isPlainObject(shopStock)) return false;
        const enabled = Array.isArray(enabledCardsList) ? new Set(enabledCardsList) : null;
        for (const [key, count] of Object.entries(shopStock)) {
            const name = savedShopStockNameFromKey(key);
            if (!name || !isNonnegativeSafeInteger(count)) return false;
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
        if (Object.prototype.hasOwnProperty.call(state, 'lastDiceResult') &&
            (!isNonnegativeSafeInteger(state.lastDiceResult) || state.lastDiceResult > 14)) return false;
        for (const field of ['lastDice1', 'lastDice2']) {
            if (Object.prototype.hasOwnProperty.call(state, field) &&
                (!isNonnegativeSafeInteger(state[field]) || state[field] > 6)) return false;
        }
        if (Object.prototype.hasOwnProperty.call(state, 'turnCount') &&
            !isNonnegativeSafeInteger(state.turnCount)) return false;
        if (Object.prototype.hasOwnProperty.call(state, 'cpuSpeed') &&
            (!isNonnegativeSafeInteger(state.cpuSpeed) ||
            state.cpuSpeed > MAX_SAVED_CPU_SPEED)) return false;
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
        if (Array.isArray(state.enabledLandmarksList)) {
            const enabledLandmarks = new Set(state.enabledLandmarksList);
            for (const playerState of state.players) {
                if (Object.entries(playerState.landmarks || {}).some(([name, built]) =>
                    built === true && !enabledLandmarks.has(name))) return false;
            }
        }
        if (state.shopStock != null && !isValidSavedShopStock(state.shopStock, state.enabledCardsList)) return false;
        if (inventoryValidator && !inventoryValidator.validate({
            playerCount: state.players.length,
            playerCardNames: state.players.map(player => player.cards),
            shopStock: state.shopStock,
            enabledCardNames: state.enabledCardsList,
        })) return false;
        if (!hasResolvablePendingTargets(state, {
            isMajorCardName,
            yakushoName: options.yakushoName,
        })) return false;
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
    maxLogEntries: MAX_SAVED_LOG_ENTRIES,
    maxPendingCount: MAX_SAVED_PENDING_COUNT,
    maxCpuSpeed: MAX_SAVED_CPU_SPEED,
    pendingActionByField: SAVED_PENDING_ACTION_BY_FIELD,
    createValidator,
    hasResolvablePendingTargets,
    normalizeCpuSettings,
    normalizeSavedLog,
    reconstructMissingShopStock,
});

if (typeof module !== 'undefined' && module.exports) module.exports = SavedGameValidation;
if (typeof window !== 'undefined') window.SavedGameValidation = SavedGameValidation;
if (typeof globalThis !== 'undefined') globalThis.SavedGameValidation = SavedGameValidation;
