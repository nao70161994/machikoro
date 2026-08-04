'use strict';

const OnlineDiagnosticState = (() => {

    function createController(initialState = {}) {
        const state = Object.assign(Object.create(null), initialState);
        const keys = Object.freeze(Object.keys(state));
        const knownKeys = new Set(keys);
        const projection = {};

        function assertKnownKey(key) {
            if (!knownKeys.has(key)) {
                throw new Error(`Unknown online diagnostic key: ${key}`);
            }
        }

        keys.forEach(key => {
            Object.defineProperty(projection, key, {
                enumerable: true,
                get() {
                    return state[key];
                },
                set(value) {
                    state[key] = value;
                },
            });
        });

        return Object.freeze({
            keys,
            projection: Object.freeze(projection),
            read(key) {
                assertKnownKey(key);
                return state[key];
            },
            write(key, value) {
                assertKnownKey(key);
                state[key] = value;
                return value;
            },
            snapshot() {
                return Object.freeze(Object.assign({}, state));
            },
        });
    }

    return Object.freeze({ createController });
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OnlineDiagnosticState;
}
