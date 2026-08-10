'use strict';

const GameSnapshot = require('../js/gameSnapshot');
const GameEngine = require('../js/gameEngine');
const GameSchemaCodec = require('../js/gameSchemaCodec');

const MAX_SNAPSHOT_PENDING_COUNT = 50;
const MAX_SNAPSHOT_LOG_ENTRIES = 30;

function makeMirrorReplay({
    gameRuntime,
    maxActionLogLength,
    maxFullActionLogLength,
    isPlainObject,
    isValidDieValue,
    validateActionPayloadForState,
    getAllowedActions,
}) {
    function serializeMirrorState(game, shopStock, undoState = null, actionSeq = 0) {
        return GameSnapshot.serializeGameState(game, shopStock, {
            undoState,
            actionSeq,
            logLimit: MAX_SNAPSHOT_LOG_ENTRIES,
            pendingActionsFor: (gameRuntime.GameManager &&
                    typeof gameRuntime.GameManager.serializedPendingActionsFor === 'function')
                ? gameRuntime.GameManager.serializedPendingActionsFor
                : () => [],
        });
    }

    function transitionMirrorEnvelope(options) {
        if (!options || typeof options.action !== 'string' ||
                !options.data || typeof options.data !== 'object' || Array.isArray(options.data)) {
            return Object.freeze({ ok: false, reason: 'invalid-input', snapshot: null, snapshotEnvelope: null });
        }
        const snapshotEncoded = GameSchemaCodec.encodeSnapshot(options.selection, options.snapshot);
        const actionEncoded = GameSchemaCodec.encodeAction(options.selection, options.action, options.data);
        if (!snapshotEncoded.ok || !actionEncoded.ok) {
            return Object.freeze({
                ok: false,
                reason: !snapshotEncoded.ok ? snapshotEncoded.reason : actionEncoded.reason,
                snapshot: null,
                snapshotEnvelope: null,
            });
        }
        const transition = GameEngine.transitionEnvelope({
            selection: options.selection,
            snapshotEnvelope: snapshotEncoded.value,
            actionEnvelope: actionEncoded.value,
            hydrate(snapshot) {
                const playerCount = Array.isArray(snapshot.players) ? snapshot.players.length : 0;
                const game = new gameRuntime.GameManager(playerCount);
                if (Array.isArray(options.enabledLandmarks) && options.enabledLandmarks.length > 0) {
                    game.enabledLandmarks = new Set(options.enabledLandmarks);
                }
                /** @type {Record<string, number>} */
                const shopStock = {};
                restoreMirrorState(game, shopStock, snapshot, gameRuntime.createCardByName);
                const runtime = {
                    game,
                    shopStock,
                    undoState: snapshot.undoState || null,
                    createCardByName: gameRuntime.createCardByName,
                    decrementShopStock: gameRuntime.decrementShopStock,
                };
                if (options.action === 'buildCard' || options.action === 'buildLandmark') {
                    runtime.undoState = makeUndoStateFromMirror(game, shopStock);
                }
                runtime.restoreUndoState = state =>
                    restoreUndoMirror(game, shopStock, state, gameRuntime.createCardByName);
                return runtime;
            },
            serialize(runtime) {
                if (options.action === 'undoBuild' || options.action === 'nextTurn') {
                    runtime.undoState = null;
                }
                return serializeMirrorState(
                    runtime.game, runtime.shopStock, runtime.undoState, options.actionSeq
                );
            },
        });
        if (!transition.ok) {
            return Object.freeze({ ok: false, reason: transition.reason, snapshot: null, snapshotEnvelope: null });
        }
        const decoded = GameSchemaCodec.decodeSnapshot(options.selection, transition.snapshotEnvelope);
        if (!decoded.ok) {
            return Object.freeze({ ok: false, reason: decoded.reason, snapshot: null, snapshotEnvelope: null });
        }
        return Object.freeze({
            ok: true,
            reason: '',
            snapshot: decoded.value,
            snapshotEnvelope: transition.snapshotEnvelope,
        });
    }

    function compactRoomActionLog(room) {
        if (!room.actionLog || room.actionLog.length <= maxActionLogLength) return;
        const mirror = createRoomMirror(room);
        if (!mirror) return;
        room.lastUndoState = mirror.lastUndoState || null;
        room.stateSnapshot = serializeMirrorState(mirror.game, mirror.shopStock, room.lastUndoState, room.actionSeq || 0);
        if (room.fullActionLog !== null) {
            const priorHistory = Array.isArray(room.fullActionLog) ? room.fullActionLog : [];
            const fullActionLog = priorHistory.concat(room.actionLog);
            room.fullActionLog = fullActionLog.length <= maxFullActionLogLength
                ? fullActionLog
                : null;
        }
        room.actionLog = [];
    }

    function createRoomMirror(room) {
        if (!room.gameStartPayload) return null;
        const { GameManager, CARDS, createCardByName, getInitialCardStock, setShopStockCount, Player } = gameRuntime;
        const { playerNames, playerSettings, playerOrder, enabledCards, enabledLandmarks } = room.gameStartPayload;
        const game = new GameManager(playerNames.length);
        game.enabledLandmarks = new Set((enabledLandmarks && enabledLandmarks.length > 0) ? enabledLandmarks : Player.landmarkNames());
                /** @type {Record<string, number>} */
        const shopStock = {};
        const enabled = new Set(enabledCards || CARDS.map(c => c.name));
        for (const card of CARDS) {
            setShopStockCount(shopStock, card, enabled.has(card.name) ? getInitialCardStock(card, playerNames.length) : 0);
        }

        const order = playerOrder || playerNames.map((_, i) => i);
        for (let i = 0; i < playerNames.length; i++) {
            const originalIndex = order[i];
            game.players[i].name = playerNames[originalIndex];
        }
        const cpuPlayers = (playerSettings && playerSettings.length > 0)
            ? order.map(originalIndex => playerSettings[originalIndex]?.type === 'cpu')
            : game.players.map(() => false);

        let lastUndoState = null;
        if (room.stateSnapshot) {
            if (!validateMirrorSnapshot(room.stateSnapshot, playerNames.length, createCardByName, Player)) {
                return null;
            }
            if (!validateSnapshotAgainstRoomConfig(room.stateSnapshot, room, playerNames.length)) {
                return null;
            }
            restoreMirrorState(game, shopStock, room.stateSnapshot, createCardByName);
            lastUndoState = room.stateSnapshot.undoState || null;
        }
        for (const entry of room.actionLog || []) {
            if (!entry || typeof entry.action !== 'string') continue;
            try {
                if (!validateReplayAction(room, game, shopStock, entry, lastUndoState, cpuPlayers)) {
                    return null;
                }
                if (entry.action === 'buildCard' || entry.action === 'buildLandmark') {
                    lastUndoState = makeUndoStateFromMirror(game, shopStock);
                }
                const replayData = entry.action === 'undoBuild' ? { state: lastUndoState } : entry.data;
                if (applyActionToMirror(game, shopStock, entry.action, replayData, createCardByName) === false) {
                    return null;
                }
                if (entry.action === 'undoBuild' || entry.action === 'nextTurn') {
                    lastUndoState = null;
                }
            } catch {
                return null;
            }
        }
        return { game, shopStock, cpuPlayers, lastUndoState };
    }

    function validateMirrorSnapshot(state, playerCount, createCardByName, PlayerClass) {
        if (!isPlainObject(state)) return false;
        if (!Array.isArray(state.players) || state.players.length !== playerCount) return false;
        const landmarkNames = new Set(PlayerClass.landmarkNames());
        for (const playerState of state.players) {
            if (!isPlainObject(playerState)) return false;
            if (Object.prototype.hasOwnProperty.call(playerState, 'name') &&
                typeof playerState.name !== 'string') return false;
            if (Object.prototype.hasOwnProperty.call(playerState, 'coins') &&
                (!Number.isInteger(playerState.coins) || playerState.coins < 0)) return false;
            if (Object.prototype.hasOwnProperty.call(playerState, 'cards')) {
                if (!Array.isArray(playerState.cards) ||
                    playerState.cards.some(name => !createCardByName(name))) return false;
            }
            const cardCount = Array.isArray(playerState.cards) ? playerState.cards.length : 0;
            if (Object.prototype.hasOwnProperty.call(playerState, 'dormantIndices')) {
                if (!Array.isArray(playerState.dormantIndices) ||
                    hasDuplicateValues(playerState.dormantIndices) ||
                    playerState.dormantIndices.some(idx => !Number.isInteger(idx) || idx < 0 || idx >= cardCount)) return false;
                const cardNames = Array.isArray(playerState.cards) ? playerState.cards : [];
                for (const idx of playerState.dormantIndices) {
                    const card = createCardByName(cardNames[idx]);
                    if (card?.category === gameRuntime.CARD_CATEGORIES.MAJOR) return false;
                }
            }
            if (Object.prototype.hasOwnProperty.call(playerState, 'landmarks')) {
                if (!isPlainObject(playerState.landmarks)) return false;
                for (const [name, built] of Object.entries(playerState.landmarks)) {
                    if (!landmarkNames.has(name) || typeof built !== 'boolean') return false;
                }
            }
            if (Object.prototype.hasOwnProperty.call(playerState, 'itVentureCoins') &&
                (!Number.isInteger(playerState.itVentureCoins) || playerState.itVentureCoins < 0)) return false;
            if (Object.prototype.hasOwnProperty.call(playerState, 'hasYakusho') &&
                typeof playerState.hasYakusho !== 'boolean') return false;
        }
        if (Object.prototype.hasOwnProperty.call(state, 'shopStock')) {
            if (!isPlainObject(state.shopStock)) return false;
            for (const [key, count] of Object.entries(state.shopStock)) {
                if (!gameRuntime.resolveCardStockName(key) || !Number.isInteger(count) || count < 0) return false;
            }
        }
        if (Object.prototype.hasOwnProperty.call(state, 'currentPlayerIndex') &&
            (!Number.isInteger(state.currentPlayerIndex) || state.currentPlayerIndex < 0 || state.currentPlayerIndex >= playerCount)) return false;
        if (Object.prototype.hasOwnProperty.call(state, 'phase') &&
            !Object.values(gameRuntime.GAME_PHASES).includes(state.phase)) return false;
        if (Object.prototype.hasOwnProperty.call(state, 'log') && !Array.isArray(state.log)) return false;
        for (const field of ['lastDiceResult', 'lastDice1', 'lastDice2', 'turnCount']) {
            if (Object.prototype.hasOwnProperty.call(state, field) &&
                (!Number.isInteger(state[field]) || state[field] < 0)) return false;
        }
        let pendingFieldTotal = 0;
        for (const field of ['pendingTV', 'pendingBusiness', 'pendingCleaning', 'pendingMover', 'pendingRenovation']) {
            if (Object.prototype.hasOwnProperty.call(state, field)) {
                if (!Number.isInteger(state[field]) || state[field] < 0 || state[field] > MAX_SNAPSHOT_PENDING_COUNT) return false;
                pendingFieldTotal += state[field];
            }
        }
        if (pendingFieldTotal > MAX_SNAPSHOT_PENDING_COUNT) return false;
        if (state.phase && state.phase !== gameRuntime.GAME_PHASES.PENDING && pendingFieldTotal > 0) return false;
        if (Object.prototype.hasOwnProperty.call(state, 'pendingActions')) {
            const actionByField = {
                pendingTV: gameRuntime.GAME_ACTIONS.RESOLVE_TV,
                pendingBusiness: gameRuntime.GAME_ACTIONS.RESOLVE_BUSINESS,
                pendingCleaning: gameRuntime.GAME_ACTIONS.RESOLVE_CLEANING,
                pendingMover: gameRuntime.GAME_ACTIONS.RESOLVE_MOVER,
                pendingRenovation: gameRuntime.GAME_ACTIONS.RESOLVE_RENOVATION,
            };
            const pendingCounts = Object.fromEntries(Object.keys(actionByField).map(field => [field, 0]));
            if (!Array.isArray(state.pendingActions) || state.pendingActions.length > MAX_SNAPSHOT_PENDING_COUNT) return false;
            if (state.phase && state.phase !== gameRuntime.GAME_PHASES.PENDING && state.pendingActions.length > 0) return false;
            for (const pending of state.pendingActions) {
                if (!isPlainObject(pending) || actionByField[pending.field] !== pending.action) return false;
                pendingCounts[pending.field]++;
            }
            for (const field of Object.keys(actionByField)) {
                const fieldCount = Object.prototype.hasOwnProperty.call(state, field) ? state[field] : 0;
                if (pendingCounts[field] !== fieldCount) return false;
            }
        }
        for (const field of ['builtThisTurn', 'pendingIT', 'usedReroll', 'hadAmusementParkAtRoll']) {
            if (Object.prototype.hasOwnProperty.call(state, field) &&
                typeof state[field] !== 'boolean') return false;
        }
        if (state.pendingIT === true && state.phase && state.phase !== gameRuntime.GAME_PHASES.PENDING) return false;
        if (Object.prototype.hasOwnProperty.call(state, 'pendingTunaDice') &&
            state.pendingTunaDice !== null &&
            (!Array.isArray(state.pendingTunaDice) ||
                state.pendingTunaDice.length !== 2 ||
                state.pendingTunaDice.some(value => !isValidDieValue(value)))) return false;
        if (Object.prototype.hasOwnProperty.call(state, 'undoState') &&
            state.undoState !== null &&
            !isValidUndoState(state.undoState, playerCount, createCardByName)) return false;
        return true;
    }

    function isValidUndoState(state, playerCount, createCardByName) {
        if (!isPlainObject(state)) return false;
        if (!Array.isArray(state.playerCoins) || state.playerCoins.length !== playerCount) return false;
        if (!Array.isArray(state.playerCardNames) || state.playerCardNames.length !== playerCount) return false;
        if (!Array.isArray(state.playerLandmarks) || state.playerLandmarks.length !== playerCount) return false;
        if (Object.prototype.hasOwnProperty.call(state, 'playerItVenture') &&
            (!Array.isArray(state.playerItVenture) || state.playerItVenture.length !== playerCount)) return false;
        if (!isPlainObject(state.shopStock)) return false;
        if (Object.prototype.hasOwnProperty.call(state, 'log') && !Array.isArray(state.log)) return false;
        if (Object.prototype.hasOwnProperty.call(state, 'builtThisTurn') && typeof state.builtThisTurn !== 'boolean') return false;
        if (state.playerCoins.some(coins => !Number.isInteger(coins) || coins < 0)) return false;
        const landmarkNames = new Set(gameRuntime.Player.landmarkNames());
        for (let i = 0; i < playerCount; i++) {
            const cardNames = state.playerCardNames[i];
            if (!Array.isArray(cardNames) || cardNames.some(name => !createCardByName(name))) return false;
            const dormantIndices = state.playerDormantIndices?.[i] || [];
            if (!Array.isArray(dormantIndices) ||
                hasDuplicateValues(dormantIndices) ||
                dormantIndices.some(idx => !Number.isInteger(idx) || idx < 0 || idx >= cardNames.length)) return false;
            for (const idx of dormantIndices) {
                const card = createCardByName(cardNames[idx]);
                if (card?.category === gameRuntime.CARD_CATEGORIES.MAJOR) return false;
            }
            if (!isPlainObject(state.playerLandmarks[i])) return false;
            for (const [name, built] of Object.entries(state.playerLandmarks[i])) {
                if (!landmarkNames.has(name) || typeof built !== 'boolean') return false;
            }
            const itVentureCoins = state.playerItVenture?.[i] ?? 0;
            if (!Number.isInteger(itVentureCoins) || itVentureCoins < 0) return false;
            if (state.playerHasYakusho && typeof state.playerHasYakusho[i] !== 'boolean') return false;
        }
        return Object.entries(state.shopStock)
            .every(([key, count]) => gameRuntime.resolveCardStockName(key) && Number.isInteger(count) && count >= 0);
    }

    function validateSnapshotAgainstRoomConfig(state, room, playerCount) {
        if (!isPlainObject(state)) return false;
        const enabledCards = new Set(room.gameStartPayload?.enabledCards || gameRuntime.CARDS.map(card => card.name));
        const enabledLandmarks = new Set(room.gameStartPayload?.enabledLandmarks || gameRuntime.Player.landmarkNames());
        if (!validateSnapshotCardAndStockConfig(state.players, state.shopStock, enabledCards, playerCount)) return false;
        if (!validateSnapshotLandmarkConfig(state.players, enabledLandmarks)) return false;
        if (state.undoState) {
            if (!validateSnapshotCardAndStockConfig(
                state.undoState.playerCardNames?.map((cardNames, index) => ({ cards: cardNames, landmarks: state.undoState.playerLandmarks?.[index] })),
                state.undoState.shopStock,
                enabledCards,
                playerCount
            )) return false;
            if (!validateSnapshotLandmarkConfig(
                state.undoState.playerLandmarks?.map(landmarks => ({ landmarks })),
                enabledLandmarks
            )) return false;
        }
        return true;
    }

    function validateSnapshotCardAndStockConfig(playersState, shopStockState, enabledCards, playerCount) {
        if (!Array.isArray(playersState)) return false;
        const stockState = isPlainObject(shopStockState) ? shopStockState : {};
        const initialCardNames = new Set(['麦畑', 'パン屋']);
        const disabledInitialCardCounts = {};
        for (const playerState of playersState) {
            const cardNames = Array.isArray(playerState?.cards) ? playerState.cards : [];
            for (const name of cardNames) {
                if (!enabledCards.has(name)) {
                    if (!initialCardNames.has(name)) return false;
                    disabledInitialCardCounts[name] = (disabledInitialCardCounts[name] || 0) + 1;
                }
            }
        }
        for (const count of Object.values(disabledInitialCardCounts)) {
            if (count > playerCount) return false;
        }
        for (const card of gameRuntime.CARDS) {
            if (!enabledCards.has(card.name)) {
                if (gameRuntime.getShopStockCount(stockState, card) !== 0) return false;
                continue;
            }
            const initialStock = enabledCards.has(card.name)
                ? gameRuntime.getInitialCardStock(card, playerCount)
                : 0;
            const hasStock = Object.prototype.hasOwnProperty.call(stockState, card.name) ||
                Object.prototype.hasOwnProperty.call(stockState, card.id);
            const stockCount = hasStock ? gameRuntime.getShopStockCount(stockState, card) : initialStock;
            if (!Number.isInteger(stockCount) || stockCount < 0 || stockCount > initialStock) return false;
        }
        return true;
    }

    function validateSnapshotLandmarkConfig(playersState, enabledLandmarks) {
        if (!Array.isArray(playersState)) return false;
        for (const playerState of playersState) {
            const landmarks = playerState?.landmarks;
            if (landmarks == null) continue;
            if (!isPlainObject(landmarks)) return false;
            for (const [name, built] of Object.entries(landmarks)) {
                if (built === true && !enabledLandmarks.has(name)) return false;
            }
        }
        return true;
    }

    function hasDuplicateValues(values) {
        return new Set(values).size !== values.length;
    }

    function validateReplayAction(room, game, shopStock, entry, lastUndoState, cpuPlayers) {
        const { action, data } = entry;
        if (game.checkWinner && game.checkWinner()) return false;
        if (!validateReplayActor(room, game, entry, cpuPlayers)) return false;
        if (!getAllowedActions(game).has(action)) return false;
        return validateActionPayloadForState(room, game, shopStock, action, data, {
            undoState: lastUndoState,
            requireUndoPayload: true,
        });
    }

    function validateReplayActor(room, game, entry, cpuPlayers) {
        const currentIndex = game.currentPlayerIndex;
        const playerOrder = room.gameStartPayload?.playerOrder;
        const originalCurrentIndex = playerOrder ? playerOrder[currentIndex] : currentIndex;
        if (!Number.isInteger(entry.playerIndex)) return false;
        const settings = room.gameStartPayload?.playerSettings || [];
        const playerCount = Array.isArray(room.gameStartPayload?.playerNames)
            ? room.gameStartPayload.playerNames.length
            : settings.length;
        if (entry.playerIndex < 0 || entry.playerIndex >= playerCount) return false;
        if (cpuPlayers[currentIndex]) {
            const hostPlayerIndex = Number.isInteger(room.hostPlayerIndex)
                ? room.hostPlayerIndex
                : room.gameStartPayload?.hostPlayerIndex;
            return Number.isInteger(hostPlayerIndex) &&
                entry.playerIndex === hostPlayerIndex &&
                settings[entry.playerIndex]?.type !== 'cpu';
        }
        return entry.playerIndex === originalCurrentIndex;
    }

    function restoreMirrorState(game, shopStock, state, createCardByName) {
        GameSnapshot.hydrateMutableGameState({
            game,
            shopStock,
            state,
            createCardByName,
            assignShopStockSnapshot: gameRuntime.assignShopStockSnapshot,
            normalizePlayerCoins: (value, currentValue) => Number.isFinite(value) ? value : currentValue,
            readDormantIndices: value => Array.isArray(value) ? value : [],
            readLandmarks: value => value && typeof value === 'object' ? value : {},
            readLog: value => Array.isArray(value) ? value : [],
            normalizeCurrentPlayerIndex: (value, _currentValue, playerCount) =>
                Number.isInteger(value) && value >= 0 && value < playerCount ? value : 0,
        });
    }

    function adoptTransitionSnapshotToRoomMirror(room, transition) {
        if (!room || !transition || transition.ok !== true ||
                !isPlainObject(transition.snapshot)) return false;
        try {
            const candidateRoom = Object.assign({}, room, {
                stateSnapshot: transition.snapshot,
                actionLog: [],
            });
            const adoptedMirror = createRoomMirror(candidateRoom);
            if (!adoptedMirror) return false;
            room.canonicalMirror = adoptedMirror;
            return true;
        } catch (_) {
            return false;
        }
    }

    function applyActionToMirror(game, shopStock, action, data, createCardByName) {
        if (!isPlainObject(data)) return false;
        return GameEngine.applyMutableAction({
            game,
            shopStock,
            action,
            data,
            createCardByName,
            decrementShopStock: gameRuntime.decrementShopStock,
            restoreUndoState: state => restoreUndoMirror(game, shopStock, state, createCardByName),
        });
    }

    function restoreUndoMirror(game, shopStock, state, createCardByName) {
        return GameSnapshot.hydrateUndoState({
            game,
            shopStock,
            state,
            createCardByName,
            assignShopStockSnapshot: gameRuntime.assignShopStockSnapshot,
            mergePlayerLandmarks: (current, saved) => Object.assign({}, current, saved),
        });
    }

    function makeUndoStateFromMirror(game, shopStock) {
        return GameSnapshot.serializeUndoState(game, shopStock, MAX_SNAPSHOT_LOG_ENTRIES);
    }

    return {
        serializeMirrorState,
        transitionMirrorEnvelope,
        restoreMirrorState,
        adoptTransitionSnapshotToRoomMirror,
        compactRoomActionLog,
        createRoomMirror,
        applyActionToMirror,
        restoreUndoMirror,
        makeUndoStateFromMirror,
        isValidUndoState,
    };
}

module.exports = makeMirrorReplay;
