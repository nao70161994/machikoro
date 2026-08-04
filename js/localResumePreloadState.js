'use strict';

const LocalResumePreloadState = (() => {
    function create(initial = {}) {
        let pending = initial.pending === true;
        let generation = Number.isInteger(initial.generation) ? initial.generation : 0;

        function snapshot() {
            return Object.freeze({ pending, generation });
        }

        function setPending(value) {
            pending = value === true;
            return snapshot();
        }

        function start() {
            generation++;
            pending = true;
            return snapshot();
        }

        function finish(expectedGeneration) {
            if (expectedGeneration !== generation) {
                return Object.freeze({ accepted: false, state: snapshot() });
            }
            pending = false;
            return Object.freeze({ accepted: true, state: snapshot() });
        }

        return Object.freeze({ snapshot, setPending, start, finish });
    }

    return Object.freeze({ create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalResumePreloadState;
if (typeof window !== 'undefined') Object.assign(window, { LocalResumePreloadState });
if (typeof globalThis !== 'undefined') globalThis.LocalResumePreloadState = LocalResumePreloadState;
