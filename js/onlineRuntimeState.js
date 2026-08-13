'use strict';

const OnlineRuntimeState = (() => {
    const defaults = Object.freeze({
        socket: null,
        isOnlineGame: false,
        isRoomHost: false,
        myPlayerIndex: -1,
        myOriginalPlayerIndex: -1,
        myPlayerName: '',
        myRoomId: null,
        reconnectToken: '',
        isReplaying: false,
        isReconnectingOnline: false,
        gameGeneration: 0,
    });
    const fields = Object.freeze(Object.keys(defaults));

    function createController(initial = {}) {
        /** @type {Record<string, any>} */
        const state = Object.assign({}, defaults, initial);

        function snapshot() {
            return Object.freeze(Object.fromEntries(fields.map(field => [field, state[field]])));
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

        function setSocket(value) {
            state.socket = value;
            return snapshot();
        }

        function setOnline(value) {
            state.isOnlineGame = value === true;
            return snapshot();
        }

        function setHost(value) {
            state.isRoomHost = value === true;
            return snapshot();
        }

        function setReplaying(value) {
            state.isReplaying = value === true;
            return snapshot();
        }

        function setReconnecting(value) {
            state.isReconnectingOnline = value === true;
            return snapshot();
        }

        function setReconnectToken(value) {
            state.reconnectToken = typeof value === 'string' ? value : '';
            return snapshot();
        }

        function setGameGeneration(value) {
            state.gameGeneration = Number.isSafeInteger(value) && value >= 0 ? value : 0;
            return snapshot();
        }

        function acceptRoom(identity = {}) {
            state.myOriginalPlayerIndex = identity.playerIndex;
            state.myPlayerIndex = identity.playerIndex;
            state.myRoomId = identity.roomId;
            state.reconnectToken = identity.reconnectToken;
            state.gameGeneration = Number.isSafeInteger(identity.gameGeneration) && identity.gameGeneration >= 0
                ? identity.gameGeneration : 0;
            return snapshot();
        }

        function restoreIdentity(identity = {}) {
            state.isRoomHost = identity.isRoomHost;
            state.myPlayerName = identity.playerName;
            state.myRoomId = identity.roomId;
            state.myOriginalPlayerIndex = identity.originalPlayerIndex;
            state.myPlayerIndex = identity.playerIndex;
            state.reconnectToken = identity.reconnectToken;
            state.gameGeneration = Number.isSafeInteger(identity.gameGeneration) && identity.gameGeneration >= 0
                ? identity.gameGeneration : 0;
            return snapshot();
        }

        function setPlayerIndexes(originalPlayerIndex, playerIndex = originalPlayerIndex) {
            state.myOriginalPlayerIndex = originalPlayerIndex;
            state.myPlayerIndex = playerIndex;
            return snapshot();
        }

        function setCurrentPlayerIndex(playerIndex) {
            state.myPlayerIndex = playerIndex;
            return snapshot();
        }

        function setPlayerName(playerName) {
            state.myPlayerName = playerName;
            return snapshot();
        }

        function clearPlayerIndexes() {
            return setPlayerIndexes(-1, -1);
        }

        function clearRoom() {
            state.myRoomId = null;
            return snapshot();
        }

        function clearReconnectToken() {
            state.reconnectToken = '';
            state.gameGeneration = 0;
            return snapshot();
        }

        function clearIdentity() {
            state.isRoomHost = false;
            state.myPlayerIndex = -1;
            state.myOriginalPlayerIndex = -1;
            state.myPlayerName = '';
            state.myRoomId = null;
            state.reconnectToken = '';
            return snapshot();
        }

        function reset() {
            for (const field of fields) state[field] = defaults[field];
            return snapshot();
        }

        function bindGlobals(root, options = {}) {
            if (!root || (typeof root !== 'object' && typeof root !== 'function')) return false;
            const writable = options.writable !== false;
            const descriptors = Object.fromEntries(fields.map(field => [field, {
                configurable: true,
                enumerable: false,
                get: () => read(field),
                set: writable ? value => { write(field, value); } : undefined,
            }]));
            Object.defineProperties(root, descriptors);
            return true;
        }

        return Object.freeze({
            snapshot,
            read,
            setSocket,
            setOnline,
            setHost,
            setReplaying,
            setReconnecting,
            setReconnectToken,
            setGameGeneration,
            acceptRoom,
            restoreIdentity,
            setPlayerIndexes,
            setCurrentPlayerIndex,
            setPlayerName,
            clearPlayerIndexes,
            clearRoom,
            clearReconnectToken,
            clearIdentity,
            reset,
            bindGlobals,
        });
    }

    function hasActiveContext(snapshot = runtime.snapshot(), options = {}) {
        return !!snapshot && (
            snapshot.isOnlineGame === true ||
            snapshot.isReconnectingOnline === true ||
            (typeof snapshot.myRoomId === 'string' && snapshot.myRoomId.length > 0) ||
            options.lobbyRequestPending === true
        );
    }

    const runtime = createController();
    const root = typeof globalThis !== 'undefined' ? globalThis : null;
    const browserRoot = typeof window !== 'undefined' ? window : null;
    if (root) runtime.bindGlobals(root, { writable: !browserRoot || browserRoot !== root });

    return Object.freeze({ defaults, fields, createController, hasActiveContext, runtime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineRuntimeState;
if (typeof window !== 'undefined') Object.assign(window, { OnlineRuntimeState });
if (typeof globalThis !== 'undefined') globalThis.OnlineRuntimeState = OnlineRuntimeState;
