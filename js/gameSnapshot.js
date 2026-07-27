'use strict';

const GAME_SNAPSHOT_SCHEMA_VERSION = 1;
const GAME_SNAPSHOT_LEGACY_VERSION = 0;
const GAME_SNAPSHOT_DEFAULT_LOG_LIMIT = 30;

/**
 * @typedef {Object} GameSnapshotEnvelope
 * @property {number} schemaVersion
 * @property {Object} snapshot
 */

function snapshotVersionOf(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (!Object.prototype.hasOwnProperty.call(value, 'schemaVersion')) {
        return GAME_SNAPSHOT_LEGACY_VERSION;
    }
    return Number.isInteger(value.schemaVersion) ? value.schemaVersion : null;
}

function isSupportedSnapshotVersion(version) {
    return version === GAME_SNAPSHOT_LEGACY_VERSION ||
        version === GAME_SNAPSHOT_SCHEMA_VERSION;
}

function createSnapshotEnvelope(snapshot) {
    return {
        schemaVersion: GAME_SNAPSHOT_SCHEMA_VERSION,
        snapshot,
    };
}

function readSnapshotEnvelope(value) {
    const version = snapshotVersionOf(value);
    if (version === GAME_SNAPSHOT_LEGACY_VERSION) {
        return { ok: true, schemaVersion: version, snapshot: value, legacy: true };
    }
    if (version !== GAME_SNAPSHOT_SCHEMA_VERSION ||
            !value ||
            !value.snapshot ||
            typeof value.snapshot !== 'object' ||
            Array.isArray(value.snapshot)) {
        return { ok: false, schemaVersion: version, snapshot: null, legacy: false };
    }
    return { ok: true, schemaVersion: version, snapshot: value.snapshot, legacy: false };
}

function copyRecentLog(log, limit) {
    if (!Array.isArray(log) || limit === 0) return [];
    return log.slice(-limit);
}

function serializeGameState(game, shopStock, options = {}) {
    const logLimit = Number.isInteger(options.logLimit) && options.logLimit >= 0
        ? options.logLimit
        : GAME_SNAPSHOT_DEFAULT_LOG_LIMIT;
    const pendingActionsFor = typeof options.pendingActionsFor === 'function'
        ? options.pendingActionsFor
        : () => [];
    return {
        players: game.players.map(player => ({
            name: player.name,
            coins: player.coins,
            cards: player.cards.map(card => card.name),
            dormantIndices: player.dormantCards
                .map(card => player.cards.indexOf(card))
                .filter(index => index >= 0),
            landmarks: Object.assign({}, player.landmarks),
            itVentureCoins: player.itVentureCoins,
            hasYakusho: player.hasYakusho,
        })),
        currentPlayerIndex: game.currentPlayerIndex,
        phase: game.phase,
        log: copyRecentLog(game.log, logLimit),
        lastDiceResult: game.lastDiceResult,
        lastDice1: game.lastDice1,
        lastDice2: game.lastDice2,
        builtThisTurn: game.builtThisTurn,
        pendingTV: game.pendingTV,
        pendingBusiness: game.pendingBusiness,
        pendingCleaning: game.pendingCleaning,
        pendingMover: game.pendingMover,
        pendingRenovation: game.pendingRenovation,
        pendingActions: pendingActionsFor(game),
        pendingIT: game.pendingIT,
        usedReroll: game.usedReroll,
        pendingTunaDice: game.pendingTunaDice,
        turnCount: game.turnCount,
        hadAmusementParkAtRoll: game.hadAmusementParkAtRoll,
        shopStock: Object.assign({}, shopStock),
        undoState: options.undoState || null,
        actionSeq: Object.prototype.hasOwnProperty.call(options, 'actionSeq')
            ? options.actionSeq : 0,
    };
}

function serializeUndoState(game, shopStock, logLimit = GAME_SNAPSHOT_DEFAULT_LOG_LIMIT) {
    const normalizedLogLimit = Number.isInteger(logLimit) && logLimit >= 0
        ? logLimit
        : GAME_SNAPSHOT_DEFAULT_LOG_LIMIT;
    return {
        playerCoins: game.players.map(player => player.coins),
        playerCardNames: game.players.map(player => player.cards.map(card => card.name)),
        playerDormantIndices: game.players.map(player =>
            player.dormantCards
                .map(card => player.cards.indexOf(card))
                .filter(index => index >= 0)
        ),
        playerLandmarks: game.players.map(player => Object.assign({}, player.landmarks)),
        playerItVenture: game.players.map(player => player.itVentureCoins),
        playerHasYakusho: game.players.map(player => player.hasYakusho),
        hadAmusementParkAtRoll: game.hadAmusementParkAtRoll,
        shopStock: Object.assign({}, shopStock),
        builtThisTurn: game.builtThisTurn,
        log: copyRecentLog(game.log, normalizedLogLimit),
    };
}

function hydrateMutableGameState(options) {
    if (!options || !options.game || !options.state ||
            !Array.isArray(options.game.players) ||
            typeof options.createCardByName !== 'function' ||
            typeof options.assignShopStockSnapshot !== 'function' ||
            typeof options.normalizePlayerCoins !== 'function' ||
            typeof options.readDormantIndices !== 'function' ||
            typeof options.readLandmarks !== 'function' ||
            typeof options.readLog !== 'function' ||
            typeof options.normalizeCurrentPlayerIndex !== 'function') return false;

    const { game, shopStock, state } = options;
    const playersState = Array.isArray(state.players) ? state.players : [];
    game.players.forEach((player, index) => {
        const playerState = playersState[index];
        if (!playerState) return;
        player.name = playerState.name;
        player.coins = options.normalizePlayerCoins(playerState.coins, player.coins, index);
        if (Array.isArray(playerState.cards)) {
            player.cards = playerState.cards.map(name => options.createCardByName(name)).filter(Boolean);
        }
        const dormantIndices = options.readDormantIndices(playerState.dormantIndices);
        player.dormantCards = dormantIndices.map(cardIndex => player.cards[cardIndex]).filter(Boolean);
        player.landmarks = Object.assign({}, player.landmarks, options.readLandmarks(playerState.landmarks));
        player.itVentureCoins = playerState.itVentureCoins || 0;
        player.hasYakusho = playerState.hasYakusho !== false;
    });
    options.assignShopStockSnapshot(shopStock, state.shopStock || {});
    game.currentPlayerIndex = options.normalizeCurrentPlayerIndex(
        state.currentPlayerIndex, game.currentPlayerIndex, game.players.length
    );
    game.phase = state.phase || game.phase;
    game.log = options.readLog(state.log);
    game.lastDiceResult = state.lastDiceResult || 0;
    game.lastDice1 = state.lastDice1 || 0;
    game.lastDice2 = state.lastDice2 || 0;
    game.builtThisTurn = state.builtThisTurn || false;
    if (typeof game.resetPendingState === 'function') game.resetPendingState();
    game.pendingTV = state.pendingTV || 0;
    game.pendingBusiness = state.pendingBusiness || 0;
    game.pendingCleaning = state.pendingCleaning || 0;
    game.pendingMover = state.pendingMover || 0;
    game.pendingRenovation = state.pendingRenovation || 0;
    game.pendingActionQueue = Array.isArray(state.pendingActions)
        ? state.pendingActions
            .filter(pending => pending && typeof pending === 'object')
            .map(pending => ({ action: pending.action, field: pending.field }))
        : [];
    if (typeof game.rebuildPendingActionsFromFields === 'function' && game.pendingActionQueue.length === 0) {
        game.rebuildPendingActionsFromFields();
    }
    game.pendingIT = state.pendingIT || false;
    game.usedReroll = state.usedReroll || false;
    game.pendingTunaDice = state.pendingTunaDice || null;
    game.turnCount = state.turnCount || 0;
    game.hadAmusementParkAtRoll = state.hadAmusementParkAtRoll || false;
    if (typeof options.onUndoState === 'function') options.onUndoState(state.undoState || null);
    return true;
}

const GameSnapshot = Object.freeze({
    schemaVersion: GAME_SNAPSHOT_SCHEMA_VERSION,
    legacyVersion: GAME_SNAPSHOT_LEGACY_VERSION,
    defaultLogLimit: GAME_SNAPSHOT_DEFAULT_LOG_LIMIT,
    snapshotVersionOf,
    isSupportedSnapshotVersion,
    createSnapshotEnvelope,
    readSnapshotEnvelope,
    serializeGameState,
    hydrateMutableGameState,
    serializeUndoState,
});

if (typeof module !== 'undefined' && module.exports) module.exports = GameSnapshot;
if (typeof window !== 'undefined') window.GameSnapshot = GameSnapshot;
if (typeof globalThis !== 'undefined') globalThis.GameSnapshot = GameSnapshot;
