'use strict';

const GameRuntimeState = (() => {
    const fields = Object.freeze(['game', 'cpuPlayers', 'prevCoins', 'undoState']);

    function createController(initial = {}) {
        const state = {
            game: Object.prototype.hasOwnProperty.call(initial, 'game') ? initial.game : undefined,
            cpuPlayers: Object.prototype.hasOwnProperty.call(initial, 'cpuPlayers')
                ? initial.cpuPlayers
                : [],
            prevCoins: Object.prototype.hasOwnProperty.call(initial, 'prevCoins')
                ? initial.prevCoins
                : null,
            undoState: Object.prototype.hasOwnProperty.call(initial, 'undoState')
                ? initial.undoState
                : null,
        };

        function snapshot() {
            return Object.freeze({
                game: state.game,
                cpuPlayers: state.cpuPlayers,
                prevCoins: state.prevCoins,
                undoState: state.undoState,
            });
        }

        function read(field) {
            if (!fields.includes(field)) return undefined;
            return state[field];
        }

        function write(field, value) {
            if (!fields.includes(field)) return false;
            state[field] = value;
            return true;
        }

        function setGame(value) {
            state.game = value;
            return snapshot();
        }

        function setCpuPlayers(value) {
            state.cpuPlayers = value;
            return snapshot();
        }

        function setPreviousCoins(value) {
            state.prevCoins = value;
            return snapshot();
        }

        function setUndoState(value) {
            state.undoState = value;
            return snapshot();
        }

        function installHydrated(value = {}) {
            state.game = value.game;
            state.undoState = value.undoState;
            return snapshot();
        }

        function bindGlobals(root) {
            if (!root || (typeof root !== 'object' && typeof root !== 'function')) return false;
            Object.defineProperties(root, Object.fromEntries(fields.map(field => [field, {
                configurable: true,
                enumerable: false,
                get: () => read(field),
                set: value => { write(field, value); },
            }])));
            return true;
        }

        return Object.freeze({
            snapshot,
            read,
            write,
            setGame,
            setCpuPlayers,
            setPreviousCoins,
            setUndoState,
            installHydrated,
            bindGlobals,
        });
    }

    function currentGlobals(root) {
        if (!root || (typeof root !== 'object' && typeof root !== 'function')) return {};
        return Object.fromEntries(fields
            .filter(field => typeof root[field] !== 'undefined')
            .map(field => [field, root[field]]));
    }

    const root = typeof globalThis !== 'undefined' ? globalThis : null;
    const runtime = createController(currentGlobals(root));
    if (root) runtime.bindGlobals(root);

    return Object.freeze({ fields, createController, runtime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameRuntimeState;
if (typeof window !== 'undefined') Object.assign(window, { GameRuntimeState });
if (typeof globalThis !== 'undefined') globalThis.GameRuntimeState = GameRuntimeState;
