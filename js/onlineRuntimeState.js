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
    });
    const fields = Object.freeze(Object.keys(defaults));

    function createController(initial = {}) {
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

        function reset() {
            for (const field of fields) state[field] = defaults[field];
            return snapshot();
        }

        function bindGlobals(root) {
            if (!root || (typeof root !== 'object' && typeof root !== 'function')) return false;
            const descriptors = Object.fromEntries(fields.map(field => [field, {
                configurable: true,
                enumerable: false,
                get: () => read(field),
                set: value => { write(field, value); },
            }]));
            Object.defineProperties(root, descriptors);
            return true;
        }

        return Object.freeze({ snapshot, read, write, reset, bindGlobals });
    }

    const runtime = createController();
    if (typeof globalThis !== 'undefined') runtime.bindGlobals(globalThis);

    return Object.freeze({ defaults, fields, createController, runtime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineRuntimeState;
if (typeof window !== 'undefined') Object.assign(window, { OnlineRuntimeState });
if (typeof globalThis !== 'undefined') globalThis.OnlineRuntimeState = OnlineRuntimeState;
