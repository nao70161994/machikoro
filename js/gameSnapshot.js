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

const GameSnapshot = Object.freeze({
    schemaVersion: GAME_SNAPSHOT_SCHEMA_VERSION,
    legacyVersion: GAME_SNAPSHOT_LEGACY_VERSION,
    defaultLogLimit: GAME_SNAPSHOT_DEFAULT_LOG_LIMIT,
    snapshotVersionOf,
    isSupportedSnapshotVersion,
    createSnapshotEnvelope,
    readSnapshotEnvelope,
    serializeGameState,
    serializeUndoState,
});

if (typeof module !== 'undefined' && module.exports) module.exports = GameSnapshot;
if (typeof window !== 'undefined') window.GameSnapshot = GameSnapshot;
if (typeof globalThis !== 'undefined') globalThis.GameSnapshot = GameSnapshot;
