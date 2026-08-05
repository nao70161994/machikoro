'use strict';

const GameSnapshotRuntimeApi = typeof module !== 'undefined' && module.exports
    ? require('./gameSnapshot')
    : globalThis.GameSnapshot;

const GameEngineRuntimeAdapter = (() => {
    function requireFunction(value, name) {
        if (typeof value !== 'function') throw new TypeError(name + ' must be a function');
        return value;
    }

    function create(options) {
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new TypeError('runtime adapter options are required');
        }
        const createGame = requireFunction(options.createGame, 'createGame');
        const createCardByName = requireFunction(options.createCardByName, 'createCardByName');
        const assignShopStockSnapshot = requireFunction(
            options.assignShopStockSnapshot,
            'assignShopStockSnapshot'
        );
        const decrementShopStock = requireFunction(options.decrementShopStock, 'decrementShopStock');
        const landmarkNames = requireFunction(options.landmarkNames, 'landmarkNames');
        const pendingActionsFor = requireFunction(options.pendingActionsFor, 'pendingActionsFor');
        const configuredLandmarks = options.enabledLandmarks == null
            ? null
            : Array.from(options.enabledLandmarks);
        const logLimit = options.logLimit;

        function hydrate(snapshot) {
            const playerCount = Array.isArray(snapshot && snapshot.players)
                ? snapshot.players.length
                : 0;
            if (playerCount < 1) throw new Error('invalid engine runtime snapshot');
            const runtimeGame = createGame(playerCount);
            runtimeGame.enabledLandmarks = new Set(
                configuredLandmarks == null ? landmarkNames() : configuredLandmarks
            );
            /** @type {Record<string, number>} */
            const runtimeStock = {};
            let runtimeUndoState = null;
            const hydrated = GameSnapshotRuntimeApi.hydrateMutableGameState({
                game: runtimeGame,
                shopStock: runtimeStock,
                state: snapshot,
                createCardByName,
                assignShopStockSnapshot,
                normalizePlayerCoins: value => value,
                readDormantIndices: value => value || [],
                readLandmarks: value => value || {},
                readLog: value => Array.isArray(value) ? value.slice() : [],
                normalizeCurrentPlayerIndex: value => value || 0,
                onUndoState: value => { runtimeUndoState = value; },
            });
            if (!hydrated) throw new Error('engine runtime hydrate failed');
            const runtime = {
                game: runtimeGame,
                shopStock: runtimeStock,
                undoState: runtimeUndoState,
                actionSeq: snapshot.actionSeq || 0,
                createCardByName,
                decrementShopStock,
            };
            runtime.restoreUndoState = state => {
                const restored = GameSnapshotRuntimeApi.hydrateUndoState({
                    game: runtime.game,
                    shopStock: runtime.shopStock,
                    state,
                    createCardByName,
                    assignShopStockSnapshot,
                    mergePlayerLandmarks: (current, saved) => Object.assign(
                        {},
                        Object.fromEntries(landmarkNames().map(name => [name, false])),
                        current,
                        saved
                    ),
                });
                if (restored) runtime.undoState = null;
                return restored;
            };
            return runtime;
        }

        function serialize(runtime) {
            return GameSnapshotRuntimeApi.serializeGameState(runtime.game, runtime.shopStock, {
                undoState: runtime.undoState,
                actionSeq: runtime.actionSeq,
                logLimit,
                pendingActionsFor,
            });
        }

        return Object.freeze({ hydrate, serialize });
    }

    return Object.freeze({ create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameEngineRuntimeAdapter;
if (typeof window !== 'undefined') window.GameEngineRuntimeAdapter = GameEngineRuntimeAdapter;
if (typeof globalThis !== 'undefined') globalThis.GameEngineRuntimeAdapter = GameEngineRuntimeAdapter;
