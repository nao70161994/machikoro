'use strict';

const CPUSimulation = Object.freeze({
    createPlayoutRng(seed) {
        let state = (seed >>> 0) || 1;
        return () => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 0x100000000;
        };
    },
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUSimulation };
}
if (typeof window !== 'undefined') window.CPUSimulation = CPUSimulation;
if (typeof globalThis !== 'undefined') globalThis.CPUSimulation = CPUSimulation;
